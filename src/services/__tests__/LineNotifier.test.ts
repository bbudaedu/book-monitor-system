import { LineNotifier } from '../LineNotifier';
import { BookInfo, BookStatus, ErrorInfo, LogLevel, DailySummary } from '../../types';
import { messagingApi } from '@line/bot-sdk';
import { MessageTemplates } from '../MessageTemplates';

// Mock the LINE SDK
jest.mock('@line/bot-sdk', () => ({
  messagingApi: {
    MessagingApiClient: jest.fn().mockImplementation(() => ({
      pushMessage: jest.fn(),
    }))
  }
}));

// Mock Logger
jest.mock('../Logger', () => ({
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    })
  }
}));

// Mock MessageTemplates
jest.mock('../MessageTemplates', () => ({
  MessageTemplates: {
    createBookNotificationFlexMessage: jest.fn(),
    createBookNotificationTextMessage: jest.fn(),
    createErrorNotificationFlexMessage: jest.fn(),
    createErrorNotificationTextMessage: jest.fn(),
    createStatusNotificationFlexMessage: jest.fn(),
    createStatusNotificationTextMessage: jest.fn(),
    createDailySummaryFlexMessage: jest.fn()
  }
}));

// Helper function to extract text from message
const getMessageText = (call: any): string => {
  return (call.messages[0] as any).text;
};

