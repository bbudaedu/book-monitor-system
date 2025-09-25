import { EventEmitter } from 'events';
import { Logger } from './Logger';
import { LineNotifier } from './LineNotifier';
import { ErrorInfo, LogLevel } from '../types';

/**
 * 錯誤類型列舉
 */
export enum ErrorType {
  NETWORK = 'network',
  PARSING = 'parsing',
  DOWNLOAD = 'download',
  API = 'api',
  DATABASE = 'database',
  SYSTEM = 'system',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

/**
 * 錯誤嚴重程度列舉
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 錯誤處理策略列舉
 */
export enum ErrorHandlingStrategy {
  IGNORE = 'ignore',
  LOG_ONLY = 'log_only',
  RETRY = 'retry',
  NOTIFY = 'notify',
  ESCALATE = 'escalate',
  SHUTDOWN = 'shutdown'
}

/**
 * 錯誤分類規則介面
 */
export interface ErrorClassificationRule {
  pattern: RegExp | string;
  type: ErrorType;
  severity: ErrorSeverity;
  strategy: ErrorHandlingStrategy;
  retryable: boolean;
  maxRetries?: number;
  retryDelay?: number;
  notifyUser?: boolean;
}

/**
 * 錯誤處理結果介面
 */
export interface ErrorHandlingResult {
  handled: boolean;
  shouldRetry: boolean;
  shouldNotify: boolean;
  shouldEscalate: boolean;
  retryDelay?: number;
  classification: {
    type: ErrorType;
    severity: ErrorSeverity;
    strategy: ErrorHandlingStrategy;
  };
}

/**
 * 錯誤統計介面
 */
export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ErrorInfo[];
  criticalErrorsCount: number;
  lastCriticalError?: ErrorInfo;
}

/**
 * 全域錯誤處理器事件介面
 */
export interface ErrorHandlerEvents {
  'error-classified': (error: Error, classification: ErrorHandlingResult) => void;
  'error-handled': (error: Error, result: ErrorHandlingResult) => void;
  'critical-error': (error: Error, classification: ErrorHandlingResult) => void;
  'retry-attempted': (error: Error, attempt: number, maxRetries: number) => void;
  'max-retries-exceeded': (error: Error, attempts: number) => void;
  'notification-sent': (error: Error, success: boolean) => void;
}

/**
 * 全域錯誤處理器
 * 
 * 實作統一的錯誤處理邏輯，包含錯誤分類、處理策略和通知機制
 * 基於Node.js EventEmitter模式實現事件驅動的錯誤處理
 * 
 * 參考: https://nodejs.org/api/process.html#process_event_uncaughtexception
 * 參考: https://nodejs.org/api/process.html#process_event_unhandledrejection
 */
export class ErrorHandler extends EventEmitter {
  private logger: Logger;
  private lineNotifier?: LineNotifier;
  private classificationRules: ErrorClassificationRule[];
  private errorStatistics: ErrorStatistics;
  private isShuttingDown = false;
  private retryAttempts = new Map<string, number>();
  private recentErrorsLimit = 100;

  constructor(logger: Logger, lineNotifier?: LineNotifier) {
    super();
    
    this.logger = logger;
    this.lineNotifier = lineNotifier;
    this.errorStatistics = this.initializeStatistics();
    this.classificationRules = this.getDefaultClassificationRules();

    // 設定全域錯誤處理
    this.setupGlobalErrorHandling();
    
    this.logger.info('全域錯誤處理器已初始化', { component: 'ErrorHandler' });
  }

  /**
   * 設定LINE通知器
   */
  setLineNotifier(lineNotifier: LineNotifier): void {
    this.lineNotifier = lineNotifier;
    this.logger.debug('LINE通知器已設定', { component: 'ErrorHandler' });
  }

