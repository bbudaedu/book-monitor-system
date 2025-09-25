import { BookInfo, LogEntry } from '../types';

/**
 * 資料庫介面
 * 負責資料持久化操作
 */
export interface IDatabase {
  /**
   * 初始化資料庫
   */
  initialize(): Promise<void>;

  /**
   * 關閉資料庫連線
   */
  close(): Promise<void>;

  // 書籍相關操作
  /**
   * 新增書籍
   * @param book 書籍資訊
   * @returns 新增的書籍ID
   */
  addBook(book: BookInfo): Promise<number>;

  /**
   * 更新書籍
   * @param book 書籍資訊
   */
  updateBook(book: BookInfo): Promise<void>;

  /**
   * 根據ID獲取書籍
   * @param id 書籍ID
   * @returns 書籍資訊
   */
  getBookById(id: number): Promise<BookInfo | null>;

  /**
   * 根據PDF URL獲取書籍
   * @param pdfUrl PDF URL
   * @returns 書籍資訊
   */
  getBookByPdfUrl(pdfUrl: string): Promise<BookInfo | null>;

  /**
   * 獲取所有書籍
   * @param limit 限制數量
   * @param offset 偏移量
   * @returns 書籍列表
   */
  getAllBooks(limit?: number, offset?: number): Promise<BookInfo[]>;

  /**
   * 刪除書籍
   * @param id 書籍ID
   */
  deleteBook(id: number): Promise<void>;

  // 設定相關操作
  /**
   * 獲取設定值
   * @param key 設定鍵
   * @returns 設定值
   */
  getConfigValue(key: string): Promise<string | null>;

  /**
   * 設定設定值
   * @param key 設定鍵
   * @param value 設定值
   * @param encrypted 是否加密
   */
  setConfigValue(key: string, value: string, encrypted?: boolean): Promise<void>;

  /**
   * 刪除設定
   * @param key 設定鍵
   */
  deleteConfigValue(key: string): Promise<void>;

  // 日誌相關操作
  /**
   * 新增日誌記錄
   * @param log 日誌記錄
   */
  addLog(log: LogEntry): Promise<void>;

  /**
   * 獲取日誌記錄
   * @param limit 限制數量
   * @param level 過濾等級
   * @returns 日誌記錄列表
   */
  getLogs(limit?: number, level?: string): Promise<LogEntry[]>;

  /**
   * 清理舊日誌
   * @param daysToKeep 保留天數
   */
  cleanupOldLogs(daysToKeep: number): Promise<void>;
}