describe('LineNotifier', () => {
  let lineNotifier: LineNotifier;
  let mockClient: jest.Mocked<messagingApi.MessagingApiClient>;
  const testToken = 'test_channel_access_token';
  const testUserId = 'test_user_id';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      pushMessage: jest.fn()
    } as any;
    
    // Mock the MessagingApiClient constructor
    (messagingApi.MessagingApiClient as jest.Mock).mockImplementation(() => mockClient);
    
    // Setup MessageTemplates mocks
    (MessageTemplates.createBookNotificationFlexMessage as jest.Mock).mockReturnValue({
      type: 'flex',
      altText: 'Book notification',
      contents: {}
    });
    (MessageTemplates.createBookNotificationTextMessage as jest.Mock).mockReturnValue({
      type: 'text',
      text: 'Book notification text'
    });
    (MessageTemplates.createErrorNotificationFlexMessage as jest.Mock).mockReturnValue({
      type: 'flex',
      altText: 'Error notification',
      contents: {}
    });
    (MessageTemplates.createErrorNotificationTextMessage as jest.Mock).mockReturnValue({
      type: 'text',
      text: 'Error notification text'
    });
    (MessageTemplates.createStatusNotificationFlexMessage as jest.Mock).mockReturnValue({
      type: 'flex',
      altText: 'Status notification',
      contents: {}
    });
    (MessageTemplates.createStatusNotificationTextMessage as jest.Mock).mockReturnValue({
      type: 'text',
      text: 'Status notification text'
    });
    (MessageTemplates.createDailySummaryFlexMessage as jest.Mock).mockReturnValue({
      type: 'flex',
      altText: 'Daily summary',
      contents: {}
    });
    
    lineNotifier = new LineNotifier(testToken, testUserId);
  });

  describe('constructor', () => {
    it('should create LineNotifier with access token', () => {
      expect(messagingApi.MessagingApiClient).toHaveBeenCalledWith({
        channelAccessToken: testToken
      });
    });

    it('should create LineNotifier without user ID', () => {
      const notifier = new LineNotifier(testToken);
      expect(notifier).toBeInstanceOf(LineNotifier);
    });
  });

  describe('setUserId', () => {
    it('should set user ID', () => {
      const newUserId = 'new_user_id';
      lineNotifier.setUserId(newUserId);
      // We can't directly test the private property, but we can test it through sendBookNotification
    });
  });

  describe('setRetryConfig', () => {
    it('should set retry configuration', () => {
      lineNotifier.setRetryConfig(5, 2000);
      // We can't directly test private properties, but this tests the method doesn't throw
    });
  });

  describe('setUseFlexMessages', () => {
    it('should set flex message usage', () => {
      lineNotifier.setUseFlexMessages(false);
      // We can't directly test private properties, but this tests the method doesn't throw
    });
  });

  describe('sendBookNotification', () => {
    const mockBookInfo: BookInfo = {
      id: 1,
      title: '測試書籍',
      author: '測試作者',
      description: '這是一本測試書籍',
      pdfUrl: 'https://example.com/test.pdf',
      filePath: '/downloads/test.pdf',
      status: BookStatus.COMPLETED
    };

    it('should send book notification successfully with flex message', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(true);
      expect(MessageTemplates.createBookNotificationFlexMessage).toHaveBeenCalledWith(mockBookInfo);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'flex',
          altText: 'Book notification',
          contents: {}
        }]
      });
    });

    it('should send book notification successfully with text message when flex disabled', async () => {
      lineNotifier.setUseFlexMessages(false);
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(true);
      expect(MessageTemplates.createBookNotificationTextMessage).toHaveBeenCalledWith(mockBookInfo);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'text',
          text: 'Book notification text'
        }]
      });
    });

    it('should return false when user ID is not set', async () => {
      const notifier = new LineNotifier(testToken);
      
      const result = await notifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(false);
      expect(mockClient.pushMessage).not.toHaveBeenCalled();
    });

    it('should return false when LINE API call fails', async () => {
      // Mock all calls to fail (including retries)
      mockClient.pushMessage.mockRejectedValue(new Error('API Error'));

      const result = await lineNotifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(false);
    }, 10000);


  });

  describe('sendErrorNotification', () => {
    const mockErrorInfo: ErrorInfo = {
      code: 'DOWNLOAD_ERROR',
      message: '下載失敗',
      timestamp: new Date('2023-01-01T12:00:00Z'),
      retryCount: 2
    };

    it('should send error notification successfully with flex message', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendErrorNotification(mockErrorInfo);

      expect(result).toBe(true);
      expect(MessageTemplates.createErrorNotificationFlexMessage).toHaveBeenCalledWith(mockErrorInfo);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'flex',
          altText: 'Error notification',
          contents: {}
        }]
      });
    });

    it('should send error notification successfully with text message when flex disabled', async () => {
      lineNotifier.setUseFlexMessages(false);
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendErrorNotification(mockErrorInfo);

      expect(result).toBe(true);
      expect(MessageTemplates.createErrorNotificationTextMessage).toHaveBeenCalledWith(mockErrorInfo);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'text',
          text: 'Error notification text'
        }]
      });
    });

    it('should return false when user ID is not set', async () => {
      const notifier = new LineNotifier(testToken);
      
      const result = await notifier.sendErrorNotification(mockErrorInfo);

      expect(result).toBe(false);
      expect(mockClient.pushMessage).not.toHaveBeenCalled();
    });


  });

  describe('sendStatusNotification', () => {
    it('should send status notification successfully with flex message', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendStatusNotification('系統啟動');

      expect(result).toBe(true);
      expect(MessageTemplates.createStatusNotificationFlexMessage).toHaveBeenCalledWith('系統啟動', undefined);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'flex',
          altText: 'Status notification',
          contents: {}
        }]
      });
    });

    it('should send status notification with details', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);
      const details = {
        booksFound: 5,
        downloaded: 3,
        errors: 1
      };

      await lineNotifier.sendStatusNotification('監控完成', details);

      expect(MessageTemplates.createStatusNotificationFlexMessage).toHaveBeenCalledWith('監控完成', details);
    });

    it('should send status notification with text message when flex disabled', async () => {
      lineNotifier.setUseFlexMessages(false);
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendStatusNotification('系統啟動');

      expect(result).toBe(true);
      expect(MessageTemplates.createStatusNotificationTextMessage).toHaveBeenCalledWith('系統啟動', undefined);
    });
  });

  describe('sendDailySummaryNotification', () => {
    const mockSummary: DailySummary = {
      date: new Date('2023-01-01'),
      totalBooks: 100,
      newBooks: 5,
      downloaded: 4,
      failed: 1
    };

    it('should send daily summary notification successfully', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendDailySummaryNotification(mockSummary);

      expect(result).toBe(true);
      expect(MessageTemplates.createDailySummaryFlexMessage).toHaveBeenCalledWith(mockSummary);
      expect(mockClient.pushMessage).toHaveBeenCalledWith({
        to: testUserId,
        messages: [{
          type: 'flex',
          altText: 'Daily summary',
          contents: {}
        }]
      });
    });

    it('should return false when user ID is not set', async () => {
      const notifier = new LineNotifier(testToken);
      
      const result = await notifier.sendDailySummaryNotification(mockSummary);

      expect(result).toBe(false);
      expect(mockClient.pushMessage).not.toHaveBeenCalled();
    });

    it('should return false when LINE API call fails', async () => {
      mockClient.pushMessage.mockRejectedValue(new Error('API Error'));

      const result = await lineNotifier.sendDailySummaryNotification(mockSummary);

      expect(result).toBe(false);
    }, 10000);
  });

  describe('validateToken', () => {
    it('should return true for valid token (400 error)', async () => {
      const error = new Error('Bad Request') as any;
      error.status = 400;
      mockClient.pushMessage.mockRejectedValueOnce(error);

      const result = await lineNotifier.validateToken();

      expect(result).toBe(true);
    });

    it('should return false for invalid token (401 error)', async () => {
      const error = new Error('Unauthorized') as any;
      error.status = 401;
      mockClient.pushMessage.mockRejectedValueOnce(error);

      const result = await lineNotifier.validateToken();

      expect(result).toBe(false);
    });

    it('should return false for other errors', async () => {
      const error = new Error('Server Error') as any;
      error.status = 500;
      mockClient.pushMessage.mockRejectedValueOnce(error);

      const result = await lineNotifier.validateToken();

      expect(result).toBe(false);
    });

    it('should return true if no error occurs', async () => {
      mockClient.pushMessage.mockResolvedValueOnce({} as any);

      const result = await lineNotifier.validateToken();

      expect(result).toBe(true);
    });
  });

  describe('retry mechanism', () => {
    it('should retry on failure and succeed', async () => {
      const mockBookInfo: BookInfo = {
        id: 1,
        title: '測試書籍',
        author: '測試作者',
        pdfUrl: 'https://example.com/test.pdf',
        status: BookStatus.PENDING
      };

      // First call fails, second succeeds
      mockClient.pushMessage
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({} as any);

      const result = await lineNotifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(true);
      expect(mockClient.pushMessage).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const mockBookInfo: BookInfo = {
        id: 1,
        title: '測試書籍',
        author: '測試作者',
        pdfUrl: 'https://example.com/test.pdf',
        status: BookStatus.PENDING
      };

      // Set max retries to 2 for faster testing
      lineNotifier.setRetryConfig(2, 100);

      // All calls fail
      mockClient.pushMessage.mockRejectedValue(new Error('Network Error'));

      const result = await lineNotifier.sendBookNotification(mockBookInfo);

      expect(result).toBe(false);
      expect(mockClient.pushMessage).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });


});