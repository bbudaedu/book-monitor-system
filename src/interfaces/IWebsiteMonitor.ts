import { BookInfo } from '../types';

/**
 * 網站監控模組介面
 * 負責定期檢查目標網站，檢測新書籍
 */
export interface IWebsiteMonitor {
  /**
   * 開始監控
   * @param interval 檢查間隔（毫秒）
   */
  startMonitoring(interval: number): Promise<void>;

  /**
   * 停止監控
   */
  stopMonitoring(): Promise<void>;

  /**
   * 檢查新書籍
   * @returns 新發現的書籍列表
   */
  checkForNewBooks(): Promise<BookInfo[]>;

  /**
   * 解析書籍列表
   * @param html 網頁HTML內容
   * @returns 解析出的書籍資訊
   */
  parseBookList(html: string): Promise<BookInfo[]>;

  /**
   * 獲取監控狀態
   */
  isMonitoring(): boolean;

  /**
   * 設定目標網站URL
   * @param url 目標網站URL
   */
  setTargetUrl(url: string): void;
}