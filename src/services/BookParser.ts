import { Page } from 'puppeteer';
import { BookInfo, BookStatus } from '../types';
import { Logger } from './Logger';

export interface ParsedBookData {
  title: string;
  author?: string;
  description?: string;
  pdfUrl: string;
  publishDate?: string;
  category?: string;
}

export interface ParsingResult {
  success: boolean;
  books: ParsedBookData[];
  totalFound: number;
  error?: string;
  timestamp: Date;
}

export interface BookParserSelectors {
  bookContainer: string;
  title: string;
  author: string;
  description: string;
  pdfLink: string;
  publishDate: string;
  category: string;
}

export interface BookParserValidation {
  minTitleLength: number;
  requiredFields: string[];
  allowedFileExtensions: string[];
}

export interface BookParserConfig {
  baseUrl?: string;
  selectors?: Partial<BookParserSelectors>;
  validation?: Partial<BookParserValidation>;
}

interface BookParserInternalConfig {
  baseUrl: string;
  selectors: BookParserSelectors;
  validation: BookParserValidation;
}

export class BookParser {
  private config: BookParserInternalConfig;
  private logger: Logger;

  constructor(config: BookParserConfig = {}, logger: Logger) {
    this.config = {
      baseUrl: config.baseUrl ?? 'https://www.budaedu.org/#/books/applicable/chinese',
      selectors: {
        bookContainer: config.selectors?.bookContainer ?? '.book-item, .book-card, [class*="book"]',
        title: config.selectors?.title ?? '.title, .book-title, h3, h4, [class*="title"]',
        author: config.selectors?.author ?? '.author, .book-author, [class*="author"]',
        description: config.selectors?.description ?? '.description, .summary, .content, [class*="desc"]',
        pdfLink: config.selectors?.pdfLink ?? 'a[href*=".pdf"], a[href*="download"], [class*="download"]',
        publishDate: config.selectors?.publishDate ?? '.date, .publish-date, [class*="date"]',
        category: config.selectors?.category ?? '.category, .tag, [class*="category"]'
      },
      validation: {
        minTitleLength: config.validation?.minTitleLength ?? 2,
        requiredFields: config.validation?.requiredFields ?? ['title', 'pdfUrl'],
        allowedFileExtensions: config.validation?.allowedFileExtensions ?? ['.pdf']
      }
    };
    this.logger = logger;
  }

  /**
   * 解析頁面中的書籍列表
   */
  async parseBookList(page: Page): Promise<ParsingResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting book list parsing');

      // 等待頁面載入完成
      await this.waitForContent(page);

      // 嘗試多種選擇器策略
      const books = await this.extractBooksWithMultipleStrategies(page);

      // 驗證和清理資料
      const validBooks = this.validateAndCleanBooks(books);

      const duration = Date.now() - startTime;
      this.logger.info(`Book parsing completed`, {
        totalFound: books.length,
        validBooks: validBooks.length,
        duration: `${duration}ms`
      });

