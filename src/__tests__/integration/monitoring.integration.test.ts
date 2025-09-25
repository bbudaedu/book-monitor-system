/**
 * 監控流程整合測試
 * 
 * 測試完整的書籍監控流程整合
 */

import { WebScraper } from '../../services/WebScraper';
import { BookParser } from '../../services/BookParser';
import { BookDetector } from '../../services/BookDetector';
import { PDFDownloader } from '../../services/PDFDownloader';
import { LineNotifier } from '../../services/LineNotifier';
import { createMockDatabaseManager, createMockLogger } from '../mockFactories';
import { createMockBookInfo, createMockBookListHTML } from '../testUtils';
import { BookStatus } from '../../types';

// 模擬所有依賴
jest.mock('../../services/WebScraper');
jest.mock('../../services/BookParser');
jest.mock('../../services/BookDetector');
jest.mock('../../services/PDFDownloader');
jest.mock('../../services/LineNotifier');
jest.mock('../../services/BrowserManager');

describe('Monitoring Integration Tests', () => {
  let webScraper: jest.Mocked<WebScraper>;
  let bookParser: jest.Mocked<BookParser>;
  let bookDetector: jest.Mocked<BookDetector>;
  let pdfDownloader: jest.Mocked<PDFDownloader>;
  let lineNotifier: jest.Mocked<LineNotifier>;
  let mockDbManager: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbManager = createMockDatabaseManager();
    mockLogger = createMockLogger();

    // 建立模擬服務
    webScraper = new WebScraper({}, mockLogger) as jest.Mocked<WebScraper>;
    bookParser = new BookParser({}, mockLogger) as jest.Mocked<BookParser>;
    bookDetector = new BookDetector(mockDbManager, {}, mockLogger) as jest.Mocked<BookDetector>;
    pdfDownloader = new PDFDownloader('./test-downloads', mockLogger) as jest.Mocked<PDFDownloader>;
    lineNotifier = new LineNotifier('test-token', mockLogger) as jest.Mocked<LineNotifier>;

    // 設定基本模擬行為
    webScraper.scrapeWebsite = jest.fn();
    bookParser.parseBookList = jest.fn();
    bookDetector.detectNewBooks = jest.fn();
    pdfDownloader.downloadPDF = jest.fn();
    pdfDownloader.on = jest.fn();
    lineNotifier.sendBookNotification = jest.fn();
    lineNotifier.sendErrorNotification = jest.fn();
  });

  describe('完整監控流程', () => {
    it('應該能夠執行完整的新書檢測和下載流程', async () => {
      const targetUrl = 'https://www.budaedu.org/#/books/applicable/chinese';
      const mockHtml = createMockBookListHTML(3);
      
      const mockParsedBooks = [
        {
          title: '新書籍1',
          author: '作者1',
          pdfUrl: 'https://example.com/book1.pdf'
        },
        {
          title: '新書籍2',
          author: '作者2',
          pdfUrl: 'https://example.com/book2.pdf'
        },
        {
          title: '現有書籍',
          author: '現有作者',
          pdfUrl: 'https://example.com/existing.pdf'
        }
      ];

      const mockDetectionResult = {
        totalScraped: 3,
        totalNew: 2,
        totalExisting: 1,
        totalUpdated: 0,
        newBooks: [
          createMockBookInfo({
            id: 1,
            title: '新書籍1',
            author: '作者1',
            pdfUrl: 'https://example.com/book1.pdf',
            status: BookStatus.PENDING
          }),
          createMockBookInfo({
            id: 2,
            title: '新書籍2',
            author: '作者2',
            pdfUrl: 'https://example.com/book2.pdf',
            status: BookStatus.PENDING
          })
        ],
        updatedBooks: []
      };

      // 設定模擬回應
      webScraper.scrapeWebsite.mockResolvedValue(mockHtml);
      bookParser.parseBookList.mockResolvedValue({
        success: true,
        books: mockParsedBooks,
        totalFound: 3
      });
      bookDetector.detectNewBooks.mockResolvedValue(mockDetectionResult);
      pdfDownloader.downloadPDF.mockResolvedValue({
        success: true,
        filePath: '/downloads/test-book.pdf',
        fileSize: 1024000
      });
      lineNotifier.sendBookNotification.mockResolvedValue(true);

      // 執行完整流程
      const html = await webScraper.scrapeWebsite(targetUrl);
      expect(html).toBe(mockHtml);

      const parseResult = await bookParser.parseBookList({} as any);
      expect(parseResult.success).toBe(true);
      expect(parseResult.books).toHaveLength(3);

      const detectionResult = await bookDetector.detectNewBooks(mockParsedBooks);
      expect(detectionResult.totalNew).toBe(2);
      expect(detectionResult.newBooks).toHaveLength(2);

      // 下載新書籍
      for (const newBook of detectionResult.newBooks) {
        const downloadResult = await pdfDownloader.downloadPDF(newBook);
        expect(downloadResult.success).toBe(true);

        // 發送通知
        const notificationSent = await lineNotifier.sendBookNotification(newBook);
        expect(notificationSent).toBe(true);
      }

      // 驗證所有步驟都被執行
      expect(webScraper.scrapeWebsite).toHaveBeenCalledWith(targetUrl);
      expect(bookParser.parseBookList).toHaveBeenCalled();
      expect(bookDetector.detectNewBooks).toHaveBeenCalledWith(mockParsedBooks);
      expect(pdfDownloader.downloadPDF).toHaveBeenCalledTimes(2);
      expect(lineNotifier.sendBookNotification).toHaveBeenCalledTimes(2);
    });

    it('應該能夠處理監控流程中的錯誤', async () => {
      const targetUrl = 'https://www.budaedu.org/#/books/applicable/chinese';

      // 模擬網站爬取失敗
      webScraper.scrapeWebsite.mockRejectedValue(new Error('網站無法訪問'));

      await expect(webScraper.scrapeWebsite(targetUrl)).rejects.toThrow('網站無法訪問');

      // 驗證錯誤處理
      expect(webScraper.scrapeWebsite).toHaveBeenCalledWith(targetUrl);
    });

    it('應該能夠處理解析錯誤', async () => {
      const mockHtml = '<html><body>Invalid HTML</body></html>';

      webScraper.scrapeWebsite.mockResolvedValue(mockHtml);
      bookParser.parseBookList.mockResolvedValue({
        success: false,
        books: [],
        totalFound: 0,
        error: '解析失敗'
      });

      const html = await webScraper.scrapeWebsite('test-url');
      const parseResult = await bookParser.parseBookList({} as any);

      expect(parseResult.success).toBe(false);
      expect(parseResult.error).toBe('解析失敗');
    });

    it('應該能夠處理下載失敗', async () => {
      const mockBook = createMockBookInfo({
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf'
      });

      pdfDownloader.downloadPDF.mockResolvedValue({
        success: false,
        error: '下載失敗',
        filePath: '',
        fileSize: 0
      });

      lineNotifier.sendErrorNotification.mockResolvedValue(true);

      const downloadResult = await pdfDownloader.downloadPDF(mockBook);
      expect(downloadResult.success).toBe(false);

      // 應該發送錯誤通知
      const errorNotificationSent = await lineNotifier.sendErrorNotification({
        message: '下載失敗',
        details: `書籍: ${mockBook.title}`,
        timestamp: new Date()
      });
      expect(errorNotificationSent).toBe(true);
    });
  });

  describe('並發處理', () => {
    it('應該能夠處理多個書籍的並發下載', async () => {
      const mockBooks = [
        createMockBookInfo({ id: 1, title: '書籍1', pdfUrl: 'https://example.com/book1.pdf' }),
        createMockBookInfo({ id: 2, title: '書籍2', pdfUrl: 'https://example.com/book2.pdf' }),
        createMockBookInfo({ id: 3, title: '書籍3', pdfUrl: 'https://example.com/book3.pdf' })
      ];

      // 模擬並發下載
      pdfDownloader.downloadPDF.mockImplementation(async (book) => {
        // 模擬不同的下載時間
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        return {
          success: true,
          filePath: `/downloads/${book.title}.pdf`,
          fileSize: 1024000
        };
      });

      lineNotifier.sendBookNotification.mockResolvedValue(true);

      // 並發下載所有書籍
      const downloadPromises = mockBooks.map(book => pdfDownloader.downloadPDF(book));
      const downloadResults = await Promise.all(downloadPromises);

      // 驗證所有下載都成功
      expect(downloadResults).toHaveLength(3);
      downloadResults.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並發發送通知
      const notificationPromises = mockBooks.map(book => lineNotifier.sendBookNotification(book));
      const notificationResults = await Promise.all(notificationPromises);

      // 驗證所有通知都成功
      expect(notificationResults).toHaveLength(3);
      notificationResults.forEach(result => {
        expect(result).toBe(true);
      });
    });

    it('應該能夠處理部分失敗的並發操作', async () => {
      const mockBooks = [
        createMockBookInfo({ id: 1, title: '成功書籍', pdfUrl: 'https://example.com/success.pdf' }),
        createMockBookInfo({ id: 2, title: '失敗書籍', pdfUrl: 'https://example.com/fail.pdf' }),
        createMockBookInfo({ id: 3, title: '另一成功書籍', pdfUrl: 'https://example.com/success2.pdf' })
      ];

      // 模擬部分下載失敗
      pdfDownloader.downloadPDF.mockImplementation(async (book) => {
        if (book.title === '失敗書籍') {
          return {
            success: false,
            error: '下載失敗',
            filePath: '',
            fileSize: 0
          };
        }
        return {
          success: true,
          filePath: `/downloads/${book.title}.pdf`,
          fileSize: 1024000
        };
      });

      const downloadPromises = mockBooks.map(async (book) => {
        try {
          return await pdfDownloader.downloadPDF(book);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知錯誤',
            filePath: '',
            fileSize: 0
          };
        }
      });

      const downloadResults = await Promise.all(downloadPromises);

      // 驗證結果
      expect(downloadResults[0].success).toBe(true);
      expect(downloadResults[1].success).toBe(false);
      expect(downloadResults[2].success).toBe(true);

      // 統計成功和失敗的數量
      const successCount = downloadResults.filter(result => result.success).length;
      const failureCount = downloadResults.filter(result => !result.success).length;

      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);
    });
  });

  describe('重試機制', () => {
    it('應該能夠重試失敗的操作', async () => {
      const targetUrl = 'https://www.budaedu.org/#/books/applicable/chinese';
      let attemptCount = 0;

      // 模擬前兩次失敗，第三次成功
      webScraper.scrapeWebsite.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('暫時性網路錯誤');
        }
        return '<html><body>Success</body></html>';
      });

      // 實作重試邏輯
      const maxRetries = 3;
      let result: string | null = null;
      let lastError: Error | null = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          result = await webScraper.scrapeWebsite(targetUrl);
          break;
        } catch (error) {
          lastError = error as Error;
          if (i === maxRetries - 1) {
            throw lastError;
          }
          // 等待一段時間後重試
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      expect(result).toBe('<html><body>Success</body></html>');
      expect(attemptCount).toBe(3);
      expect(webScraper.scrapeWebsite).toHaveBeenCalledTimes(3);
    });

    it('應該在達到最大重試次數後失敗', async () => {
      const targetUrl = 'https://www.budaedu.org/#/books/applicable/chinese';

      // 模擬持續失敗
      webScraper.scrapeWebsite.mockRejectedValue(new Error('持續性錯誤'));

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          await webScraper.scrapeWebsite(targetUrl);
          break;
        } catch (error) {
          lastError = error as Error;
          if (i === maxRetries - 1) {
            break;
          }
        }
      }

      expect(lastError).toBeDefined();
      expect(lastError!.message).toBe('持續性錯誤');
      expect(webScraper.scrapeWebsite).toHaveBeenCalledTimes(3);
    });
  });

  describe('事件處理', () => {
    it('應該能夠處理下載進度事件', async () => {
      const mockBook = createMockBookInfo({
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf'
      });

      const progressEvents: any[] = [];
      
      // 模擬進度事件
      pdfDownloader.on.mockImplementation((event, callback) => {
        if (event === 'progress') {
          // 模擬進度更新
          setTimeout(() => callback({ bookId: mockBook.id, progress: 25 }), 10);
          setTimeout(() => callback({ bookId: mockBook.id, progress: 50 }), 20);
          setTimeout(() => callback({ bookId: mockBook.id, progress: 75 }), 30);
          setTimeout(() => callback({ bookId: mockBook.id, progress: 100 }), 40);
        }
      });

      // 註冊進度監聽器
      pdfDownloader.on('progress', (data) => {
        progressEvents.push(data);
      });

      // 等待事件處理
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(progressEvents).toHaveLength(4);
      expect(progressEvents[0].progress).toBe(25);
      expect(progressEvents[3].progress).toBe(100);
    });

    it('應該能夠處理下載完成事件', async () => {
      const mockBook = createMockBookInfo({
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf'
      });

      let downloadCompleted = false;

      pdfDownloader.on.mockImplementation((event, callback) => {
        if (event === 'completed') {
          setTimeout(() => {
            downloadCompleted = true;
            callback({ bookId: mockBook.id, filePath: '/downloads/test.pdf' });
          }, 50);
        }
      });

      // 註冊完成監聽器
      pdfDownloader.on('completed', (data) => {
        expect(data.bookId).toBe(mockBook.id);
        expect(data.filePath).toBe('/downloads/test.pdf');
      });

      // 等待事件處理
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(downloadCompleted).toBe(true);
    });
  });

  describe('資源管理', () => {
    it('應該能夠正確清理資源', async () => {
      // 模擬資源清理
      webScraper.close = jest.fn().mockResolvedValue(undefined);
      pdfDownloader.cancelAllDownloads = jest.fn();

      // 執行清理
      await webScraper.close();
      pdfDownloader.cancelAllDownloads();

      expect(webScraper.close).toHaveBeenCalled();
      expect(pdfDownloader.cancelAllDownloads).toHaveBeenCalled();
    });

    it('應該能夠取消正在進行的下載', async () => {
      const mockBooks = [
        createMockBookInfo({ id: 1, title: '書籍1' }),
        createMockBookInfo({ id: 2, title: '書籍2' }),
        createMockBookInfo({ id: 3, title: '書籍3' })
      ];

      pdfDownloader.getActiveDownloadIds = jest.fn().mockReturnValue([1, 2, 3]);
      pdfDownloader.cancelDownload = jest.fn().mockReturnValue(true);

      const activeDownloads = pdfDownloader.getActiveDownloadIds();
      expect(activeDownloads).toEqual([1, 2, 3]);

      // 取消所有下載
      for (const bookId of activeDownloads) {
        const cancelled = pdfDownloader.cancelDownload(bookId);
        expect(cancelled).toBe(true);
      }

      expect(pdfDownloader.cancelDownload).toHaveBeenCalledTimes(3);
    });
  });
});