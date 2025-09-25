/**
 * 模擬物件工廠
 *
 * 提供各種服務和模組的模擬實作，用於單元測試
 */

import { jest } from '@jest/globals';
import { PoolClient } from 'pg';
import { DatabaseManager } from '../database/DatabaseManager';
import { ConfigManager } from '../services/ConfigManager';
import { Logger } from '../services/Logger';
import { WebScraper } from '../services/WebScraper';
import { BookParser } from '../services/BookParser';
import { BookDetector } from '../services/BookDetector';
import { PDFDownloader } from '../services/PDFDownloader';
import { LineNotifier } from '../services/LineNotifier';
import { TaskScheduler } from '../services/TaskScheduler';
import { BrowserManager } from '../services/BrowserManager';
import { SystemRecovery } from '../services/SystemRecovery';
import { ErrorHandler } from '../services/ErrorHandler';
import { createMockQueryResult, createMockSystemConfig } from './testUtils';

/**
 * 建立模擬的 DatabaseManager
 */
export const createMockDatabaseManager = () => {
  // @ts-ignore - 忽略 TypeScript 類型檢查以允許 mock 物件
  const mockDbManager = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(createMockQueryResult()),
    transaction: jest.fn().mockImplementation(async (callback: any) => {
      return await callback(mockDbManager);
    }),
    migrate: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue({
      status: 'connected',
      latency: 10,
      timestamp: new Date()
    }),
    isConnected: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue('connected'),
    // IDatabase 介面方法
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    addBook: jest.fn().mockResolvedValue(1),
    updateBook: jest.fn().mockResolvedValue(undefined),
    getBookById: jest.fn().mockResolvedValue(null),
    getBookByPdfUrl: jest.fn().mockResolvedValue(null),
    getAllBooks: jest.fn().mockResolvedValue([]),
    deleteBook: jest.fn().mockResolvedValue(undefined),
    getConfigValue: jest.fn().mockResolvedValue(null),
    setConfigValue: jest.fn().mockResolvedValue(undefined),
    deleteConfigValue: jest.fn().mockResolvedValue(undefined),
    addLog: jest.fn().mockResolvedValue(undefined),
    getLogs: jest.fn().mockResolvedValue([]),
    cleanupOldLogs: jest.fn().mockResolvedValue(undefined)
  };

  return mockDbManager as any;
};

/**
 * 建立模擬的 ConfigManager
 */
export const createMockConfigManager = () => {
  const mockConfig = createMockSystemConfig();

  const mockConfigManager = {
    loadConfig: jest.fn().mockResolvedValue(mockConfig as never),
    saveConfig: jest.fn().mockResolvedValue(undefined as never),
    get: jest.fn().mockResolvedValue('test-value' as never),
    set: jest.fn().mockResolvedValue(undefined as never),
    delete: jest.fn().mockResolvedValue(true as never),
    encryptSensitiveData: jest.fn().mockResolvedValue('encrypted-data' as never),
    decryptSensitiveData: jest.fn().mockResolvedValue('decrypted-data' as never),
    isEncryptionInitialized: jest.fn().mockReturnValue(true),
    getAllConfigItems: jest.fn().mockResolvedValue([] as never),
    reinitializeEncryption: jest.fn().mockResolvedValue(undefined as never)
  };

  return mockConfigManager as any;
};

/**
 * 建立模擬的 Logger
 */
export const createMockLogger = () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    http: jest.fn(),
    silly: jest.fn(),
    setLevel: jest.fn(),
    getLevel: jest.fn().mockReturnValue('info'),
    child: jest.fn().mockReturnThis(),
    close: jest.fn().mockResolvedValue(undefined as never),
    cleanupOldLogs: jest.fn().mockResolvedValue(undefined as never),
    getLogStats: jest.fn().mockResolvedValue({
      totalLogs: 100,
      errorLogs: 5,
      warnLogs: 10,
      infoLogs: 85
    } as never)
  };

  // 模擬 Logger.getInstance
  jest.spyOn(Logger, 'getInstance').mockReturnValue(mockLogger as any);

  return mockLogger as any;
};

/**
 * 建立模擬的 WebScraper
 */
export const createMockWebScraper = () => {
  const mockWebScraper = {
    initialize: jest.fn().mockResolvedValue(undefined as never),
    scrapeWebsite: jest.fn().mockResolvedValue('<html><body>Mock HTML</body></html>' as never),
    scrapeWithRetry: jest.fn().mockResolvedValue('<html><body>Mock HTML</body></html>' as never),
    checkWebsiteAvailability: jest.fn().mockResolvedValue({
      available: true,
      responseTime: 100,
      statusCode: 200
    } as never),
    takeScreenshot: jest.fn().mockResolvedValue(Buffer.from('mock-screenshot') as never),
    close: jest.fn().mockResolvedValue(undefined as never),
    isRunning: jest.fn().mockReturnValue(true),
    scrape: jest.fn().mockResolvedValue('<html><body>Mock HTML</body></html>' as never),
    scrapeMultiple: jest.fn().mockResolvedValue([] as never),
    getBrowserManager: jest.fn().mockReturnValue({} as never)
  };

  return mockWebScraper as any;
};

