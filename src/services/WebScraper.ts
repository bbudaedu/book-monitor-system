import { Page } from 'puppeteer';
import { BrowserManager, BrowserManagerConfig } from './BrowserManager';
import { Logger } from './Logger';

export interface ScrapingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  url: string;
}

export interface ScrapingOptions {
  waitForSelector?: string;
  additionalWaitTime?: number;
  retryOnFailure?: boolean;
  customHeaders?: Record<string, string>;
}

export class WebScraper {
  private browserManager: BrowserManager;
  private logger: Logger;

  constructor(config: BrowserManagerConfig = {}, logger: Logger) {
    this.browserManager = new BrowserManager(config, logger);
    this.logger = logger;
  }

  /**
   * 初始化爬蟲（啟動瀏覽器）
   */
  async initialize(): Promise<void> {
    try {
      await this.browserManager.launch();
      this.logger.info('WebScraper initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize WebScraper', error as Error);
      throw error;
    }
  }

  /**
   * 爬取網頁內容
   */
  async scrape<T>(
    url: string, 
    scrapeFunction: (page: Page) => Promise<T>,
    options: ScrapingOptions = {}
  ): Promise<ScrapingResult<T>> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      this.logger.info(`Starting scrape operation for: ${url}`);

      // 建立新頁面
      page = await this.browserManager.createPage();
      
      // 設定錯誤處理
      this.browserManager.setupPageErrorHandling(page);

      // 設定自訂標頭
      if (options.customHeaders) {
        await page.setExtraHTTPHeaders(options.customHeaders);
      }

      // 導航到目標頁面
      await this.browserManager.navigateToPage(page, url);

      // 等待頁面載入
      await this.browserManager.waitForPageLoad(page, options.additionalWaitTime);

      // 等待特定元素（如果指定）
      if (options.waitForSelector) {
        await this.browserManager.waitForElement(page, options.waitForSelector);
      }

      // 執行爬取函數
      const data = await scrapeFunction(page);

      const duration = Date.now() - startTime;
      this.logger.info(`Scrape operation completed successfully`, {
        url,
        duration: `${duration}ms`,
        dataSize: JSON.stringify(data).length
      });

      return {
        success: true,
        data,
        timestamp: new Date(),
        url
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(`Scrape operation failed`, {
        url,
        error: errorMessage,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
        url
      };

    } finally {
      // 清理頁面
      if (page) {
        await this.browserManager.closePage(page);
      }
    }
  }

  /**
   * 帶重試機制的爬取
   */
  async scrapeWithRetry<T>(
    url: string,
    scrapeFunction: (page: Page) => Promise<T>,
    options: ScrapingOptions & { maxRetries?: number; retryDelay?: number } = {}
  ): Promise<ScrapingResult<T>> {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 2000;
    
    let lastResult: ScrapingResult<T> | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(`Scrape attempt ${attempt}/${maxRetries} for: ${url}`);
      
      const result = await this.scrape(url, scrapeFunction, options);
      
      if (result.success) {
        return result;
      }

      lastResult = result;
      
      if (attempt < maxRetries) {
        this.logger.warn(`Scrape attempt ${attempt} failed, retrying in ${retryDelay}ms`, {
          error: result.error
        });
        await this.delay(retryDelay * attempt); // 指數退避
      }
    }

    this.logger.error(`All scrape attempts failed for: ${url}`, {
      maxRetries,
      lastError: lastResult?.error
    });

    return lastResult!;
  }

  /**
   * 批量爬取多個URL
   */
  async scrapeMultiple<T>(
    urls: string[],
    scrapeFunction: (page: Page, url: string) => Promise<T>,
    options: ScrapingOptions & { concurrent?: boolean; maxConcurrency?: number } = {}
  ): Promise<ScrapingResult<T>[]> {
    const concurrent = options.concurrent ?? false;
    const maxConcurrency = options.maxConcurrency ?? 3;

    if (concurrent) {
      return this.scrapeMultipleConcurrent(urls, scrapeFunction, options, maxConcurrency);
    } else {
      return this.scrapeMultipleSequential(urls, scrapeFunction, options);
    }
  }

  /**
   * 順序爬取多個URL
   */
  private async scrapeMultipleSequential<T>(
    urls: string[],
    scrapeFunction: (page: Page, url: string) => Promise<T>,
    options: ScrapingOptions
  ): Promise<ScrapingResult<T>[]> {
    const results: ScrapingResult<T>[] = [];

    for (const url of urls) {
      const result = await this.scrape(
        url, 
        (page) => scrapeFunction(page, url), 
        options
      );
      results.push(result);
    }

    return results;
  }

  /**
   * 並行爬取多個URL
   */
  private async scrapeMultipleConcurrent<T>(
    urls: string[],
    scrapeFunction: (page: Page, url: string) => Promise<T>,
    options: ScrapingOptions,
    maxConcurrency: number
  ): Promise<ScrapingResult<T>[]> {
    const results: ScrapingResult<T>[] = [];
    const chunks = this.chunkArray(urls, maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(url => 
        this.scrape(url, (page) => scrapeFunction(page, url), options)
      );
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }  /**

   * 檢查網站是否可訪問
   */
  async checkWebsiteAvailability(url: string): Promise<{ available: boolean; statusCode?: number; error?: string }> {
    try {
      const result = await this.scrape(url, async (page) => {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        return {
          statusCode: response?.status() ?? 0,
          ok: response?.ok() ?? false
        };
      });

      if (result.success && result.data) {
        return {
          available: result.data.ok,
          statusCode: result.data.statusCode
        };
      } else {
        return {
          available: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 獲取頁面截圖（用於調試）
   */
  async takeScreenshot(url: string, outputPath: string): Promise<boolean> {
    try {
      const result = await this.scrape(url, async (page) => {
        const finalPath = (outputPath.endsWith('.png') ? outputPath : `${outputPath}.png`) as `${string}.png`;
        await page.screenshot({ 
          path: finalPath,
          fullPage: true,
        });
        return true;
      });

      return result.success;
    } catch (error) {
      this.logger.error('Failed to take screenshot', error as Error);
      return false;
    }
  }

  /**
   * 關閉爬蟲（關閉瀏覽器）
   */
  async close(): Promise<void> {
    try {
      await this.browserManager.close();
      this.logger.info('WebScraper closed successfully');
    } catch (error) {
      this.logger.error('Error closing WebScraper', error as Error);
      throw error;
    }
  }

  /**
   * 檢查爬蟲是否正在運行
   */
  isRunning(): boolean {
    return this.browserManager.isRunning();
  }

  /**
   * 工具方法：延遲執行
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 工具方法：將陣列分塊
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 獲取瀏覽器管理器實例（供高級用戶使用）
   */
  getBrowserManager(): BrowserManager {
    return this.browserManager;
  }
}