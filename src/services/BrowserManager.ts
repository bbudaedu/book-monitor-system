import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { Logger } from './Logger';

export interface BrowserManagerConfig {
  headless?: boolean;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export class BrowserManager {
  private browser: Browser | null = null;
  private config: Required<BrowserManagerConfig>;
  private logger: Logger;

  constructor(config: BrowserManagerConfig = {}, logger: Logger) {
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: config.viewport ?? { width: 1920, height: 1080 }
    };
    this.logger = logger;
  }

  /**
   * 啟動瀏覽器實例
   */
  async launch(): Promise<void> {
    if (this.browser) {
      this.logger.warn('Browser is already running');
      return;
    }

    const launchOptions: PuppeteerLaunchOptions = {
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      defaultViewport: this.config.viewport
    };

    try {
      this.logger.info('Launching browser...', { options: launchOptions });
      this.browser = await puppeteer.launch(launchOptions);
      this.logger.info('Browser launched successfully');
    } catch (error) {
      this.logger.error('Failed to launch browser', error as Error);
      throw error;
    }
  }

  /**
   * 建立新頁面
   */
  async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser is not running. Call launch() first.');
    }

    try {
      const page = await this.browser.newPage();
      
      // 設定使用者代理
      await page.setUserAgent(this.config.userAgent);
      
      // 設定預設超時時間
      page.setDefaultTimeout(this.config.timeout);
      page.setDefaultNavigationTimeout(this.config.timeout);

      this.logger.debug('New page created', { 
        userAgent: this.config.userAgent,
        timeout: this.config.timeout 
      });

      return page;
    } catch (error) {
      this.logger.error('Failed to create page', error as Error);
      throw error;
    }
  }

  /**
   * 導航到指定URL並等待載入完成
   */
  async navigateToPage(page: Page, url: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.logger.info(`Navigating to ${url} (attempt ${attempt}/${this.config.retryAttempts})`);
        
        const response = await page.goto(url, {
          waitUntil: 'networkidle2', // 等待網路閒置
          timeout: this.config.timeout
        });

        if (!response) {
          throw new Error('Navigation failed: no response received');
        }

        if (!response.ok()) {
          throw new Error(`Navigation failed: HTTP ${response.status()} ${response.statusText()}`);
        }

        this.logger.info(`Successfully navigated to ${url}`, {
          status: response.status(),
          url: response.url()
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Navigation attempt ${attempt} failed`, {
          url,
          error: lastError.message,
          attempt,
          maxAttempts: this.config.retryAttempts
        });

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt); // 指數退避
        }
      }
    }

    throw new Error(`Failed to navigate to ${url} after ${this.config.retryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * 等待頁面元素載入
   */
  async waitForElement(page: Page, selector: string, timeout?: number): Promise<void> {
    const waitTimeout = timeout ?? this.config.timeout;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.logger.debug(`Waiting for element: ${selector} (attempt ${attempt})`);
        
        await page.waitForSelector(selector, { 
          timeout: waitTimeout,
          visible: true 
        });

        this.logger.debug(`Element found: ${selector}`);
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Wait for element attempt ${attempt} failed`, {
          selector,
          error: lastError.message,
          attempt,
          maxAttempts: this.config.retryAttempts
        });

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay);
        }
      }
    }

    throw new Error(`Element not found: ${selector} after ${this.config.retryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * 等待頁面載入完成（適用於SPA）
   */
  async waitForPageLoad(page: Page, additionalWaitTime: number = 2000): Promise<void> {
    try {
      // 等待DOM內容載入完成
      await page.waitForFunction(() => document.readyState === 'complete', {
        timeout: this.config.timeout
      });
      
      // 額外等待時間，確保動態內容載入（特別是SPA）
      if (additionalWaitTime > 0) {
        await this.delay(additionalWaitTime);
      }

      this.logger.debug('Page load completed', { additionalWaitTime });
    } catch (error) {
      this.logger.warn('Error waiting for page load, using fallback method', error as Error);
      
      // 備用方法：等待固定時間
      await this.delay(Math.max(additionalWaitTime, 3000));
    }
  }

  /**
   * 關閉頁面
   */
  async closePage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
        this.logger.debug('Page closed successfully');
      }
    } catch (error) {
      this.logger.warn('Error closing page', error as Error);
    }
  }

  /**
   * 關閉瀏覽器
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.logger.info('Browser closed successfully');
      } catch (error) {
        this.logger.error('Error closing browser', error as Error);
        throw error;
      }
    }
  }

  /**
   * 檢查瀏覽器是否正在運行
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.connected;
  }

  /**
   * 獲取瀏覽器實例（僅供內部使用）
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * 延遲執行
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 處理頁面錯誤
   */
  setupPageErrorHandling(page: Page): void {
    page.on('error', (error) => {
      this.logger.error('Page error occurred', error);
    });

    page.on('pageerror', (error) => {
      this.logger.error('Page script error occurred', error);
    });

    page.on('requestfailed', (request) => {
      this.logger.warn('Request failed', {
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText
      });
    });

    page.on('console', (message) => {
      const type = message.type();
      if (type === 'error' || type === 'warning') {
        this.logger.debug(`Browser console ${type}`, {
          text: message.text(),
          location: message.location()
        });
      }
    });
  }
}