import { Logger, LoggerConfig } from '../Logger';
import fs from 'fs';
import path from 'path';

// Mock winston
jest.mock('winston', () => {
  const mockFormat = {
    combine: jest.fn((...formats) => ({ formats })),
    timestamp: jest.fn((options) => ({ type: 'timestamp', options })),
    errors: jest.fn((options) => ({ type: 'errors', options })),
    json: jest.fn(() => ({ type: 'json' })),
    colorize: jest.fn((options) => ({ type: 'colorize', options })),
    printf: jest.fn((template) => ({ type: 'printf', template }))
  };

  const mockTransport = jest.fn().mockImplementation((options) => {
    const transport = {
      ...options,
      log: jest.fn(),
      on: jest.fn(),
      format: options.format,
      level: options.level,
      filename: options.filename,
      datePattern: options.datePattern,
      maxSize: options.maxSize,
      maxFiles: options.maxFiles,
      zippedArchive: options.zippedArchive,
      auditFile: options.auditFile
    };
    // Make it a proper transport-like object
    Object.setPrototypeOf(transport, {});
    return transport;
  });

  const mockLogger = jest.fn().mockImplementation((options) => {
    const logger = {
      ...options,
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      http: jest.fn(),
      silly: jest.fn(),
      level: options.level || 'info',
      transports: options.transports || [],
      clear: jest.fn()
    };
    return logger;
  });

  return {
    createLogger: mockLogger,
    format: mockFormat,
    transports: {
      Console: mockTransport,
      DailyRotateFile: mockTransport
    }
  };
});

// Mock winston-daily-rotate-file
jest.mock('winston-daily-rotate-file', () => {
  const mockTransport = jest.fn().mockImplementation((options) => {
    const transport = {
      ...options,
      log: jest.fn(),
      on: jest.fn(),
      format: options.format,
      level: options.level,
      filename: options.filename,
      datePattern: options.datePattern,
      maxSize: options.maxSize,
      maxFiles: options.maxFiles,
      zippedArchive: options.zippedArchive,
      auditFile: options.auditFile
    };
    // Make it a proper transport-like object
    Object.setPrototypeOf(transport, {});
    return transport;
  });
  return mockTransport;
});

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock os
jest.mock('os', () => ({
  hostname: jest.fn().mockReturnValue('test-hostname'),
  release: jest.fn().mockReturnValue('test-release'),
  platform: jest.fn().mockReturnValue('test-platform'),
  arch: jest.fn().mockReturnValue('test-arch'),
  EOL: '\n'
}));

