import { Book } from '../Book';
import { BookInfo, BookStatus } from '../../types';
import { DatabaseManager } from '../../database/DatabaseManager';
import { DatabaseConfig } from '../../types/database';

// 模擬DatabaseManager
jest.mock('../../database/DatabaseManager');

describe('Book Model', () => {
  let book: Book;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDbManager = new DatabaseManager({} as DatabaseConfig) as jest.Mocked<DatabaseManager>;
    book = new Book(mockDbManager);
  });

  describe('資料驗證', () => {
    test('應該驗證有效的書籍資料', () => {
      const validBook: Partial<BookInfo> = {
        title: '測試書籍',
        author: '測試作者',
        pdfUrl: 'https://example.com/test.pdf',
        status: BookStatus.PENDING
      };

      const result = Book.validate(validBook);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('應該拒絕空標題', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '',
        pdfUrl: 'https://example.com/test.pdf'
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('書籍標題不能為空');
    });

    test('應該拒絕空PDF URL', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        pdfUrl: ''
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('PDF URL不能為空');
    });

    test('應該拒絕無效的PDF URL格式', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        pdfUrl: 'invalid-url'
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('PDF URL格式不正確');
    });

    test('應該拒絕無效的下載URL格式', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf',
        downloadUrl: 'invalid-url'
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('下載URL格式不正確');
    });

    test('應該拒絕無效的書籍狀態', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf',
        status: 'invalid-status' as BookStatus
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('書籍狀態不正確');
    });

    test('應該拒絕負數檔案大小', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        pdfUrl: 'https://example.com/test.pdf',
        fileSize: -100
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('檔案大小不能為負數');
    });

    test('應該拒絕過長的標題', () => {
      const invalidBook: Partial<BookInfo> = {
        title: 'a'.repeat(256), // 超過255個字元
        pdfUrl: 'https://example.com/test.pdf'
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('書籍標題長度不能超過255個字元');
    });

    test('應該拒絕過長的作者名稱', () => {
      const invalidBook: Partial<BookInfo> = {
        title: '測試書籍',
        author: 'a'.repeat(256), // 超過255個字元
        pdfUrl: 'https://example.com/test.pdf'
      };

      const result = Book.validate(invalidBook);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('作者名稱長度不能超過255個字元');
    });
  });

  describe('CRUD操作', () => {
    const mockBookData: Omit<BookInfo, 'id' | 'createdAt' | 'updatedAt'> = {
      title: '測試書籍',
      author: '測試作者',
      description: '這是一本測試書籍',
      pdfUrl: 'https://example.com/test.pdf',
      downloadUrl: 'https://example.com/download/test.pdf',
      filePath: '/downloads/test.pdf',
      fileSize: 1024000,
      downloadedAt: new Date(),
      status: BookStatus.COMPLETED
    };

    const mockBookInfo: BookInfo = {
      id: 1,
      ...mockBookData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    describe('create', () => {
      test('應該成功建立書籍記錄', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [mockBookInfo],
          rowCount: 1,
          command: 'INSERT'
        });

        const result = await book.create(mockBookData);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO books'),
          expect.arrayContaining([
            mockBookData.title,
            mockBookData.author,
            mockBookData.description,
            mockBookData.pdfUrl,
            mockBookData.downloadUrl,
            mockBookData.filePath,
            mockBookData.fileSize,
            mockBookData.downloadedAt,
            mockBookData.status
          ])
        );
        
        expect(result).toEqual(mockBookInfo);
      });

      test('應該在資料驗證失敗時拋出錯誤', async () => {
        const invalidData = { ...mockBookData, title: '' };
        
        await expect(book.create(invalidData)).rejects.toThrow('書籍資料驗證失敗');
      });

      test('應該在資料庫錯誤時拋出錯誤', async () => {
        mockDbManager.query.mockRejectedValue(new Error('資料庫錯誤'));
        
        await expect(book.create(mockBookData)).rejects.toThrow('建立書籍記錄失敗');
      });
    });

    describe('findById', () => {
      test('應該成功根據ID查詢書籍', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [mockBookInfo],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.findById(1);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'SELECT * FROM books WHERE id = $1',
          [1]
        );
        expect(result).toEqual(mockBookInfo);
      });

      test('應該在找不到書籍時返回null', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT'
        });

        const result = await book.findById(999);
        expect(result).toBeNull();
      });
    });

    describe('findByPdfUrl', () => {
      test('應該成功根據PDF URL查詢書籍', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [mockBookInfo],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.findByPdfUrl('https://example.com/test.pdf');
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'SELECT * FROM books WHERE pdf_url = $1',
          ['https://example.com/test.pdf']
        );
        expect(result).toEqual(mockBookInfo);
      });
    });

    describe('findByStatus', () => {
      test('應該成功根據狀態查詢書籍列表', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [mockBookInfo],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.findByStatus(BookStatus.COMPLETED, 10, 0);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE status = $1'),
          [BookStatus.COMPLETED, 10, 0]
        );
        expect(result).toEqual([mockBookInfo]);
      });
    });

    describe('update', () => {
      test('應該成功更新書籍資訊', async () => {
        const updates = { title: '更新的標題', status: BookStatus.DOWNLOADING };
        const updatedBook = { ...mockBookInfo, ...updates };
        
        mockDbManager.query.mockResolvedValue({
          rows: [updatedBook],
          rowCount: 1,
          command: 'UPDATE'
        });

        const result = await book.update(1, updates);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE books SET'),
          expect.arrayContaining([updates.title, updates.status, 1])
        );
        expect(result).toEqual(updatedBook);
      });

      test('應該在沒有提供更新欄位時拋出錯誤', async () => {
        await expect(book.update(1, {})).rejects.toThrow('沒有提供要更新的欄位');
      });
    });

    describe('delete', () => {
      test('應該成功刪除書籍', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [],
          rowCount: 1,
          command: 'DELETE'
        });

        const result = await book.delete(1);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'DELETE FROM books WHERE id = $1',
          [1]
        );
        expect(result).toBe(true);
      });

      test('應該在書籍不存在時返回false', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'DELETE'
        });

        const result = await book.delete(999);
        expect(result).toBe(false);
      });
    });

    describe('count', () => {
      test('應該成功統計書籍總數', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [{ count: '5' }],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.count();
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'SELECT COUNT(*) as count FROM books',
          []
        );
        expect(result).toBe(5);
      });

      test('應該成功統計特定狀態的書籍數量', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [{ count: '3' }],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.count(BookStatus.COMPLETED);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'SELECT COUNT(*) as count FROM books WHERE status = $1',
          [BookStatus.COMPLETED]
        );
        expect(result).toBe(3);
      });
    });

    describe('exists', () => {
      test('應該正確檢查書籍是否存在', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [{ exists: true }],
          rowCount: 1,
          command: 'SELECT'
        });

        const result = await book.exists('https://example.com/test.pdf');
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          'SELECT EXISTS(SELECT 1 FROM books WHERE pdf_url = $1)',
          ['https://example.com/test.pdf']
        );
        expect(result).toBe(true);
      });
    });

    describe('batchUpdateStatus', () => {
      test('應該成功批量更新書籍狀態', async () => {
        mockDbManager.query.mockResolvedValue({
          rows: [],
          rowCount: 3,
          command: 'UPDATE'
        });

        const result = await book.batchUpdateStatus([1, 2, 3], BookStatus.DOWNLOADING);
        
        expect(mockDbManager.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE id IN ($1,$2,$3)'),
          [1, 2, 3, BookStatus.DOWNLOADING]
        );
        expect(result).toBe(3);
      });

      test('應該在空ID陣列時返回0', async () => {
        const result = await book.batchUpdateStatus([], BookStatus.DOWNLOADING);
        expect(result).toBe(0);
        expect(mockDbManager.query).not.toHaveBeenCalled();
      });
    });
  });
});