/**
 * 建立模擬的 BookParser
 */
export const createMockBookParser = () => {
  const mockBookParser = {
    parseBookList: jest.fn().mockResolvedValue([] as never),
    parseBookDetails: jest.fn().mockResolvedValue({
      title: 'Mock Book',
      author: 'Mock Author',
      description: 'Mock Description',
      pdfUrl: 'https://example.com/mock.pdf'
    } as never),
    validateBookData: jest.fn().mockReturnValue({
      isValid: true,
      errors: []
    } as never),
    convertToBookInfo: jest.fn().mockReturnValue({} as never),
    convertToBookInfoList: jest.fn().mockReturnValue([] as never),
    updateConfig: jest.fn(),
    getConfig: jest.fn().mockReturnValue({} as never)
  };

  return mockBookParser as any;
};

/**
 * 建立模擬的 BookDetector
 */
export const createMockBookDetector = () => {
  const mockBookDetector = {
    detectNewBooks: jest.fn().mockResolvedValue([] as never),
    compareBookLists: jest.fn().mockReturnValue([] as never),
    isNewBook: jest.fn().mockResolvedValue(true as never),
    getBookFingerprint: jest.fn().mockReturnValue('mock-fingerprint'),
    getBookStatistics: jest.fn().mockReturnValue({} as never),
    findDuplicateBooks: jest.fn().mockReturnValue([] as never),
    updateConfig: jest.fn(),
    getConfig: jest.fn().mockReturnValue({} as never)
  };

  return mockBookDetector as any;
};

/**
 * 建立模擬的 PDFDownloader
 */
export const createMockPDFDownloader = () => {
  const mockPDFDownloader = {
    downloadPDF: jest.fn().mockResolvedValue({
      success: true,
      filePath: '/mock/path/file.pdf',
      fileSize: 1024000
    } as never),
    setDownloadPath: jest.fn(),
    setMaxRetries: jest.fn(),
    cancelDownload: jest.fn().mockReturnValue(true as never),
    cancelAllDownloads: jest.fn(),
    getActiveDownloadCount: jest.fn().mockReturnValue(0),
    getActiveDownloadIds: jest.fn().mockReturnValue([] as never),
    validatePDF: jest.fn().mockResolvedValue(true as never),
    generateFileName: jest.fn().mockReturnValue('mock-filename.pdf'),
    checkFileExists: jest.fn().mockResolvedValue(false as never),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    addListener: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    eventNames: jest.fn().mockReturnValue([] as never)
  };

  return mockPDFDownloader as any;
};

/**
 * 建立模擬的 LineNotifier
 */
export const createMockLineNotifier = () => {
  const mockLineNotifier = {
    setUserId: jest.fn(),
    setAccessToken: jest.fn(),
    setRetryConfig: jest.fn(),
    setUseFlexMessages: jest.fn(),
    sendBookNotification: jest.fn().mockResolvedValue(true as never),
    sendErrorNotification: jest.fn().mockResolvedValue(true as never),
    sendStatusNotification: jest.fn().mockResolvedValue(true as never),
    sendDailySummaryNotification: jest.fn().mockResolvedValue(true as never),
    validateToken: jest.fn().mockResolvedValue(true as never),
    client: {},
    logger: {},
    maxRetries: 3,
    retryDelay: 1000
  };

  return mockLineNotifier as any;
};

/**
 * 建立模擬的 TaskScheduler
 */
export const createMockTaskScheduler = () => {
  const mockTaskScheduler = {
    scheduleTask: jest.fn(),
    scheduleTaskWithInterval: jest.fn(),
    unscheduleTask: jest.fn(),
    pauseTask: jest.fn().mockReturnValue(true as never),
    resumeTask: jest.fn().mockReturnValue(true as never),
    getTaskInfo: jest.fn().mockReturnValue({
      id: 'mock-task',
      name: 'Mock Task',
      status: 'idle'
    } as never),
    getStatistics: jest.fn().mockReturnValue({
      totalTasks: 1,
      runningTasks: 0,
      pausedTasks: 0,
      errorTasks: 0,
      totalRuns: 0,
      totalErrors: 0
    } as never),
    shutdown: jest.fn().mockResolvedValue(undefined as never),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    runTaskNow: jest.fn(),
    getAllTasks: jest.fn().mockReturnValue([] as never),
    getRunningTaskCount: jest.fn().mockReturnValue(0),
    hasTask: jest.fn().mockReturnValue(true as never),
    eventNames: jest.fn().mockReturnValue([] as never)
  };

  return mockTaskScheduler as any;
};

/**
 * 建立模擬的 BrowserManager
 */
