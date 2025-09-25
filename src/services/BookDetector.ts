import { BookInfo, BookStatus } from '../types';
import { ParsedBookData } from './BookParser';
import { DatabaseManager } from '../database/DatabaseManager';
import { Logger } from './Logger';

export interface DetectionResult {
  newBooks: BookInfo[];
  existingBooks: BookInfo[];
  updatedBooks: BookInfo[];
  totalScraped: number;
  totalNew: number;
  totalExisting: number;
  totalUpdated: number;
  timestamp: Date;
}

export interface BookDetectorConfig {
  compareFields?: string[];
  updateExistingBooks?: boolean;
  ignoreCaseInComparison?: boolean;
  similarityThreshold?: number;
}

export class BookDetector {
  private config: Required<BookDetectorConfig>;
  private databaseManager: DatabaseManager;
  private logger: Logger;

  constructor(
    databaseManager: DatabaseManager,
    config: BookDetectorConfig = {},
    logger: Logger
  ) {
    this.config = {
      compareFields: config.compareFields ?? ['title', 'pdfUrl'],
      updateExistingBooks: config.updateExistingBooks ?? true,
      ignoreCaseInComparison: config.ignoreCaseInComparison ?? true,
      similarityThreshold: config.similarityThreshold ?? 0.85
    };
    this.databaseManager = databaseManager;
    this.logger = logger;
  }

