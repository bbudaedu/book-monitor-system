import { EventEmitter } from 'events';
import { Logger } from './Logger';
import { DatabaseManager } from '../database/DatabaseManager';
import { PDFDownloader } from './PDFDownloader';
import { LineNotifier } from './LineNotifier';
import { BookInfo, BookStatus, SystemConfig } from '../types';
import fs from 'fs';
import path from 'path';

/**
 * 系統健康狀態介面
 */
export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    database: ComponentHealth;
    fileSystem: ComponentHealth;
    network: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
  };
  lastCheckTime: Date;
  issues: HealthIssue[];
}

/**
 * 元件健康狀態介面
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metrics?: any;
  lastCheckTime: Date;
}

/**
 * 健康問題介面
 */
export interface HealthIssue {
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

/**
 * 恢復操作結果介面
 */
export interface RecoveryResult {
  success: boolean;
  operation: string;
  details: string;
  timestamp: Date;
  duration: number;
}

/**
 * 系統恢復機制事件介面
 */
export interface SystemRecoveryEvents {
  'health-check-completed': (status: SystemHealthStatus) => void;
  'health-issue-detected': (issue: HealthIssue) => void;
  'health-issue-resolved': (issue: HealthIssue) => void;
  'recovery-started': (operation: string) => void;
  'recovery-completed': (result: RecoveryResult) => void;
  'recovery-failed': (operation: string, error: Error) => void;
  'download-recovered': (book: BookInfo) => void;
  'system-degraded': (status: SystemHealthStatus) => void;
  'system-recovered': (status: SystemHealthStatus) => void;
}

/**
 * 系統恢復機制
 * 
 * 負責監控系統健康狀態、檢測問題並執行自動恢復操作
 * 包含應用程式崩潰恢復、未完成下載恢復和系統健康檢查
 */
export class SystemRecovery extends EventEmitter {
  private logger: Logger;
  private dbManager: DatabaseManager;
  private pdfDownloader?: PDFDownloader;
  private lineNotifier?: LineNotifier;
  private config?: SystemConfig;
  
  private healthStatus: SystemHealthStatus;
  private healthCheckInterval?: NodeJS.Timeout;
  private healthCheckIntervalMs = 60000; // 1分鐘
  private isShuttingDown = false;
  private recoveryInProgress = new Set<string>();
  private healthIssues = new Map<string, HealthIssue>();

  constructor(
    logger: Logger, 
    dbManager: DatabaseManager,
    pdfDownloader?: PDFDownloader,
    lineNotifier?: LineNotifier
  ) {
    super();
    
    this.logger = logger;
    this.dbManager = dbManager;
    this.pdfDownloader = pdfDownloader;
    this.lineNotifier = lineNotifier;
    
    this.healthStatus = this.initializeHealthStatus();
    
    this.logger.info('系統恢復機制已初始化', { component: 'SystemRecovery' });
  }

  /**
   * 設定系統設定
   */
  setConfig(config: SystemConfig): void {
    this.config = config;
  }

  /**
   * 設定PDF下載器
   */
  setPDFDownloader(pdfDownloader: PDFDownloader): void {
    this.pdfDownloader = pdfDownloader;
  }

  /**
   * 設定LINE通知器
   */
  setLineNotifier(lineNotifier: LineNotifier): void {
    this.lineNotifier = lineNotifier;
  }

  /**
   * 啟動系統恢復機制
   */
  async start(): Promise<void> {
    try {
      this.logger.info('啟動系統恢復機制...', { component: 'SystemRecovery' });

      // 執行初始健康檢查
      await this.performHealthCheck();

      // 恢復未完成的下載
      await this.recoverIncompleteDownloads();

      // 啟動定期健康檢查
      this.startHealthCheckInterval();

      this.logger.info('系統恢復機制已啟動', { component: 'SystemRecovery' });

    } catch (error) {
      this.logger.error('啟動系統恢復機制失敗', error, { component: 'SystemRecovery' });
      throw error;
    }
  }

  /**
   * 停止系統恢復機制
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.logger.info('系統恢復機制已停止', { component: 'SystemRecovery' });
  }

  /**
   * 執行系統健康檢查
   */
  async performHealthCheck(): Promise<SystemHealthStatus> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('開始執行系統健康檢查', { component: 'SystemRecovery' });