export const createMockBrowserManager = () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined as never),
    content: jest.fn().mockResolvedValue('<html><body>Mock Content</body></html>' as never),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('mock-screenshot') as never),
    waitForSelector: jest.fn().mockResolvedValue({} as never),
    evaluate: jest.fn().mockResolvedValue('mock-result' as never),
    close: jest.fn().mockResolvedValue(undefined as never)
  };

  const mockBrowserManager = {
    launch: jest.fn().mockResolvedValue(undefined as never),
    createPage: jest.fn().mockResolvedValue(mockPage as never),
    navigateToPage: jest.fn().mockResolvedValue(undefined as never),
    waitForElement: jest.fn().mockResolvedValue({} as never),
    close: jest.fn().mockResolvedValue(undefined as never),
    isRunning: jest.fn().mockReturnValue(true),
    waitForPageLoad: jest.fn().mockResolvedValue(undefined as never),
    closePage: jest.fn().mockResolvedValue(undefined as never),
    getBrowser: jest.fn().mockReturnValue({} as never),
    setupPageErrorHandling: jest.fn()
  };

  return mockBrowserManager as any;
};

/**
 * 建立模擬的 SystemRecovery
 */
export const createMockSystemRecovery = () => {
  const mockSystemRecovery = {
    setConfig: jest.fn(),
    setPDFDownloader: jest.fn(),
    setLineNotifier: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined as never),
    stop: jest.fn().mockResolvedValue(undefined as never),
    checkSystemHealth: jest.fn().mockResolvedValue({
      healthy: true,
      issues: []
    } as never),
    recoverFromCrash: jest.fn().mockResolvedValue(true as never),
    recoverIncompleteDownloads: jest.fn().mockResolvedValue([] as never),
    cleanupCorruptedFiles: jest.fn().mockResolvedValue(0 as never),
    validateSystemIntegrity: jest.fn().mockResolvedValue(true as never),
    createSystemBackup: jest.fn().mockResolvedValue('backup-path' as never),
    restoreFromBackup: jest.fn().mockResolvedValue(true as never),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn().mockReturnValue([] as never)
  };

  return mockSystemRecovery as any;
};

/**
 * 建立模擬的 ErrorHandler
 */
export const createMockErrorHandler = () => {
  const mockErrorHandler = {
    setLineNotifier: jest.fn(),
    handleError: jest.fn().mockResolvedValue(undefined as never),
    handleNetworkError: jest.fn().mockResolvedValue(undefined as never),
    handleDatabaseError: jest.fn().mockResolvedValue(undefined as never),
    handleFileSystemError: jest.fn().mockResolvedValue(undefined as never),
    handleAPIError: jest.fn().mockResolvedValue(undefined as never),
    handleParsingError: jest.fn().mockResolvedValue(undefined as never),
    handleDownloadError: jest.fn().mockResolvedValue(undefined as never),
    handleSystemError: jest.fn().mockResolvedValue(undefined as never),
    shouldRetry: jest.fn().mockReturnValue(true as never),
    getRetryDelay: jest.fn().mockReturnValue(1000),
    logError: jest.fn(),
    notifyError: jest.fn().mockResolvedValue(true as never),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    eventNames: jest.fn().mockReturnValue([] as never)
  };

  return mockErrorHandler as any;
};

/**
 * 建立模擬的 Puppeteer Browser
 */
export const createMockPuppeteerBrowser = () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined as never),
    content: jest.fn().mockResolvedValue('<html><body>Mock Content</body></html>' as never),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('mock-screenshot') as never),
    waitForSelector: jest.fn().mockResolvedValue({} as never),
    evaluate: jest.fn().mockResolvedValue('mock-result' as never),
    close: jest.fn().mockResolvedValue(undefined as never),
    setUserAgent: jest.fn().mockResolvedValue(undefined as never),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined as never)
  };

  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage as never),
    close: jest.fn().mockResolvedValue(undefined as never),
    isConnected: jest.fn().mockReturnValue(true),
    pages: jest.fn().mockResolvedValue([mockPage] as never)
  };

  return { mockBrowser: mockBrowser as any, mockPage: mockPage as any };
};

/**
 * 建立模擬的 Axios 實例
 */
export const createMockAxios = () => {
  const mockAxios = {
    get: jest.fn().mockResolvedValue({
      status: 200,
      data: 'mock-data',
      headers: {}
    } as never),
    post: jest.fn().mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: {}
    } as never),
    put: jest.fn().mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: {}
    } as never),
    delete: jest.fn().mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: {}
    } as never),
    create: jest.fn().mockReturnThis(),
    defaults: {
      headers: {},
      timeout: 30000
    },
    interceptors: {
      request: {
        use: jest.fn(),
        eject: jest.fn()
      },
      response: {
        use: jest.fn(),
        eject: jest.fn()
      }
    }
  };

  return mockAxios as any;
};

/**
 * 重置所有模擬物件
 */
export const resetAllMocks = () => {
  jest.clearAllMocks();
  jest.resetAllMocks();
};
