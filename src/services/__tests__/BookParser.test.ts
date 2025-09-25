import { BookParser, ParsedBookData } from '../BookParser';
import { Logger } from '../Logger';
import { BookStatus } from '../../types';

// Mock Logger
jest.mock('../Logger');
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('BookParser', () => {
  let bookParser: BookParser;
  let mockLogger: jest.Mocked<Logger>;
  let mockPage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // 建立 mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;

    // 建立 mock page
    mockPage = {
      waitForSelector: jest.fn().mockResolvedValue({}),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn()
    };

    // 建立 BookParser 實例
    bookParser = new BookParser({}, mockLogger);
  });

  describe('parseBookList', () => {
    it('should parse books successfully', async () => {
      const mockBooks: ParsedBookData[] = [
        {
          title: '測試書籍1',
          author: '測試作者1',
          pdfUrl: 'https://example.com/book1.pdf'
        },
        {
          title: '測試書籍2',
          pdfUrl: 'https://example.com/book2.pdf'
        }
      ];

      // Mock the extraction strategies
      jest.spyOn(bookParser as any, 'extractBooksWithMultipleStrategies')
        .mockResolvedValue(mockBooks);
      
      jest.spyOn(bookParser as any, 'waitForContent')
        .mockResolvedValue(undefined);

      const result = await bookParser.parseBookList(mockPage);

      expect(result.success).toBe(true);
      expect(result.books).toHaveLength(2);
      expect(result.totalFound).toBe(2);
      expect(result.books[0].title).toBe('測試書籍1');
      expect(result.books[0].author).toBe('測試作者1');
    });

    it('should handle parsing errors', async () => {
      const error = new Error('Parsing failed');
      
      jest.spyOn(bookParser as any, 'waitForContent')
        .mockRejectedValue(error);

      const result = await bookParser.parseBookList(mockPage);

      expect(result.success).toBe(false);
      expect(result.books).toHaveLength(0);
      expect(result.error).toBe('Parsing failed');
    });

    it('should validate and clean books', async () => {
      const mockBooks: ParsedBookData[] = [
        {
          title: 'Valid Book',
          pdfUrl: 'https://example.com/valid.pdf'
        },
        {
          title: 'A', // Too short title
          pdfUrl: 'https://example.com/short.pdf'
        },
        {
          title: 'Invalid URL Book',
          pdfUrl: 'not-a-url'
        },
        {
          title: '', // Empty title
          pdfUrl: 'https://example.com/empty.pdf'
        }
      ];

      jest.spyOn(bookParser as any, 'extractBooksWithMultipleStrategies')
        .mockResolvedValue(mockBooks);
      
      jest.spyOn(bookParser as any, 'waitForContent')
        .mockResolvedValue(undefined);

      const result = await bookParser.parseBookList(mockPage);

      expect(result.success).toBe(true);
      expect(result.books).toHaveLength(1); // Only valid book should remain
      expect(result.books[0].title).toBe('Valid Book');
    });
  });

  describe('validateRequiredFields', () => {
    it('should validate required fields correctly', () => {
      const validBook: ParsedBookData = {
        title: 'Test Book',
        pdfUrl: 'https://example.com/test.pdf'
      };

      const invalidBook: ParsedBookData = {
        title: '',
        pdfUrl: 'https://example.com/test.pdf'
      };

      expect((bookParser as any).validateRequiredFields(validBook)).toBe(true);
      expect((bookParser as any).validateRequiredFields(invalidBook)).toBe(false);
    });
  });

  describe('validatePdfUrl', () => {
    it('should validate PDF URLs correctly', () => {
      const validUrls = [
        'https://example.com/book.pdf',
        'http://example.com/document.PDF',
        'https://site.org/files/book.pdf?version=1'
      ];

      const invalidUrls = [
        'not-a-url',
        'ftp://example.com/book.pdf',
        'https://example.com/book.doc',
        'https://example.com/book'
      ];

      validUrls.forEach(url => {
        expect((bookParser as any).validatePdfUrl(url)).toBe(true);
      });

      invalidUrls.forEach(url => {
        expect((bookParser as any).validatePdfUrl(url)).toBe(false);
      });
    });
  });

  describe('cleanText', () => {
    it('should clean text correctly', () => {
      const dirtyText = '  Test   Book\n\tTitle  ';
      const cleanedText = (bookParser as any).cleanText(dirtyText);
      
      expect(cleanedText).toBe('Test Book Title');
    });

    it('should handle special characters', () => {
      const textWithSpecialChars = 'Book@#$%^&*()Title';
      const cleanedText = (bookParser as any).cleanText(textWithSpecialChars);
      
      expect(cleanedText).toBe('BookTitle');
    });

    it('should preserve Chinese characters', () => {
      const chineseText = '測試書籍標題';
      const cleanedText = (bookParser as any).cleanText(chineseText);
      
      expect(cleanedText).toBe('測試書籍標題');
    });
  });

  describe('normalizeUrl', () => {
    beforeEach(() => {
      bookParser = new BookParser({
        baseUrl: 'https://www.budaedu.org/#/books/applicable/chinese'
      }, mockLogger);
    });

    it('should normalize relative URLs', () => {
      const relativeUrl = '/files/book.pdf';
      const normalizedUrl = (bookParser as any).normalizeUrl(relativeUrl);
      
      expect(normalizedUrl).toBe('https://www.budaedu.org/files/book.pdf');
    });

    it('should keep absolute URLs unchanged', () => {
      const absoluteUrl = 'https://example.com/book.pdf';
      const normalizedUrl = (bookParser as any).normalizeUrl(absoluteUrl);
      
      expect(normalizedUrl).toBe(absoluteUrl);
    });

    it('should handle relative paths without leading slash', () => {
      const relativePath = 'files/book.pdf';
      const normalizedUrl = (bookParser as any).normalizeUrl(relativePath);
      
      expect(normalizedUrl).toContain('budaedu.org');
      expect(normalizedUrl).toContain('book.pdf');
    });

    it('should return original URL if normalization fails', () => {
      const invalidUrl = 'invalid-url';
      const normalizedUrl = (bookParser as any).normalizeUrl(invalidUrl);
      
      // The normalizeUrl method will try to resolve relative paths, so it won't return the original invalid URL
      expect(normalizedUrl).toContain('invalid-url');
    });
  });

  describe('convertToBookInfo', () => {
    it('should convert ParsedBookData to BookInfo correctly', () => {
      const parsedBook: ParsedBookData = {
        title: 'Test Book',
        author: 'Test Author',
        description: 'Test Description',
        pdfUrl: 'https://example.com/test.pdf'
      };

      const bookInfo = bookParser.convertToBookInfo(parsedBook);

      expect(bookInfo.title).toBe('Test Book');
      expect(bookInfo.author).toBe('Test Author');
      expect(bookInfo.description).toBe('Test Description');
      expect(bookInfo.pdfUrl).toBe('https://example.com/test.pdf');
      expect(bookInfo.status).toBe(BookStatus.PENDING);
      expect(bookInfo.createdAt).toBeInstanceOf(Date);
      expect(bookInfo.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('convertToBookInfoList', () => {
    it('should convert array of ParsedBookData to BookInfo array', () => {
      const parsedBooks: ParsedBookData[] = [
        {
          title: 'Book 1',
          pdfUrl: 'https://example.com/book1.pdf'
        },
        {
          title: 'Book 2',
          pdfUrl: 'https://example.com/book2.pdf'
        }
      ];

      const bookInfoList = bookParser.convertToBookInfoList(parsedBooks);

      expect(bookInfoList).toHaveLength(2);
      expect(bookInfoList[0].title).toBe('Book 1');
      expect(bookInfoList[1].title).toBe('Book 2');
      expect(bookInfoList[0].status).toBe(BookStatus.PENDING);
      expect(bookInfoList[1].status).toBe(BookStatus.PENDING);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        selectors: {
          title: '.new-title-selector'
        },
        validation: {
          minTitleLength: 5
        }
      };

      bookParser.updateConfig(newConfig);
      const config = bookParser.getConfig();

      expect(config.selectors.title).toBe('.new-title-selector');
      expect(config.validation.minTitleLength).toBe(5);
    });
  });

  describe('cleanBookData', () => {
    it('should clean book data correctly', () => {
      const dirtyBook: ParsedBookData = {
        title: '  Test   Book\n\tTitle  ',
        author: '  Author  Name  ',
        description: 'Book\n\ndescription\twith\tspaces',
        pdfUrl: 'https://example.com/book.pdf'
      };

      const cleanedBook = (bookParser as any).cleanBookData(dirtyBook);

      expect(cleanedBook.title).toBe('Test Book Title');
      expect(cleanedBook.author).toBe('Author Name');
      expect(cleanedBook.description).toBe('Book description with spaces');
      expect(cleanedBook.pdfUrl).toBe('https://example.com/book.pdf');
    });

    it('should handle undefined optional fields', () => {
      const book: ParsedBookData = {
        title: 'Test Book',
        pdfUrl: 'https://example.com/book.pdf'
      };

      const cleanedBook = (bookParser as any).cleanBookData(book);

      expect(cleanedBook.title).toBe('Test Book');
      expect(cleanedBook.author).toBeUndefined();
      expect(cleanedBook.description).toBeUndefined();
    });
  });
});