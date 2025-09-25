import fs from 'fs';
import path from 'path';
import { Logger } from './Logger';

export interface LogRotationConfig {
  logDir: string;
  maxFiles: number;
  maxAge: number; // days
  maxSize: number; // bytes
  compressionEnabled: boolean;
  cleanupInterval: number; // milliseconds
}

export interface LogFileInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
  isCompressed: boolean;
}

export class LogRotationManager {
  private config: LogRotationConfig;
  private logger: Logger;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<LogRotationConfig>, logger: Logger) {
    this.config = {
      logDir: config.logDir ?? './logs',
      maxFiles: config.maxFiles ?? 14,
      maxAge: config.maxAge ?? 30,
      maxSize: config.maxSize ?? 100 * 1024 * 1024, // 100MB
      compressionEnabled: config.compressionEnabled ?? true,
      cleanupInterval: config.cleanupInterval ?? 24 * 60 * 60 * 1000 // 24 hours
    };
    this.logger = logger;
  }

  /**
   * 啟動自動清理排程
   */
  startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch(error => {
        this.logger.error('自動清理日誌時發生錯誤', error, { operation: 'auto_cleanup' });
      });
    }, this.config.cleanupInterval);

    this.logger.info('日誌自動清理排程已啟動', {
      interval: this.config.cleanupInterval,
      operation: 'log_rotation_start'
    });
  }

  /**
   * 停止自動清理排程
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      this.logger.info('日誌自動清理排程已停止', { operation: 'log_rotation_stop' });
    }
  }

  /**
   * 執行日誌清理
   */
  async performCleanup(): Promise<{
    deletedFiles: string[];
    compressedFiles: string[];
    totalSpaceFreed: number;
  }> {
    const result = {
      deletedFiles: [] as string[],
      compressedFiles: [] as string[],
      totalSpaceFreed: 0
    };

    try {
      const logFiles = await this.getLogFiles();
      
      // 按修改時間排序，最舊的在前
      logFiles.sort((a, b) => a.modified.getTime() - b.modified.getTime());

      // 清理過期檔案
      const expiredFiles = this.getExpiredFiles(logFiles);
      for (const file of expiredFiles) {
        try {
          result.totalSpaceFreed += file.size;
          fs.unlinkSync(file.path);
          result.deletedFiles.push(file.filename);
          this.logger.info(`已刪除過期日誌檔案: ${file.filename}`, {
            size: file.size,
            age: Math.floor((Date.now() - file.modified.getTime()) / (1000 * 60 * 60 * 24)),
            operation: 'log_cleanup'
          });
        } catch (error) {
          this.logger.error(`刪除日誌檔案失敗: ${file.filename}`, error);
        }
      }

      // 清理超過數量限制的檔案
      const remainingFiles = logFiles.filter(f => !expiredFiles.includes(f));
      if (remainingFiles.length > this.config.maxFiles) {
        const filesToDelete = remainingFiles.slice(0, remainingFiles.length - this.config.maxFiles);
        for (const file of filesToDelete) {
          try {
            result.totalSpaceFreed += file.size;
            fs.unlinkSync(file.path);
            result.deletedFiles.push(file.filename);
            this.logger.info(`已刪除超量日誌檔案: ${file.filename}`, {
              size: file.size,
              operation: 'log_cleanup'
            });
          } catch (error) {
            this.logger.error(`刪除日誌檔案失敗: ${file.filename}`, error);
          }
        }
      }

      // 壓縮大檔案（如果啟用壓縮）
      if (this.config.compressionEnabled) {
        const filesToCompress = remainingFiles.filter(f => 
          !f.isCompressed && 
          f.size > this.config.maxSize / 10 && // 壓縮超過最大大小10%的檔案
          !result.deletedFiles.includes(f.filename)
        );

        for (const file of filesToCompress) {
          try {
            await this.compressLogFile(file);
            result.compressedFiles.push(file.filename);
            this.logger.info(`已壓縮日誌檔案: ${file.filename}`, {
              originalSize: file.size,
              operation: 'log_compression'
            });
          } catch (error) {
            this.logger.error(`壓縮日誌檔案失敗: ${file.filename}`, error);
          }
        }
      }

      this.logger.info('日誌清理完成', {
        deletedCount: result.deletedFiles.length,
        compressedCount: result.compressedFiles.length,
        spaceFreed: result.totalSpaceFreed,
        operation: 'log_cleanup_complete'
      });

    } catch (error) {
      this.logger.error('執行日誌清理時發生錯誤', error, { operation: 'log_cleanup' });
      throw error;
    }

    return result;
  }

  /**
   * 取得所有日誌檔案資訊
   */
  private async getLogFiles(): Promise<LogFileInfo[]> {
    const files: LogFileInfo[] = [];

    try {
      const entries = fs.readdirSync(this.config.logDir);
      
      for (const entry of entries) {
        if (this.isLogFile(entry)) {
          const filePath = path.join(this.config.logDir, entry);
          const stats = fs.statSync(filePath);
          
          files.push({
            filename: entry,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            isCompressed: entry.endsWith('.gz') || entry.endsWith('.zip')
          });
        }
      }
    } catch (error) {
      this.logger.error('讀取日誌目錄時發生錯誤', error);
      throw error;
    }

    return files;
  }

  /**
   * 判斷是否為日誌檔案
   */
  private isLogFile(filename: string): boolean {
    const logExtensions = ['.log', '.log.gz', '.log.zip'];
    return logExtensions.some(ext => filename.endsWith(ext)) ||
           /\d{4}-\d{2}-\d{2}\.log/.test(filename); // 日期格式的日誌檔案
  }

  /**
   * 取得過期的日誌檔案
   */
  private getExpiredFiles(files: LogFileInfo[]): LogFileInfo[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAge);

    return files.filter(file => file.modified < cutoffDate);
  }

  /**
   * 壓縮日誌檔案
   */
  private async compressLogFile(file: LogFileInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const zlib = require('zlib');
      const readStream = fs.createReadStream(file.path);
      const writeStream = fs.createWriteStream(`${file.path}.gz`);
      const gzip = zlib.createGzip();

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', () => {
          // 刪除原始檔案
          fs.unlinkSync(file.path);
          resolve();
        })
        .on('error', reject);
    });
  }

  /**
   * 取得日誌統計資訊
   */
  async getLogStatistics(): Promise<{
    totalFiles: number;
    totalSize: number;
    compressedFiles: number;
    oldestFile?: LogFileInfo;
    newestFile?: LogFileInfo;
    averageFileSize: number;
  }> {
    try {
      const files = await this.getLogFiles();
      
      if (files.length === 0) {
        return {
          totalFiles: 0,
          totalSize: 0,
          compressedFiles: 0,
          averageFileSize: 0
        };
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const compressedFiles = files.filter(f => f.isCompressed).length;
      
      // 找出最舊和最新的檔案
      const sortedByDate = [...files].sort((a, b) => a.modified.getTime() - b.modified.getTime());
      const oldestFile = sortedByDate[0];
      const newestFile = sortedByDate[sortedByDate.length - 1];

      return {
        totalFiles: files.length,
        totalSize,
        compressedFiles,
        oldestFile,
        newestFile,
        averageFileSize: Math.round(totalSize / files.length)
      };
    } catch (error) {
      this.logger.error('取得日誌統計資訊時發生錯誤', error);
      throw error;
    }
  }

  /**
   * 手動觸發日誌輪轉
   */
  async rotateNow(): Promise<void> {
    this.logger.info('手動觸發日誌輪轉', { operation: 'manual_rotation' });
    await this.performCleanup();
  }

  /**
   * 檢查日誌目錄健康狀態
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    statistics: any;
  }> {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    try {
      // 檢查目錄是否存在且可寫
      if (!fs.existsSync(this.config.logDir)) {
        issues.push('日誌目錄不存在');
        status = 'critical';
      } else {
        try {
          const testFile = path.join(this.config.logDir, '.health-check');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
        } catch {
          issues.push('日誌目錄不可寫');
          status = 'critical';
        }
      }

      // 取得統計資訊
      const stats = await this.getLogStatistics();

      // 檢查檔案數量
      if (stats.totalFiles > this.config.maxFiles * 1.2) {
        issues.push(`日誌檔案數量過多 (${stats.totalFiles}/${this.config.maxFiles})`);
        if (status === 'healthy') status = 'warning';
      }

      // 檢查總大小
      const maxTotalSize = this.config.maxSize * this.config.maxFiles;
      if (stats.totalSize > maxTotalSize) {
        issues.push(`日誌總大小超限 (${Math.round(stats.totalSize / 1024 / 1024)}MB/${Math.round(maxTotalSize / 1024 / 1024)}MB)`);
        if (status === 'healthy') status = 'warning';
      }

      // 檢查最舊檔案年齡
      if (stats.oldestFile) {
        const ageInDays = Math.floor((Date.now() - stats.oldestFile.modified.getTime()) / (1000 * 60 * 60 * 24));
        if (ageInDays > this.config.maxAge * 1.5) {
          issues.push(`存在過舊的日誌檔案 (${ageInDays} 天)`);
          if (status === 'healthy') status = 'warning';
        }
      }

      return {
        status,
        issues,
        statistics: stats
      };

    } catch (error) {
      return {
        status: 'critical',
        issues: [`健康檢查失敗: ${error instanceof Error ? error.message : String(error)}`],
        statistics: null
      };
    }
  }

  /**
   * 清理資源
   */
  destroy(): void {
    this.stopAutoCleanup();
  }
}