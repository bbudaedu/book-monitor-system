/**
 * 效能測試
 * 
 * 測試系統各個模組的效能表現
 */

import { performance } from 'perf_hooks';
import { BookDetector } from '../../services/BookDetector';
import { BookParser } from '../../services/BookParser';
import { PDFDownloader } from '../../services/PDFDownloader';
import { createMockDatabaseManager, createMockLogger } from '../mockFactories';
import { createMockBookList, createMockBookListHTML } from '../testUtils';

// 模擬依賴
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/Logger');

describe('Performance Tests', () => {
  const PERFORMANCE_THRESHOLD = {
    BOOK_DETECTION: 1000, // 1秒
    BOOK_PARSING: 2000,   // 2秒
    FILE_OPERATIONS: 500   // 0.5秒
  };

  describe('BookDetector 效能測試', () => {
    let bookDetector: BookDetector;
    let mockDbManager: any;
    let mockLogger: any;

    beforeEach(() => {
      mockDbManager = createMockDatabaseManager();
      mockLogger = createMockLogger();
      bookDetector = new BookDetector(mockDbManager, {}, mockLogger);
    });

    it('應該在合理時間內處理大量書籍檢測', async () => {
      const largeBookList = createMockBookList(1000); // 1000本書
      const scrapedBooks = largeBookList.map(book => ({
        title: book.title,
        author: book.author,
        pdfUrl: book.pdfUrl
      }));

      // 模擬資料庫回應
      mockDbManager.query.mockResolvedValue({
        rows: largeBookList.map(book => ({
          ...book,
          pdf_url: book.pdfUrl
        })),
        rowCount: largeBookList.length
      });

      const startTime = performance.now();
      
      await bookDetector.detectNewBooks(scrapedBooks);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.BOOK_DETECTION);
      console.log(`BookDetector 處理 1000 本書籍耗時: ${executionTime.toFixed(2)}ms`);
    });

    it('應該在處理重複書籍時保持效能', async () => {
      const bookList = createMockBookList(500);
      
      // 建立重複書籍（相同標題但不同 URL）
      const duplicateBooks = bookList.map(book => ({
        ...book,
        id: book.id! + 500,
        pdfUrl: book.pdfUrl + '?duplicate=true'
      }));

      const allBooks = [...bookList, ...duplicateBooks];

      mockDbManager.query.mockResolvedValue({
        rows: allBooks.map(book => ({
          ...book,
          pdf_url: book.pdfUrl
        })),
        rowCount: allBooks.length
      });

      const startTime = performance.now();
      
      await bookDetector.findDuplicateBooks();
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.BOOK_DETECTION);
      console.log(`重複書籍檢測耗時: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('BookParser 效能測試', () => {
    let bookParser: BookParser;
    let mockLogger: any;

    beforeEach(() => {
      mockLogger = createMockLogger();
      bookParser = new BookParser({}, mockLogger);
    });

    it('應該在合理時間內解析大型 HTML 文件', async () => {
      const largeHTML = createMockBookListHTML(500); // 500本書的HTML
      
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue({} as any),
        waitForTimeout: jest.fn().mockResolvedValue(undefined as any),
        waitForFunction: jest.fn().mockResolvedValue(undefined as any),
        evaluate: jest.fn().mockResolvedValue(
          Array.from({ length: 500 }, (_, i) => ({
            title: `書籍 ${i + 1}`,
            author: `作者 ${i + 1}`,
            pdfUrl: `https://example.com/book${i + 1}.pdf`
          }))
        )
      } as any;

      const startTime = performance.now();
      
      const result = await bookParser.parseBookList(mockPage);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.BOOK_PARSING);
      expect(result.success).toBe(true);
      console.log(`HTML 解析耗時: ${executionTime.toFixed(2)}ms`);
    });

    it('應該高效處理文字清理和驗證', () => {
      const dirtyTexts = Array.from({ length: 1000 }, (_, i) => 
        `  髒亂的文字 ${i}  \n\t  包含特殊字符@#$%  `
      );

      const startTime = performance.now();
      
      const cleanedTexts = dirtyTexts.map(text => 
        (bookParser as any).cleanText(text)
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.FILE_OPERATIONS);
      expect(cleanedTexts).toHaveLength(1000);
      console.log(`文字清理耗時: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('記憶體使用測試', () => {
    it('應該在處理大量資料時保持合理的記憶體使用', async () => {
      const initialMemory = process.memoryUsage();
      
      // 建立大量測試資料
      const largeDataSet = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        title: `書籍標題 ${i}`.repeat(10), // 較長的標題
        author: `作者姓名 ${i}`.repeat(5),
        description: `書籍描述 ${i}`.repeat(20),
        pdfUrl: `https://example.com/very-long-url-path/book-${i}.pdf`
      }));

      // 模擬資料處理
      const processedData = largeDataSet.map(item => ({
        ...item,
        processed: true,
        timestamp: new Date().toISOString()
      }));

      const afterProcessingMemory = process.memoryUsage();
      
      // 清理資料
      largeDataSet.length = 0;
      processedData.length = 0;

      // 強制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();

      // 記憶體增長應該在合理範圍內
      const memoryIncrease = afterProcessingMemory.heapUsed - initialMemory.heapUsed;
      const memoryMB = memoryIncrease / 1024 / 1024;

      console.log(`記憶體使用增長: ${memoryMB.toFixed(2)}MB`);
      
      // 記憶體增長不應超過 100MB
      expect(memoryMB).toBeLessThan(100);
    });
  });

  describe('並發處理效能', () => {
    it('應該能夠高效處理並發操作', async () => {
      const mockDbManager = createMockDatabaseManager();
      const mockLogger = createMockLogger();
      const bookDetector = new BookDetector(mockDbManager, {}, mockLogger);

      // 模擬並發檢測任務
      const concurrentTasks = Array.from({ length: 10 }, (_, i) => {
        const books = createMockBookList(100).map(book => ({
          title: book.title,
          author: book.author,
          pdfUrl: book.pdfUrl
        }));

        mockDbManager.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT'
        });

        return bookDetector.detectNewBooks(books);
      });

      const startTime = performance.now();
      
      await Promise.all(concurrentTasks);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // 並發執行應該比順序執行快
      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.BOOK_DETECTION * 5);
      console.log(`並發處理耗時: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('資料庫查詢效能', () => {
    it('應該高效處理大量資料庫查詢', async () => {
      const mockDbManager = createMockDatabaseManager();
      
      // 模擬大量查詢
      const queries = Array.from({ length: 100 }, (_, i) => 
        mockDbManager.query(`SELECT * FROM books WHERE id = $1`, [i])
      );

      const startTime = performance.now();
      
      await Promise.all(queries);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.FILE_OPERATIONS);
      console.log(`100 個資料庫查詢耗時: ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('字串處理效能', () => {
    it('應該高效處理字串相似度計算', () => {
      const bookDetector = new BookDetector(
        createMockDatabaseManager(),
        {},
        createMockLogger()
      );

      const strings = Array.from({ length: 1000 }, (_, i) => 
        `測試字串 ${i} 用於相似度計算測試`
      );

      const startTime = performance.now();
      
      // 計算所有字串與第一個字串的相似度
      const similarities = strings.map(str => 
        (bookDetector as any).calculateStringSimilarity(strings[0], str)
      );
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD.FILE_OPERATIONS);
      expect(similarities).toHaveLength(1000);
      console.log(`字串相似度計算耗時: ${executionTime.toFixed(2)}ms`);
    });
  });
});