  /**
   * 處理錯誤
   */
  async handleError(error: Error, context?: any): Promise<ErrorHandlingResult> {
    try {
      // 分類錯誤
      const classification = this.classifyError(error);
      
      // 更新統計
      this.updateStatistics(error, classification);
      
      // 記錄錯誤
      this.logError(error, classification, context);
      
      // 發送事件
      this.emit('error-classified', error, classification);
      
      // 執行處理策略
      await this.executeHandlingStrategy(error, classification, context);
      
      // 發送處理完成事件
      this.emit('error-handled', error, classification);
      
      return classification;
      
    } catch (handlingError) {
      // 錯誤處理器本身發生錯誤
      this.logger.error('錯誤處理器發生錯誤', handlingError, { 
        component: 'ErrorHandler',
        originalError: error.message 
      });
      
      return {
        handled: false,
        shouldRetry: false,
        shouldNotify: false,
        shouldEscalate: true,
        classification: {
          type: ErrorType.SYSTEM,
          severity: ErrorSeverity.CRITICAL,
          strategy: ErrorHandlingStrategy.ESCALATE
        }
      };
    }
  }

  /**
   * 處理網路錯誤
   */
  async handleNetworkError(error: Error, retryCount = 0, context?: any): Promise<ErrorHandlingResult> {
    const errorKey = this.generateErrorKey(error, context);
    const currentRetries = this.retryAttempts.get(errorKey) || 0;
    
    const result = await this.handleError(error, { 
      ...context, 
      retryCount: currentRetries,
      errorType: ErrorType.NETWORK 
    });
    
    if (result.shouldRetry && currentRetries < (result.classification.strategy === ErrorHandlingStrategy.RETRY ? 3 : 0)) {
      this.retryAttempts.set(errorKey, currentRetries + 1);
      this.emit('retry-attempted', error, currentRetries + 1, 3);
      
      // 指數退避延遲
      const delay = result.retryDelay || Math.pow(2, currentRetries) * 1000;
      await this.delay(delay);
      
      return { ...result, shouldRetry: true, retryDelay: delay };
    } else if (currentRetries >= 3) {
      this.retryAttempts.delete(errorKey);
      this.emit('max-retries-exceeded', error, currentRetries);
      return { ...result, shouldRetry: false, shouldEscalate: true };
    }
    
    return result;
  }

  /**
   * 處理解析錯誤
   */
  async handleParsingError(error: Error, context?: any): Promise<ErrorHandlingResult> {
    return this.handleError(error, { 
      ...context, 
      errorType: ErrorType.PARSING 
    });
  }

  /**
   * 處理下載錯誤
   */
  async handleDownloadError(error: Error, bookInfo?: any): Promise<ErrorHandlingResult> {
    return this.handleError(error, { 
      bookInfo, 
      errorType: ErrorType.DOWNLOAD 
    });
  }

  /**
   * 處理API錯誤
   */
  async handleAPIError(error: Error, apiType: string, context?: any): Promise<ErrorHandlingResult> {
    return this.handleError(error, { 
      ...context, 
      apiType, 
      errorType: ErrorType.API 
    });
  }

  /**
   * 處理資料庫錯誤
   */
  async handleDatabaseError(error: Error, operation: string, context?: any): Promise<ErrorHandlingResult> {
    return this.handleError(error, { 
      ...context, 
      operation, 
      errorType: ErrorType.DATABASE 
    });
  }

  /**
   * 處理系統錯誤
   */
  async handleSystemError(error: Error, context?: any): Promise<ErrorHandlingResult> {
    return this.handleError(error, { 
      ...context, 
      errorType: ErrorType.SYSTEM 
    });
  }

  /**
   * 取得錯誤統計
   */
  getStatistics(): ErrorStatistics {
    return { ...this.errorStatistics };
  }

  /**
   * 重置錯誤統計
   */
  resetStatistics(): void {
    this.errorStatistics = this.initializeStatistics();
    this.retryAttempts.clear();
    this.logger.info('錯誤統計已重置', { component: 'ErrorHandler' });
  }

  /**
   * 添加自訂錯誤分類規則
   */
  addClassificationRule(rule: ErrorClassificationRule): void {
    this.classificationRules.unshift(rule); // 新規則優先
    this.logger.debug('已添加錯誤分類規則', { 
      component: 'ErrorHandler',
      ruleType: rule.type 
    });
  }

  /**
   * 移除錯誤分類規則
   */
  removeClassificationRule(pattern: RegExp | string): boolean {
    const initialLength = this.classificationRules.length;
    this.classificationRules = this.classificationRules.filter(rule => 
      rule.pattern !== pattern
    );
    
    const removed = this.classificationRules.length < initialLength;
    if (removed) {
      this.logger.debug('已移除錯誤分類規則', { component: 'ErrorHandler' });
    }
    
    return removed;
  }

