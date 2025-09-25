import { PDFDownloader } from '../PDFDownloader';
import { FileManager } from '../FileManager';
import { BookInfo, BookStatus } from '../../types';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * 整合測試 - 測試PDF下載器和檔案管理器的協作
 * 注意：這些測試需要網路連接，在CI環境中可能需要跳過
 */
describe('PDFDownloader Integration Tests', () => {
  let downloader: PDFDownloader;
  let fileManager: FileManager;
  let testDownloadPath: string;

  beforeAll(() => {
    testDownloadPath = join(__dirname, '../../../test-downloads');
    
    // 清理並建立測試目錄
    if (existsSync(testDownloadPath)) {
      rmSync(testDownloadPath, { recursive: true, force: true });
    }
    mkdirSync(testDownloadPath, { recursive: true });
    
    downloader = new PDFDownloader(testDownloadPath, 2);
    fileManager = new FileManager(testDownloadPath);
  });

  afterAll(() => {
    // 清理測試目錄
    if (existsSync(testDownloadPath)) {
      rmSync(testDownloadPath, { recursive: true, force: true });
    }
  });

  describe('File naming and management', () => {
    it('should generate unique filenames for different books', () => {
      const book1: BookInfo = {
        id: 1,
        title: '測試書籍一',
        author: '作者甲',
        pdfUrl: 'https://example.com/book1.pdf',
        status: BookStatus.PENDING
      };

      const book2: BookInfo = {
        id: 2,
        title: '測試書籍二',
        author: '作者乙',
        pdfUrl: 'https://example.com/book2.pdf',
        status: BookStatus.PENDING
      };

      const fileName1 = fileManager.generateUniqueFileName(book1);
      const fileName2 = fileManager.generateUniqueFileName(book2);

      expect(fileName1).not.toBe(fileName2);
      expect(fileName1).toContain('測試書籍一');
      expect(fileName1).toContain('作者甲');
      expect(fileName2).toContain('測試書籍二');
      expect(fileName2).toContain('作者乙');
    });

    it('should handle books with special characters in title', () => {
      const bookWithSpecialChars: BookInfo = {
        id: 3,
        title: '特殊字元<>:"/\\|?*測試',
        author: '特殊*作者?',
        pdfUrl: 'https://example.com/special.pdf',
        status: BookStatus.PENDING
      };

      const fileName = fileManager.generateUniqueFileName(bookWithSpecialChars);

      // 檔案名稱不應包含非法字元
      expect(fileName).not.toMatch(/[<>:"/\\|?*]/);
      expect(fileName).toContain('特殊字元');
      expect(fileName).toContain('特殊');
      expect(fileName).toContain('作者');
    });

    it('should create directory structure correctly', () => {
      const subDir = fileManager.createDirectory('test-subdir');
      
      expect(existsSync(subDir)).toBe(true);
      expect(subDir).toContain('test-subdir');
    });
  });

  describe('File operations', () => {
    it('should detect duplicate files correctly', async () => {
      const book: BookInfo = {
        id: 4,
        title: '重複檢測測試',
        author: '測試作者',
        pdfUrl: 'https://example.com/duplicate.pdf',
        status: BookStatus.PENDING
      };

      // 初始狀態應該沒有重複檔案
      const duplicates = await fileManager.findDuplicateFiles(book);
      expect(duplicates).toHaveLength(0);
    });

    it('should list PDF files correctly', () => {
      const pdfFiles = fileManager.listPDFFiles();
      
      // 初始狀態應該是空的
      expect(Array.isArray(pdfFiles)).toBe(true);
      expect(pdfFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate directory size', () => {
      const size = fileManager.getDirectorySize();
      
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Download manager functionality', () => {
    it('should track active downloads', () => {
      const activeCount = downloader.getActiveDownloadCount();
      const activeIds = downloader.getActiveDownloadIds();
      
      expect(typeof activeCount).toBe('number');
      expect(Array.isArray(activeIds)).toBe(true);
      expect(activeCount).toBe(activeIds.length);
    });

    it('should generate consistent filenames', () => {
      const book: BookInfo = {
        id: 5,
        title: '一致性測試',
        author: '測試作者',
        pdfUrl: 'https://example.com/consistent.pdf',
        status: BookStatus.PENDING
      };

      const fileName1 = downloader.generateFileName(book);
      const fileName2 = downloader.generateFileName(book);

      // 由於包含時間戳，檔案名稱應該相同（在同一天內）
      expect(fileName1.split('_')[0]).toBe(fileName2.split('_')[0]); // 標題部分相同
      expect(fileName1.split('_')[1]).toBe(fileName2.split('_')[1]); // 作者部分相同
    });

    it('should handle file existence check', async () => {
      const nonExistentFile = join(testDownloadPath, 'non-existent.pdf');
      const exists = await downloader.checkFileExists(nonExistentFile);
      
      expect(exists).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid file paths gracefully', () => {
      const invalidPath = '/invalid/path/that/does/not/exist';
      
      expect(() => {
        fileManager.getFileInfo(invalidPath);
      }).not.toThrow();
      
      const info = fileManager.getFileInfo(invalidPath);
      expect(info).toBeNull();
    });

    it('should handle directory operations on non-existent paths', () => {
      const nonExistentDir = '/non/existent/directory';
      const pdfFiles = fileManager.listPDFFiles(nonExistentDir);
      
      expect(Array.isArray(pdfFiles)).toBe(true);
      expect(pdfFiles).toHaveLength(0);
    });
  });

  describe('Event handling', () => {
    it('should be able to register progress listeners', (done) => {
      let listenerCalled = false;
      
      downloader.on('progress', (progress) => {
        listenerCalled = true;
        expect(progress).toHaveProperty('bookId');
        expect(progress).toHaveProperty('percentage');
        expect(progress).toHaveProperty('totalBytes');
        expect(progress).toHaveProperty('downloadedBytes');
      });

      // 模擬進度事件
      downloader.emit('progress', {
        bookId: 999,
        fileName: 'test.pdf',
        totalBytes: 1000,
        downloadedBytes: 500,
        percentage: 50,
        speed: 100,
        estimatedTimeRemaining: 5
      });

      setTimeout(() => {
        expect(listenerCalled).toBe(true);
        done();
      }, 100);
    });
  });
});