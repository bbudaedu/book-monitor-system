import { EventEmitter } from 'events';
import { SystemConfig, MonitorStatus, BookInfo, LogLevel } from '../types';
import { DatabaseManager } from '../database/DatabaseManager';
import { ConfigManager } from '../services/ConfigManager';
import { Logger } from '../services/Logger';
import { WebScraper } from '../services/WebScraper';
import { BookParser } from '../services/BookParser';
import { BookDetector } from '../services/BookDetector';
import { PDFDownloader } from '../services/PDFDownloader';
import { LineNotifier } from '../services/LineNotifier';
import { TaskScheduler, TaskStatus } from '../services/TaskScheduler';
import { ErrorHandler } from '../services/ErrorHandler';
import { SystemRecovery } from '../services/SystemRecovery';

/**
 * 主控制器事件介面
 */
export interface MainControllerEvents {
  'status-changed': (status: MonitorStatus) => void;
  'new-book-detected': (book: BookInfo) => void;
  'download-started': (book: BookInfo) => void;
  'download-completed': (book: BookInfo) => void;
  'download-failed': (book: BookInfo, error: Error) => void;
  'notification-sent': (book: BookInfo) => void;
  'error': (error: Error) => void;
  'config-updated': (config: SystemConfig) => void;
}

/**
 * 主控制器 - 協調各個模組的運作，管理應用程式生命週期
 * 
 * 基於Node.js EventEmitter模式實現模組間通訊
 * 參考: https://nodejs.org/api/events.html#events_class_eventemitter
 */
export class MainController extends EventEmitter {
  private dbManager: DatabaseManager;
  private configManager: ConfigManager;
  private logger: Logger;
  private webScraper: WebScraper;
  private bookParser: BookParser;
  private bookDetector: BookDetector;
  private pdfDownloader: PDFDownloader;
  private lineNotifier: LineNotifier;
  private taskScheduler: TaskScheduler;
  private errorHandler: ErrorHandler;
  private systemRecovery: SystemRecovery;
  
  private config: SystemConfig | null = null;
  private monitorStatus: MonitorStatus;
  private monitoringTaskId = 'book-monitoring-task';
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(dbManager: DatabaseManager, masterPassword?: string) {
    super();
    
    this.dbManager = dbManager;
    this.configManager = new ConfigManager(dbManager, masterPassword);
    this.logger = Logger.getInstance();
    
    // 初始化監控狀態
    this.monitorStatus = {
      isRunning: false,
      totalBooksFound: 0,
      totalDownloaded: 0,
      errors: 0
    };

    // 初始化服務模組（延遲初始化，等待設定載入）
    this.webScraper = new WebScraper({}, this.logger);
    this.bookParser = new BookParser({}, this.logger);
    this.bookDetector = new BookDetector(dbManager, {}, this.logger);
    this.pdfDownloader = new PDFDownloader('./downloads'); // 預設路徑，稍後會更新
    this.lineNotifier = new LineNotifier(''); // 空token，稍後會更新
    this.taskScheduler = new TaskScheduler(this.logger);

    // 初始化錯誤處理器和系統恢復機制
    this.errorHandler = new ErrorHandler(this.logger);
    this.systemRecovery = new SystemRecovery(this.logger, this.dbManager);

    // 設定錯誤處理
    this.setupErrorHandling();
    
    this.logger.info('主控制器已建立', { component: 'MainController' });
  }