      return {
        success: true,
        books: validBooks,
        totalFound: validBooks.length,
        timestamp: new Date()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      
      this.logger.error('Book parsing failed', {
        error: errorMessage,
        duration: `${duration}ms`
      });

      return {
        success: false,
        books: [],
        totalFound: 0,
        error: errorMessage,
        timestamp: new Date()
      };
    }
  }

  /**
   * 等待內容載入（適用於SPA）
   */
  private async waitForContent(page: Page): Promise<void> {
    try {
      // 等待可能的書籍容器出現
      await Promise.race([
        page.waitForSelector(this.config.selectors.bookContainer, { timeout: 10000 }),
        page.waitForSelector('main, .main-content, .content, #app', { timeout: 10000 }),
        page.waitForFunction(() => document.querySelectorAll('a[href*=".pdf"]').length > 0, { timeout: 15000 })
      ]);

      // 額外等待動態內容載入
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      this.logger.warn('Content wait timeout, proceeding with parsing', error as Error);
    }
  }

  /**
   * 使用多種策略提取書籍資訊
   */
  private async extractBooksWithMultipleStrategies(page: Page): Promise<ParsedBookData[]> {
    const strategies = [
      () => this.extractBooksStrategy1(page), // 標準容器策略
      () => this.extractBooksStrategy2(page), // PDF連結策略
      () => this.extractBooksStrategy3(page), // 表格策略
      () => this.extractBooksStrategy4(page)  // 通用策略
    ];

    for (const strategy of strategies) {
      try {
        const books = await strategy();
        if (books.length > 0) {
          this.logger.info(`Successfully extracted ${books.length} books using strategy`);
          return books;
        }
      } catch (error) {
        this.logger.debug('Strategy failed, trying next', error as Error);
      }
    }

    throw new Error('All extraction strategies failed');
  }

  /**
   * 策略1: 標準書籍容器
   */
  private async extractBooksStrategy1(page: Page): Promise<ParsedBookData[]> {
    return await page.evaluate((selectors) => {
      const bookElements = document.querySelectorAll(selectors.bookContainer);
      const books: ParsedBookData[] = [];

      bookElements.forEach((element) => {
        try {
          const titleEl = element.querySelector(selectors.title);
          const authorEl = element.querySelector(selectors.author);
          const descEl = element.querySelector(selectors.description);
          const pdfEl = element.querySelector(selectors.pdfLink);

          if (titleEl && pdfEl) {
            const title = titleEl.textContent?.trim() || '';
            const pdfUrl = (pdfEl as HTMLAnchorElement).href || '';

            if (title && pdfUrl) {
              books.push({
                title,
                author: authorEl?.textContent?.trim(),
                description: descEl?.textContent?.trim(),
                pdfUrl
              });
            }
          }
        } catch (error) {
          console.warn('Error parsing book element:', error);
        }
      });

      return books;
    }, this.config.selectors);
  }

  /**
   * 策略2: 基於PDF連結的提取
   */
  private async extractBooksStrategy2(page: Page): Promise<ParsedBookData[]> {
    return await page.evaluate(() => {
      const pdfLinks = document.querySelectorAll('a[href*=".pdf"]');
      const books: ParsedBookData[] = [];

      pdfLinks.forEach((link) => {
        try {
          const pdfUrl = (link as HTMLAnchorElement).href;
          let title = link.textContent?.trim() || '';
          
          // 如果連結文字不是標題，嘗試找附近的標題
          if (!title || title.length < 3) {
            const parent = link.closest('tr, li, div, .item');
            if (parent) {
              const titleEl = parent.querySelector('h1, h2, h3, h4, h5, .title, .name');
              title = titleEl?.textContent?.trim() || '';
            }
          }

          // 如果還是沒有標題，使用檔案名稱
          if (!title) {
            const urlParts = pdfUrl.split('/');
            title = urlParts[urlParts.length - 1].replace('.pdf', '');
          }

          if (title && pdfUrl) {
            books.push({
              title,
              pdfUrl
            });
          }
        } catch (error) {
          console.warn('Error parsing PDF link:', error);
        }
      });

      return books;
    });
  }  /*
*
   * 策略3: 表格結構提取
   */
  private async extractBooksStrategy3(page: Page): Promise<ParsedBookData[]> {
    return await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const books: ParsedBookData[] = [];

      tables.forEach((table) => {
        const rows = table.querySelectorAll('tr');
        
        rows.forEach((row) => {
          try {
            const cells = row.querySelectorAll('td, th');
            const pdfLink = row.querySelector('a[href*=".pdf"]');
            
            if (pdfLink && cells.length > 0) {
              const pdfUrl = (pdfLink as HTMLAnchorElement).href;
              let title = '';
              let author = '';

              // 嘗試從表格單元格提取資訊
              cells.forEach((cell, index) => {
                const text = cell.textContent?.trim() || '';
                if (text && !text.includes('下載') && !text.includes('PDF')) {
                  if (index === 0 || (!title && text.length > 2)) {
                    title = text;
                  } else if (index === 1 || (!author && text.length > 1)) {
                    author = text;
                  }
                }
              });

              if (title && pdfUrl) {
                books.push({
                  title,
                  author: author || undefined,
                  pdfUrl
                });
              }
            }
          } catch (error) {
            console.warn('Error parsing table row:', error);
          }
        });
      });

      return books;
    });
  }

  /**
   * 策略4: 通用文字提取
   */
  private async extractBooksStrategy4(page: Page): Promise<ParsedBookData[]> {
    return await page.evaluate(() => {
      const books: ParsedBookData[] = [];
      
      // 尋找所有可能包含書籍資訊的元素
      const candidates = document.querySelectorAll('div, li, article, section');
      
      candidates.forEach((element) => {
        try {
          const pdfLink = element.querySelector('a[href*=".pdf"]');
          if (!pdfLink) return;

          const pdfUrl = (pdfLink as HTMLAnchorElement).href;
          const allText = element.textContent?.trim() || '';
          
          // 嘗試提取標題（通常是最長的文字片段）
          const textParts = allText.split(/\n|\s{2,}/).filter(part => part.trim().length > 2);
          const title = textParts.reduce((longest, current) => 
            current.length > longest.length ? current : longest, '');

          if (title && title.length > 2 && pdfUrl) {
            books.push({
              title: title.trim(),
              pdfUrl
            });
          }
        } catch (error) {
          console.warn('Error in generic extraction:', error);
        }
      });

      return books;
    });
  }

  /**
   * 驗證和清理書籍資料
   */
  private validateAndCleanBooks(books: ParsedBookData[]): ParsedBookData[] {
    const validBooks: ParsedBookData[] = [];
    const seenUrls = new Set<string>();

    for (const book of books) {
      try {
        // 檢查必要欄位
        if (!this.validateRequiredFields(book)) {
          continue;
        }

        // 檢查標題長度
        if (book.title.length < this.config.validation.minTitleLength) {
          continue;
        }

        // 檢查PDF URL格式
        if (!this.validatePdfUrl(book.pdfUrl)) {
          continue;
        }

        // 去重複
        if (seenUrls.has(book.pdfUrl)) {
          continue;
        }

        // 清理資料
        const cleanedBook = this.cleanBookData(book);
        
        // 標準化URL
        cleanedBook.pdfUrl = this.normalizeUrl(cleanedBook.pdfUrl);
        
        validBooks.push(cleanedBook);
        seenUrls.add(cleanedBook.pdfUrl);

      } catch (error) {
        this.logger.warn('Error validating book', { book, error });
      }
    }

    return validBooks;
  }

  /**
   * 驗證必要欄位
   */
  private validateRequiredFields(book: ParsedBookData): boolean {
    for (const field of this.config.validation.requiredFields) {
      if (!book[field as keyof ParsedBookData]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 驗證PDF URL
   */
  private validatePdfUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // 檢查是否為有效的URL
      if (!urlObj.protocol.startsWith('http')) {
        return false;
      }

      // 檢查檔案副檔名
      const hasValidExtension = this.config.validation.allowedFileExtensions.some(ext => 
        url.toLowerCase().includes(ext.toLowerCase())
      );

      return hasValidExtension;
    } catch {
      return false;
    }
  }

  /**
   * 清理書籍資料
   */
  private cleanBookData(book: ParsedBookData): ParsedBookData {
    return {
      title: this.cleanText(book.title),
      author: book.author ? this.cleanText(book.author) : undefined,
      description: book.description ? this.cleanText(book.description) : undefined,
      pdfUrl: book.pdfUrl.trim(),
      publishDate: book.publishDate ? this.cleanText(book.publishDate) : undefined,
      category: book.category ? this.cleanText(book.category) : undefined
    };
  }

  /**
   * 清理文字內容
   */
  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // 合併多個空白
      .replace(/[\r\n\t]/g, ' ') // 移除換行和tab
      .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf]/g, '') // 保留中英文、數字和基本標點
      .trim();
  }

  /**
   * 標準化URL
   */
  private normalizeUrl(url: string): string {
    try {
      // 如果是相對路徑，轉換為絕對路徑
      if (url.startsWith('/')) {
        const baseUrl = new URL(this.config.baseUrl);
        return `${baseUrl.protocol}//${baseUrl.host}${url}`;
      }
      
      // 如果是完整URL，直接返回
      if (url.startsWith('http')) {
        return url;
      }

      // 如果是相對路徑（不以/開頭），與基礎URL合併
      const baseUrl = new URL(this.config.baseUrl);
      return new URL(url, baseUrl.href).href;
    } catch {
      return url; // 如果處理失敗，返回原始URL
    }
  }

  /**
   * 轉換為BookInfo格式
   */
  convertToBookInfo(parsedBook: ParsedBookData): BookInfo {
    return {
      title: parsedBook.title,
      author: parsedBook.author,
      description: parsedBook.description,
      pdfUrl: parsedBook.pdfUrl,
      status: BookStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * 批量轉換為BookInfo格式
   */
  convertToBookInfoList(parsedBooks: ParsedBookData[]): BookInfo[] {
    return parsedBooks.map(book => this.convertToBookInfo(book));
  }

  /**
   * 更新解析器配置
   */
  updateConfig(newConfig: Partial<BookParserConfig>): void {
    if (newConfig.selectors) {
      this.config.selectors = { ...this.config.selectors, ...newConfig.selectors };
    }
    if (newConfig.validation) {
      this.config.validation = { ...this.config.validation, ...newConfig.validation };
    }
    if (newConfig.baseUrl) {
      this.config.baseUrl = newConfig.baseUrl;
    }

    this.logger.info('BookParser configuration updated', newConfig);
  }

  /**
   * 獲取當前配置
   */
  getConfig(): BookParserInternalConfig {
    return { ...this.config };
  }
}