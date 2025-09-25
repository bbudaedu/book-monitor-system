/**
 * 系統整合測試
 * 
 * 測試各個模組之間的整合和端到端流程
 */

import { MainController } from '../../controllers/MainController';
import { DatabaseManager } from '../../database/DatabaseManager';
import { createMockDatabaseConfig, createMockSystemConfig, sleep } from '../testUtils';
import { BookStatus } from '../../types';

// 模擬所有依賴
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/ConfigManager');
jest.mock('../../services/Logger');
jest.mock('../../services/WebScraper');
jest.mock('../../services/BookParser');
jest.mock('../../services/BookDetector');
jest.mock('../../services/PDFDownloader');
jest.mock('../../services/LineNotifier');
jest.mock('../../services/TaskScheduler');
jest.mock('../../services/BrowserManager');

describe('System Integration Tests', () => {
  let mainController: MainController;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // 建立模擬資料庫管理器
    mockDbManager = new DatabaseManager(createMockDatabaseConfig()) as jest.Mocked<DatabaseManager>;
    mockDbManager.connect = jest.fn().mockResolvedValue(undefined);
    mockDbManager.disconnect = jest.fn().mockResolvedValue(undefined);
    mockDbManager.query = jest.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT'
    });

    // 模擬 ConfigManager
    const { ConfigManager } = require('../../services/ConfigManager');
    ConfigManager.prototype.loadConfig = jest.fn().mockResolvedValue(createMockSystemConfig());
    ConfigManager.prototype.saveConfig = jest.fn().mockResolvedValue(undefined);

    // 模擬 Logger
    const { Logger } = require('../../services/Logger');
    Logger.getInstance = jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setLevel: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined)
    });

    // 模擬 TaskScheduler
    const { TaskScheduler } = require('../../services/TaskScheduler');
    TaskScheduler.prototype.scheduleTaskWithInterval = jest.fn();
    TaskScheduler.prototype.unscheduleTask = jest.fn();
    TaskScheduler.prototype.shutdown = jest.fn().mockResolvedValue(undefined);
    TaskScheduler.prototype.on = jest.fn();

    // 模擬其他服務
    const { WebScraper } = require('../../services/WebScraper');
    WebScraper.prototype.scrapeWebsite = jest.fn().mockResolvedValue('<html></html>');
    WebScraper.prototype.close = jest.fn().mockResolvedValue(undefined);

    const { BookParser } = require('../../services/BookParser');
    BookParser.prototype.parseBookList = jest.fn().mockResolvedValue({
      success: true,
      books: [],
      totalFound: 0
    });

    const { BookDetector } = require('../../services/BookDetector');
    BookDetector.prototype.detectNewBooks = jest.fn().mockResolvedValue({
      totalScraped: 0,
      totalNew: 0,
      totalExisting: 0,
      totalUpdated: 0,
      newBooks: [],
      updatedBooks: []
    });

    const { PDFDownloader } = require('../../services/PDFDownloader');
    PDFDownloader.prototype.setDownloadPath = jest.fn();
    PDFDownloader.prototype.setMaxRetries = jest.fn();
    PDFDownloader.prototype.cancelAllDownloads = jest.fn();
    PDFDownloader.prototype.on = jest.fn();

    const { LineNotifier } = require('../../services/LineNotifier');
    LineNotifier.prototype.setUserId = jest.fn();
    LineNotifier.prototype.setAccessToken = jest.fn();
    LineNotifier.prototype.validateToken = jest.fn().mockResolvedValue(true);

    mainController = new MainController(mockDbManager, 'test-password');
  });

  afterEach(async () => {
    try {
      await mainController.shutdown();
    } catch (error) {
      // 忽略關閉錯誤
    }
  });

  describe('完整系統生命週期', () => {
    it('應該能夠完成完整的初始化、啟動、停止和關閉流程', async () => {
      // 初始化
      await mainController.initialize();
      
      // 驗證初始化
      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.loadConfig).toHaveBeenCalled();

      // 啟動
      await mainController.start();
      
      // 驗證啟動
      const status = mainController.getStatus();
      expect(status.isRunning).toBe(true);

      // 停止
      await mainController.stop();
      
      // 驗證停止
      const stoppedStatus = mainController.getStatus();
      expect(stoppedStatus.isRunning).toBe(false);

      // 關閉
      await mainController.shutdown();
      
      // 驗證關閉
      expect(mockDbManager.disconnect).toHaveBeenCalled();
    });

    it('應該能夠處理設定更新並重新啟動服務', async () => {
      await mainController.initialize();
      await mainController.start();

      const newConfig = createMockSystemConfig({
        monitorInterval: 600000, // 10分鐘
        downloadPath: './new-downloads'
      });

      await mainController.updateConfig(newConfig);

      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.saveConfig).toHaveBeenCalledWith(newConfig);

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.unscheduleTask).toHaveBeenCalled();
      expect(TaskScheduler.prototype.scheduleTaskWithInterval).toHaveBeenCalledTimes(2); // 初始啟動 + 重新啟動
    });
  });

  describe('監控任務流程', () => {
    it('應該能夠執行完整的監控流程', async () => {
      // 設定模擬回應
      const { WebScraper } = require('../../services/WebScraper');
      WebScraper.prototype.scrapeWebsite = jest.fn().mockResolvedValue('<html><body>Mock HTML</body></html>');

      const { BookParser } = require('../../services/BookParser');
      BookParser.prototype.parseBookList = jest.fn().mockResolvedValue({
        success: true,
        books: [
          {
            title: '測試書籍',
            author: '測試作者',
            pdfUrl: 'https://example.com/test.pdf'
          }
        ],
        totalFound: 1
      });

      const { BookDetector } = require('../../services/BookDetector');
      BookDetector.prototype.detectNewBooks = jest.fn().mockResolvedValue({
        totalScraped: 1,
        totalNew: 1,
        totalExisting: 0,
        totalUpdated: 0,
        newBooks: [{
          id: 1,
          title: '測試書籍',
          author: '測試作者',
          pdfUrl: 'https://example.com/test.pdf',
          status: BookStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
        }],
        updatedBooks: []
      });

      await mainController.initialize();
      await mainController.runManualCheck();

      // 驗證監控流程
      expect(WebScraper.prototype.scrapeWebsite).toHaveBeenCalledWith(
        'https://www.budaedu.org/#/books/applicable/chinese'
      );
      expect(BookParser.prototype.parseBookList).toHaveBeenCalled();
      expect(BookDetector.prototype.detectNewBooks).toHaveBeenCalled();
    });

    it('應該能夠處理監控過程中的錯誤', async () => {
      const { WebScraper } = require('../../services/WebScraper');
      WebScraper.prototype.scrapeWebsite = jest.fn().mockRejectedValue(new Error('網路錯誤'));

      await mainController.initialize();

      // 手動檢查應該不會拋出錯誤，而是記錄錯誤
      await expect(mainController.runManualCheck()).resolves.not.toThrow();

      const { Logger } = require('../../services/Logger');
      const mockLogger = Logger.getInstance();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('錯誤處理和恢復', () => {
    it('應該能夠處理資料庫連接錯誤', async () => {
      mockDbManager.connect = jest.fn().mockRejectedValue(new Error('資料庫連接失敗'));

      await expect(mainController.initialize()).rejects.toThrow('資料庫連接失敗');
    });

    it('應該能夠處理設定載入錯誤', async () => {
      const { ConfigManager } = require('../../services/ConfigManager');
      ConfigManager.prototype.loadConfig = jest.fn().mockRejectedValue(new Error('設定載入失敗'));

      await expect(mainController.initialize()).rejects.toThrow('設定載入失敗');
    });

    it('應該能夠處理服務初始化錯誤', async () => {
      const { LineNotifier } = require('../../services/LineNotifier');
      LineNotifier.prototype.validateToken = jest.fn().mockResolvedValue(false);

      await mainController.initialize();

      const { Logger } = require('../../services/Logger');
      const mockLogger = Logger.getInstance();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('LINE Token 驗證失敗')
      );
    });
  });

  describe('並發和競爭條件', () => {
    it('應該能夠處理並發的啟動和停止操作', async () => {
      await mainController.initialize();

      // 並發啟動
      const startPromises = [
        mainController.start(),
        mainController.start(),
        mainController.start()
      ];

      await Promise.all(startPromises);

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(true);

      // 並發停止
      const stopPromises = [
        mainController.stop(),
        mainController.stop(),
        mainController.stop()
      ];

      await Promise.all(stopPromises);

      const stoppedStatus = mainController.getStatus();
      expect(stoppedStatus.isRunning).toBe(false);
    });

    it('應該能夠處理快速的設定更新', async () => {
      await mainController.initialize();
      await mainController.start();

      const configs = [
        createMockSystemConfig({ monitorInterval: 300000 }),
        createMockSystemConfig({ monitorInterval: 600000 }),
        createMockSystemConfig({ monitorInterval: 900000 })
      ];

      // 快速連續更新設定
      const updatePromises = configs.map(config => 
        mainController.updateConfig(config)
      );

      await Promise.all(updatePromises);

      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.saveConfig).toHaveBeenCalledTimes(3);
    });
  });

  describe('記憶體和資源管理', () => {
    it('應該能夠正確清理資源', async () => {
      await mainController.initialize();
      await mainController.start();

      // 執行一些操作
      await mainController.runManualCheck();
      await mainController.pauseMonitoring();
      await mainController.resumeMonitoring();

      // 關閉系統
      await mainController.shutdown();

      // 驗證資源清理
      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.shutdown).toHaveBeenCalled();

      const { WebScraper } = require('../../services/WebScraper');
      expect(WebScraper.prototype.close).toHaveBeenCalled();

      expect(mockDbManager.disconnect).toHaveBeenCalled();

      const { Logger } = require('../../services/Logger');
      const mockLogger = Logger.getInstance();
      expect(mockLogger.close).toHaveBeenCalled();
    });

    it('應該能夠處理重複的關閉操作', async () => {
      await mainController.initialize();
      await mainController.start();

      // 多次關閉
      await mainController.shutdown();
      await mainController.shutdown();
      await mainController.shutdown();

      // 驗證只關閉一次
      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('事件處理', () => {
    it('應該能夠正確發出和處理事件', async () => {
      const statusChangedSpy = jest.fn();
      const configUpdatedSpy = jest.fn();

      mainController.on('status-changed', statusChangedSpy);
      mainController.on('config-updated', configUpdatedSpy);

      await mainController.initialize();
      await mainController.start();

      // 等待事件處理
      await sleep(100);

      expect(statusChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isRunning: true
        })
      );

      const newConfig = createMockSystemConfig({ monitorInterval: 600000 });
      await mainController.updateConfig(newConfig);

      expect(configUpdatedSpy).toHaveBeenCalledWith(newConfig);
    });
  });

  describe('效能和穩定性', () => {
    it('應該能夠處理大量的監控任務', async () => {
      const { BookParser } = require('../../services/BookParser');
      const { BookDetector } = require('../../services/BookDetector');

      // 模擬大量書籍
      const manyBooks = Array.from({ length: 100 }, (_, i) => ({
        title: `書籍 ${i + 1}`,
        author: `作者 ${i + 1}`,
        pdfUrl: `https://example.com/book${i + 1}.pdf`
      }));

      BookParser.prototype.parseBookList = jest.fn().mockResolvedValue({
        success: true,
        books: manyBooks,
        totalFound: 100
      });

      BookDetector.prototype.detectNewBooks = jest.fn().mockResolvedValue({
        totalScraped: 100,
        totalNew: 50,
        totalExisting: 50,
        totalUpdated: 0,
        newBooks: manyBooks.slice(0, 50).map((book, i) => ({
          id: i + 1,
          ...book,
          status: BookStatus.PENDING,
          createdAt: new Date(),
          updatedAt: new Date()
        })),
        updatedBooks: []
      });

      await mainController.initialize();

      const startTime = Date.now();
      await mainController.runManualCheck();
      const endTime = Date.now();

      // 驗證處理時間合理（應該在合理時間內完成）
      expect(endTime - startTime).toBeLessThan(5000); // 5秒內

      expect(BookDetector.prototype.detectNewBooks).toHaveBeenCalledWith(manyBooks);
    });

    it('應該能夠處理長時間運行', async () => {
      await mainController.initialize();
      await mainController.start();

      // 模擬長時間運行
      for (let i = 0; i < 10; i++) {
        await mainController.runManualCheck();
        await sleep(10); // 短暫等待
      }

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(true);

      const stats = mainController.getTaskStatistics();
      expect(stats).toBeDefined();
    });
  });
});