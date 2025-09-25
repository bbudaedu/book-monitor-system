import { PDFDownloader } from '../PDFDownloader';
import { BookInfo, BookStatus } from '../../types';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { EventEmitter } from 'events';

// Mock axios
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

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
    json: jest.fn(),
    metadata: jest.fn(() => ({ type: 'metadata' })) // 添加缺失的metadata格式
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

jest.mock('winston-daily-rotate-file', () => jest.fn());

// Mock fs functions
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn()
}));

describe('PDFDownloader', () => {
  let downloader: PDFDownloader;
  let testDownloadPath: string;
  let mockBookInfo: BookInfo;

  beforeEach(() => {
    testDownloadPath = './test-downloads';
    downloader = new PDFDownloader(testDownloadPath, 2);
    
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

  afterEach(() => {
    // Clean up test directory if it exists
    if (existsSync(testDownloadPath)) {
      rmSync(testDownloadPath, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create downloader with correct settings', () => {
      expect(downloader).toBeInstanceOf(PDFDownloader);
      expect(downloader).toBeInstanceOf(EventEmitter);
    });

    it('should create download directory if it does not exist', () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      new PDFDownloader('./new-test-path');
      
      expect(mockMkdirSync).toHaveBeenCalledWith('./new-test-path', { recursive: true });
    });
  });

  describe('generateFileName', () => {
    it('should generate valid filename from book info', () => {
      const fileName = downloader.generateFileName(mockBookInfo);
      
      expect(fileName).toMatch(/^測試書籍_測試作者_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('\\');
      expect(fileName).not.toContain(':');
    });

    it('should handle book without author', () => {
      const bookWithoutAuthor = { ...mockBookInfo, author: undefined };
      const fileName = downloader.generateFileName(bookWithoutAuthor);
      
      expect(fileName).toMatch(/^測試書籍_\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should sanitize illegal characters', () => {
      const bookWithIllegalChars = {
        ...mockBookInfo,
        title: '測試<書>籍:檔案/名稱',
        author: '測試*作者?'
      };
      
      const fileName = downloader.generateFileName(bookWithIllegalChars);
      
      expect(fileName).not.toContain('<');
      expect(fileName).not.toContain('>');
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('*');
      expect(fileName).not.toContain('?');
    });

    it('should limit filename length', () => {
      const longTitle = 'a'.repeat(200);
      const bookWithLongTitle = { ...mockBookInfo, title: longTitle };
      
      const fileName = downloader.generateFileName(bookWithLongTitle);
      
      expect(fileName.length).toBeLessThanOrEqual(110); // 100 + author + timestamp + .pdf
    });
  });

  describe('checkFileExists', () => {
    it('should return true for existing non-empty file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = require('fs').statSync as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      
      const result = await downloader.checkFileExists('/test/file.pdf');
      
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const result = await downloader.checkFileExists('/test/nonexistent.pdf');
      
      expect(result).toBe(false);
    });

    it('should return false for empty file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = require('fs').statSync as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 0 });
      
      const result = await downloader.checkFileExists('/test/empty.pdf');
      
      expect(result).toBe(false);
    });
  });

  describe('validatePDF', () => {
    it('should return true for valid PDF file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = require('fs').statSync as jest.MockedFunction<any>;
      const mockCreateReadStream = require('fs').createReadStream as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      
      const mockStream = new EventEmitter();
      mockCreateReadStream.mockReturnValue(mockStream);
      
      const validatePromise = downloader.validatePDF('/test/valid.pdf');
      
      // Simulate PDF header
      setTimeout(() => {
        mockStream.emit('data', Buffer.from('%PDF-1.4'));
        mockStream.emit('end');
      }, 10);
      
      const result = await validatePromise;
      expect(result).toBe(true);
    });

    it('should return false for invalid PDF file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = require('fs').statSync as jest.MockedFunction<any>;
      const mockCreateReadStream = require('fs').createReadStream as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      
      const mockStream = new EventEmitter();
      mockCreateReadStream.mockReturnValue(mockStream);
      
      const validatePromise = downloader.validatePDF('/test/invalid.pdf');
      
      // Simulate non-PDF header
      setTimeout(() => {
        mockStream.emit('data', Buffer.from('HTML content'));
        mockStream.emit('end');
      }, 10);
      
      const result = await validatePromise;
      expect(result).toBe(false);
    });

    it('should return false for non-existing file', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      
      mockExistsSync.mockReturnValue(false);
      
      const result = await downloader.validatePDF('/test/nonexistent.pdf');
      
      expect(result).toBe(false);
    });
  });

  describe('downloadPDF', () => {
    it('should skip download if file already exists', async () => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockStatSync = require('fs').statSync as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 1024 });
      
      const result = await downloader.downloadPDF(mockBookInfo);
      
      expect(result).toContain('測試書籍');
      expect(axios).not.toHaveBeenCalled();
    });

    it('should emit progress events during download', (done) => {
      const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
      const mockCreateWriteStream = require('fs').createWriteStream as jest.MockedFunction<any>;
      
      mockExistsSync.mockReturnValue(false);
      
      const mockWriteStream = new EventEmitter();
      mockCreateWriteStream.mockReturnValue(mockWriteStream);
      
      const mockResponseStream = new EventEmitter();
      (mockResponseStream as any).pipe = jest.fn().mockReturnValue(mockWriteStream);
      
      (mockedAxios as any).mockResolvedValue({
        status: 200,
        headers: { 'content-length': '1024' },
        data: mockResponseStream
      });
      
      downloader.on('progress', (progress) => {
        expect(progress.bookId).toBe(1);
        expect(progress.totalBytes).toBe(1024);
        done();
      });
      
      downloader.downloadPDF(mockBookInfo);
      
      // Simulate download progress
      setTimeout(() => {
        mockResponseStream.emit('data', Buffer.alloc(512));
      }, 10);
    });
  });

  describe('cancelDownload', () => {
    it('should cancel active download', () => {
      // This would require more complex mocking of AbortController
      // For now, test the basic functionality
      const result = downloader.cancelDownload(999); // Non-existent download
      expect(result).toBe(false);
    });

    it('should return download count', () => {
      const count = downloader.getActiveDownloadCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getActiveDownloadIds', () => {
    it('should return array of active download IDs', () => {
      const ids = downloader.getActiveDownloadIds();
      expect(Array.isArray(ids)).toBe(true);
    });
  });

  describe('cancelAllDownloads', () => {
    it('should cancel all active downloads', () => {
      expect(() => downloader.cancelAllDownloads()).not.toThrow();
    });
  });
});