  /**
   * 初始化系統
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('系統已經初始化', { component: 'MainController' });
      return;
    }

    try {
      this.logger.info('開始初始化系統...', { component: 'MainController' });

      // 載入設定
      await this.loadConfiguration();

      // 初始化各個模組
      await this.initializeModules();

      // 設定模組間通訊
      this.setupModuleCommunication();

      // 設定任務排程器事件
      this.setupTaskSchedulerEvents();

      // 設定錯誤處理器和系統恢復機制
      await this.setupErrorHandlerAndRecovery();

      this.isInitialized = true;
      this.logger.info('系統初始化完成', { component: 'MainController' });

      // 如果設定為自動啟動，則開始監控
      if (this.config?.autoStart) {
        await this.start();
      }

    } catch (error) {
      this.logger.error('系統初始化失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 啟動監控系統
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('系統尚未初始化，請先呼叫 initialize()');
    }

    if (this.monitorStatus.isRunning) {
      this.logger.warn('監控系統已在運行中', { component: 'MainController' });
      return;
    }

    try {
      this.logger.info('啟動監控系統...', { component: 'MainController' });

      // 驗證設定
      await this.validateConfiguration();

      // 啟動定時任務
      await this.startMonitoringTask();

      // 更新狀態
      this.monitorStatus.isRunning = true;
      this.monitorStatus.lastCheckTime = undefined;
      this.monitorStatus.nextCheckTime = this.calculateNextCheckTime();

      this.emit('status-changed', this.monitorStatus);
      this.logger.info('監控系統已啟動', { 
        component: 'MainController',
        interval: this.config?.monitorInterval 
      });

    } catch (error) {
      this.logger.error('啟動監控系統失敗', error, { component: 'MainController' });
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * 停止監控系統
   */
  async stop(): Promise<void> {
    if (!this.monitorStatus.isRunning) {
      this.logger.warn('監控系統未在運行', { component: 'MainController' });
      return;
    }

    try {
      this.logger.info('停止監控系統...', { component: 'MainController' });

      // 停止定時任務
      this.taskScheduler.unscheduleTask(this.monitoringTaskId);

      // 取消所有進行中的下載
      this.pdfDownloader.cancelAllDownloads();

      // 更新狀態
      this.monitorStatus.isRunning = false;
      this.monitorStatus.nextCheckTime = undefined;

      this.emit('status-changed', this.monitorStatus);
      this.logger.info('監控系統已停止', { component: 'MainController' });

    } catch (error) {
      this.logger.error('停止監控系統失敗', error, { component: 'MainController' });
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * 取得系統狀態
   */
  getStatus(): MonitorStatus {
    return { ...this.monitorStatus };
  }

  /**
   * 更新設定
   */
  async updateConfig(newConfig: SystemConfig): Promise<void> {
    try {
      this.logger.info('更新系統設定...', { component: 'MainController' });

      // 儲存設定
      await this.configManager.saveConfig(newConfig);
      
      // 重新載入設定
      await this.loadConfiguration();

      // 重新初始化模組（如果需要）
      await this.reinitializeModules();

      // 如果監控正在運行，重新啟動定時任務
      if (this.monitorStatus.isRunning) {
        await this.restartMonitoringTask();
      }

      this.emit('config-updated', this.config!);
      this.logger.info('系統設定已更新', { component: 'MainController' });

    } catch (error) {
      this.logger.error('更新系統設定失敗', error, { component: 'MainController' });
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * 取得當前設定
   */
  getConfig(): SystemConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * 取得任務排程器統計資訊
   */
  getTaskStatistics() {
    return this.taskScheduler.getStatistics();
  }

  /**
   * 取得監控任務資訊
   */
  getMonitoringTaskInfo() {
    return this.taskScheduler.getTaskInfo(this.monitoringTaskId);
  }

  /**
   * 暫停監控任務
   */
  pauseMonitoring(): boolean {
    if (!this.monitorStatus.isRunning) {
      return false;
    }

    const success = this.taskScheduler.pauseTask(this.monitoringTaskId);
    if (success) {
      this.monitorStatus.isRunning = false;
      this.monitorStatus.nextCheckTime = undefined;
      this.emit('status-changed', this.monitorStatus);
      this.logger.info('監控已暫停', { component: 'MainController' });
    }

    return success;
  }

  /**
   * 恢復監控任務
   */
  resumeMonitoring(): boolean {
    if (this.monitorStatus.isRunning) {
      return false;
    }

    const success = this.taskScheduler.resumeTask(this.monitoringTaskId);
    if (success) {
      this.monitorStatus.isRunning = true;
      this.monitorStatus.nextCheckTime = this.calculateNextCheckTime();
      this.emit('status-changed', this.monitorStatus);
      this.logger.info('監控已恢復', { component: 'MainController' });
    }

    return success;
  }

  /**
   * 手動執行一次檢查
   */
  async runManualCheck(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('系統尚未初始化');
    }

    try {
      this.logger.info('執行手動檢查...', { component: 'MainController' });
      await this.performMonitoringTask();
      this.logger.info('手動檢查完成', { component: 'MainController' });
    } catch (error) {
      this.logger.error('手動檢查失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 啟動監控系統（別名方法）
   */
  async startMonitoring(): Promise<void> {
    return this.start();
  }

  /**
   * 停止監控系統（別名方法）
   */
  async stopMonitoring(): Promise<void> {
    return this.stop();
  }

  /**
   * 取得最近的書籍
   */
  async getRecentBooks(limit: number = 10): Promise<BookInfo[]> {
    if (!this.isInitialized) {
      throw new Error('系統尚未初始化');
    }

    try {
      // 從資料庫取得最近的書籍
      const query = `
        SELECT * FROM books 
        ORDER BY created_at DESC 
        LIMIT $1
      `;
      const result = await this.dbManager.query(query, [limit]);
      return result.rows;
    } catch (error) {
      await this.errorHandler.handleDatabaseError(error as Error, 'SELECT', { 
        component: 'MainController',
        operation: 'getRecentBooks' 
      });
      return [];
    }
  }

  /**
   * 取得錯誤統計
   */
  getErrorStatistics() {
    return this.errorHandler.getStatistics();
  }

  /**
   * 取得系統健康狀態
   */
  getSystemHealthStatus() {
    return this.systemRecovery.getHealthStatus();
  }

  /**
   * 執行系統健康檢查
   */
  async performHealthCheck() {
    return this.systemRecovery.performHealthCheck();
  }

  /**
   * 執行系統自動恢復
   */
  async performAutoRecovery() {
    return this.systemRecovery.performAutoRecovery();
  }

  /**
   * 重置錯誤統計
   */
  resetErrorStatistics(): void {
    this.errorHandler.resetStatistics();
    this.logger.info('錯誤統計已重置', { component: 'MainController' });
  }

  /**
   * 取得 Logger 實例
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 根據ID下載單一書籍
   */
  async downloadBookById(bookId: number): Promise<void> {
    this.logger.info(`開始手動下載書籍 ID: ${bookId}`, { component: 'MainController' });
    try {
      const result = await this.dbManager.query('SELECT * FROM books WHERE id = $1', [bookId]);
      if (result.rows.length === 0) {
        throw new Error(`找不到 ID 為 ${bookId} 的書籍`);
      }
      const bookToDownload = result.rows[0] as BookInfo;

      // 觸發下載
      await this.pdfDownloader.downloadPDF(bookToDownload);
      this.logger.info(`已成功觸發書籍 ID: ${bookId} 的下載`, { component: 'MainController' });

    } catch (error) {
      this.logger.error(`手動下載書籍 ID: ${bookId} 失敗`, error, { component: 'MainController' });
      this.emit('error', error as Error);
      throw error;
    }
  }



  /**
   * 關閉系統並清理資源
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('開始關閉系統...', { component: 'MainController' });

    try {
      // 停止監控
      if (this.monitorStatus.isRunning) {
        await this.stop();
      }

      // 關閉任務排程器
      await this.taskScheduler.shutdown();

      // 關閉錯誤處理器和系統恢復機制
      await this.errorHandler.shutdown();
      await this.systemRecovery.stop();

      // 關閉各個模組
      await this.shutdownModules();

      // 關閉資料庫連接
      await this.dbManager.disconnect();

      // 關閉日誌器
      await this.logger.close();

      this.logger.info('系統已關閉', { component: 'MainController' });
    } catch (error) {
      console.error('關閉系統時發生錯誤:', error);
    }
  }

  /**
   * 載入設定
   */
  private async loadConfiguration(): Promise<void> {
    try {
      this.config = await this.configManager.loadConfig();
      this.logger.setLevel(this.config.logLevel);
      this.logger.debug('設定已載入', { 
        component: 'MainController',
        config: { ...this.config, lineAccessToken: '***' } // 隱藏敏感資訊
      });
    } catch (error) {
      this.logger.error('載入設定失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 初始化各個模組
   */
  private async initializeModules(): Promise<void> {
    if (!this.config) {
      throw new Error('設定尚未載入');
    }

    try {
      // 初始化WebScraper
      await this.webScraper.initialize();

      // 初始化LINE通知器
      this.lineNotifier.setUserId('broadcast'); // 廣播模式
      // 重新建立LineNotifier實例以更新token
      this.lineNotifier = new LineNotifier(this.config.lineAccessToken, 'broadcast');

      // 重新建立PDFDownloader實例以更新設定
      this.pdfDownloader = new PDFDownloader(this.config.downloadPath, this.config.maxRetries);

      this.logger.debug('所有模組已初始化', { component: 'MainController' });
    } catch (error) {
      this.logger.error('初始化模組失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 重新初始化模組（設定更新時使用）
   */
  private async reinitializeModules(): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      // 重新建立LINE通知器實例
      this.lineNotifier = new LineNotifier(this.config.lineAccessToken, 'broadcast');

      // 重新建立PDF下載器實例
      this.pdfDownloader = new PDFDownloader(this.config.downloadPath, this.config.maxRetries);

      // 更新錯誤處理器和系統恢復機制的設定
      this.errorHandler.setLineNotifier(this.lineNotifier);
      this.systemRecovery.setConfig(this.config);
      this.systemRecovery.setPDFDownloader(this.pdfDownloader);
      this.systemRecovery.setLineNotifier(this.lineNotifier);

      // 重新設定模組間通訊
      this.setupModuleCommunication();

      this.logger.debug('模組已重新初始化', { component: 'MainController' });
    } catch (error) {
      this.logger.error('重新初始化模組失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 設定模組間通訊
   */
  private setupModuleCommunication(): void {
    // PDF下載器事件
    this.pdfDownloader.on('download-started', (book: BookInfo) => {
      this.logger.info(`開始下載: ${book.title}`, { 
        component: 'MainController',
        bookId: book.id 
      });
      this.emit('download-started', book);
    });

    this.pdfDownloader.on('download-completed', async (book: BookInfo) => {
      this.logger.info(`下載完成: ${book.title}`, { 
        component: 'MainController',
        bookId: book.id 
      });
      
      this.monitorStatus.totalDownloaded++;
      this.emit('download-completed', book);

      // 發送LINE通知
      try {
        await this.lineNotifier.sendBookNotification(book);
        this.emit('notification-sent', book);
      } catch (error) {
        this.logger.error('發送LINE通知失敗', error, { 
          component: 'MainController',
          bookId: book.id 
        });
      }
    });

    this.pdfDownloader.on('download-failed', (book: BookInfo, error: Error) => {
      this.logger.error(`下載失敗: ${book.title}`, error, { 
        component: 'MainController',
        bookId: book.id 
      });
      
      this.monitorStatus.errors++;
      this.emit('download-failed', book, error);
    });

    this.logger.debug('模組間通訊已設定', { component: 'MainController' });
  }

  /**
   * 設定任務排程器事件處理
   */
  private setupTaskSchedulerEvents(): void {
    this.taskScheduler.on('task-started', (taskId) => {
      this.logger.debug(`任務開始執行: ${taskId}`, { 
        component: 'MainController',
        taskId 
      });
    });

    this.taskScheduler.on('task-completed', (result) => {
      this.logger.debug(`任務執行完成: ${result.taskId}`, { 
        component: 'MainController',
        taskId: result.taskId,
        duration: result.duration
      });
    });

    this.taskScheduler.on('task-failed', (result) => {
      this.logger.error(`任務執行失敗: ${result.taskId}`, result.error, { 
        component: 'MainController',
        taskId: result.taskId,
        duration: result.duration
      });
      
      this.monitorStatus.errors++;
      this.emit('error', result.error!);
    });

    this.taskScheduler.on('scheduler-error', (error) => {
      this.logger.error('任務排程器發生錯誤', error, { 
        component: 'MainController' 
      });
      this.emit('error', error);
    });

    this.logger.debug('任務排程器事件已設定', { component: 'MainController' });
  }

  /**
   * 設定錯誤處理器和系統恢復機制
   */
  private async setupErrorHandlerAndRecovery(): Promise<void> {
    try {
      // 設定錯誤處理器的LINE通知器
      if (this.config?.lineAccessToken) {
        this.errorHandler.setLineNotifier(this.lineNotifier);
      }

      // 設定系統恢復機制
      this.systemRecovery.setConfig(this.config!);
      this.systemRecovery.setPDFDownloader(this.pdfDownloader);
      if (this.config?.lineAccessToken) {
        this.systemRecovery.setLineNotifier(this.lineNotifier);
      }

      // 設定錯誤處理器事件
      this.setupErrorHandlerEvents();

      // 設定系統恢復機制事件
      this.setupSystemRecoveryEvents();

      // 啟動系統恢復機制
      await this.systemRecovery.start();

      this.logger.debug('錯誤處理器和系統恢復機制已設定', { component: 'MainController' });

    } catch (error) {
      this.logger.error('設定錯誤處理器和系統恢復機制失敗', error, { component: 'MainController' });
      throw error;
    }
  }

  /**
   * 設定錯誤處理器事件
   */
  private setupErrorHandlerEvents(): void {
    this.errorHandler.on('critical-error', (error, classification) => {
      this.logger.error('檢測到嚴重錯誤', error, { 
        component: 'MainController',
        classification 
      });
      this.emit('error', error);
    });

    this.errorHandler.on('error-handled', (error, result) => {
      this.logger.debug('錯誤已處理', { 
        component: 'MainController',
        errorMessage: error.message,
        result 
      });
    });

    this.errorHandler.on('max-retries-exceeded', (error, attempts) => {
      this.logger.warn('錯誤重試次數已達上限', { 
        component: 'MainController',
        errorMessage: error.message,
        attempts 
      });
    });
  }

  /**
   * 設定系統恢復機制事件
   */
  private setupSystemRecoveryEvents(): void {
    this.systemRecovery.on('system-degraded', (status) => {
      this.logger.warn('系統狀態降級', { 
        component: 'MainController',
        overallStatus: status.overall,
        issues: status.issues.length 
      });
    });

    this.systemRecovery.on('system-recovered', (status) => {
      this.logger.info('系統狀態已恢復', { 
        component: 'MainController',
        overallStatus: status.overall 
      });
    });

    this.systemRecovery.on('download-recovered', (book) => {
      this.logger.info(`下載已恢復: ${book.title}`, { 
        component: 'MainController',
        bookId: book.id 
      });
    });

    this.systemRecovery.on('health-issue-detected', (issue) => {
      this.logger.warn(`檢測到健康問題: ${issue.message}`, { 
        component: 'MainController',
        issue 
      });
    });

    this.systemRecovery.on('health-issue-resolved', (issue) => {
      this.logger.info(`健康問題已解決: ${issue.message}`, { 
        component: 'MainController',
        issue 
      });
    });
  }

  /**
   * 設定錯誤處理（保留原有的全域錯誤處理作為備用）
   */
  private setupErrorHandling(): void {
    // 這些處理器現在主要作為備用，主要錯誤處理由ErrorHandler負責
    process.on('uncaughtException', async (error) => {
      if (!this.isShuttingDown) {
        await this.errorHandler.handleSystemError(error, { 
          global: true, 
          origin: 'uncaughtException' 
        });
      }
    });

    process.on('unhandledRejection', async (reason, promise) => {
      if (!this.isShuttingDown) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        await this.errorHandler.handleSystemError(error, { 
          global: true, 
          origin: 'unhandledRejection',
          promise: promise.toString() 
        });
      }
    });
  }

  /**
   * 驗證設定
   */
  private async validateConfiguration(): Promise<void> {
    if (!this.config) {
      throw new Error('設定尚未載入');
    }

    // 驗證LINE Token
    if (this.config.lineAccessToken) {
      const isValid = await this.lineNotifier.validateToken();
      if (!isValid) {
        throw new Error('LINE Access Token 無效');
      }
    }

    // 驗證下載路徑
    // 這裡可以添加路徑存在性和可寫性檢查

    this.logger.debug('設定驗證通過', { component: 'MainController' });
  }

  /**
   * 啟動監控任務
   */
  private async startMonitoringTask(): Promise<void> {
    if (!this.config) {
      throw new Error('設定尚未載入');
    }

    // 使用TaskScheduler排程監控任務
    this.taskScheduler.scheduleTaskWithInterval(
      this.monitoringTaskId,
      '書籍監控任務',
      this.config.monitorInterval,
      async () => {
        if (!this.isShuttingDown) {
          await this.performMonitoringTask();
        }
      }
    );

    this.logger.info('監控任務已排程', { 
      component: 'MainController',
      taskId: this.monitoringTaskId,
      intervalMs: this.config.monitorInterval
    });
  }

  /**
   * 重新啟動監控任務
   */
  private async restartMonitoringTask(): Promise<void> {
    // 取消現有任務
    this.taskScheduler.unscheduleTask(this.monitoringTaskId);
    
    // 重新排程任務
    await this.startMonitoringTask();
  }

  /**
   * 執行監控任務
   */
  private async performMonitoringTask(): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('開始執行監控任務', { component: 'MainController' });

      // 更新狀態
      this.monitorStatus.lastCheckTime = new Date();
      this.monitorStatus.nextCheckTime = this.calculateNextCheckTime();

      // 1. 爬取網站並解析書籍列表
      const parsingResult = await this.webScraper.scrape(
        'https://www.budaedu.org/#/books/applicable/chinese',
        async (page) => {
          return await this.bookParser.parseBookList(page);
        }
      );

      if (!parsingResult.success || !parsingResult.data) {
        throw new Error('網站爬取失敗');
      }

      const books = parsingResult.data.books;
      this.monitorStatus.totalBooksFound = books.length;

      // 2. 檢測新書
      const detectionResult = await this.bookDetector.detectNewBooks(books);
      
      if (detectionResult.newBooks.length > 0) {
        this.logger.info(`檢測到 ${detectionResult.newBooks.length} 本新書`, { 
          component: 'MainController',
          newBooksCount: detectionResult.newBooks.length 
        });

        // 3. 下載新書
        for (const book of detectionResult.newBooks) {
          this.emit('new-book-detected', book);
          
          try {
            await this.pdfDownloader.downloadPDF(book);
          } catch (error) {
            this.logger.error(`下載書籍失敗: ${book.title}`, error, { 
              component: 'MainController',
              bookId: book.id 
            });
            this.monitorStatus.errors++;
          }
        }
      } else {
        this.logger.info('未檢測到新書', { component: 'MainController' });
      }

      const duration = Date.now() - startTime;
      this.logger.performance('監控任務執行', duration, { component: 'MainController' });

    } catch (error) {
      this.monitorStatus.errors++;
      this.emit('error', error as Error);

      // 使用錯誤處理器處理錯誤
      await this.errorHandler.handleSystemError(error as Error, {
        component: 'MainController',
        operation: 'performMonitoringTask',
        context: { monitoringTaskId: this.monitoringTaskId }
      });
    }
  }

  /**
   * 計算下次檢查時間
   */
  private calculateNextCheckTime(): Date | undefined {
    if (!this.config || !this.monitorStatus.isRunning) {
      return undefined;
    }

    return new Date(Date.now() + this.config.monitorInterval);
  }

  /**
   * 關閉各個模組
   */
  private async shutdownModules(): Promise<void> {
    try {
      // 關閉瀏覽器管理器
      if (this.webScraper) {
        await this.webScraper.close();
      }

      this.logger.debug('所有模組已關閉', { component: 'MainController' });
    } catch (error) {
      this.logger.error('關閉模組時發生錯誤', error, { component: 'MainController' });
    }
  }
}

// 匯出事件類型以供TypeScript使用
export declare interface MainController {
  on<K extends keyof MainControllerEvents>(event: K, listener: MainControllerEvents[K]): this;
  emit<K extends keyof MainControllerEvents>(event: K, ...args: Parameters<MainControllerEvents[K]>): boolean;
}