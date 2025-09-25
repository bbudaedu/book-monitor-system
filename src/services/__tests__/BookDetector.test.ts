import { BookDetector, DetectionResult } from '../BookDetector';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Logger } from '../Logger';
import { BookInfo, BookStatus } from '../../types';
import { ParsedBookData } from '../BookParser';

// Mock dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('../Logger');

const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('BookDetector', () => {
  let bookDetector: BookDetector;
  let mockDatabaseManager: jest.Mocked<DatabaseManager>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // 建立 mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;

    // 建立 mock database manager
    mockDatabaseManager = new MockDatabaseManager({} as any) as jest.Mocked<DatabaseManager>;

    // 建立 BookDetector 實例
    bookDetector = new BookDetector(mockDatabaseManager, {}, mockLogger);
  });

  describe('detectNewBooks', () => {
    const mockExistingBooks: BookInfo[] = [
      {
        id: 1,
        title: '現有書籍1',
        author: '作者1',
        pdfUrl: 'https://example.com/existing1.pdf',
        status: BookStatus.COMPLETED,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01')
      },
      {
        id: 2,
        title: '現有書籍2',
        pdfUrl: 'https://example.com/existing2.pdf',
        status: BookStatus.PENDING,
        createdAt: new Date('2023-01-02'),
        updatedAt: new Date('2023-01-02')
      }
    ];

    const mockScrapedBooks: ParsedBookData[] = [
      {
        title: '現有書籍1', // 已存在
        author: '作者1',
        pdfUrl: 'https://example.com/existing1.pdf'
      },
      {
        title: '新書籍1', // 新書
        author: '新作者1',
        pdfUrl: 'https://example.com/new1.pdf'
      },
      {
        title: '現有書籍2更新版', // 更新的書籍
        pdfUrl: 'https://example.com/existing2.pdf'
      }
    ];

    beforeEach(() => {
      // Mock database query for existing books
      mockDatabaseManager.query.mockResolvedValue({
        rows: mockExistingBooks.map(book => ({
          id: book.id,
          title: book.title,
          author: book.author,
          description: book.description,
          pdf_url: book.pdfUrl,
          download_url: book.downloadUrl,
          file_path: book.filePath,
          file_size: book.fileSize,
          created_at: book.createdAt,
          updated_at: book.updatedAt,
          downloaded_at: book.downloadedAt,
          status: book.status
        }))
      } as any);
    });

    it('should detect new books correctly', async () => {
      // Mock insert query for new books
      mockDatabaseManager.query
        .mockResolvedValueOnce({ rows: mockExistingBooks.map(book => ({ ...book, pdf_url: book.pdfUrl })) } as any) // getExistingBooks
        .mockResolvedValueOnce({ // saveNewBook
          rows: [{
            id: 3,
            title: '新書籍1',
            author: '新作者1',
            description: null,
            pdf_url: 'https://example.com/new1.pdf',
            download_url: null,
            file_path: null,
            file_size: null,
            created_at: new Date(),
            updated_at: new Date(),
            downloaded_at: null,
            status: BookStatus.PENDING
          }]
        } as any)
        .mockResolvedValueOnce({ // updateExistingBook
          rows: [{
            id: 2,
            title: '現有書籍2更新版',
            author: null,
            description: null,
            pdf_url: 'https://example.com/existing2.pdf',
            download_url: null,
            file_path: null,
            file_size: null,
            created_at: new Date('2023-01-02'),
            updated_at: new Date(),
            downloaded_at: null,
            status: BookStatus.PENDING
          }]
        } as any);

      const result = await bookDetector.detectNewBooks(mockScrapedBooks);

      expect(result.totalScraped).toBe(3);
      expect(result.totalNew).toBe(1);
      expect(result.totalExisting).toBe(1);
      expect(result.totalUpdated).toBe(1);
      expect(result.newBooks[0].title).toBe('新書籍1');
      expect(result.updatedBooks[0].title).toBe('現有書籍2更新版');
    });

    it('should handle empty scraped books', async () => {
      const result = await bookDetector.detectNewBooks([]);

      expect(result.totalScraped).toBe(0);
      expect(result.totalNew).toBe(0);
      expect(result.totalExisting).toBe(0);
      expect(result.totalUpdated).toBe(0);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockDatabaseManager.query.mockRejectedValue(error);

      await expect(bookDetector.detectNewBooks(mockScrapedBooks)).rejects.toThrow('Database connection failed');
    });
  });

  describe('isExactMatch', () => {
    const book1: BookInfo = {
      title: 'Test Book',
      pdfUrl: 'https://example.com/test.pdf',
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const book2: BookInfo = {
      title: 'Test Book',
      pdfUrl: 'https://example.com/test.pdf',
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const book3: BookInfo = {
      title: 'Different Book',
      pdfUrl: 'https://example.com/different.pdf',
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should return true for exact matches', () => {
      const result = (bookDetector as any).isExactMatch(book1, book2);
      expect(result).toBe(true);
    });

    it('should return false for different books', () => {
      const result = (bookDetector as any).isExactMatch(book1, book3);
      expect(result).toBe(false);
    });

    it('should ignore case when configured', () => {
      const bookLower: BookInfo = {
        title: 'test book',
        pdfUrl: 'https://example.com/test.pdf',
        status: BookStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = (bookDetector as any).isExactMatch(book1, bookLower);
      expect(result).toBe(true);
    });
  });

  describe('calculateStringSimilarity', () => {
    it('should return 1 for identical strings', () => {
      const similarity = (bookDetector as any).calculateStringSimilarity('test', 'test');
      expect(similarity).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      const similarity = (bookDetector as any).calculateStringSimilarity('abc', 'xyz');
      expect(similarity).toBeCloseTo(0, 1);
    });

    it('should return appropriate similarity for similar strings', () => {
      const similarity = (bookDetector as any).calculateStringSimilarity('test', 'tests');
      expect(similarity).toBeGreaterThanOrEqual(0.8);
    });

    it('should handle empty strings', () => {
      const similarity1 = (bookDetector as any).calculateStringSimilarity('', '');
      const similarity2 = (bookDetector as any).calculateStringSimilarity('test', '');
      
      expect(similarity1).toBe(1);
      expect(similarity2).toBe(0);
    });
  });

  describe('normalizeForComparison', () => {
    it('should normalize strings correctly', () => {
      const normalized = (bookDetector as any).normalizeForComparison('  Test   Book  ');
      expect(normalized).toBe('test book');
    });

    it('should handle undefined values', () => {
      const normalized = (bookDetector as any).normalizeForComparison(undefined);
      expect(normalized).toBe('');
    });

    it('should handle empty strings', () => {
      const normalized = (bookDetector as any).normalizeForComparison('');
      expect(normalized).toBe('');
    });
  });

  describe('hasBookChanged', () => {
    const originalBook: BookInfo = {
      id: 1,
      title: 'Original Title',
      author: 'Original Author',
      pdfUrl: 'https://example.com/original.pdf',
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should detect title changes', () => {
      const updatedBook: BookInfo = {
        ...originalBook,
        title: 'Updated Title'
      };

      const hasChanged = (bookDetector as any).hasBookChanged(updatedBook, originalBook);
      expect(hasChanged).toBe(true);
    });

    it('should detect author changes', () => {
      const updatedBook: BookInfo = {
        ...originalBook,
        author: 'Updated Author'
      };

      const hasChanged = (bookDetector as any).hasBookChanged(updatedBook, originalBook);
      expect(hasChanged).toBe(true);
    });

    it('should return false when no changes detected', () => {
      const sameBook: BookInfo = { ...originalBook };

      const hasChanged = (bookDetector as any).hasBookChanged(sameBook, originalBook);
      expect(hasChanged).toBe(false);
    });
  });

  describe('getBookStatistics', () => {
    it('should return correct statistics', async () => {
      mockDatabaseManager.query.mockResolvedValue({
        rows: [{
          total: '10',
          pending: '3',
          downloading: '2',
          completed: '4',
          failed: '1'
        }]
      } as any);

      const stats = await bookDetector.getBookStatistics();

      expect(stats.total).toBe(10);
      expect(stats.pending).toBe(3);
      expect(stats.downloading).toBe(2);
      expect(stats.completed).toBe(4);
      expect(stats.failed).toBe(1);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockDatabaseManager.query.mockRejectedValue(error);

      await expect(bookDetector.getBookStatistics()).rejects.toThrow('Database error');
    });
  });

  describe('findDuplicateBooks', () => {
    it('should find duplicate books', async () => {
      const duplicateBooks = [
        {
          id: 1,
          title: 'Duplicate Book',
          author: 'Author 1',
          description: null,
          pdf_url: 'https://example.com/book.pdf',
          download_url: null,
          file_path: null,
          file_size: null,
          created_at: new Date('2023-01-01'),
          updated_at: new Date('2023-01-01'),
          downloaded_at: null,
          status: BookStatus.PENDING
        },
        {
          id: 2,
          title: 'Duplicate Book',
          author: 'Author 2',
          description: null,
          pdf_url: 'https://example.com/book2.pdf',
          download_url: null,
          file_path: null,
          file_size: null,
          created_at: new Date('2023-01-02'),
          updated_at: new Date('2023-01-02'),
          downloaded_at: null,
          status: BookStatus.PENDING
        }
      ];

      mockDatabaseManager.query.mockResolvedValue({
        rows: duplicateBooks
      } as any);

      const duplicates = await bookDetector.findDuplicateBooks();

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]).toHaveLength(2);
      expect(duplicates[0][0].title).toBe('Duplicate Book');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        similarityThreshold: 0.9,
        updateExistingBooks: false
      };

      bookDetector.updateConfig(newConfig);
      const config = bookDetector.getConfig();

      expect(config.similarityThreshold).toBe(0.9);
      expect(config.updateExistingBooks).toBe(false);
    });
  });
});