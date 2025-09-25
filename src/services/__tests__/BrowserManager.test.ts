import { BrowserManager } from '../BrowserManager';
import { Logger } from '../Logger';
import puppeteer from 'puppeteer';

// Mock puppeteer
jest.mock('puppeteer');
const mockPuppeteer = puppeteer as jest.Mocked<typeof puppeteer>;

// Mock Logger
jest.mock('../Logger');
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('BrowserManager', () => {
  let browserManager: BrowserManager;
  let mockLogger: jest.Mocked<Logger>;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    // 重置所有 mocks
    jest.clearAllMocks();

    // 建立 mock logger
    mockLogger = new MockLogger() as jest.Mocked<Logger>;

    // 建立 mock page
    mockPage = {
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      goto: jest.fn().mockResolvedValue({
        ok: () => true,
        status: () => 200,
        statusText: () => 'OK',
        url: () => 'https://example.com'
      }),
      waitForSelector: jest.fn().mockResolvedValue({}),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      isClosed: jest.fn().mockReturnValue(false),
      on: jest.fn(),
      setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined)
    };

    // 建立 mock browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
      connected: true
    };

    // 設定 puppeteer mock
    mockPuppeteer.launch.mockResolvedValue(mockBrowser);

    // 建立 BrowserManager 實例
    browserManager = new BrowserManager({}, mockLogger);
  });

  describe('launch', () => {
    it('should launch browser successfully', async () => {
      await browserManager.launch();

      expect(mockPuppeteer.launch).toHaveBeenCalledWith({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        defaultViewport: { width: 1920, height: 1080 }
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Launching browser...', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('Browser launched successfully');
    });

    it('should not launch browser if already running', async () => {
      await browserManager.launch();
      jest.clearAllMocks();

      await browserManager.launch();

      expect(mockPuppeteer.launch).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Browser is already running');
    });

    it('should handle launch errors', async () => {
      const error = new Error('Launch failed');
      mockPuppeteer.launch.mockRejectedValue(error);

      await expect(browserManager.launch()).rejects.toThrow('Launch failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to launch browser', error);
    });
  });

  describe('createPage', () => {
    beforeEach(async () => {
      await browserManager.launch();
    });

    it('should create page successfully', async () => {
      const page = await browserManager.createPage();

      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setUserAgent).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalled();
      expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalled();
      expect(page).toBe(mockPage);
    });

    it('should throw error if browser not running', async () => {
      const browserManager2 = new BrowserManager({}, mockLogger);

      await expect(browserManager2.createPage()).rejects.toThrow(
        'Browser is not running. Call launch() first.'
      );
    });

    it('should handle page creation errors', async () => {
      const error = new Error('Page creation failed');
      mockBrowser.newPage.mockRejectedValue(error);

      await expect(browserManager.createPage()).rejects.toThrow('Page creation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create page', error);
    });
  });

  describe('navigateToPage', () => {
    let page: any;

    beforeEach(async () => {
      await browserManager.launch();
      page = await browserManager.createPage();
    });

    it('should navigate successfully', async () => {
      await browserManager.navigateToPage(page, 'https://example.com');

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Navigating to https://example.com (attempt 1/3)'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully navigated to https://example.com',
        expect.any(Object)
      );
    });

    it('should retry on navigation failure', async () => {
      mockPage.goto
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: () => true,
          status: () => 200,
          statusText: () => 'OK',
          url: () => 'https://example.com'
        });

      await browserManager.navigateToPage(page, 'https://example.com');

      expect(mockPage.goto).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Navigation attempt 1 failed',
        expect.any(Object)
      );
    });

    it('should throw error after max retries', async () => {
      const error = new Error('Network error');
      mockPage.goto.mockRejectedValue(error);

      await expect(
        browserManager.navigateToPage(page, 'https://example.com')
      ).rejects.toThrow('Failed to navigate to https://example.com after 3 attempts');

      expect(mockPage.goto).toHaveBeenCalledTimes(3);
    });

    it('should handle HTTP error responses', async () => {
      mockPage.goto.mockResolvedValue({
        ok: () => false,
        status: () => 404,
        statusText: () => 'Not Found',
        url: () => 'https://example.com'
      });

      await expect(
        browserManager.navigateToPage(page, 'https://example.com')
      ).rejects.toThrow('Failed to navigate to https://example.com after 3 attempts');
    });
  });

  describe('waitForElement', () => {
    let page: any;

    beforeEach(async () => {
      await browserManager.launch();
      page = await browserManager.createPage();
    });

    it('should wait for element successfully', async () => {
      await browserManager.waitForElement(page, '.test-selector');

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.test-selector', {
        timeout: 30000,
        visible: true
      });
    });

    it('should retry on element wait failure', async () => {
      mockPage.waitForSelector
        .mockRejectedValueOnce(new Error('Element not found'))
        .mockResolvedValueOnce({});

      await browserManager.waitForElement(page, '.test-selector');

      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      const error = new Error('Element not found');
      mockPage.waitForSelector.mockRejectedValue(error);

      await expect(
        browserManager.waitForElement(page, '.test-selector')
      ).rejects.toThrow('Element not found: .test-selector after 3 attempts');

      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(3);
    });
  });

  describe('close', () => {
    it('should close browser successfully', async () => {
      await browserManager.launch();
      await browserManager.close();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Browser closed successfully');
    });

    it('should handle close errors', async () => {
      await browserManager.launch();
      const error = new Error('Close failed');
      mockBrowser.close.mockRejectedValue(error);

      await expect(browserManager.close()).rejects.toThrow('Close failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing browser', error);
    });

    it('should do nothing if browser not running', async () => {
      await browserManager.close();

      expect(mockBrowser.close).not.toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should return false when browser not launched', () => {
      expect(browserManager.isRunning()).toBe(false);
    });

    it('should return true when browser is running', async () => {
      await browserManager.launch();
      expect(browserManager.isRunning()).toBe(true);
    });

    it('should return false when browser is disconnected', async () => {
      await browserManager.launch();
      mockBrowser.connected = false;
      expect(browserManager.isRunning()).toBe(false);
    });
  });
});