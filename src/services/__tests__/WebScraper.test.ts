import { WebScraper } from '../WebScraper';
import { BrowserManager } from '../BrowserManager';
import { Logger } from '../Logger';

// Mock dependencies
jest.mock('../BrowserManager');
jest.mock('../Logger');

const MockBrowserManager = BrowserManager as jest.MockedClass<typeof BrowserManager>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('WebScraper', () => {
  let webScraper: WebScraper;
  let mockBrowserManager: jest.Mocked<BrowserManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockPage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // 建立 mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;

    // 建立 mock page
    mockPage = {
      goto: jest.fn().mockResolvedValue({
        ok: () => true,
        status: () => 200
      }),
      setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(undefined)
    };

    // 建立 mock browser manager
    mockBrowserManager = new MockBrowserManager({}, mockLogger) as jest.Mocked<BrowserManager>;
    mockBrowserManager.launch = jest.fn().mockResolvedValue(undefined);
    mockBrowserManager.createPage = jest.fn().mockResolvedValue(mockPage);
    mockBrowserManager.navigateToPage = jest.fn().mockResolvedValue(undefined);
    mockBrowserManager.waitForPageLoad = jest.fn().mockResolvedValue(undefined);
    mockBrowserManager.waitForElement = jest.fn().mockResolvedValue(undefined);
    mockBrowserManager.closePage = jest.fn().mockResolvedValue(undefined);
    mockBrowserManager.setupPageErrorHandling = jest.fn().mockReturnValue(undefined);
    mockBrowserManager.isRunning = jest.fn().mockReturnValue(true);

    // 建立 WebScraper 實例
    webScraper = new WebScraper({}, mockLogger);
    // 替換內部的 browserManager
    (webScraper as any).browserManager = mockBrowserManager;
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await webScraper.initialize();

      expect(mockBrowserManager.launch).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('WebScraper initialized successfully');
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Launch failed');
      mockBrowserManager.launch.mockRejectedValue(error);

      await expect(webScraper.initialize()).rejects.toThrow('Launch failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize WebScraper', error);
    });
  });

  describe('scrape', () => {
    const testUrl = 'https://example.com';
    const mockScrapeFunction = jest.fn().mockResolvedValue({ title: 'Test Page' });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should scrape successfully', async () => {
      const result = await webScraper.scrape(testUrl, mockScrapeFunction);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Test Page' });
      expect(result.url).toBe(testUrl);
      expect(result.timestamp).toBeInstanceOf(Date);

      expect(mockBrowserManager.createPage).toHaveBeenCalled();
      expect(mockBrowserManager.navigateToPage).toHaveBeenCalledWith(mockPage, testUrl);
      expect(mockBrowserManager.waitForPageLoad).toHaveBeenCalledWith(mockPage, undefined);
      expect(mockScrapeFunction).toHaveBeenCalledWith(mockPage);
      expect(mockBrowserManager.closePage).toHaveBeenCalledWith(mockPage);
    });

    it('should handle scrape function errors', async () => {
      const error = new Error('Scrape function failed');
      mockScrapeFunction.mockRejectedValue(error);

      const result = await webScraper.scrape(testUrl, mockScrapeFunction);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Scrape function failed');
      expect(result.url).toBe(testUrl);
      expect(mockBrowserManager.closePage).toHaveBeenCalledWith(mockPage);
    });

    it('should handle navigation errors', async () => {
      const error = new Error('Navigation failed');
      mockBrowserManager.navigateToPage.mockRejectedValue(error);

      const result = await webScraper.scrape(testUrl, mockScrapeFunction);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Navigation failed');
      expect(mockScrapeFunction).not.toHaveBeenCalled();
    });

    it('should wait for specific selector when provided', async () => {
      const options = { waitForSelector: '.content' };

      await webScraper.scrape(testUrl, mockScrapeFunction, options);

      expect(mockBrowserManager.waitForElement).toHaveBeenCalledWith(mockPage, '.content');
    });

    it('should set custom headers when provided', async () => {
      const options = { customHeaders: { 'Authorization': 'Bearer token' } };

      await webScraper.scrape(testUrl, mockScrapeFunction, options);

      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith({ 'Authorization': 'Bearer token' });
    });

    it('should pass additional wait time to waitForPageLoad', async () => {
      const options = { additionalWaitTime: 5000 };

      await webScraper.scrape(testUrl, mockScrapeFunction, options);

      expect(mockBrowserManager.waitForPageLoad).toHaveBeenCalledWith(mockPage, 5000);
    });
  });

  describe('scrapeWithRetry', () => {
    const testUrl = 'https://example.com';
    const mockScrapeFunction = jest.fn().mockResolvedValue({ title: 'Test Page' });

    beforeEach(() => {
      jest.clearAllMocks();
      // 重置 scrape 方法的 spy
      jest.spyOn(webScraper, 'scrape');
    });

    it('should succeed on first attempt', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: true,
        data: { title: 'Test Page' },
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.scrapeWithRetry(testUrl, mockScrapeFunction);

      expect(result.success).toBe(true);
      expect(webScraper.scrape).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      (webScraper.scrape as jest.Mock)
        .mockResolvedValueOnce({
          success: false,
          error: 'Network error',
          timestamp: new Date(),
          url: testUrl
        })
        .mockResolvedValueOnce({
          success: true,
          data: { title: 'Test Page' },
          timestamp: new Date(),
          url: testUrl
        });

      const result = await webScraper.scrapeWithRetry(testUrl, mockScrapeFunction, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(webScraper.scrape).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Persistent error',
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.scrapeWithRetry(testUrl, mockScrapeFunction, { maxRetries: 2 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistent error');
      expect(webScraper.scrape).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkWebsiteAvailability', () => {
    const testUrl = 'https://example.com';

    beforeEach(() => {
      jest.spyOn(webScraper, 'scrape');
    });

    it('should return available true for successful response', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: true,
        data: { statusCode: 200, ok: true },
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.checkWebsiteAvailability(testUrl);

      expect(result.available).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should return available false for failed response', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: true,
        data: { statusCode: 404, ok: false },
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.checkWebsiteAvailability(testUrl);

      expect(result.available).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    it('should handle scrape errors', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Network error',
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.checkWebsiteAvailability(testUrl);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('takeScreenshot', () => {
    const testUrl = 'https://example.com';
    const outputPath = './screenshot.png';

    beforeEach(() => {
      jest.spyOn(webScraper, 'scrape');
    });

    it('should take screenshot successfully', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: true,
        data: true,
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.takeScreenshot(testUrl, outputPath);

      expect(result).toBe(true);
    });

    it('should handle screenshot errors', async () => {
      (webScraper.scrape as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Screenshot failed',
        timestamp: new Date(),
        url: testUrl
      });

      const result = await webScraper.takeScreenshot(testUrl, outputPath);

      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await webScraper.close();

      expect(mockBrowserManager.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('WebScraper closed successfully');
    });

    it('should handle close errors', async () => {
      const error = new Error('Close failed');
      mockBrowserManager.close.mockRejectedValue(error);

      await expect(webScraper.close()).rejects.toThrow('Close failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing WebScraper', error);
    });
  });

  describe('isRunning', () => {
    it('should return browser manager running status', () => {
      mockBrowserManager.isRunning.mockReturnValue(true);
      expect(webScraper.isRunning()).toBe(true);

      mockBrowserManager.isRunning.mockReturnValue(false);
      expect(webScraper.isRunning()).toBe(false);
    });
  });
});