describe('Logger', () => {
  let testLogDir: string;
  let logger: Logger;

  beforeEach(() => {
    testLogDir = './test-logs';
    jest.clearAllMocks();
    
    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation();
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({
      mtime: new Date(),
      size: 1024
    } as any);
    mockFs.unlinkSync.mockImplementation();

    // Reset singleton
    (Logger as any).instance = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('建構函式和設定', () => {
    it('應該使用預設設定建立Logger', () => {
      logger = new Logger();
      
      expect(logger).toBeInstanceOf(Logger);
      expect(mockFs.existsSync).toHaveBeenCalledWith('./logs');
    });

    it('應該使用自訂設定建立Logger', () => {
      const config: LoggerConfig = {
        level: 'debug',
        logDir: testLogDir,
        maxFiles: 7,
        maxSize: '10m',
        enableConsole: false,
        enableFile: true,
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: false
      };

      logger = new Logger(config);
      
      expect(mockFs.existsSync).toHaveBeenCalledWith(testLogDir);
    });

    it('應該建立日誌目錄如果不存在', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      logger = new Logger({ logDir: testLogDir });
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testLogDir, { recursive: true });
    });
  });

  describe('單例模式', () => {
    it('應該返回相同的實例', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('應該使用提供的設定建立第一個實例', () => {
      const config: LoggerConfig = { level: 'debug', logDir: testLogDir };
      const logger1 = Logger.getInstance(config);
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
      expect(mockFs.existsSync).toHaveBeenCalledWith(testLogDir);
    });
  });

  describe('日誌方法', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
      // Mock the winston logger
      jest.spyOn(logger['logger'], 'info').mockImplementation();
      jest.spyOn(logger['logger'], 'error').mockImplementation();
      jest.spyOn(logger['logger'], 'warn').mockImplementation();
      jest.spyOn(logger['logger'], 'debug').mockImplementation();
      jest.spyOn(logger['logger'], 'verbose').mockImplementation();
      jest.spyOn(logger['logger'], 'http').mockImplementation();
      jest.spyOn(logger['logger'], 'silly').mockImplementation();
    });

    it('應該記錄info訊息', () => {
      const message = '測試資訊訊息';
      const meta = { userId: '123', operation: 'test' };
      
      logger.info(message, meta);
      
      expect(logger['logger'].info).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          userId: '123',
          operation: 'test',
          timestamp: expect.any(String),
          pid: expect.any(Number),
          hostname: 'test-hostname'
        })
      );
    });

    it('應該記錄error訊息與Error物件', () => {
      const message = '測試錯誤訊息';
      const error = new Error('測試錯誤');
      const meta = { operation: 'test' };
      
      logger.error(message, error, meta);
      
      expect(logger['logger'].error).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          operation: 'test',
          error: {
            name: 'Error',
            message: '測試錯誤',
            stack: expect.any(String),
            cause: undefined
          },
          timestamp: expect.any(String),
          pid: expect.any(Number),
          hostname: 'test-hostname'
        })
      );
    });

    it('應該記錄error訊息與一般物件', () => {
      const message = '測試錯誤訊息';
      const error = { code: 'TEST_ERROR', details: '測試詳情' };
      
      logger.error(message, error);
      
      expect(logger['logger'].error).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          error: { code: 'TEST_ERROR', details: '測試詳情' },
          timestamp: expect.any(String)
        })
      );
    });

    it('應該記錄warn訊息', () => {
      const message = '測試警告訊息';
      
      logger.warn(message);
      
      expect(logger['logger'].warn).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          timestamp: expect.any(String),
          pid: expect.any(Number),
          hostname: 'test-hostname'
        })
      );
    });

    it('應該記錄debug訊息', () => {
      const message = '測試除錯訊息';
      
      logger.debug(message);
      
      expect(logger['logger'].debug).toHaveBeenCalled();
    });

    it('應該記錄verbose訊息', () => {
      const message = '測試詳細訊息';
      
      logger.verbose(message);
      
      expect(logger['logger'].verbose).toHaveBeenCalled();
    });

    it('應該記錄http訊息', () => {
      const message = '測試HTTP訊息';
      
      logger.http(message);
      
      expect(logger['logger'].http).toHaveBeenCalled();
    });

    it('應該記錄silly訊息', () => {
      const message = '測試愚蠢訊息';
      
      logger.silly(message);
      
      expect(logger['logger'].silly).toHaveBeenCalled();
    });
  });

  describe('子日誌器', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
    });

    it('應該建立帶有預設元數據的子日誌器', () => {
      const defaultMeta = { service: 'test-service', version: '1.0.0' };
      const childLogger = logger.child(defaultMeta);
      
      expect(childLogger).toBeInstanceOf(Logger);
      
      // Mock the child logger's winston instance
      jest.spyOn(childLogger['logger'], 'info').mockImplementation();
      
      childLogger.info('測試訊息', { requestId: 'req-123' });
      
      expect(childLogger['logger'].info).toHaveBeenCalledWith(
        '測試訊息',
        expect.objectContaining({
          service: 'test-service',
          version: '1.0.0',
          requestId: 'req-123',
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('日誌層級管理', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
    });

    it('應該設定日誌層級', () => {
      logger.setLevel('debug');
      expect(logger['logger'].level).toBe('debug');
    });

    it('應該取得當前日誌層級', () => {
      logger['logger'].level = 'warn';
      expect(logger.getLevel()).toBe('warn');
    });
  });

  describe('日誌清理', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
    });

    it('應該清理舊日誌檔案', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35天前
      
      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 5); // 5天前

      mockFs.readdirSync.mockReturnValue(['old.log', 'new.log', 'config.json'] as any);
      mockFs.statSync
        .mockReturnValueOnce({ mtime: oldDate, size: 1024 } as any) // old.log
        .mockReturnValueOnce({ mtime: newDate, size: 2048 } as any) // new.log
        .mockReturnValueOnce({ mtime: newDate, size: 512 } as any); // config.json

      jest.spyOn(logger, 'info').mockImplementation();

      await logger.cleanupOldLogs(30);

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join(testLogDir, 'old.log'));
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(path.join(testLogDir, 'new.log'));
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(path.join(testLogDir, 'config.json'));
      expect(logger.info).toHaveBeenCalledWith(
        '已清理舊日誌檔案: old.log',
        { operation: 'log_cleanup' }
      );
    });

    it('應該處理清理過程中的錯誤', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('無法讀取目錄');
      });

      jest.spyOn(logger, 'error').mockImplementation();

      await logger.cleanupOldLogs();

      expect(logger.error).toHaveBeenCalledWith(
        '清理舊日誌檔案時發生錯誤',
        expect.any(Error),
        { operation: 'log_cleanup' }
      );
    });
  });

  describe('日誌統計', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
    });

    it('應該取得日誌統計資訊', () => {
      const oldDate = new Date('2023-01-01');
      const newDate = new Date('2023-12-31');

      mockFs.readdirSync.mockReturnValue(['app-2023-01-01.log', 'error-2023-12-31.log', 'config.json'] as any);
      mockFs.statSync
        .mockReturnValueOnce({ mtime: oldDate, size: 1024 } as any)
        .mockReturnValueOnce({ mtime: newDate, size: 2048 } as any)
        .mockReturnValueOnce({ mtime: newDate, size: 512 } as any);

      const stats = logger.getLogStats();

      expect(stats).toEqual({
        totalFiles: 2,
        totalSize: 3072,
        oldestFile: 'app-2023-01-01.log',
        newestFile: 'error-2023-12-31.log'
      });
    });

    it('應該處理統計過程中的錯誤', () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('無法讀取目錄');
      });

      jest.spyOn(logger, 'error').mockImplementation();

      const stats = logger.getLogStats();

      expect(stats).toEqual({
        totalFiles: 0,
        totalSize: 0
      });
      expect(logger.error).toHaveBeenCalledWith(
        '取得日誌統計資訊時發生錯誤',
        expect.any(Error)
      );
    });
  });

  describe('元數據豐富化', () => {
    beforeEach(() => {
      logger = new Logger({ logDir: testLogDir });
    });

    it('應該豐富元數據', () => {
      const originalMeta = { userId: '123', operation: 'test' };
      const enriched = logger['enrichMetadata'](originalMeta);

      expect(enriched).toEqual({
        userId: '123',
        operation: 'test',
        timestamp: expect.any(String),
        pid: expect.any(Number),
        hostname: 'test-hostname'
      });
    });

    it('應該處理空元數據', () => {
      const enriched = logger['enrichMetadata']();

      expect(enriched).toEqual({
        timestamp: expect.any(String),
        pid: expect.any(Number),
        hostname: 'test-hostname'
      });
    });
  });
});