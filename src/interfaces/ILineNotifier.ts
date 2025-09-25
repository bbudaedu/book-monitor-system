import { BookInfo, LineMessage, ErrorInfo } from '../types';

/**
 * LINE通知模組介面
 * 負責透過LINE Messaging API發送通知
 */
export interface ILineNotifier {
  /**
   * 發送新書通知
   * @param bookInfo 書籍資訊
   */
  sendBookNotification(bookInfo: BookInfo): Promise<void>;

  /**
   * 發送錯誤通知
   * @param error 錯誤資訊
   */
  sendErrorNotification(error: ErrorInfo): Promise<void>;

  /**
   * 驗證LINE Token有效性
   * @returns 是否有效
   */
  validateToken(): Promise<boolean>;

  /**
   * 格式化訊息
   * @param bookInfo 書籍資訊
   * @returns 格式化的訊息
   */
  formatMessage(bookInfo: BookInfo): LineMessage;

  /**
   * 設定LINE Access Token
   * @param token LINE Access Token
   */
  setAccessToken(token: string): void;

  /**
   * 發送自訂訊息
   * @param message 訊息內容
   */
  sendCustomMessage(message: LineMessage): Promise<void>;

  /**
   * 獲取API配額資訊
   */
  getQuotaInfo(): Promise<any>;
}