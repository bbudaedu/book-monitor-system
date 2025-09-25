import { LogLevel, LogEntry } from '../types';

/**
 * 日誌模組介面
 * 負責記錄系統運作日誌
 */
export interface ILogger {
  /**
   * 記錄資訊日誌
   * @param message 訊息
   * @param metadata 額外資料
   */
  info(message: string, metadata?: any): void;

  /**
   * 記錄錯誤日誌
   * @param message 訊息
   * @param error 錯誤物件
   */
  error(message: string, error?: Error): void;

  /**
   * 記錄警告日誌
   * @param message 訊息
   * @param metadata 額外資料
   */
  warn(message: string, metadata?: any): void;

  /**
   * 記錄除錯日誌
   * @param message 訊息
   * @param metadata 額外資料
   */
  debug(message: string, metadata?: any): void;

  /**
   * 設定日誌等級
   * @param level 日誌等級
   */
  setLevel(level: LogLevel): void;

  /**
   * 獲取日誌記錄
   * @param limit 限制數量
   * @param level 過濾等級
   * @returns 日誌記錄列表
   */
  getLogs(limit?: number, level?: LogLevel): Promise<LogEntry[]>;

  /**
   * 清理舊日誌
   * @param daysToKeep 保留天數
   */
  cleanupOldLogs(daysToKeep: number): Promise<void>;

  /**
   * 輪轉日誌檔案
   */
  rotateLogs(): Promise<void>;
}