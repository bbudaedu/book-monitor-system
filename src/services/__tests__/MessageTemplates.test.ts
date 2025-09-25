import { MessageTemplates } from '../MessageTemplates';
import { BookInfo, BookStatus, ErrorInfo, DailySummary } from '../../types';

describe('MessageTemplates', () => {
  const mockBookInfo: BookInfo = {
    id: 1,
    title: '測試書籍標題',
    author: '測試作者',
    description: '這是一本測試書籍的描述',
    pdfUrl: 'https://example.com/test.pdf',
    filePath: '/downloads/test.pdf',
    status: BookStatus.COMPLETED
  };

  const mockErrorInfo: ErrorInfo = {
    code: 'DOWNLOAD_ERROR',
    message: '下載過程中發生錯誤',
    timestamp: new Date('2023-01-01T12:00:00Z'),
    retryCount: 2
  };

  describe('createBookNotificationFlexMessage', () => {
    it('should create flex message for book notification', () => {
      const message = MessageTemplates.createBookNotificationFlexMessage(mockBookInfo);

      expect(message.type).toBe('flex');
      expect(message.altText).toContain('📚 發現新書：測試書籍標題');
      expect(message.contents).toBeDefined();
      expect(message.contents.type).toBe('bubble');
    });

    it('should include book title in flex message', () => {
      const message = MessageTemplates.createBookNotificationFlexMessage(mockBookInfo);
      const contents = message.contents as any;

      const titleText = contents.body.contents[0];
      expect(titleText.text).toBe('測試書籍標題');
      expect(titleText.weight).toBe('bold');
    });

    it('should include author information', () => {
      const message = MessageTemplates.createBookNotificationFlexMessage(mockBookInfo);
      const contents = message.contents as any;

      const detailsBox = contents.body.contents[1];
      const authorRow = detailsBox.contents[0];
      expect(authorRow.contents[1].text).toBe('測試作者');
    });

    it('should handle book without author', () => {
      const bookWithoutAuthor = { ...mockBookInfo, author: undefined };
      const message = MessageTemplates.createBookNotificationFlexMessage(bookWithoutAuthor);
      const contents = message.contents as any;

      const detailsBox = contents.body.contents[1];
      const authorRow = detailsBox.contents[0];
      expect(authorRow.contents[1].text).toBe('未知');
    });

    it('should include status with correct color and icon', () => {
      const message = MessageTemplates.createBookNotificationFlexMessage(mockBookInfo);
      const contents = message.contents as any;

      const detailsBox = contents.body.contents[1];
      const statusRow = detailsBox.contents[1];
      expect(statusRow.contents[1].text).toContain('✅');
      expect(statusRow.contents[1].text).toContain('下載完成');
      expect(statusRow.contents[1].color).toBe('#1DB446');
    });

    it('should include PDF URL in footer button', () => {
      const message = MessageTemplates.createBookNotificationFlexMessage(mockBookInfo);
      const contents = message.contents as any;

      const button = contents.footer.contents[0];
      expect(button.action.uri).toBe('https://example.com/test.pdf');
      expect(button.action.label).toBe('查看原始連結');
    });
  });

  describe('createBookNotificationTextMessage', () => {
    it('should create text message for book notification', () => {
      const message = MessageTemplates.createBookNotificationTextMessage(mockBookInfo);

      expect(message.type).toBe('text');
      expect(message.text).toContain('📚 發現新書！');
      expect(message.text).toContain('測試書籍標題');
      expect(message.text).toContain('測試作者');
      expect(message.text).toContain('https://example.com/test.pdf');
    });

    it('should handle book without author', () => {
      const bookWithoutAuthor = { ...mockBookInfo, author: undefined };
      const message = MessageTemplates.createBookNotificationTextMessage(bookWithoutAuthor);

      expect(message.text).toContain('✍️ 作者: 未知');
    });

    it('should include file path when available', () => {
      const message = MessageTemplates.createBookNotificationTextMessage(mockBookInfo);

      expect(message.text).toContain('📁 檔案位置: /downloads/test.pdf');
    });

    it('should not include file path when not available', () => {
      const bookWithoutPath = { ...mockBookInfo, filePath: undefined };
      const message = MessageTemplates.createBookNotificationTextMessage(bookWithoutPath);

      expect(message.text).not.toContain('📁 檔案位置:');
    });
  });

  describe('createErrorNotificationFlexMessage', () => {
    it('should create flex message for error notification', () => {
      const message = MessageTemplates.createErrorNotificationFlexMessage(mockErrorInfo);

      expect(message.type).toBe('flex');
      expect(message.altText).toContain('⚠️ 系統錯誤：DOWNLOAD_ERROR');
      expect(message.contents).toBeDefined();
      expect(message.contents.type).toBe('bubble');
    });

    it('should include error code and message', () => {
      const message = MessageTemplates.createErrorNotificationFlexMessage(mockErrorInfo);
      const contents = message.contents as any;

      const errorCodeText = contents.body.contents[0];
      const errorMessageText = contents.body.contents[1];

      expect(errorCodeText.text).toBe('DOWNLOAD_ERROR');
      expect(errorMessageText.text).toBe('下載過程中發生錯誤');
    });

    it('should include timestamp', () => {
      const message = MessageTemplates.createErrorNotificationFlexMessage(mockErrorInfo);
      const contents = message.contents as any;

      const timestampRow = contents.body.contents[2].contents[0];
      expect(timestampRow.contents[1].text).toContain('2023');
    });

    it('should include retry count when available', () => {
      const message = MessageTemplates.createErrorNotificationFlexMessage(mockErrorInfo);
      const contents = message.contents as any;

      expect(contents.footer).toBeDefined();
      expect(contents.footer.contents[0].text).toContain('🔄 重試次數: 2');
    });

    it('should not include retry count when not available', () => {
      const errorWithoutRetry = { ...mockErrorInfo, retryCount: undefined };
      const message = MessageTemplates.createErrorNotificationFlexMessage(errorWithoutRetry);
      const contents = message.contents as any;

      expect(contents.footer).toBeUndefined();
    });
  });

  describe('createErrorNotificationTextMessage', () => {
    it('should create text message for error notification', () => {
      const message = MessageTemplates.createErrorNotificationTextMessage(mockErrorInfo);

      expect(message.type).toBe('text');
      expect(message.text).toContain('⚠️ 系統錯誤通知');
      expect(message.text).toContain('DOWNLOAD_ERROR');
      expect(message.text).toContain('下載過程中發生錯誤');
    });

    it('should include retry count when available', () => {
      const message = MessageTemplates.createErrorNotificationTextMessage(mockErrorInfo);

      expect(message.text).toContain('🔄 重試次數: 2');
    });

    it('should not include retry count when not available', () => {
      const errorWithoutRetry = { ...mockErrorInfo, retryCount: undefined };
      const message = MessageTemplates.createErrorNotificationTextMessage(errorWithoutRetry);

      expect(message.text).not.toContain('🔄 重試次數:');
    });
  });

  describe('createStatusNotificationFlexMessage', () => {
    it('should create flex message for status notification', () => {
      const message = MessageTemplates.createStatusNotificationFlexMessage('系統啟動');

      expect(message.type).toBe('flex');
      expect(message.altText).toContain('ℹ️ 系統狀態：系統啟動');
      expect(message.contents).toBeDefined();
    });

    it('should include status text', () => {
      const message = MessageTemplates.createStatusNotificationFlexMessage('監控完成');
      const contents = message.contents as any;

      const statusText = contents.body.contents[0];
      expect(statusText.text).toBe('監控完成');
    });

    it('should include details when provided', () => {
      const details = {
        booksFound: 5,
        downloaded: 3,
        errors: 1
      };
      const message = MessageTemplates.createStatusNotificationFlexMessage('監控完成', details);
      const contents = message.contents as any;

      const detailsBox = contents.body.contents[1];
      expect(detailsBox.contents).toHaveLength(3);
      
      expect(detailsBox.contents[0].contents[1].text).toBe('5 本');
      expect(detailsBox.contents[1].contents[1].text).toBe('3 本');
      expect(detailsBox.contents[2].contents[1].text).toBe('1 個');
    });

    it('should not include details section when no details provided', () => {
      const message = MessageTemplates.createStatusNotificationFlexMessage('系統啟動');
      const contents = message.contents as any;

      expect(contents.body.contents).toHaveLength(1); // Only status text
    });
  });

  describe('createStatusNotificationTextMessage', () => {
    it('should create text message for status notification', () => {
      const message = MessageTemplates.createStatusNotificationTextMessage('系統啟動');

      expect(message.type).toBe('text');
      expect(message.text).toContain('ℹ️ 系統狀態通知');
      expect(message.text).toContain('📊 狀態: 系統啟動');
    });

    it('should include details when provided', () => {
      const details = {
        booksFound: 5,
        downloaded: 3,
        errors: 1
      };
      const message = MessageTemplates.createStatusNotificationTextMessage('監控完成', details);

      expect(message.text).toContain('📚 發現書籍數: 5');
      expect(message.text).toContain('⬇️ 已下載: 3');
      expect(message.text).toContain('❌ 錯誤數: 1');
    });
  });

  describe('createDailySummaryFlexMessage', () => {
    const mockSummary: DailySummary = {
      date: new Date('2023-01-01'),
      totalBooks: 100,
      newBooks: 5,
      downloaded: 4,
      failed: 1
    };

    it('should create flex message for daily summary', () => {
      const message = MessageTemplates.createDailySummaryFlexMessage(mockSummary);

      expect(message.type).toBe('flex');
      expect(message.altText).toContain('📊 每日摘要');
      expect(message.contents).toBeDefined();
    });

    it('should include all summary statistics', () => {
      const message = MessageTemplates.createDailySummaryFlexMessage(mockSummary);
      const contents = message.contents as any;

      const statsBox = contents.body.contents[0];
      expect(statsBox.contents).toHaveLength(4);

      expect(statsBox.contents[0].contents[1].text).toBe('100 本');
      expect(statsBox.contents[1].contents[1].text).toBe('5 本');
      expect(statsBox.contents[2].contents[1].text).toBe('4 本');
      expect(statsBox.contents[3].contents[1].text).toBe('1 本');
    });

    it('should use appropriate colors for statistics', () => {
      const message = MessageTemplates.createDailySummaryFlexMessage(mockSummary);
      const contents = message.contents as any;

      const statsBox = contents.body.contents[0];
      
      // New books should be green
      expect(statsBox.contents[1].contents[1].color).toBe('#1DB446');
      // Downloaded should be green
      expect(statsBox.contents[2].contents[1].color).toBe('#1DB446');
      // Failed should be red when > 0
      expect(statsBox.contents[3].contents[1].color).toBe('#FF5551');
    });

    it('should use normal color for failed when count is 0', () => {
      const summaryWithNoFailures = { ...mockSummary, failed: 0 };
      const message = MessageTemplates.createDailySummaryFlexMessage(summaryWithNoFailures);
      const contents = message.contents as any;

      const statsBox = contents.body.contents[0];
      expect(statsBox.contents[3].contents[1].color).toBe('#333333');
    });
  });

  describe('status mapping functions', () => {
    it('should map all book statuses correctly', () => {
      const statusTests = [
        { status: BookStatus.PENDING, expectedText: '等待下載', expectedIcon: '⏳', expectedColor: '#FFA500' },
        { status: BookStatus.DOWNLOADING, expectedText: '下載中', expectedIcon: '⬇️', expectedColor: '#1E90FF' },
        { status: BookStatus.COMPLETED, expectedText: '下載完成', expectedIcon: '✅', expectedColor: '#1DB446' },
        { status: BookStatus.FAILED, expectedText: '下載失敗', expectedIcon: '❌', expectedColor: '#FF5551' }
      ];

      for (const test of statusTests) {
        const bookInfo = { ...mockBookInfo, status: test.status };
        const message = MessageTemplates.createBookNotificationFlexMessage(bookInfo);
        const contents = message.contents as any;

        const detailsBox = contents.body.contents[1];
        const statusRow = detailsBox.contents[1];
        
        expect(statusRow.contents[1].text).toContain(test.expectedIcon);
        expect(statusRow.contents[1].text).toContain(test.expectedText);
        expect(statusRow.contents[1].color).toBe(test.expectedColor);
      }
    });

    it('should map error severity colors correctly', () => {
      const errorTests = [
        { code: 'CRITICAL_ERROR', expectedColor: '#FF0000' },
        { code: 'FATAL_ERROR', expectedColor: '#FF0000' },
        { code: 'DOWNLOAD_ERROR', expectedColor: '#FF5551' },
        { code: 'WARNING_MESSAGE', expectedColor: '#FFA500' },
        { code: 'UNKNOWN_ERROR', expectedColor: '#FF5551' }
      ];

      for (const test of errorTests) {
        const errorInfo = { ...mockErrorInfo, code: test.code };
        const message = MessageTemplates.createErrorNotificationFlexMessage(errorInfo);
        const contents = message.contents as any;

        expect(contents.header.backgroundColor).toBe(test.expectedColor);
      }
    });

    it('should map system status colors correctly', () => {
      const statusTests = [
        { status: '系統啟動', expectedColor: '#1DB446' },
        { status: '監控完成', expectedColor: '#1DB446' },
        { status: '系統停止', expectedColor: '#FFA500' },
        { status: '監控暫停', expectedColor: '#FFA500' },
        { status: '系統錯誤', expectedColor: '#FF5551' },
        { status: '未知狀態', expectedColor: '#1E90FF' }
      ];

      for (const test of statusTests) {
        const message = MessageTemplates.createStatusNotificationFlexMessage(test.status);
        const contents = message.contents as any;

        expect(contents.header.backgroundColor).toBe(test.expectedColor);
      }
    });
  });
});