      // 檢查各個元件
      const [database, fileSystem, network, memory, disk] = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkFileSystemHealth(),
        this.checkNetworkHealth(),
        this.checkMemoryHealth(),
        this.checkDiskHealth()
      ]);

      // 更新健康狀態
      this.healthStatus = {
        overall: 'healthy',
        components: {
          database: this.getSettledResult(database, 'database'),
          fileSystem: this.getSettledResult(fileSystem, 'fileSystem'),
          network: this.getSettledResult(network, 'network'),
          memory: this.getSettledResult(memory, 'memory'),
          disk: this.getSettledResult(disk, 'disk')
        },
        lastCheckTime: new Date(),
        issues: Array.from(this.healthIssues.values()).filter(issue => !issue.resolved)
      };

      // 計算整體健康狀態
      this.calculateOverallHealth();

      // 檢測新問題和已解決的問題
      await this.detectHealthChanges();

      const duration = Date.now() - startTime;
      this.logger.performance('系統健康檢查', duration, { 
        component: 'SystemRecovery',
        overallHealth: this.healthStatus.overall 
      });

      this.emit('health-check-completed', this.healthStatus);

      return this.healthStatus;

    } catch (error) {
      this.logger.error('系統健康檢查失敗', error, { component: 'SystemRecovery' });
      
      // 設定為不健康狀態
      this.healthStatus.overall = 'unhealthy';
      this.healthStatus.lastCheckTime = new Date();
      
      return this.healthStatus;
    }
  }

  /**
   * 恢復未完成的下載
   */
  async recoverIncompleteDownloads(): Promise<RecoveryResult[]> {
    const startTime = Date.now();
    const results: RecoveryResult[] = [];

    try {
      this.logger.info('開始恢復未完成的下載...', { component: 'SystemRecovery' });

      if (!this.pdfDownloader) {
        throw new Error('PDF下載器未設定');
      }

      // 查詢未完成的下載
      const query = `
        SELECT * FROM books 
        WHERE status IN ($1, $2) 
        ORDER BY created_at DESC
      `;
      
      const result = await this.dbManager.query(query, [
        BookStatus.DOWNLOADING,
        BookStatus.PENDING
      ]);

      const incompleteBooks = result.rows as BookInfo[];
      
      if (incompleteBooks.length === 0) {
        this.logger.info('沒有需要恢復的下載', { component: 'SystemRecovery' });
        return results;
      }

      this.logger.info(`發現 ${incompleteBooks.length} 個未完成的下載`, { 
        component: 'SystemRecovery',
        count: incompleteBooks.length 
      });

      // 恢復每個未完成的下載
      for (const book of incompleteBooks) {
        try {
          const recoveryResult = await this.recoverSingleDownload(book);
          results.push(recoveryResult);
          
          if (recoveryResult.success) {
            this.emit('download-recovered', book);
          }
          
        } catch (error) {
          const failedResult: RecoveryResult = {
            success: false,
            operation: `recover-download-${book.id}`,
            details: `恢復下載失敗: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date(),
            duration: Date.now() - startTime
          };
          
          results.push(failedResult);
          this.logger.error(`恢復下載失敗: ${book.title}`, error, { 
            component: 'SystemRecovery',
            bookId: book.id 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const duration = Date.now() - startTime;
      
      this.logger.info(`下載恢復完成: ${successCount}/${results.length} 成功`, { 
        component: 'SystemRecovery',
        successCount,
        totalCount: results.length,
        duration 
      });

      return results;

    } catch (error) {
      this.logger.error('恢復未完成下載失敗', error, { component: 'SystemRecovery' });
      
      const failedResult: RecoveryResult = {
        success: false,
        operation: 'recover-incomplete-downloads',
        details: `恢復失敗: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      return [failedResult];
    }
  }

  /**
   * 執行系統自動恢復
   */
  async performAutoRecovery(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];

    try {
      this.logger.info('開始執行系統自動恢復...', { component: 'SystemRecovery' });

      // 恢復資料庫連接
      if (this.healthStatus.components.database.status !== 'healthy') {
        const dbResult = await this.recoverDatabaseConnection();
        results.push(dbResult);
      }

      // 恢復未完成的下載
      const downloadResults = await this.recoverIncompleteDownloads();
      results.push(...downloadResults);

      // 清理臨時檔案
      const cleanupResult = await this.cleanupTemporaryFiles();
      results.push(cleanupResult);

      const successCount = results.filter(r => r.success).length;
      this.logger.info(`自動恢復完成: ${successCount}/${results.length} 成功`, { 
        component: 'SystemRecovery',
        successCount,
        totalCount: results.length 
      });

      return results;

    } catch (error) {
      this.logger.error('系統自動恢復失敗', error, { component: 'SystemRecovery' });
      
      const failedResult: RecoveryResult = {
        success: false,
        operation: 'auto-recovery',
        details: `自動恢復失敗: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        duration: 0
      };
      
      return [failedResult];
    }
  }

  /**
   * 取得系統健康狀態
   */
  getHealthStatus(): SystemHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * 取得健康問題列表
   */
  getHealthIssues(): HealthIssue[] {
    return Array.from(this.healthIssues.values());
  }

  /**
   * 標記健康問題為已解決
   */
  resolveHealthIssue(issueKey: string): boolean {
    const issue = this.healthIssues.get(issueKey);
    if (issue && !issue.resolved) {
      issue.resolved = true;
      this.emit('health-issue-resolved', issue);
      this.logger.info(`健康問題已解決: ${issue.message}`, { 
        component: 'SystemRecovery',
        issueKey 
      });
      return true;
    }
    return false;
  }

  /**
   * 檢查資料庫健康狀態
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      
      // 執行簡單查詢測試連接
      await this.dbManager.query('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        message: responseTime < 1000 ? '資料庫連接正常' : '資料庫回應較慢',
        metrics: { responseTime },
        lastCheckTime: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `資料庫連接失敗: ${error instanceof Error ? error.message : String(error)}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 檢查檔案系統健康狀態
   */
  private async checkFileSystemHealth(): Promise<ComponentHealth> {
    try {
      const downloadPath = this.config?.downloadPath || './downloads';
      
      // 檢查目錄是否存在
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }
      
      // 測試寫入權限
      const testFile = path.join(downloadPath, '.health-check');
      fs.writeFileSync(testFile, 'health check');
      fs.unlinkSync(testFile);
      
      // 檢查磁碟空間
      const stats = fs.statSync(downloadPath);
      
      return {
        status: 'healthy',
        message: '檔案系統正常',
        metrics: { downloadPath, accessible: true },
        lastCheckTime: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `檔案系統錯誤: ${error instanceof Error ? error.message : String(error)}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 檢查網路健康狀態
   */
  private async checkNetworkHealth(): Promise<ComponentHealth> {
    try {
      // 簡單的網路連接測試
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      return {
        status: response.ok ? 'healthy' : 'degraded',
        message: response.ok ? '網路連接正常' : '網路連接異常',
        metrics: { status: response.status },
        lastCheckTime: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `網路連接失敗: ${error instanceof Error ? error.message : String(error)}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 檢查記憶體健康狀態
   */
  private async checkMemoryHealth(): Promise<ComponentHealth> {
    try {
      const memUsage = process.memoryUsage();
      const totalMB = Math.round(memUsage.rss / 1024 / 1024);
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      // 簡單的記憶體使用率檢查
      const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = '記憶體使用正常';
      
      if (heapUsagePercent > 90) {
        status = 'unhealthy';
        message = '記憶體使用率過高';
      } else if (heapUsagePercent > 75) {
        status = 'degraded';
        message = '記憶體使用率較高';
      }
      
      return {
        status,
        message,
        metrics: {
          rss: totalMB,
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          heapUsagePercent: Math.round(heapUsagePercent)
        },
        lastCheckTime: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `記憶體檢查失敗: ${error instanceof Error ? error.message : String(error)}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 檢查磁碟健康狀態
   */
  private async checkDiskHealth(): Promise<ComponentHealth> {
    try {
      const downloadPath = this.config?.downloadPath || './downloads';
      
      if (!fs.existsSync(downloadPath)) {
        return {
          status: 'degraded',
          message: '下載目錄不存在',
          lastCheckTime: new Date()
        };
      }
      
      // 這裡可以添加更詳細的磁碟空間檢查
      // 目前只做基本的目錄存在性檢查
      
      return {
        status: 'healthy',
        message: '磁碟狀態正常',
        metrics: { downloadPath },
        lastCheckTime: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `磁碟檢查失敗: ${error instanceof Error ? error.message : String(error)}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 恢復單個下載
   */
  private async recoverSingleDownload(book: BookInfo): Promise<RecoveryResult> {
    const startTime = Date.now();
    const operation = `recover-download-${book.id}`;
    
    if (this.recoveryInProgress.has(operation)) {
      return {
        success: false,
        operation,
        details: '恢復操作已在進行中',
        timestamp: new Date(),
        duration: 0
      };
    }
    
    this.recoveryInProgress.add(operation);
    this.emit('recovery-started', operation);
    
    try {
      if (!this.pdfDownloader) {
        throw new Error('PDF下載器未設定');
      }
      
      // 檢查檔案是否已存在且完整
      if (book.filePath && fs.existsSync(book.filePath)) {
        // 驗證檔案完整性
        const stats = fs.statSync(book.filePath);
        if (stats.size > 0) {
          // 更新資料庫狀態為已完成
          await this.dbManager.query(
            'UPDATE books SET status = $1, downloaded_at = $2 WHERE id = $3',
            [BookStatus.COMPLETED, new Date(), book.id]
          );
          
          const result: RecoveryResult = {
            success: true,
            operation,
            details: '檔案已存在且完整，已更新狀態',
            timestamp: new Date(),
            duration: Date.now() - startTime
          };
          
          this.emit('recovery-completed', result);
          return result;
        }
      }
      
      // 重置狀態為待下載
      await this.dbManager.query(
        'UPDATE books SET status = $1 WHERE id = $2',
        [BookStatus.PENDING, book.id]
      );
      
      // 重新開始下載
      await this.pdfDownloader.downloadPDF(book);
      
      const result: RecoveryResult = {
        success: true,
        operation,
        details: '已重新開始下載',
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-completed', result);
      return result;
      
    } catch (error) {
      const result: RecoveryResult = {
        success: false,
        operation,
        details: `恢復失敗: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-failed', operation, error as Error);
      return result;
      
    } finally {
      this.recoveryInProgress.delete(operation);
    }
  }

  /**
   * 恢復資料庫連接
   */
  private async recoverDatabaseConnection(): Promise<RecoveryResult> {
    const startTime = Date.now();
    const operation = 'recover-database-connection';
    
    this.emit('recovery-started', operation);
    
    try {
      // 嘗試重新連接資料庫
      await this.dbManager.disconnect();
      await this.dbManager.connect();
      
      // 測試連接
      await this.dbManager.query('SELECT 1 as test');
      
      const result: RecoveryResult = {
        success: true,
        operation,
        details: '資料庫連接已恢復',
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-completed', result);
      return result;
      
    } catch (error) {
      const result: RecoveryResult = {
        success: false,
        operation,
        details: `資料庫連接恢復失敗: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-failed', operation, error as Error);
      return result;
    }
  }

  /**
   * 清理臨時檔案
   */
  private async cleanupTemporaryFiles(): Promise<RecoveryResult> {
    const startTime = Date.now();
    const operation = 'cleanup-temporary-files';
    
    this.emit('recovery-started', operation);
    
    try {
      const downloadPath = this.config?.downloadPath || './downloads';
      let cleanedCount = 0;
      
      if (fs.existsSync(downloadPath)) {
        const files = fs.readdirSync(downloadPath);
        
        for (const file of files) {
          const filePath = path.join(downloadPath, file);
          const stats = fs.statSync(filePath);
          
          // 清理超過24小時的臨時檔案（以.tmp結尾）
          if (file.endsWith('.tmp') && Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      }
      
      const result: RecoveryResult = {
        success: true,
        operation,
        details: `已清理 ${cleanedCount} 個臨時檔案`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-completed', result);
      return result;
      
    } catch (error) {
      const result: RecoveryResult = {
        success: false,
        operation,
        details: `清理臨時檔案失敗: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };
      
      this.emit('recovery-failed', operation, error as Error);
      return result;
    }
  }

  /**
   * 啟動定期健康檢查
   */
  private startHealthCheckInterval(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.performHealthCheck();
        } catch (error) {
          this.logger.error('定期健康檢查失敗', error, { component: 'SystemRecovery' });
        }
      }
    }, this.healthCheckIntervalMs);
    
    this.logger.debug('定期健康檢查已啟動', { 
      component: 'SystemRecovery',
      intervalMs: this.healthCheckIntervalMs 
    });
  }

  /**
   * 初始化健康狀態
   */
  private initializeHealthStatus(): SystemHealthStatus {
    const now = new Date();
    
    return {
      overall: 'healthy',
      components: {
        database: { status: 'healthy', lastCheckTime: now },
        fileSystem: { status: 'healthy', lastCheckTime: now },
        network: { status: 'healthy', lastCheckTime: now },
        memory: { status: 'healthy', lastCheckTime: now },
        disk: { status: 'healthy', lastCheckTime: now }
      },
      lastCheckTime: now,
      issues: []
    };
  }

  /**
   * 取得Promise.allSettled結果
   */
  private getSettledResult(
    result: PromiseSettledResult<ComponentHealth>, 
    componentName: string
  ): ComponentHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        message: `${componentName}檢查失敗: ${result.reason}`,
        lastCheckTime: new Date()
      };
    }
  }

  /**
   * 計算整體健康狀態
   */
  private calculateOverallHealth(): void {
    const components = Object.values(this.healthStatus.components);
    const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;
    
    if (unhealthyCount > 0) {
      this.healthStatus.overall = 'unhealthy';
    } else if (degradedCount > 0) {
      this.healthStatus.overall = 'degraded';
    } else {
      this.healthStatus.overall = 'healthy';
    }
  }

  /**
   * 檢測健康狀態變化
   */
  private async detectHealthChanges(): Promise<void> {
    const currentIssues = new Set<string>();
    
    // 檢查各元件的健康問題
    for (const [componentName, health] of Object.entries(this.healthStatus.components)) {
      if (health.status !== 'healthy') {
        const issueKey = `${componentName}-${health.status}`;
        currentIssues.add(issueKey);
        
        if (!this.healthIssues.has(issueKey)) {
          // 新問題
          const issue: HealthIssue = {
            component: componentName,
            severity: health.status === 'unhealthy' ? 'high' : 'medium',
            message: health.message || `${componentName}狀態異常`,
            timestamp: new Date(),
            resolved: false
          };
          
          this.healthIssues.set(issueKey, issue);
          this.emit('health-issue-detected', issue);
          
          this.logger.warn(`檢測到健康問題: ${issue.message}`, { 
            component: 'SystemRecovery',
            issueKey,
            componentName 
          });
        }
      }
    }
    
    // 檢查已解決的問題
    for (const [issueKey, issue] of this.healthIssues.entries()) {
      if (!issue.resolved && !currentIssues.has(issueKey)) {
        issue.resolved = true;
        this.emit('health-issue-resolved', issue);
        
        this.logger.info(`健康問題已解決: ${issue.message}`, { 
          component: 'SystemRecovery',
          issueKey 
        });
      }
    }
    
    // 檢查系統狀態變化
    const previousOverallStatus = this.healthStatus.overall;
    this.calculateOverallHealth();
    
    if (previousOverallStatus !== this.healthStatus.overall) {
      if (this.healthStatus.overall === 'healthy') {
        this.emit('system-recovered', this.healthStatus);
      } else {
        this.emit('system-degraded', this.healthStatus);
      }
    }
  }
}

// 匯出事件類型以供TypeScript使用
export declare interface SystemRecovery {
  on<K extends keyof SystemRecoveryEvents>(event: K, listener: SystemRecoveryEvents[K]): this;
  emit<K extends keyof SystemRecoveryEvents>(event: K, ...args: Parameters<SystemRecoveryEvents[K]>): boolean;
}