  /**
   * 關閉錯誤處理器
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // 移除全域錯誤處理器
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtExceptionMonitor');
    
    this.logger.info('錯誤處理器已關閉', { component: 'ErrorHandler' });
  }

  /**
   * 設定全域錯誤處理
   * 
   * 參考Node.js文件實作uncaughtException和unhandledRejection處理
   */
  private setupGlobalErrorHandling(): void {
    // 處理未捕獲的異常
    process.on('uncaughtException', async (error: Error, origin: string) => {
      if (this.isShuttingDown) return;
      
      this.logger.error('未捕獲的異常', error, { 
        component: 'ErrorHandler',
        origin,
        critical: true 
      });
      
      const result = await this.handleError(error, { 
        origin, 
        global: true,
        errorType: ErrorType.SYSTEM 
      });
      
      if (result.classification.severity === ErrorSeverity.CRITICAL) {
        this.emit('critical-error', error, result);
        
        // 給予時間進行清理
        setTimeout(() => {
          process.exit(1);
        }, 5000);
      }
    });

    // 處理未處理的Promise拒絕
    process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
      if (this.isShuttingDown) return;
      
      const error = reason instanceof Error ? reason : new Error(String(reason));
      
      this.logger.error('未處理的Promise拒絕', error, { 
        component: 'ErrorHandler',
        promise: promise.toString(),
        critical: true 
      });
      
      const result = await this.handleError(error, { 
        promise: promise.toString(), 
        global: true,
        errorType: ErrorType.SYSTEM 
      });
      
      if (result.classification.severity === ErrorSeverity.CRITICAL) {
        this.emit('critical-error', error, result);
      }
    });

    // 監控未捕獲的異常（不改變預設行為）
    process.on('uncaughtExceptionMonitor', (error: Error, origin: string) => {
      if (this.isShuttingDown) return;
      
      this.logger.error('異常監控', error, { 
        component: 'ErrorHandler',
        origin,
        monitor: true 
      });
    });

    this.logger.debug('全域錯誤處理已設定', { component: 'ErrorHandler' });
  }

  /**
   * 分類錯誤
   */
  private classifyError(error: Error): ErrorHandlingResult {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';
    
    // 遍歷分類規則
    for (const rule of this.classificationRules) {
      let matches = false;
      
      if (rule.pattern instanceof RegExp) {
        matches = rule.pattern.test(errorMessage) || rule.pattern.test(errorStack);
      } else {
        matches = errorMessage.includes(rule.pattern.toLowerCase()) || 
                 errorStack.includes(rule.pattern.toLowerCase());
      }
      
      if (matches) {
        return {
          handled: true,
          shouldRetry: rule.retryable && rule.strategy === ErrorHandlingStrategy.RETRY,
          shouldNotify: rule.notifyUser || rule.severity === ErrorSeverity.CRITICAL,
          shouldEscalate: rule.strategy === ErrorHandlingStrategy.ESCALATE,
          retryDelay: rule.retryDelay,
          classification: {
            type: rule.type,
            severity: rule.severity,
            strategy: rule.strategy
          }
        };
      }
    }
    
    // 預設分類
    return {
      handled: true,
      shouldRetry: false,
      shouldNotify: true,
      shouldEscalate: false,
      classification: {
        type: ErrorType.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        strategy: ErrorHandlingStrategy.LOG_ONLY
      }
    };
  }

  /**
   * 執行處理策略
   */
  private async executeHandlingStrategy(
    error: Error, 
    classification: ErrorHandlingResult, 
    context?: any
  ): Promise<void> {
    const { strategy, severity } = classification.classification;
    
    switch (strategy) {
      case ErrorHandlingStrategy.IGNORE:
        // 不做任何處理
        break;
        
      case ErrorHandlingStrategy.LOG_ONLY:
        // 已經在logError中處理
        break;
        
      case ErrorHandlingStrategy.NOTIFY:
      case ErrorHandlingStrategy.ESCALATE:
        if (classification.shouldNotify && this.lineNotifier) {
          await this.sendErrorNotification(error, classification, context);
        }
        break;
        
      case ErrorHandlingStrategy.SHUTDOWN:
        this.logger.error('嚴重錯誤，準備關閉系統', error, { 
          component: 'ErrorHandler',
          context 
        });
        
        if (this.lineNotifier) {
          await this.sendErrorNotification(error, classification, context);
        }
        
        // 延遲關閉，給予清理時間
        setTimeout(() => {
          process.exit(1);
        }, 3000);
        break;
    }
  }

  /**
   * 記錄錯誤
   */
  private logError(error: Error, classification: ErrorHandlingResult, context?: any): void {
    const { type, severity } = classification.classification;
    const logLevel = this.getLogLevelFromSeverity(severity);
    
    const metadata = {
      component: 'ErrorHandler',
      errorType: type,
      severity,
      context,
      stack: error.stack
    };
    
    switch (logLevel) {
      case LogLevel.ERROR:
        this.logger.error(error.message, error, metadata);
        break;
      case LogLevel.WARN:
        this.logger.warn(error.message, metadata);
        break;
      case LogLevel.INFO:
        this.logger.info(error.message, metadata);
        break;
      default:
        this.logger.debug(error.message, metadata);
        break;
    }
  }

  /**
   * 發送錯誤通知
   */
  private async sendErrorNotification(
    error: Error, 
    classification: ErrorHandlingResult, 
    context?: any
  ): Promise<void> {
    if (!this.lineNotifier) {
      return;
    }
    
    try {
      const errorInfo: ErrorInfo = {
        code: classification.classification.type.toUpperCase(),
        message: error.message,
        details: {
          type: classification.classification.type,
          severity: classification.classification.severity,
          context
        },
        timestamp: new Date()
      };
      
      const success = await this.lineNotifier.sendErrorNotification(errorInfo);
      this.emit('notification-sent', error, success);
      
      if (success) {
        this.logger.debug('錯誤通知已發送', { 
          component: 'ErrorHandler',
          errorType: classification.classification.type 
        });
      }
      
    } catch (notificationError) {
      this.logger.error('發送錯誤通知失敗', notificationError, { 
        component: 'ErrorHandler',
        originalError: error.message 
      });
    }
  }

  /**
   * 更新錯誤統計
   */
  private updateStatistics(error: Error, classification: ErrorHandlingResult): void {
    const { type, severity } = classification.classification;
    
    this.errorStatistics.totalErrors++;
    this.errorStatistics.errorsByType[type] = (this.errorStatistics.errorsByType[type] || 0) + 1;
    this.errorStatistics.errorsBySeverity[severity] = (this.errorStatistics.errorsBySeverity[severity] || 0) + 1;
    
    const errorInfo: ErrorInfo = {
      code: type.toUpperCase(),
      message: error.message,
      details: { severity, stack: error.stack },
      timestamp: new Date()
    };
    
    this.errorStatistics.recentErrors.unshift(errorInfo);
    
    // 限制最近錯誤數量
    if (this.errorStatistics.recentErrors.length > this.recentErrorsLimit) {
      this.errorStatistics.recentErrors = this.errorStatistics.recentErrors.slice(0, this.recentErrorsLimit);
    }
    
    // 更新嚴重錯誤統計
    if (severity === ErrorSeverity.CRITICAL) {
      this.errorStatistics.criticalErrorsCount++;
      this.errorStatistics.lastCriticalError = errorInfo;
    }
  }

  /**
   * 初始化統計資料
   */
  private initializeStatistics(): ErrorStatistics {
    return {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: [],
      criticalErrorsCount: 0
    };
  }

  /**
   * 取得預設錯誤分類規則
   */
  private getDefaultClassificationRules(): ErrorClassificationRule[] {
    return [
      // 系統錯誤 (最高優先級)
      {
        pattern: /system.*(?:memory|disk|cpu|process)|(?:memory|disk|cpu|process).*system|out of memory|process.*crash/i,
        type: ErrorType.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        strategy: ErrorHandlingStrategy.ESCALATE,
        retryable: false,
        notifyUser: true
      },
      
      // 資料庫錯誤
      {
        pattern: /database.*(?:connection|pool|query|transaction)|(?:connection|pool|query|transaction).*database|sql.*(?:error|timeout)/i,
        type: ErrorType.DATABASE,
        severity: ErrorSeverity.HIGH,
        strategy: ErrorHandlingStrategy.ESCALATE,
        retryable: true,
        maxRetries: 2,
        retryDelay: 3000,
        notifyUser: true
      },
      
      // API錯誤
      {
        pattern: /api.*(?:error|401|403|404|500|502|503)|(?:401|403|404|500|502|503).*api|http.*(?:401|403|404|500|502|503)/i,
        type: ErrorType.API,
        severity: ErrorSeverity.HIGH,
        strategy: ErrorHandlingStrategy.NOTIFY,
        retryable: true,
        maxRetries: 2,
        retryDelay: 5000,
        notifyUser: true
      },
      
      // 網路錯誤
      {
        pattern: /network.*(?:error|timeout)|enotfound|econnrefused|econnreset|connection.*(?:refused|reset|timeout)/i,
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        strategy: ErrorHandlingStrategy.RETRY,
        retryable: true,
        maxRetries: 3,
        retryDelay: 2000,
        notifyUser: false
      },
      
      // 解析錯誤
      {
        pattern: /parse.*(?:error|failed)|json.*parse|xml.*parse|html.*parse|selector.*not.*found|element.*not.*found/i,
        type: ErrorType.PARSING,
        severity: ErrorSeverity.MEDIUM,
        strategy: ErrorHandlingStrategy.NOTIFY,
        retryable: false,
        notifyUser: true
      },
      
      // 下載錯誤
      {
        pattern: /download.*(?:error|failed)|file.*(?:write|read).*error|stream.*error/i,
        type: ErrorType.DOWNLOAD,
        severity: ErrorSeverity.MEDIUM,
        strategy: ErrorHandlingStrategy.RETRY,
        retryable: true,
        maxRetries: 3,
        retryDelay: 1000,
        notifyUser: true
      },
      
      // 認證錯誤
      {
        pattern: /auth.*(?:error|failed)|token.*(?:invalid|expired)|unauthorized|forbidden/i,
        type: ErrorType.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        strategy: ErrorHandlingStrategy.ESCALATE,
        retryable: false,
        notifyUser: true
      },
      
      // 權限錯誤
      {
        pattern: /permission.*denied|access.*denied|eacces/i,
        type: ErrorType.PERMISSION,
        severity: ErrorSeverity.HIGH,
        strategy: ErrorHandlingStrategy.ESCALATE,
        retryable: false,
        notifyUser: true
      },
      
      // 超時錯誤
      {
        pattern: /timeout|etimedout/i,
        type: ErrorType.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        strategy: ErrorHandlingStrategy.RETRY,
        retryable: true,
        maxRetries: 2,
        retryDelay: 5000,
        notifyUser: false
      },
      
      // 驗證錯誤
      {
        pattern: /validation.*(?:error|failed)|invalid.*(?:input|data)|required.*(?:field|parameter)|missing.*(?:field|parameter)/i,
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        strategy: ErrorHandlingStrategy.LOG_ONLY,
        retryable: false,
        notifyUser: false
      }
    ];
  }

  /**
   * 從嚴重程度取得日誌等級
   */
  private getLogLevelFromSeverity(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return LogLevel.ERROR;
      case ErrorSeverity.MEDIUM:
        return LogLevel.WARN;
      case ErrorSeverity.LOW:
        return LogLevel.INFO;
      default:
        return LogLevel.DEBUG;
    }
  }

  /**
   * 生成錯誤鍵值（用於重試計數）
   */
  private generateErrorKey(error: Error, context?: any): string {
    const contextStr = context ? JSON.stringify(context) : '';
    return `${error.name}:${error.message}:${contextStr}`;
  }

  /**
   * 延遲函數
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 匯出事件類型以供TypeScript使用
export declare interface ErrorHandler {
  on<K extends keyof ErrorHandlerEvents>(event: K, listener: ErrorHandlerEvents[K]): this;
  emit<K extends keyof ErrorHandlerEvents>(event: K, ...args: Parameters<ErrorHandlerEvents[K]>): boolean;
}