import { ErrorHandler, ErrorType, ErrorSeverity, ErrorHandlingStrategy } from '../ErrorHandler';
import { Logger } from '../Logger';
import { LineNotifier } from '../LineNotifier';

// Mock dependencies
jest.mock('../Logger');
jest.mock('../LineNotifier');

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: jest.Mocked<Logger>;
  let mockLineNotifier: jest.Mocked<LineNotifier>;

  beforeEach(() => {
    // Create mock instances
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      http: jest.fn(),
      silly: jest.fn()
    } as any;

    mockLineNotifier = {
      sendErrorNotification: jest.fn().mockResolvedValue(true)
    } as any;

    // Create ErrorHandler instance
    errorHandler = new ErrorHandler(mockLogger, mockLineNotifier);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with logger and line notifier', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        '全域錯誤處理器已初始化',
        { component: 'ErrorHandler' }
      );
    });

    it('should initialize without line notifier', () => {
      const handler = new ErrorHandler(mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '全域錯誤處理器已初始化',
        { component: 'ErrorHandler' }
      );
    });
  });

  describe('handleError', () => {
    it('should handle network error correctly', async () => {
      const networkError = new Error('ENOTFOUND example.com');
      
      const result = await errorHandler.handleError(networkError);
      
      expect(result.handled).toBe(true);
      expect(result.classification.type).toBe(ErrorType.NETWORK);
      expect(result.classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.shouldRetry).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle API error correctly', async () => {
      const apiError = new Error('API 401 Unauthorized');
      
      const result = await errorHandler.handleError(apiError);
      
      expect(result.handled).toBe(true);
      expect(result.classification.type).toBe(ErrorType.API);
      expect(result.classification.severity).toBe(ErrorSeverity.HIGH);
      expect(result.shouldNotify).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle database error correctly', async () => {
      const dbError = new Error('Database connection pool exhausted');
      
      const result = await errorHandler.handleError(dbError);
      
      expect(result.handled).toBe(true);
      expect(result.classification.type).toBe(ErrorType.DATABASE);
      expect(result.classification.severity).toBe(ErrorSeverity.HIGH);
      expect(result.shouldEscalate).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle unknown error with default classification', async () => {
      const unknownError = new Error('Some completely unknown error');
      
      const result = await errorHandler.handleError(unknownError);
      
      expect(result.handled).toBe(true);
      expect(result.classification.type).toBe(ErrorType.UNKNOWN);
      expect(result.classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.shouldNotify).toBe(true);
    });

    it('should send LINE notification for high severity errors', async () => {
      const criticalError = new Error('System process memory exhausted');
      
      await errorHandler.handleError(criticalError);
      
      expect(mockLineNotifier.sendErrorNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SYSTEM',
          message: 'System process memory exhausted',
          details: expect.objectContaining({
            type: ErrorType.SYSTEM,
            severity: ErrorSeverity.CRITICAL
          })
        })
      );
    });

    it('should emit error-classified event', async () => {
      const eventSpy = jest.fn();
      errorHandler.on('error-classified', eventSpy);
      
      const error = new Error('Test error');
      await errorHandler.handleError(error);
      
      expect(eventSpy).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should emit error-handled event', async () => {
      const eventSpy = jest.fn();
      errorHandler.on('error-handled', eventSpy);
      
      const error = new Error('Test error');
      await errorHandler.handleError(error);
      
      expect(eventSpy).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should handle error in error handler gracefully', async () => {
      // Mock the classifyError method to throw error
      jest.spyOn(errorHandler as any, 'classifyError').mockImplementation(() => {
        throw new Error('Classification error');
      });
      
      const error = new Error('Original error');
      const result = await errorHandler.handleError(error);
      
      expect(result.handled).toBe(false);
      expect(result.shouldEscalate).toBe(true);
      expect(result.classification.type).toBe(ErrorType.SYSTEM);
      expect(result.classification.severity).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('handleNetworkError', () => {
    it('should retry network error with exponential backoff', async () => {
      const networkError = new Error('ECONNREFUSED');
      
      // Mock delay to resolve immediately for testing
      jest.spyOn(errorHandler as any, 'delay').mockResolvedValue(undefined);
      
      const result = await errorHandler.handleNetworkError(networkError, 0);
      
      expect(result.shouldRetry).toBe(true);
      expect(result.retryDelay).toBeGreaterThan(0);
    });

    it('should emit retry-attempted event', async () => {
      const eventSpy = jest.fn();
      errorHandler.on('retry-attempted', eventSpy);
      
      const networkError = new Error('ECONNREFUSED');
      jest.spyOn(errorHandler as any, 'delay').mockResolvedValue(undefined);
      
      await errorHandler.handleNetworkError(networkError, 0);
      
      expect(eventSpy).toHaveBeenCalledWith(networkError, 1, 3);
    });

    it('should emit max-retries-exceeded event after max retries', async () => {
      const eventSpy = jest.fn();
      errorHandler.on('max-retries-exceeded', eventSpy);
      
      const networkError = new Error('ECONNREFUSED');
      jest.spyOn(errorHandler as any, 'delay').mockResolvedValue(undefined);
      
      // Simulate max retries reached by calling the same error multiple times
      const context = { testKey: 'test' };
      await errorHandler.handleNetworkError(networkError, 0, context);
      await errorHandler.handleNetworkError(networkError, 1, context);
      await errorHandler.handleNetworkError(networkError, 2, context);
      await errorHandler.handleNetworkError(networkError, 3, context);
      
      expect(eventSpy).toHaveBeenCalledWith(networkError, expect.any(Number));
    }, 10000);
  });

  describe('specialized error handlers', () => {
    it('should handle parsing error', async () => {
      const parsingError = new Error('JSON parse failed');
      
      const result = await errorHandler.handleParsingError(parsingError, { url: 'test.com' });
      
      expect(result.classification.type).toBe(ErrorType.PARSING);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle download error', async () => {
      const downloadError = new Error('File write error');
      const bookInfo = { id: 1, title: 'Test Book' };
      
      const result = await errorHandler.handleDownloadError(downloadError, bookInfo);
      
      expect(result.classification.type).toBe(ErrorType.DOWNLOAD);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle API error with context', async () => {
      const apiError = new Error('API 500 Internal Server Error');
      
      const result = await errorHandler.handleAPIError(apiError, 'LINE_API', { endpoint: '/message' });
      
      expect(result.classification.type).toBe(ErrorType.API);
      expect(result.shouldNotify).toBe(true);
    });

    it('should handle database error with operation context', async () => {
      const dbError = new Error('Database query timeout');
      
      const result = await errorHandler.handleDatabaseError(dbError, 'SELECT', { table: 'books' });
      
      expect(result.classification.type).toBe(ErrorType.DATABASE);
      expect(result.shouldEscalate).toBe(true);
    });

    it('should handle system error', async () => {
      const systemError = new Error('System process out of memory');
      
      const result = await errorHandler.handleSystemError(systemError, { process: 'main' });
      
      expect(result.classification.type).toBe(ErrorType.SYSTEM);
      expect(result.classification.severity).toBe(ErrorSeverity.CRITICAL);
    });
  });

  describe('statistics', () => {
    it('should track error statistics', async () => {
      const error1 = new Error('ENOTFOUND network error');
      const error2 = new Error('API 401 error');
      const error3 = new Error('System process memory error');
      
      await errorHandler.handleError(error1);
      await errorHandler.handleError(error2);
      await errorHandler.handleError(error3);
      
      const stats = errorHandler.getStatistics();
      
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
      expect(stats.errorsByType[ErrorType.API]).toBe(1);
      expect(stats.errorsByType[ErrorType.SYSTEM]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.recentErrors).toHaveLength(3);
    });

    it('should track critical errors', async () => {
      const criticalError = new Error('System process crash');
      
      await errorHandler.handleSystemError(criticalError);
      
      const stats = errorHandler.getStatistics();
      
      expect(stats.criticalErrorsCount).toBe(1);
      expect(stats.lastCriticalError).toBeDefined();
      expect(stats.lastCriticalError?.message).toBe('System process crash');
    });

    it('should reset statistics', async () => {
      const error = new Error('Test error');
      await errorHandler.handleError(error);
      
      let stats = errorHandler.getStatistics();
      expect(stats.totalErrors).toBe(1);
      
      errorHandler.resetStatistics();
      
      stats = errorHandler.getStatistics();
      expect(stats.totalErrors).toBe(0);
      expect(stats.recentErrors).toHaveLength(0);
    });

    it('should limit recent errors to configured limit', async () => {
      // Generate more errors than the limit (100)
      for (let i = 0; i < 105; i++) {
        await errorHandler.handleError(new Error(`Error ${i}`));
      }
      
      const stats = errorHandler.getStatistics();
      expect(stats.recentErrors).toHaveLength(100);
      expect(stats.totalErrors).toBe(105);
    });
  });

  describe('classification rules', () => {
    it('should add custom classification rule', async () => {
      errorHandler.addClassificationRule({
        pattern: /custom error/i,
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        strategy: ErrorHandlingStrategy.IGNORE,
        retryable: false
      });
      
      const customError = new Error('Custom error occurred');
      const result = await errorHandler.handleError(customError);
      
      expect(result.classification.type).toBe(ErrorType.VALIDATION);
      expect(result.classification.severity).toBe(ErrorSeverity.LOW);
      expect(result.classification.strategy).toBe(ErrorHandlingStrategy.IGNORE);
    });

    it('should remove classification rule', () => {
      const pattern = /test pattern/i;
      
      errorHandler.addClassificationRule({
        pattern,
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        strategy: ErrorHandlingStrategy.LOG_ONLY,
        retryable: false
      });
      
      const removed = errorHandler.removeClassificationRule(pattern);
      expect(removed).toBe(true);
      
      const removedAgain = errorHandler.removeClassificationRule(pattern);
      expect(removedAgain).toBe(false);
    });
  });

  describe('LINE notifier integration', () => {
    it('should set LINE notifier', () => {
      const newNotifier = new LineNotifier('test-token');
      errorHandler.setLineNotifier(newNotifier);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'LINE通知器已設定',
        { component: 'ErrorHandler' }
      );
    });

    it('should emit notification-sent event', async () => {
      const eventSpy = jest.fn();
      errorHandler.on('notification-sent', eventSpy);
      
      const error = new Error('API 500 error');
      await errorHandler.handleError(error);
      
      expect(eventSpy).toHaveBeenCalledWith(error, true);
    });

    it('should handle notification failure gracefully', async () => {
      mockLineNotifier.sendErrorNotification.mockRejectedValue(new Error('Notification failed'));
      
      const error = new Error('API 500 error');
      const result = await errorHandler.handleError(error);
      
      expect(result.handled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '發送錯誤通知失敗',
        expect.any(Error),
        expect.objectContaining({
          component: 'ErrorHandler',
          originalError: 'API 500 error'
        })
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await errorHandler.shutdown();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        '錯誤處理器已關閉',
        { component: 'ErrorHandler' }
      );
    });
  });

  describe('global error handling', () => {
    it('should setup global error handlers', () => {
      // Verify that process event listeners are set up
      const uncaughtExceptionListeners = process.listenerCount('uncaughtException');
      const unhandledRejectionListeners = process.listenerCount('unhandledRejection');
      
      expect(uncaughtExceptionListeners).toBeGreaterThan(0);
      expect(unhandledRejectionListeners).toBeGreaterThan(0);
    });
  });

  describe('error key generation', () => {
    it('should generate consistent error keys', () => {
      const error1 = new Error('Test error');
      const error2 = new Error('Test error');
      const context = { test: 'context' };
      
      const key1 = (errorHandler as any).generateErrorKey(error1, context);
      const key2 = (errorHandler as any).generateErrorKey(error2, context);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different contexts', () => {
      const error = new Error('Test error');
      const context1 = { test: 'context1' };
      const context2 = { test: 'context2' };
      
      const key1 = (errorHandler as any).generateErrorKey(error, context1);
      const key2 = (errorHandler as any).generateErrorKey(error, context2);
      
      expect(key1).not.toBe(key2);
    });
  });
});