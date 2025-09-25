import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

export interface LoggerConfig {
  level?: string;
  logDir?: string;
  maxFiles?: number;
  maxSize?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  datePattern?: string;
  zippedArchive?: boolean;
  auditFile?: string;
}

export interface LogMetadata {
  [key: string]: any;
  timestamp?: string;
  correlationId?: string;
  userId?: string;
  operation?: string;
}

export class Logger {
  private logger: winston.Logger;
  private config: Required<LoggerConfig>;
  private static instance: Logger;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level ?? 'info',
      logDir: config.logDir ?? './logs',
      maxFiles: config.maxFiles ?? 14,
      maxSize: config.maxSize ?? '20m',
      enableConsole: config.enableConsole ?? true,
      enableFile: config.enableFile ?? true,
      datePattern: config.datePattern ?? 'YYYY-MM-DD',
      zippedArchive: config.zippedArchive ?? true,
      auditFile: config.auditFile ?? 'audit.json'
    };

    this.ensureLogDirectory();
    this.logger = this.createLogger();
  }

  /**
   * 取得Logger單例實例
   */
  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * 確保日誌目錄存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // 診斷日誌：檢查Winston版本和可用格式
    console.log('🔍 診斷：Winston版本:', require('winston/package.json').version);
    console.log('🔍 診斷：可用格式方法:', Object.keys(winston.format));

    // 控制台輸出 - 結構化格式
    if (this.config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          level: this.config.level,
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
              const metaStr = Object.keys(meta).length ?
                `\n${JSON.stringify(meta, null, 2)}` : '';
              const stackStr = stack ? `\n${stack}` : '';
              return `${timestamp} [${level}]: ${message}${metaStr}${stackStr}`;
            })
          ),
          handleExceptions: true,
          handleRejections: true
        })
      );
    }

    // 檔案輸出 - 使用日誌輪轉
    if (this.config.enableFile) {
      // 一般日誌檔案 - 每日輪轉
      transports.push(
        new DailyRotateFile({
          filename: path.join(this.config.logDir, 'app-%DATE%.log'),
          datePattern: this.config.datePattern,
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          zippedArchive: this.config.zippedArchive,
          auditFile: path.join(this.config.logDir, this.config.auditFile),
          level: this.config.level,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          handleExceptions: false,
          handleRejections: false
        })
      );

      // 錯誤日誌檔案 - 每日輪轉
      transports.push(
        new DailyRotateFile({
          filename: path.join(this.config.logDir, 'error-%DATE%.log'),
          datePattern: this.config.datePattern,
          level: 'error',
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          zippedArchive: this.config.zippedArchive,
          auditFile: path.join(this.config.logDir, 'error-audit.json'),
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          handleExceptions: false,
          handleRejections: false
        })
      );

      // 組合日誌檔案 - 包含所有層級
      transports.push(
        new DailyRotateFile({
          filename: path.join(this.config.logDir, 'combined-%DATE%.log'),
          datePattern: this.config.datePattern,
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          zippedArchive: this.config.zippedArchive,
          auditFile: path.join(this.config.logDir, 'combined-audit.json'),
          level: this.config.level,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          handleExceptions: false,
          handleRejections: false
        })
      );
    }

    // 建立異常和拒絕處理器
    const exceptionHandlers: winston.transport[] = [];
    const rejectionHandlers: winston.transport[] = [];

    if (this.config.enableFile) {
      exceptionHandlers.push(
        new DailyRotateFile({
          filename: path.join(this.config.logDir, 'exceptions-%DATE%.log'),
          datePattern: this.config.datePattern,
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          zippedArchive: this.config.zippedArchive,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );

      rejectionHandlers.push(
        new DailyRotateFile({
          filename: path.join(this.config.logDir, 'rejections-%DATE%.log'),
          datePattern: this.config.datePattern,
          maxSize: this.config.maxSize,
          maxFiles: this.config.maxFiles,
          zippedArchive: this.config.zippedArchive,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json() // 使用JSON格式來保留所有元數據
      ),
      defaultMeta: {
        service: 'book-monitor-system',
        version: '1.0.0'
      },
      transports,
      exitOnError: false,
      exceptionHandlers,
      rejectionHandlers
    });
  }



  /**
   * 記錄資訊層級日誌
   */
  info(message: string, meta?: LogMetadata): void {
    this.logger.info(message, this.enrichMetadata(meta));
  }

  /**
   * 記錄錯誤層級日誌
   */
  error(message: string, error?: Error | any, meta?: LogMetadata): void {
    const enrichedMeta = this.enrichMetadata(meta);
    
    if (error instanceof Error) {
      this.logger.error(message, {
        ...enrichedMeta,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: (error as any).cause
        }
      });
    } else if (error) {
      this.logger.error(message, {
        ...enrichedMeta,
        error: error
      });
    } else {
      this.logger.error(message, enrichedMeta);
    }
  }

  /**
   * 記錄警告層級日誌
   */
  warn(message: string, meta?: LogMetadata): void {
    this.logger.warn(message, this.enrichMetadata(meta));
  }

  /**
   * 記錄除錯層級日誌
   */
  debug(message: string, meta?: LogMetadata): void {
    this.logger.debug(message, this.enrichMetadata(meta));
  }

  /**
   * 記錄詳細層級日誌
   */
  verbose(message: string, meta?: LogMetadata): void {
    this.logger.verbose(message, this.enrichMetadata(meta));
  }

  /**
   * 記錄HTTP請求日誌
   */
  http(message: string, meta?: LogMetadata): void {
    this.logger.http(message, this.enrichMetadata(meta));
  }

  /**
   * 記錄愚蠢層級日誌（最低層級）
   */
  silly(message: string, meta?: LogMetadata): void {
    this.logger.silly(message, this.enrichMetadata(meta));
  }

  /**
   * 豐富元數據，添加通用資訊
   */
  private enrichMetadata(meta?: LogMetadata): LogMetadata {
    const enriched: LogMetadata = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      hostname: require('os').hostname(),
      ...meta
    };

    return enriched;
  }

  /**
   * 建立子日誌器，帶有預設元數據
   */
  child(defaultMeta: LogMetadata): Logger {
    const childLogger = new Logger(this.config);
    const originalEnrichMetadata = childLogger.enrichMetadata.bind(childLogger);
    
    childLogger.enrichMetadata = (meta?: LogMetadata) => {
      return originalEnrichMetadata({ ...defaultMeta, ...meta });
    };

    return childLogger;
  }

  /**
   * 設定日誌層級
   */
  setLevel(level: string): void {
    this.logger.level = level;
  }

  /**
   * 取得當前日誌層級
   */
  getLevel(): string {
    return this.logger.level;
  }

  /**
   * 清理舊日誌檔案
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const files = fs.readdirSync(this.config.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        const filePath = path.join(this.config.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate && file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          this.info(`已清理舊日誌檔案: ${file}`, { operation: 'log_cleanup' });
        }
      }
    } catch (error) {
      this.error('清理舊日誌檔案時發生錯誤', error, { operation: 'log_cleanup' });
    }
  }

  /**
   * 取得日誌統計資訊
   */
  getLogStats(): { totalFiles: number; totalSize: number; oldestFile?: string; newestFile?: string } {
    try {
      const files = fs.readdirSync(this.config.logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let totalSize = 0;
      let oldestTime = Infinity;
      let newestTime = 0;
      let oldestFile: string | undefined;
      let newestFile: string | undefined;

      for (const file of logFiles) {
        const filePath = path.join(this.config.logDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;

        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = file;
        }

        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      return {
        totalFiles: logFiles.length,
        totalSize,
        oldestFile,
        newestFile
      };
    } catch (error) {
      this.error('取得日誌統計資訊時發生錯誤', error);
      return { totalFiles: 0, totalSize: 0 };
    }
  }

  /**
   * 記錄效能指標
   */
  performance(operation: string, duration: number, meta?: LogMetadata): void {
    this.info(`效能指標: ${operation}`, {
      ...meta,
      operation,
      duration,
      performanceMetric: true
    });
  }

  /**
   * 記錄HTTP請求
   */
  httpRequest(method: string, url: string, statusCode: number, duration: number, meta?: LogMetadata): void {
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    this[level](`HTTP ${method} ${url} - ${statusCode}`, {
      ...meta,
      method,
      url,
      statusCode,
      duration,
      httpRequest: true
    });
  }

  /**
   * 記錄資料庫操作
   */
  database(operation: string, table: string, duration: number, meta?: LogMetadata): void {
    this.debug(`資料庫操作: ${operation} on ${table}`, {
      ...meta,
      operation,
      table,
      duration,
      databaseOperation: true
    });
  }

  /**
   * 記錄安全事件
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: LogMetadata): void {
    const level = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
    this[level](`安全事件: ${event}`, {
      ...meta,
      event,
      severity,
      securityEvent: true
    });
  }

  /**
   * 記錄業務邏輯事件
   */
  business(event: string, meta?: LogMetadata): void {
    this.info(`業務事件: ${event}`, {
      ...meta,
      event,
      businessEvent: true
    });
  }

  /**
   * 建立計時器，用於測量操作時間
   */
  timer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.performance(label, duration);
    };
  }

  /**
   * 關閉日誌器並清理資源
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      // Winston 3.x doesn't have a close callback, we need to close transports manually
      const promises: Promise<void>[] = [];
      
      this.logger.transports.forEach(transport => {
        if (transport && typeof (transport as any).close === 'function') {
          promises.push(new Promise<void>((resolveTransport) => {
            (transport as any).close(() => resolveTransport());
          }));
        }
      });

      Promise.all(promises).then(() => {
        this.logger.clear();
        resolve();
      }).catch(() => {
        // Even if some transports fail to close, we still resolve
        this.logger.clear();
        resolve();
      });
    });
  }

  /**
   * 檢查日誌器是否健康
   */
  /**
   * 查詢最近的日誌
   */
  async queryRecentLogs(options: { limit?: number; level?: string } = {}): Promise<any[]> {
    const { limit = 100, level } = options;

    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(file => file.startsWith('app-') && file.endsWith('.log'))
        .sort((a, b) => b.localeCompare(a)); // 降序排序，最新的檔案在最前面

      if (files.length === 0) {
        return [];
      }

      const latestLogFile = path.join(this.config.logDir, files[0]);
      const fileContent = fs.readFileSync(latestLogFile, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');

      let logs = lines.map(line => JSON.parse(line));

      if (level) {
        logs = logs.filter(log => log.level === level);
      }

      return logs.slice(-limit); // 返回最新的日誌

    } catch (error) {
      this.error('查詢日誌失敗', error);
      return [];
    }
  }

  healthCheck(): { status: 'healthy' | 'unhealthy'; details: any } {
    try {
      // 檢查日誌目錄是否可寫
      const testFile = path.join(this.config.logDir, '.health-check');
      fs.writeFileSync(testFile, 'health check');
      fs.unlinkSync(testFile);

      // 檢查日誌統計
      const stats = this.getLogStats();

      return {
        status: 'healthy',
        details: {
          logDirectory: this.config.logDir,
          logLevel: this.config.level,
          totalLogFiles: stats.totalFiles,
          totalLogSize: stats.totalSize,
          enableConsole: this.config.enableConsole,
          enableFile: this.config.enableFile
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error),
          logDirectory: this.config.logDir
        }
      };
    }
  }
}