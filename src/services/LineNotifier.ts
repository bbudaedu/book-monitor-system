import { messagingApi } from '@line/bot-sdk';
import { BookInfo, LineMessage, ErrorInfo, DailySummary } from '../types';
import { Logger } from './Logger';
import { MessageTemplates } from './MessageTemplates';

/**
 * LINE 通知服務
 * 負責透過 LINE Messaging API 發送通知訊息
 */
export class LineNotifier {
  private client: messagingApi.MessagingApiClient;
  private logger: Logger;
  private userId?: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second base delay
  private useFlexMessages: boolean = true; // 預設使用 Flex Message

  constructor(channelAccessToken: string, userId?: string) {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken
    });
    this.logger = Logger.getInstance();
    this.userId = userId;
  }

  /**
   * 設定接收通知的使用者 ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * 設定重試參數
   */
  setRetryConfig(maxRetries: number, retryDelay: number): void {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * 設定是否使用 Flex Message
   */
  setUseFlexMessages(useFlexMessages: boolean): void {
    this.useFlexMessages = useFlexMessages;
  }

  /**
   * 發送新書通知
   */
  async sendBookNotification(bookInfo: BookInfo): Promise<boolean> {
    if (!this.userId) {
      this.logger.error('無法發送通知：未設定使用者 ID');
      return false;
    }

    try {
      const message = this.useFlexMessages 
        ? MessageTemplates.createBookNotificationFlexMessage(bookInfo)
        : MessageTemplates.createBookNotificationTextMessage(bookInfo);
      await this.sendMessageWithRetry(this.userId, [message]);
      
      this.logger.info(`成功發送新書通知: ${bookInfo.title}`, {
        bookId: bookInfo.id,
        title: bookInfo.title
      });
      
      return true;
    } catch (error) {
      this.logger.error(`發送新書通知失敗: ${bookInfo.title}`, error);
      return false;
    }
  }

  /**
   * 發送錯誤通知
   */
  async sendErrorNotification(errorInfo: ErrorInfo): Promise<boolean> {
    if (!this.userId) {
      this.logger.error('無法發送錯誤通知：未設定使用者 ID');
      return false;
    }

    try {
      const message = this.useFlexMessages
        ? MessageTemplates.createErrorNotificationFlexMessage(errorInfo)
        : MessageTemplates.createErrorNotificationTextMessage(errorInfo);
      await this.sendMessageWithRetry(this.userId, [message]);
      
      this.logger.info(`成功發送錯誤通知: ${errorInfo.code}`, {
        errorCode: errorInfo.code,
        message: errorInfo.message
      });
      
      return true;
    } catch (error) {
      this.logger.error(`發送錯誤通知失敗: ${errorInfo.code}`, error);
      return false;
    }
  }

  /**
   * 發送系統狀態通知
   */
  async sendStatusNotification(status: string, details?: any): Promise<boolean> {
    if (!this.userId) {
      this.logger.error('無法發送狀態通知：未設定使用者 ID');
      return false;
    }

    try {
      const message = this.useFlexMessages
        ? MessageTemplates.createStatusNotificationFlexMessage(status, details)
        : MessageTemplates.createStatusNotificationTextMessage(status, details);
      await this.sendMessageWithRetry(this.userId, [message]);
      
      this.logger.info(`成功發送狀態通知: ${status}`);
      return true;
    } catch (error) {
      this.logger.error(`發送狀態通知失敗: ${status}`, error);
      return false;
    }
  }

  /**
   * 發送每日摘要通知
   */
  async sendDailySummaryNotification(summary: DailySummary): Promise<boolean> {
    if (!this.userId) {
      this.logger.error('無法發送每日摘要通知：未設定使用者 ID');
      return false;
    }

    try {
      const message = MessageTemplates.createDailySummaryFlexMessage(summary);
      await this.sendMessageWithRetry(this.userId, [message]);
      
      this.logger.info(`成功發送每日摘要通知: ${summary.date.toLocaleDateString('zh-TW')}`);
      return true;
    } catch (error) {
      this.logger.error(`發送每日摘要通知失敗: ${summary.date.toLocaleDateString('zh-TW')}`, error);
      return false;
    }
  }

  /**
   * 驗證 Access Token 是否有效
   */
  async validateToken(): Promise<boolean> {
    try {
      // 嘗試發送一個測試訊息到無效的使用者 ID 來驗證 token
      // 如果 token 無效，會收到 401 錯誤
      // 如果 token 有效但使用者 ID 無效，會收到 400 錯誤
      await this.client.pushMessage({
        to: 'invalid_user_id_for_token_validation',
        messages: [{ type: 'text', text: 'test' }]
      });
      
      return true;
    } catch (error: any) {
      if (error.status === 401) {
        this.logger.error('LINE Access Token 無效或已過期');
        return false;
      } else if (error.status === 400) {
        // Token 有效，但使用者 ID 無效（這是預期的）
        return true;
      } else {
        this.logger.error('驗證 LINE Access Token 時發生錯誤', error);
        return false;
      }
    }
  }



  /**
   * 帶重試機制的訊息發送
   */
  private async sendMessageWithRetry(
    to: string, 
    messages: LineMessage[], 
    retryCount: number = 0
  ): Promise<void> {
    try {
      const lineMessages = messages.map(msg => {
        if (msg.type === 'text') {
          return {
            type: 'text' as const,
            text: msg.text || ''
          };
        } else if (msg.type === 'flex') {
          return {
            type: 'flex' as const,
            altText: msg.altText || '',
            contents: msg.contents
          };
        }
        throw new Error(`Unsupported message type: ${msg.type}`);
      });

      await this.client.pushMessage({
        to,
        messages: lineMessages
      });
    } catch (error: any) {
      this.logger.warn(`LINE API 呼叫失敗 (第 ${retryCount + 1} 次嘗試)`, {
        error: error.message,
        status: error.status,
        retryCount
      });

      if (retryCount < this.maxRetries) {
        // 指數退避延遲
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await this.sleep(delay);
        
        return this.sendMessageWithRetry(to, messages, retryCount + 1);
      } else {
        throw new Error(`LINE API 呼叫失敗，已重試 ${this.maxRetries} 次: ${error.message}`);
      }
    }
  }

  /**
   * 延遲執行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}