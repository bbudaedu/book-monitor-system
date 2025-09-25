// 核心資料類型定義

/**
 * 書籍資訊介面
 */
export interface BookInfo {
  id?: number;
  title: string;
  author?: string;
  description?: string;
  pdfUrl: string;
  downloadUrl?: string;
  filePath?: string;
  fileSize?: number;
  createdAt?: Date;
  updatedAt?: Date;
  downloadedAt?: Date;
  status: BookStatus;
}

/**
 * 書籍狀態列舉
 */
export enum BookStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 系統設定介面
 */
export interface SystemConfig {
  monitorInterval: number; // 監控間隔（毫秒）
  downloadPath: string; // 下載路徑
  lineAccessToken: string; // LINE Access Token
  maxRetries: number; // 最大重試次數
  logLevel: LogLevel; // 日誌等級
  autoStart: boolean; // 自動啟動監控
}

/**
 * 日誌等級列舉
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日誌記錄介面
 */
export interface LogEntry {
  id?: number;
  level: LogLevel;
  message: string;
  metadata?: any;
  timestamp: Date;
}

/**
 * 監控狀態介面
 */
export interface MonitorStatus {
  isRunning: boolean;
  lastCheckTime?: Date;
  nextCheckTime?: Date;
  totalBooksFound: number;
  totalDownloaded: number;
  errors: number;
}

/**
 * 下載進度介面
 */
export interface DownloadProgress {
  bookId: number;
  fileName: string;
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
}

/**
 * LINE 通知訊息介面
 */
export interface LineMessage {
  type: 'text' | 'flex';
  text?: string;
  altText?: string;
  contents?: any; // Flex Message contents
}

/**
 * 錯誤資訊介面
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  retryCount?: number;
}

/**
 * 每日摘要介面
 */
export interface DailySummary {
  date: Date;
  totalBooks: number;
  newBooks: number;
  downloaded: number;
  failed: number;
}