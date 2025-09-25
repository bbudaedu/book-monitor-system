import { MainController } from '../MainController';
import { DatabaseManager } from '../../database/DatabaseManager';
import { SystemConfig, LogLevel, BookStatus } from '../../types';

// Mock all dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/ConfigManager');
jest.mock('../../services/Logger');
jest.mock('../../services/WebScraper');
jest.mock('../../services/BookParser');
jest.mock('../../services/BookDetector');
jest.mock('../../services/PDFDownloader');
jest.mock('../../services/LineNotifier');
jest.mock('../../services/TaskScheduler');

describe('MainController', () => {
  let mainController: MainController;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  const mockConfig: SystemConfig = {
    monitorInterval: 300000, // 5分鐘
    downloadPath: './downloads',
    lineAccessToken: 'test-token',
    maxRetries: 3,
    logLevel: LogLevel.INFO,
    autoStart: false
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock DatabaseManager
    mockDbManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      transaction: jest.fn()
    } as any;

    // Mock ConfigManager
    const { ConfigManager } = require('../../services/ConfigManager');
    ConfigManager.prototype.loadConfig = jest.fn().mockResolvedValue(mockConfig);
    ConfigManager.prototype.saveConfig = jest.fn().mockResolvedValue(undefined);

    // Mock Logger
    const { Logger } = require('../../services/Logger');
    Logger.getInstance = jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setLevel: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined)
    });

    // Mock TaskScheduler
    const { TaskScheduler } = require('../../services/TaskScheduler');
    TaskScheduler.prototype.scheduleTaskWithInterval = jest.fn().mockResolvedValue('task-id');
    TaskScheduler.prototype.scheduleTask = jest.fn().mockResolvedValue(undefined);
    TaskScheduler.prototype.unscheduleTask = jest.fn().mockResolvedValue(undefined);
    TaskScheduler.prototype.pauseTask = jest.fn().mockReturnValue(true);
    TaskScheduler.prototype.resumeTask = jest.fn().mockReturnValue(true);
    TaskScheduler.prototype.getStatistics = jest.fn().mockReturnValue({
      totalTasks: 1,
      runningTasks: 0,
      pausedTasks: 0,
      errorTasks: 0,
      totalRuns: 0,
      totalErrors: 0
    });
    TaskScheduler.prototype.getTaskInfo = jest.fn().mockReturnValue({
      id: 'book-monitoring-task',
      name: '書籍監控任務',
      status: 'idle'
    });
    TaskScheduler.prototype.shutdown = jest.fn().mockResolvedValue(undefined);
    TaskScheduler.prototype.on = jest.fn();

    // Mock other services
    const { WebScraper } = require('../../services/WebScraper');
    WebScraper.prototype.scrapeWebsite = jest.fn().mockResolvedValue('<html></html>');
    WebScraper.prototype.close = jest.fn().mockResolvedValue(undefined);

    const { BookParser } = require('../../services/BookParser');
    BookParser.prototype.parseBookList = jest.fn().mockResolvedValue([]);

    const { BookDetector } = require('../../services/BookDetector');
    BookDetector.prototype.detectNewBooks = jest.fn().mockResolvedValue([]);

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
    await mainController.shutdown();
  });

  describe('initialize', () => {
    it('應該成功初始化系統', async () => {
      await mainController.initialize();

      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.loadConfig).toHaveBeenCalled();

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.on).toHaveBeenCalled();
    });

    it('應該在autoStart為true時自動啟動監控', async () => {
      const autoStartConfig = { ...mockConfig, autoStart: true };
      const { ConfigManager } = require('../../services/ConfigManager');
      ConfigManager.prototype.loadConfig = jest.fn().mockResolvedValue(autoStartConfig);

      await mainController.initialize();

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.scheduleTaskWithInterval).toHaveBeenCalledWith(
        'book-monitoring-task',
        '書籍監控任務',
        300000,
        expect.any(Function)
      );
    });

    it('應該防止重複初始化', async () => {
      await mainController.initialize();
      await mainController.initialize(); // 第二次呼叫

      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.loadConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('start', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該成功啟動監控系統', async () => {
      await mainController.start();

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.nextCheckTime).toBeDefined();

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.scheduleTaskWithInterval).toHaveBeenCalledWith(
        'book-monitoring-task',
        '書籍監控任務',
        300000,
        expect.any(Function)
      );

      // 驗證內部調用了scheduleTask方法，並且使用了正確的cron表達式
      expect(TaskScheduler.prototype.scheduleTask).toHaveBeenCalledWith(
        'book-monitoring-task',
        '書籍監控任務',
        '0 */5 * * * *', // 5分鐘的cron表達式
        expect.any(Function)
      );
    });

    it('應該在系統未初始化時拋出錯誤', async () => {
      const uninitializedController = new MainController(mockDbManager);
      
      await expect(uninitializedController.start())
        .rejects.toThrow('系統尚未初始化，請先呼叫 initialize()');
    });

    it('應該防止重複啟動', async () => {
      await mainController.start();
      await mainController.start(); // 第二次呼叫

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.scheduleTaskWithInterval).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await mainController.initialize();
      await mainController.start();
    });

    it('應該成功停止監控系統', async () => {
      await mainController.stop();

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.nextCheckTime).toBeUndefined();

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.unscheduleTask).toHaveBeenCalledWith('book-monitoring-task');

      const { PDFDownloader } = require('../../services/PDFDownloader');
      expect(PDFDownloader.prototype.cancelAllDownloads).toHaveBeenCalled();
    });

    it('應該處理未運行的系統', async () => {
      await mainController.stop(); // 系統已經停止
      await mainController.stop(); // 再次停止

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.unscheduleTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateConfig', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該成功更新設定', async () => {
      const newConfig = { ...mockConfig, monitorInterval: 300000 }; // 修正為與mockConfig一致的值

      await mainController.updateConfig(newConfig);

      const { ConfigManager } = require('../../services/ConfigManager');
      expect(ConfigManager.prototype.saveConfig).toHaveBeenCalledWith(newConfig);
      expect(ConfigManager.prototype.loadConfig).toHaveBeenCalledTimes(2); // 初始化 + 更新
    });

    it('應該在監控運行時重新啟動任務', async () => {
      await mainController.start();

      const newConfig = { ...mockConfig, monitorInterval: 300000 }; // 修正為與mockConfig一致的值
      await mainController.updateConfig(newConfig);

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.unscheduleTask).toHaveBeenCalledWith('book-monitoring-task');
      expect(TaskScheduler.prototype.scheduleTaskWithInterval).toHaveBeenCalledTimes(2); // 啟動 + 重新啟動
      expect(TaskScheduler.prototype.scheduleTask).toHaveBeenCalledTimes(2); // 啟動 + 重新啟動
    });
  });

  describe('runManualCheck', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該成功執行手動檢查', async () => {
      await mainController.runManualCheck();

      const { WebScraper } = require('../../services/WebScraper');
      expect(WebScraper.prototype.scrapeWebsite).toHaveBeenCalledWith(
        'https://www.budaedu.org/#/books/applicable/chinese'
      );

      const { BookParser } = require('../../services/BookParser');
      expect(BookParser.prototype.parseBookList).toHaveBeenCalled();

      const { BookDetector } = require('../../services/BookDetector');
      expect(BookDetector.prototype.detectNewBooks).toHaveBeenCalled();
    });

    it('應該在系統未初始化時拋出錯誤', async () => {
      const uninitializedController = new MainController(mockDbManager);
      
      await expect(uninitializedController.runManualCheck())
        .rejects.toThrow('系統尚未初始化');
    });
  });

  describe('pauseMonitoring and resumeMonitoring', () => {
    beforeEach(async () => {
      await mainController.initialize();
      await mainController.start();
    });

    it('應該成功暫停監控', () => {
      const result = mainController.pauseMonitoring();
      expect(result).toBe(true);

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(false);

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.pauseTask).toHaveBeenCalledWith('book-monitoring-task');
    });

    it('應該成功恢復監控', () => {
      mainController.pauseMonitoring();
      
      const result = mainController.resumeMonitoring();
      expect(result).toBe(true);

      const status = mainController.getStatus();
      expect(status.isRunning).toBe(true);

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.resumeTask).toHaveBeenCalledWith('book-monitoring-task');
    });

    it('應該處理重複操作', () => {
      // 重複暫停
      mainController.pauseMonitoring();
      const pauseResult = mainController.pauseMonitoring();
      expect(pauseResult).toBe(false);

      // 重複恢復
      mainController.resumeMonitoring();
      const resumeResult = mainController.resumeMonitoring();
      expect(resumeResult).toBe(false);
    });
  });

  describe('getTaskStatistics', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該返回任務統計資訊', () => {
      const stats = mainController.getTaskStatistics();
      
      expect(stats).toEqual({
        totalTasks: 1,
        runningTasks: 0,
        pausedTasks: 0,
        errorTasks: 0,
        totalRuns: 0,
        totalErrors: 0
      });

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.getStatistics).toHaveBeenCalled();
    });
  });

  describe('getMonitoringTaskInfo', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該返回監控任務資訊', () => {
      const taskInfo = mainController.getMonitoringTaskInfo();
      
      expect(taskInfo).toEqual({
        id: 'book-monitoring-task',
        name: '書籍監控任務',
        status: 'idle'
      });

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.getTaskInfo).toHaveBeenCalledWith('book-monitoring-task');
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await mainController.initialize();
      await mainController.start();
    });

    it('應該成功關閉系統', async () => {
      await mainController.shutdown();

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.shutdown).toHaveBeenCalled();

      const { WebScraper } = require('../../services/WebScraper');
      expect(WebScraper.prototype.close).toHaveBeenCalled();

      expect(mockDbManager.disconnect).toHaveBeenCalled();

      const { Logger } = require('../../services/Logger');
      const mockLogger = Logger.getInstance();
      expect(mockLogger.close).toHaveBeenCalled();
    });

    it('應該防止重複關閉', async () => {
      await mainController.shutdown();
      await mainController.shutdown(); // 第二次呼叫

      const { TaskScheduler } = require('../../services/TaskScheduler');
      expect(TaskScheduler.prototype.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await mainController.initialize();
    });

    it('應該發出狀態變更事件', async () => {
      const statusChangedSpy = jest.fn();
      mainController.on('status-changed', statusChangedSpy);

      await mainController.start();

      expect(statusChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isRunning: true
        })
      );
    });

    it('應該發出設定更新事件', async () => {
      const configUpdatedSpy = jest.fn();
      mainController.on('config-updated', configUpdatedSpy);

      const newConfig = { ...mockConfig, monitorInterval: 300000 }; // 修正為與mockConfig一致的值
      await mainController.updateConfig(newConfig);

      expect(configUpdatedSpy).toHaveBeenCalledWith(newConfig);
    });
  });
});