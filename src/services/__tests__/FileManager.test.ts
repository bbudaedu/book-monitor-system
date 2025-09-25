import { FileManager } from '../FileManager';
import { BookInfo, BookStatus } from '../../types';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Mock fs functions
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  renameSync: jest.fn(),
  createReadStream: jest.fn()
}));

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn()
}));

// Mock winston to avoid file-stream-rotator issues
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
    errors: jest.fn(),
    json: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

jest.mock('winston-daily-rotate-file', () => jest.fn());

describe('FileManager', () => {
  let fileManager: FileManager;
  let testDownloadPath: string;
  let mockBookInfo: BookInfo;

  beforeEach(() => {
    testDownloadPath = './test-downloads';
    fileManager = new FileManager(testDownloadPath);
    
    mockBookInfo = {
      id: 1,
      title: '測試書籍',
      author: '測試作者',
      pdfUrl: 'https://example.com/test.pdf',
      status: BookStatus.PENDING
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create FileManager with correct download path', () => {
      expect(fileManager).toBeInstanceOf(FileManager);
      expect(fileManager.getDownloadPath()).toContain('test-downloads');
    });

    it('should create download directory if it does not exist', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      new FileManager('./new-test-path');
      
      expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('new-test-path'), { recursive: true });
    });
  });

  describe('generateUniqueFileName', () => {
    it('should generate unique filename from book info', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      mockExistsSync.mockReturnValue(false);
      
      const fileName = fileManager.generateUniqueFileName(mockBookInfo);
      
      expect(fileName).toMatch(/^測試書籍_測試作者_\d{8}\.pdf$/);
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('\\');
      expect(fileName).not.toContain(':');
    });

    it('should handle book without author', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      mockExistsSync.mockReturnValue(false);
      
      const bookWithoutAuthor = { ...mockBookInfo, author: undefined };
      const fileName = fileManager.generateUniqueFileName(bookWithoutAuthor);
      
      expect(fileName).toMatch(/^測試書籍_\d{8}\.pdf$/);
    });

    it('should generate unique name when file exists', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      // First call returns true (file exists), subsequent calls return false
      mockExistsSync
        .mockReturnValueOnce(true) // Directory exists
        .mockReturnValueOnce(true) // Original file exists
        .mockReturnValueOnce(false); // Counter file doesn't exist
      
      const fileName = fileManager.generateUniqueFileName(mockBookInfo, true);
      
      expect(fileName).toMatch(/_1\.pdf$/);
    });

    it('should sanitize illegal characters in filename', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      mockExistsSync.mockReturnValue(false);
      
      const bookWithIllegalChars = {
        ...mockBookInfo,
        title: '測試<書>籍:檔案/名稱',
        author: '測試*作者?'
      };
      
      const fileName = fileManager.generateUniqueFileName(bookWithIllegalChars);
      
      expect(fileName).not.toContain('<');
      expect(fileName).not.toContain('>');
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('*');
      expect(fileName).not.toContain('?');
    });

    it('should limit filename length', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      mockExistsSync.mockReturnValue(false);
      
      const longTitle = 'a'.repeat(300);
      const bookWithLongTitle = { ...mockBookInfo, title: longTitle };
      
      const fileName = fileManager.generateUniqueFileName(bookWithLongTitle);
      
      expect(fileName.length).toBeLessThanOrEqual(220); // 200 + author + timestamp + .pdf
    });
  });

  describe('findDuplicateFiles', () => {
    it('should find duplicate files based on title keywords', async () => {
      const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
      
      mockReaddirSync.mockReturnValue([
        '測試書籍_作者_20240101.pdf',
        '其他書籍_作者_20240102.pdf',
        '測試相關書籍_20240103.pdf'
      ] as any);
      
      const duplicates = await fileManager.findDuplicateFiles(mockBookInfo);
      
      expect(duplicates).toHaveLength(2);
      expect(duplicates[0]).toContain('測試書籍_作者_20240101.pdf');
      expect(duplicates[1]).toContain('測試相關書籍_20240103.pdf');
    });

    it('should handle empty directory', async () => {
      const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
      
      mockReaddirSync.mockReturnValue([] as any);
      
      const duplicates = await fileManager.findDuplicateFiles(mockBookInfo);
      
      expect(duplicates).toHaveLength(0);
    });

    it('should handle directory read error', async () => {
      const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
      
      mockReaddirSync.mockImplementation(() => {
        throw new Error('Directory read error');
      });
      
      const duplicates = await fileManager.findDuplicateFiles(mockBookInfo);
      
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('calculateFileHash', () => {
    it('should calculate MD5 hash of file', async () => {
      const mockCreateReadStream = require('fs').createReadStream as jest.MockedFunction<any>;
      const mockCreateHash = createHash as jest.MockedFunction<typeof createHash>;
      
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('test data')), 10);
          } else if (event === 'end') {
            setTimeout(() => callback(), 20);
          }
        })
      };
      
      const mockHash = {
        update: jest.fn(),
        digest: jest.fn().mockReturnValue('abcd1234')
      };
      
      mockCreateReadStream.mockReturnValue(mockStream);
      mockCreateHash.mockReturnValue(mockHash as any);
      
      const hash = await fileManager.calculateFileHash('/test/file.pdf');
      
      expect(hash).toBe('abcd1234');
      expect(mockHash.update).toHaveBeenCalledWith(Buffer.from('test data'));
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
    });

    it('should handle file read error', async () => {
      const mockCreateReadStream = require('fs').createReadStream as jest.MockedFunction<any>;
      const mockCreateHash = createHash as jest.MockedFunction<typeof createHash>;
      
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('File read error')), 10);
          }
        })
      };
      
      const mockHash = {
        update: jest.fn(),
        digest: jest.fn()
      };
      
      mockCreateReadStream.mockReturnValue(mockStream);
      mockCreateHash.mockReturnValue(mockHash as any);
      
      await expect(fileManager.calculateFileHash('/test/nonexistent.pdf')).rejects.toThrow('File read error');
    });
  });

  describe('areFilesIdentical', () => {
    it('should return true for identical files', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 } as any);
      
      // Mock calculateFileHash to return same hash
      jest.spyOn(fileManager, 'calculateFileHash')
        .mockResolvedValueOnce('hash123')
        .mockResolvedValueOnce('hash123');
      
      const result = await fileManager.areFilesIdentical('/test/file1.pdf', '/test/file2.pdf');
      
      expect(result).toBe(true);
    });

    it('should return false for files with different sizes', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync
        .mockReturnValueOnce({ size: 1024 } as any)
        .mockReturnValueOnce({ size: 2048 } as any);
      
      const result = await fileManager.areFilesIdentical('/test/file1.pdf', '/test/file2.pdf');
      
      expect(result).toBe(false);
    });

    it('should return false for files with different hashes', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 } as any);
      
      // Mock calculateFileHash to return different hashes
      jest.spyOn(fileManager, 'calculateFileHash')
        .mockResolvedValueOnce('hash123')
        .mockResolvedValueOnce('hash456');
      
      const result = await fileManager.areFilesIdentical('/test/file1.pdf', '/test/file2.pdf');
      
      expect(result).toBe(false);
    });

    it('should return false when one file does not exist', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync
        .mockReturnValueOnce(true)  // First file exists
        .mockReturnValueOnce(false); // Second file doesn't exist
      
      const result = await fileManager.areFilesIdentical('/test/file1.pdf', '/test/file2.pdf');
      
      expect(result).toBe(false);
    });
  });

  describe('moveFile', () => {
    it('should move file to target directory', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockRenameSync = renameSync as jest.MockedFunction<typeof renameSync>;
      const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
      
      mockExistsSync
        .mockReturnValueOnce(true)  // Source file exists
        .mockReturnValueOnce(false) // Target directory doesn't exist
        .mockReturnValueOnce(false); // Target file doesn't exist
      
      const result = fileManager.moveFile('/source/file.pdf', '/target', 'newname.pdf');
      
      expect(mockMkdirSync).toHaveBeenCalledWith('/target', { recursive: true });
      expect(mockRenameSync).toHaveBeenCalledWith('/source/file.pdf', '/target/newname.pdf');
      expect(result).toBe('/target/newname.pdf');
    });

    it('should throw error if source file does not exist', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      expect(() => {
        fileManager.moveFile('/nonexistent/file.pdf', '/target');
      }).toThrow('來源檔案不存在');
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
      
      mockExistsSync.mockReturnValue(true);
      
      const result = fileManager.deleteFile('/test/file.pdf');
      
      expect(mockUnlinkSync).toHaveBeenCalledWith('/test/file.pdf');
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const result = fileManager.deleteFile('/test/nonexistent.pdf');
      
      expect(result).toBe(false);
    });

    it('should handle delete error', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('Delete error');
      });
      
      const result = fileManager.deleteFile('/test/file.pdf');
      
      expect(result).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('should return file information', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
      
      const mockStats = {
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02')
      };
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue(mockStats as any);
      
      const info = fileManager.getFileInfo('/test/file.pdf');
      
      expect(info).toEqual({
        size: 1024,
        createdAt: new Date('2024-01-01'),
        modifiedAt: new Date('2024-01-02')
      });
    });

    it('should return null for non-existing file', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const info = fileManager.getFileInfo('/test/nonexistent.pdf');
      
      expect(info).toBeNull();
    });
  });

  describe('listPDFFiles', () => {
    it('should list PDF files in directory', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        'file1.pdf',
        'file2.txt',
        'file3.PDF',
        'file4.doc'
      ] as any);
      
      const pdfFiles = fileManager.listPDFFiles();
      
      expect(pdfFiles).toHaveLength(2);
      expect(pdfFiles[0]).toContain('file1.pdf');
      expect(pdfFiles[1]).toContain('file3.PDF');
    });

    it('should return empty array for non-existing directory', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const pdfFiles = fileManager.listPDFFiles('/nonexistent');
      
      expect(pdfFiles).toHaveLength(0);
    });
  });

  describe('getDirectorySize', () => {
    it('should calculate directory size', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
      const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
      
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['file1.pdf', 'file2.pdf'] as any);
      mockStatSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024
      } as any);
      
      const size = fileManager.getDirectorySize();
      
      expect(size).toBe(2048); // 2 files * 1024 bytes each
    });

    it('should return 0 for non-existing directory', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const size = fileManager.getDirectorySize('/nonexistent');
      
      expect(size).toBe(0);
    });
  });

  describe('setDownloadPath', () => {
    it('should update download path', () => {
      const newPath = '/new/download/path';
      
      fileManager.setDownloadPath(newPath);
      
      expect(fileManager.getDownloadPath()).toContain('new');
    });
  });
});