  /**
   * 檢測新書籍
   */
  async detectNewBooks(scrapedBooks: ParsedBookData[]): Promise<DetectionResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting new book detection for ${scrapedBooks.length} scraped books`);

      // 獲取現有書籍
      const existingBooks = await this.getExistingBooks();
      
      // 轉換爬取的書籍為BookInfo格式
      const scrapedBookInfos = this.convertToBookInfos(scrapedBooks);

      // 分類書籍
      const classification = await this.classifyBooks(scrapedBookInfos, existingBooks);

      // 處理新書籍
      const newBooks = await this.processNewBooks(classification.newBooks);

      // 處理更新的書籍
      const updatedBooks = await this.processUpdatedBooks(classification.updatedBooks);

      const duration = Date.now() - startTime;
      this.logger.info(`Book detection completed`, {
        totalScraped: scrapedBooks.length,
        newBooks: newBooks.length,
        existingBooks: classification.existingBooks.length,
        updatedBooks: updatedBooks.length,
        duration: `${duration}ms`
      });

      return {
        newBooks,
        existingBooks: classification.existingBooks,
        updatedBooks,
        totalScraped: scrapedBooks.length,
        totalNew: newBooks.length,
        totalExisting: classification.existingBooks.length,
        totalUpdated: updatedBooks.length,
        timestamp: new Date()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Book detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`
      });
      throw error;
    }
  }

  /**
   * 獲取現有書籍
   */
  private async getExistingBooks(): Promise<BookInfo[]> {
    try {
      const query = `
        SELECT id, title, author, description, pdf_url, download_url, 
               file_path, file_size, created_at, updated_at, downloaded_at, status
        FROM books
        ORDER BY created_at DESC
      `;
      
      const result = await this.databaseManager.query(query);
      
      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        author: row.author,
        description: row.description,
        pdfUrl: row.pdf_url,
        downloadUrl: row.download_url,
        filePath: row.file_path,
        fileSize: row.file_size,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        downloadedAt: row.downloaded_at,
        status: row.status as BookStatus
      }));
    } catch (error) {
      this.logger.error('Failed to get existing books', error as Error);
      throw error;
    }
  }

  /**
   * 轉換ParsedBookData為BookInfo
   */
  private convertToBookInfos(parsedBooks: ParsedBookData[]): BookInfo[] {
    return parsedBooks.map(book => ({
      title: book.title,
      author: book.author,
      description: book.description,
      pdfUrl: book.pdfUrl,
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  }

  /**
   * 分類書籍（新書、現有書、更新書）
   */
  private async classifyBooks(
    scrapedBooks: BookInfo[],
    existingBooks: BookInfo[]
  ): Promise<{
    newBooks: BookInfo[];
    existingBooks: BookInfo[];
    updatedBooks: BookInfo[];
  }> {
    const newBooks: BookInfo[] = [];
    const existingBooksResult: BookInfo[] = [];
    const updatedBooks: BookInfo[] = [];

    for (const scrapedBook of scrapedBooks) {
      const matchingBook = this.findMatchingBook(scrapedBook, existingBooks);
      
      if (matchingBook) {
        // 檢查是否需要更新
        if (this.config.updateExistingBooks && this.hasBookChanged(scrapedBook, matchingBook)) {
          const updatedBook = this.mergeBookData(scrapedBook, matchingBook);
          updatedBooks.push(updatedBook);
        } else {
          existingBooksResult.push(matchingBook);
        }
      } else {
        // 新書籍
        newBooks.push(scrapedBook);
      }
    }

    return {
      newBooks,
      existingBooks: existingBooksResult,
      updatedBooks
    };
  }

  /**
   * 尋找匹配的書籍
   */
  private findMatchingBook(scrapedBook: BookInfo, existingBooks: BookInfo[]): BookInfo | null {
    // 精確匹配
    const exactMatch = existingBooks.find(existing => 
      this.isExactMatch(scrapedBook, existing)
    );
    
    if (exactMatch) {
      return exactMatch;
    }

    // 相似度匹配
    const similarMatch = existingBooks.find(existing => 
      this.isSimilarMatch(scrapedBook, existing)
    );

    return similarMatch || null;
  }

  /**
   * 精確匹配檢查
   */
  private isExactMatch(book1: BookInfo, book2: BookInfo): boolean {
    for (const field of this.config.compareFields) {
      const value1 = this.normalizeForComparison(book1[field as keyof BookInfo] as string);
      const value2 = this.normalizeForComparison(book2[field as keyof BookInfo] as string);
      
      if (value1 !== value2) {
        return false;
      }
    }
    return true;
  }

  /**
   * 相似度匹配檢查
   */
  private isSimilarMatch(book1: BookInfo, book2: BookInfo): boolean {
    // 如果PDF URL相同，認為是同一本書
    const url1 = this.normalizeForComparison(book1.pdfUrl);
    const url2 = this.normalizeForComparison(book2.pdfUrl);
    
    if (url1 === url2) {
      return true;
    }

    // 標題相似度檢查
    const title1 = this.normalizeForComparison(book1.title);
    const title2 = this.normalizeForComparison(book2.title);
    
    const similarity = this.calculateStringSimilarity(title1, title2);
    
    return similarity >= this.config.similarityThreshold;
  }

  /**
   * 計算字串相似度（使用Levenshtein距離）
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matrix: number[][] = [];
    
    // 初始化矩陣
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // 計算編輯距離
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // 替換
            matrix[i][j - 1] + 1,     // 插入
            matrix[i - 1][j] + 1      // 刪除
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    const distance = matrix[str2.length][str1.length];
    
    return (maxLength - distance) / maxLength;
  }

  /**
   * 標準化比較用的字串
   */
  private normalizeForComparison(value: string | undefined): string {
    if (!value) return '';
    
    let normalized = value.trim();
    
    if (this.config.ignoreCaseInComparison) {
      normalized = normalized.toLowerCase();
    }
    
    // 移除多餘的空白和特殊字符
    normalized = normalized.replace(/\s+/g, ' ');
    
    return normalized;
  }  /**

   * 檢查書籍是否有變更
   */
  private hasBookChanged(scrapedBook: BookInfo, existingBook: BookInfo): boolean {
    // 檢查主要欄位是否有變更
    const fieldsToCheck = ['title', 'author', 'description', 'pdfUrl'];
    
    for (const field of fieldsToCheck) {
      const scrapedValue = this.normalizeForComparison(scrapedBook[field as keyof BookInfo] as string);
      const existingValue = this.normalizeForComparison(existingBook[field as keyof BookInfo] as string);
      
      if (scrapedValue !== existingValue) {
        this.logger.debug(`Book field changed: ${field}`, {
          bookId: existingBook.id,
          oldValue: existingValue,
          newValue: scrapedValue
        });
        return true;
      }
    }
    
    return false;
  }

  /**
   * 合併書籍資料
   */
  private mergeBookData(scrapedBook: BookInfo, existingBook: BookInfo): BookInfo {
    return {
      ...existingBook,
      title: scrapedBook.title || existingBook.title,
      author: scrapedBook.author || existingBook.author,
      description: scrapedBook.description || existingBook.description,
      pdfUrl: scrapedBook.pdfUrl || existingBook.pdfUrl,
      updatedAt: new Date()
    };
  }

  /**
   * 處理新書籍（儲存到資料庫）
   */
  private async processNewBooks(newBooks: BookInfo[]): Promise<BookInfo[]> {
    if (newBooks.length === 0) {
      return [];
    }

    try {
      const savedBooks: BookInfo[] = [];

      for (const book of newBooks) {
        const savedBook = await this.saveNewBook(book);
        savedBooks.push(savedBook);
      }

      this.logger.info(`Saved ${savedBooks.length} new books to database`);
      return savedBooks;

    } catch (error) {
      this.logger.error('Failed to process new books', error as Error);
      throw error;
    }
  }

  /**
   * 儲存新書籍到資料庫
   */
  private async saveNewBook(book: BookInfo): Promise<BookInfo> {
    const query = `
      INSERT INTO books (title, author, description, pdf_url, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, author, description, pdf_url, download_url, 
                file_path, file_size, created_at, updated_at, downloaded_at, status
    `;

    const values = [
      book.title,
      book.author || null,
      book.description || null,
      book.pdfUrl,
      book.status,
      book.createdAt || new Date(),
      book.updatedAt || new Date()
    ];

    const result = await this.databaseManager.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      pdfUrl: row.pdf_url,
      downloadUrl: row.download_url,
      filePath: row.file_path,
      fileSize: row.file_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      downloadedAt: row.downloaded_at,
      status: row.status as BookStatus
    };
  }

  /**
   * 處理更新的書籍
   */
  private async processUpdatedBooks(updatedBooks: BookInfo[]): Promise<BookInfo[]> {
    if (updatedBooks.length === 0) {
      return [];
    }

    try {
      const processedBooks: BookInfo[] = [];

      for (const book of updatedBooks) {
        const updatedBook = await this.updateExistingBook(book);
        processedBooks.push(updatedBook);
      }

      this.logger.info(`Updated ${processedBooks.length} existing books in database`);
      return processedBooks;

    } catch (error) {
      this.logger.error('Failed to process updated books', error as Error);
      throw error;
    }
  }

  /**
   * 更新現有書籍
   */
  private async updateExistingBook(book: BookInfo): Promise<BookInfo> {
    if (!book.id) {
      throw new Error('Cannot update book without ID');
    }

    const query = `
      UPDATE books 
      SET title = $1, author = $2, description = $3, pdf_url = $4, updated_at = $5
      WHERE id = $6
      RETURNING id, title, author, description, pdf_url, download_url, 
                file_path, file_size, created_at, updated_at, downloaded_at, status
    `;

    const values = [
      book.title,
      book.author || null,
      book.description || null,
      book.pdfUrl,
      new Date(),
      book.id
    ];

    const result = await this.databaseManager.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      pdfUrl: row.pdf_url,
      downloadUrl: row.download_url,
      filePath: row.file_path,
      fileSize: row.file_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      downloadedAt: row.downloaded_at,
      status: row.status as BookStatus
    };
  }

  /**
   * 獲取書籍統計資訊
   */
  async getBookStatistics(): Promise<{
    total: number;
    pending: number;
    downloading: number;
    completed: number;
    failed: number;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM books
      `;

      const result = await this.databaseManager.query(query);
      const row = result.rows[0];

      return {
        total: parseInt(row.total),
        pending: parseInt(row.pending),
        downloading: parseInt(row.downloading),
        completed: parseInt(row.completed),
        failed: parseInt(row.failed)
      };
    } catch (error) {
      this.logger.error('Failed to get book statistics', error as Error);
      throw error;
    }
  }

  /**
   * 檢查重複書籍
   */
  async findDuplicateBooks(): Promise<BookInfo[][]> {
    try {
      // 根據標題和PDF URL尋找重複書籍
      const query = `
        SELECT id, title, author, description, pdf_url, download_url, 
               file_path, file_size, created_at, updated_at, downloaded_at, status
        FROM books b1
        WHERE EXISTS (
          SELECT 1 FROM books b2 
          WHERE b2.id != b1.id 
          AND (LOWER(b2.title) = LOWER(b1.title) OR b2.pdf_url = b1.pdf_url)
        )
        ORDER BY title, created_at
      `;

      const result = await this.databaseManager.query(query);
      const duplicateBooks = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        author: row.author,
        description: row.description,
        pdfUrl: row.pdf_url,
        downloadUrl: row.download_url,
        filePath: row.file_path,
        fileSize: row.file_size,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        downloadedAt: row.downloaded_at,
        status: row.status as BookStatus
      }));

      // 將重複書籍分組
      const groups: BookInfo[][] = [];
      const processed = new Set<number>();

      for (const book of duplicateBooks) {
        if (processed.has(book.id!)) continue;

        const group = duplicateBooks.filter(other => 
          !processed.has(other.id!) && (
            this.normalizeForComparison(book.title) === this.normalizeForComparison(other.title) ||
            book.pdfUrl === other.pdfUrl
          )
        );

        if (group.length > 1) {
          groups.push(group);
          group.forEach(b => processed.add(b.id!));
        }
      }

      return groups;
    } catch (error) {
      this.logger.error('Failed to find duplicate books', error as Error);
      throw error;
    }
  }

  /**
   * 更新檢測器配置
   */
  updateConfig(newConfig: Partial<BookDetectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('BookDetector configuration updated', newConfig);
  }

  /**
   * 獲取當前配置
   */
  getConfig(): Required<BookDetectorConfig> {
    return { ...this.config };
  }
}