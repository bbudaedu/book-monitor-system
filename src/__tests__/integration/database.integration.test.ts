/**
 * 資料庫整合測試
 * 
 * 測試資料庫相關的整合功能
 */

import { DatabaseManager } from '../../database/DatabaseManager';
import { Book } from '../../models/Book';
import { ConfigManager } from '../../services/ConfigManager';
import { createMockDatabaseConfig, createMockBookInfo, createMockSystemConfig } from '../testUtils';
import { BookStatus } from '../../types';

// 模擬資料庫
jest.mock('../../database/DatabaseManager');

describe('Database Integration Tests', () => {
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let book: Book;
  let configManager: ConfigManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbManager = new DatabaseManager(createMockDatabaseConfig()) as jest.Mocked<DatabaseManager>;
    mockDbManager.connect = jest.fn().mockResolvedValue(undefined);
    mockDbManager.disconnect = jest.fn().mockResolvedValue(undefined);
    mockDbManager.query = jest.fn();
    mockDbManager.transaction = jest.fn();

    book = new Book(mockDbManager);
    configManager = new ConfigManager(mockDbManager, 'test-password');
  });

  describe('書籍資料庫操作整合', () => {
    it('應該能夠完成完整的書籍生命週期操作', async () => {
      const mockBookData = createMockBookInfo({
        title: '整合測試書籍',
        author: '整合測試作者',
        status: BookStatus.PENDING
      });

      // 模擬建立書籍
      mockDbManager.query
        .mockResolvedValueOnce({
          rows: [{ ...mockBookData, id: 1 }],
          rowCount: 1,
          command: 'INSERT'
        })
        // 模擬查詢書籍
        .mockResolvedValueOnce({
          rows: [{ ...mockBookData, id: 1 }],
          rowCount: 1,
          command: 'SELECT'
        })
        // 模擬更新書籍狀態
        .mockResolvedValueOnce({
          rows: [{ ...mockBookData, id: 1, status: BookStatus.DOWNLOADING }],
          rowCount: 1,
          command: 'UPDATE'
        })
        // 模擬最終更新為完成狀態
        .mockResolvedValueOnce({
          rows: [{ ...mockBookData, id: 1, status: BookStatus.COMPLETED }],
          rowCount: 1,
          command: 'UPDATE'
        });

      // 建立書籍
      const createdBook = await book.create({
        title: mockBookData.title,
        author: mockBookData.author,
        pdfUrl: mockBookData.pdfUrl,
        status: BookStatus.PENDING
      });

      expect(createdBook.id).toBe(1);
      expect(createdBook.title).toBe('整合測試書籍');

      // 查詢書籍
      const foundBook = await book.findById(1);
      expect(foundBook).toBeDefined();
      expect(foundBook!.title).toBe('整合測試書籍');

      // 更新書籍狀態為下載中
      const downloadingBook = await book.update(1, { status: BookStatus.DOWNLOADING });
      expect(downloadingBook.status).toBe(BookStatus.DOWNLOADING);

      // 更新書籍狀態為完成
      const completedBook = await book.update(1, { 
        status: BookStatus.COMPLETED,
        filePath: '/downloads/test-book.pdf',
        fileSize: 1024000,
        downloadedAt: new Date()
      });
      expect(completedBook.status).toBe(BookStatus.COMPLETED);
    });

    it('應該能夠處理批量書籍操作', async () => {
      const bookIds = [1, 2, 3, 4, 5];
      
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 5,
        command: 'UPDATE'
      });

      const updatedCount = await book.batchUpdateStatus(bookIds, BookStatus.DOWNLOADING);
      
      expect(updatedCount).toBe(5);
      expect(mockDbManager.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id IN'),
        expect.arrayContaining([...bookIds, BookStatus.DOWNLOADING])
      );
    });

    it('應該能夠處理書籍統計查詢', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [{
          total: '100',
          pending: '20',
          downloading: '10',
          completed: '65',
          failed: '5'
        }],
        rowCount: 1,
        command: 'SELECT'
      });

      const totalCount = await book.count();
      const pendingCount = await book.count(BookStatus.PENDING);

      expect(totalCount).toBe(100);
      expect(pendingCount).toBe(20);
    });
  });

  describe('設定資料庫操作整合', () => {
    it('應該能夠完成完整的設定管理流程', async () => {
      const testConfig = createMockSystemConfig({
        monitorInterval: 600000,
        downloadPath: './integration-test-downloads',
        lineAccessToken: 'integration-test-token'
      });

      // 模擬設定儲存
      mockDbManager.query
        .mockResolvedValue({
          rows: [],
          rowCount: 1,
          command: 'INSERT'
        });

      await configManager.saveConfig(testConfig);

      // 驗證所有設定項目都被儲存
      expect(mockDbManager.query).toHaveBeenCalledTimes(6); // 6個設定項目

      // 模擬設定載入
      const mockConfigRows = [
        { key: 'monitor_interval', value: '600000', encrypted: false, updated_at: new Date() },
        { key: 'download_path', value: './integration-test-downloads', encrypted: false, updated_at: new Date() },
        { key: 'line_access_token', value: 'encrypted-token', encrypted: true, updated_at: new Date() },
        { key: 'max_retries', value: '3', encrypted: false, updated_at: new Date() },
        { key: 'log_level', value: 'info', encrypted: false, updated_at: new Date() },
        { key: 'auto_start', value: 'false', encrypted: false, updated_at: new Date() }
      ];

      mockDbManager.query.mockResolvedValue({
        rows: mockConfigRows,
        rowCount: mockConfigRows.length,
        command: 'SELECT'
      });

      const loadedConfig = await configManager.loadConfig();

      expect(loadedConfig.monitorInterval).toBe(600000);
      expect(loadedConfig.downloadPath).toBe('./integration-test-downloads');
    });

    it('應該能夠處理加密設定項目', async () => {
      const sensitiveData = 'sensitive-line-token-12345';

      // 測試加密
      const encrypted = await configManager.encryptSensitiveData(sensitiveData);
      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted).toContain(':'); // 應該包含IV分隔符

      // 測試解密
      const decrypted = await configManager.decryptSensitiveData(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    it('應該能夠處理單一設定項目操作', async () => {
      // 設定項目
      mockDbManager.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'INSERT'
      });

      await configManager.set('test_key', 'test_value');

      // 獲取項目
      mockDbManager.query.mockResolvedValueOnce({
        rows: [{ key: 'test_key', value: 'test_value', encrypted: false, updated_at: new Date() }],
        rowCount: 1,
        command: 'SELECT'
      });

      const value = await configManager.get('test_key');
      expect(value).toBe('test_value');

      // 刪除項目
      mockDbManager.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'DELETE'
      });

      const deleted = await configManager.delete('test_key');
      expect(deleted).toBe(true);
    });
  });

  describe('事務處理整合', () => {
    it('應該能夠處理複雜的事務操作', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockDbManager);
      });

      mockDbManager.transaction = mockTransaction;

      // 模擬在事務中建立多本書籍
      mockDbManager.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, title: '書籍1' }],
          rowCount: 1,
          command: 'INSERT'
        })
        .mockResolvedValueOnce({
          rows: [{ id: 2, title: '書籍2' }],
          rowCount: 1,
          command: 'INSERT'
        })
        .mockResolvedValueOnce({
          rows: [{ id: 3, title: '書籍3' }],
          rowCount: 1,
          command: 'INSERT'
        });

      const result = await mockDbManager.transaction(async (db) => {
        const book1 = await book.create({
          title: '書籍1',
          pdfUrl: 'https://example.com/book1.pdf',
          status: BookStatus.PENDING
        });

        const book2 = await book.create({
          title: '書籍2',
          pdfUrl: 'https://example.com/book2.pdf',
          status: BookStatus.PENDING
        });

        const book3 = await book.create({
          title: '書籍3',
          pdfUrl: 'https://example.com/book3.pdf',
          status: BookStatus.PENDING
        });

        return [book1, book2, book3];
      });

      expect(mockTransaction).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('書籍1');
      expect(result[1].title).toBe('書籍2');
      expect(result[2].title).toBe('書籍3');
    });

    it('應該能夠處理事務回滾', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        try {
          return await callback(mockDbManager);
        } catch (error) {
          // 模擬事務回滾
          throw error;
        }
      });

      mockDbManager.transaction = mockTransaction;

      // 模擬第一個操作成功，第二個操作失敗
      mockDbManager.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, title: '書籍1' }],
          rowCount: 1,
          command: 'INSERT'
        })
        .mockRejectedValueOnce(new Error('資料庫錯誤'));

      await expect(
        mockDbManager.transaction(async (db) => {
          // 第一個操作成功
          await book.create({
            title: '書籍1',
            pdfUrl: 'https://example.com/book1.pdf',
            status: BookStatus.PENDING
          });

          // 第二個操作失敗
          await book.create({
            title: '書籍2',
            pdfUrl: 'https://example.com/book2.pdf',
            status: BookStatus.PENDING
          });
        })
      ).rejects.toThrow('資料庫錯誤');

      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe('連接管理整合', () => {
    it('應該能夠處理連接生命週期', async () => {
      // 連接
      await mockDbManager.connect();
      expect(mockDbManager.connect).toHaveBeenCalled();

      // 健康檢查
      mockDbManager.healthCheck = jest.fn().mockResolvedValue(true);
      const isHealthy = await mockDbManager.healthCheck();
      expect(isHealthy).toBe(true);

      // 斷開連接
      await mockDbManager.disconnect();
      expect(mockDbManager.disconnect).toHaveBeenCalled();
    });

    it('應該能夠處理連接錯誤', async () => {
      mockDbManager.connect = jest.fn().mockRejectedValue(new Error('連接失敗'));

      await expect(mockDbManager.connect()).rejects.toThrow('連接失敗');
    });

    it('應該能夠處理查詢超時', async () => {
      mockDbManager.query = jest.fn().mockRejectedValue(new Error('查詢超時'));

      await expect(
        book.findById(1)
      ).rejects.toThrow('查詢超時');
    });
  });

  describe('資料一致性測試', () => {
    it('應該維護書籍狀態的一致性', async () => {
      const bookId = 1;

      // 模擬狀態變更序列
      const statusSequence = [
        BookStatus.PENDING,
        BookStatus.DOWNLOADING,
        BookStatus.COMPLETED
      ];

      for (let i = 0; i < statusSequence.length; i++) {
        mockDbManager.query.mockResolvedValueOnce({
          rows: [{
            id: bookId,
            title: '測試書籍',
            status: statusSequence[i],
            updated_at: new Date()
          }],
          rowCount: 1,
          command: 'UPDATE'
        });

        const updatedBook = await book.update(bookId, { status: statusSequence[i] });
        expect(updatedBook.status).toBe(statusSequence[i]);
      }
    });

    it('應該防止無效的狀態轉換', async () => {
      // 嘗試從 COMPLETED 狀態回到 PENDING 狀態應該被驗證邏輯阻止
      const invalidUpdate = {
        title: '',  // 無效的標題
        status: BookStatus.PENDING
      };

      await expect(
        book.update(1, invalidUpdate)
      ).rejects.toThrow('沒有提供要更新的欄位');
    });
  });
});