/**
 * 應用程式常數定義
 */

// 目標網站URL
export const TARGET_WEBSITE_URL = 'https://www.budaedu.org/#/books/applicable/chinese';

// 預設設定值
export const DEFAULT_CONFIG = {
  monitorInterval: 5 * 60 * 1000, // 5分鐘
  downloadPath: './downloads',
  maxRetries: 3,
  logLevel: 'info' as const,
  autoStart: false
};

// 檔案路徑
export const PATHS = {
  DATABASE: './data/books.db',
  LOGS: './logs',
  CONFIG: './config',
  DOWNLOADS: './downloads'
};

// 資料庫表格名稱
export const DB_TABLES = {
  BOOKS: 'books',
  CONFIG: 'config',
  LOGS: 'logs'
};

// LINE API 相關
export const LINE_API = {
  BASE_URL: 'https://api.line.me/v2/bot',
  PUSH_ENDPOINT: '/message/push',
  PROFILE_ENDPOINT: '/profile'
};

// 錯誤代碼
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSING_ERROR: 'PARSING_ERROR',
  DOWNLOAD_ERROR: 'DOWNLOAD_ERROR',
  API_ERROR: 'API_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR'
};

// 應用程式資訊
export const APP_INFO = {
  NAME: 'Book Monitor System',
  VERSION: '1.0.0',
  DESCRIPTION: '自動化書籍監控系統'
};