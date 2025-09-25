import { SystemRecovery } from '../SystemRecovery';
import { Logger } from '../Logger';
import { DatabaseManager } from '../../database/DatabaseManager';
import { PDFDownloader } from '../PDFDownloader';
import { LineNotifier } from '../LineNotifier';
import { BookStatus, SystemConfig } from '../../types';
import fs from 'fs';

// Mock dependencies
jest.mock('../Logger');
jest.mock('../../database/DatabaseManager');
jest.mock('../PDFDownloader');
jest.mock('../LineNotifier');
jest.mock('fs');

// Mock fetch for network health check
global.fetch = jest.fn();

describe('SystemRecovery', () => {
  let systemRecovery: SystemRecovery;
  let mockLogger: jest.Mocked<Logger>;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockPdfDownloader: jest.Mocked<PDFDownloader>;
  let mockLineNotifier: jest.Mocked<LineNotifier>;
  let mockFs: jest.Mocked<typeof fs>;

  const mockConfig: SystemConfig = {
    monitorInterval: 300000,
    downloadPath: './test-downloads',
    lineAccessToken: 'test-token',
    maxRetries: 3,
    logLevel: 'info' as any,
    autoStart: false
  };

  beforeEach(() => {
    // Create mock instances
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      performance: jest.fn()
    } as any;

    mockDbManager = {
      query: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    } as any;

    mockPdfDownloader = {
      downloadPDF: jest.fn()
    } as any;

    mockLineNotifier = {} as any;

    mockFs = fs as jest.Mocked<typeof fs>;

    // Create SystemRecovery instance
    systemRecovery = new SystemRecovery(
      mockLogger,
      mockDbManager,
      mockPdfDownloader,
      mockLineNotifier
    );

    systemRecovery.setConfig(mockConfig);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        '系統恢復機制已初始化',
        { component: 'SystemRecovery' }
      );
    });

    it('should initialize without optional dependencies', () => {
      const recovery = new SystemRecovery(mockLogger, mockDbManager);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '系統恢復機制已初始化',
        { component: 'SystemRecovery' }
      );
    });
  });

  describe('start', () => {
    beforeEach(() => {
      // Mock successful health checks
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    });

    it('should start successfully', async () => {
      await systemRecovery.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '啟動系統恢復機制...',
        { component: 'SystemRecovery' }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '系統恢復機制已啟動',
        { component: 'SystemRecovery' }
      );
    });

    it('should perform initial health check', async () => {
      await systemRecovery.start();

      expect(mockDbManager.query).toHaveBeenCalledWith('SELECT 1 as test');
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should recover incomplete downloads', async () => {
      const incompleteBooks = [
        {
          id: 1,
          title: 'Test Book 1',
          status: BookStatus.DOWNLOADING,
          pdfUrl: 'http://example.com/book1.pdf'
        },
        {
          id: 2,
          title: 'Test Book 2',
          status: BookStatus.PENDING,
          pdfUrl: 'http://example.com/book2.pdf'
        }
      ];

      mockDbManager.query.mockImplementation((query) => {
        if (query.includes('status IN')) {
          return Promise.resolve({ rows: incompleteBooks, rowCount: incompleteBooks.length, command: 'SELECT' });
        }
        return Promise.resolve({ rows: [], rowCount: 0, command: 'UPDATE' });
      });

      await systemRecovery.start();

      expect(mockDbManager.query).toHaveBeenCalledWith(
        expect.stringContaining('status IN'),
        [BookStatus.DOWNLOADING, BookStatus.PENDING]
      );
    });

    it('should handle start failure', async () => {
      mockDbManager.query.mockRejectedValue(new Error('Database error'));

      await expect(systemRecovery.start()).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '啟動系統恢復機制失敗',
        expect.any(Error),
        { component: 'SystemRecovery' }
      );
    });
  });

  describe('performHealthCheck', () => {
    beforeEach(() => {
      // Mock successful responses
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    });

    it('should perform complete health check', async () => {
      const status = await systemRecovery.performHealthCheck();

      expect(status.overall).toBe('healthy');
      expect(status.components.database.status).toBe('healthy');
      expect(status.components.fileSystem.status).toBe('healthy');
      expect(status.components.network.status).toBe('healthy');
      expect(status.components.memory.status).toBe('healthy');
      expect(status.components.disk.status).toBe('healthy');
    });

    it('should detect database issues', async () => {
      mockDbManager.query.mockRejectedValue(new Error('Connection failed'));

      const status = await systemRecovery.performHealthCheck();

      expect(status.components.database.status).toBe('unhealthy');
      expect(status.overall).toBe('unhealthy');
    });

    it('should detect file system issues', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const status = await systemRecovery.performHealthCheck();

      expect(status.components.fileSystem.status).toBe('unhealthy');
      expect(status.overall).toBe('unhealthy');
    });

    it('should detect network issues', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const status = await systemRecovery.performHealthCheck();

      expect(status.components.network.status).toBe('unhealthy');
      expect(status.overall).toBe('unhealthy');
    });

    it('should detect degraded database performance', async () => {
      // Mock slow database response
      mockDbManager.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0, command: 'SELECT' }), 1500))
      );

      const status = await systemRecovery.performHealthCheck();

      expect(status.components.database.status).toBe('degraded');
      expect(status.overall).toBe('degraded');
    });

    it('should emit health-check-completed event', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('health-check-completed', eventSpy);

      await systemRecovery.performHealthCheck();

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        overall: 'healthy'
      }));
    });

    it('should handle health check failure gracefully', async () => {
      mockDbManager.query.mockRejectedValue(new Error('Critical error'));
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const status = await systemRecovery.performHealthCheck();

      expect(status.overall).toBe('unhealthy');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '系統健康檢查失敗',
        expect.any(Error),
        { component: 'SystemRecovery' }
      );
    });
  });

  describe('recoverIncompleteDownloads', () => {
    it('should recover incomplete downloads successfully', async () => {
      const incompleteBooks = [
        {
          id: 1,
          title: 'Test Book 1',
          status: BookStatus.DOWNLOADING,
          pdfUrl: 'http://example.com/book1.pdf',
          filePath: './test-downloads/book1.pdf'
        }
      ];

      mockDbManager.query.mockResolvedValue({ rows: incompleteBooks, rowCount: incompleteBooks.length, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(false); // File doesn't exist, need to re-download

      const results = await systemRecovery.recoverIncompleteDownloads();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockPdfDownloader.downloadPDF).toHaveBeenCalledWith(incompleteBooks[0]);
    });

    it('should handle existing complete files', async () => {
      const incompleteBooks = [
        {
          id: 1,
          title: 'Test Book 1',
          status: BookStatus.DOWNLOADING,
          pdfUrl: 'http://example.com/book1.pdf',
          filePath: './test-downloads/book1.pdf'
        }
      ];

      mockDbManager.query.mockImplementation((query) => {
        if (query.includes('status IN')) {
          return Promise.resolve({ rows: incompleteBooks, rowCount: incompleteBooks.length, command: 'SELECT' });
        }
        return Promise.resolve({ rows: [], rowCount: 0, command: 'UPDATE' }); // UPDATE query
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);

      const results = await systemRecovery.recoverIncompleteDownloads();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].details).toContain('檔案已存在且完整');
      expect(mockDbManager.query).toHaveBeenCalledWith(
        'UPDATE books SET status = $1, downloaded_at = $2 WHERE id = $3',
        [BookStatus.COMPLETED, expect.any(Date), 1]
      );
    });

    it('should handle no incomplete downloads', async () => {
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });

      const results = await systemRecovery.recoverIncompleteDownloads();

      expect(results).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '沒有需要恢復的下載',
        { component: 'SystemRecovery' }
      );
    });

    it('should handle recovery failures', async () => {
      const incompleteBooks = [
        {
          id: 1,
          title: 'Test Book 1',
          status: BookStatus.DOWNLOADING,
          pdfUrl: 'http://example.com/book1.pdf'
        }
      ];

      mockDbManager.query.mockResolvedValue({ rows: incompleteBooks, rowCount: incompleteBooks.length, command: 'SELECT' });
      mockPdfDownloader.downloadPDF.mockRejectedValue(new Error('Download failed'));

      const results = await systemRecovery.recoverIncompleteDownloads();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].details).toContain('恢復失敗');
    });

    it('should emit download-recovered event', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('download-recovered', eventSpy);

      const incompleteBooks = [
        {
          id: 1,
          title: 'Test Book 1',
          status: BookStatus.DOWNLOADING,
          pdfUrl: 'http://example.com/book1.pdf'
        }
      ];

      mockDbManager.query.mockResolvedValue({ 
        rows: incompleteBooks,
        rowCount: incompleteBooks.length,
        command: 'SELECT'
      });
      mockFs.existsSync.mockReturnValue(false);

      await systemRecovery.recoverIncompleteDownloads();

      expect(eventSpy).toHaveBeenCalledWith(incompleteBooks[0]);
    });
  });

  describe('performAutoRecovery', () => {
    beforeEach(() => {
      // Mock health status with database issue
      systemRecovery['healthStatus'] = {
        overall: 'degraded',
        components: {
          database: { status: 'unhealthy', lastCheckTime: new Date() },
          fileSystem: { status: 'healthy', lastCheckTime: new Date() },
          network: { status: 'healthy', lastCheckTime: new Date() },
          memory: { status: 'healthy', lastCheckTime: new Date() },
          disk: { status: 'healthy', lastCheckTime: new Date() }
        },
        lastCheckTime: new Date(),
        issues: []
      };
    });

    it('should perform auto recovery operations', async () => {
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      const results = await systemRecovery.performAutoRecovery();

      expect(results.length).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '開始執行系統自動恢復...',
        { component: 'SystemRecovery' }
      );
    });

    it('should recover database connection when unhealthy', async () => {
      mockDbManager.disconnect.mockResolvedValue();
      mockDbManager.connect.mockResolvedValue();
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      const results = await systemRecovery.performAutoRecovery();

      const dbRecoveryResult = results.find(r => r.operation === 'recover-database-connection');
      expect(dbRecoveryResult).toBeDefined();
      expect(dbRecoveryResult?.success).toBe(true);
    });

    it('should cleanup temporary files', async () => {
      const tempFiles = ['temp1.tmp', 'temp2.tmp', 'normal.pdf'];
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(tempFiles as any);
      mockFs.statSync.mockImplementation((filePath) => {
        if (filePath.toString().includes('.tmp')) {
          return { mtime: oldDate } as any;
        }
        return { mtime: new Date() } as any;
      });
      mockFs.unlinkSync.mockImplementation(() => {});

      const results = await systemRecovery.performAutoRecovery();

      const cleanupResult = results.find(r => r.operation === 'cleanup-temporary-files');
      expect(cleanupResult).toBeDefined();
      expect(cleanupResult?.success).toBe(true);
      expect(cleanupResult?.details).toContain('已清理 2 個臨時檔案');
    });

    it('should handle auto recovery failure', async () => {
      mockDbManager.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      const results = await systemRecovery.performAutoRecovery();

      expect(mockLogger.error).toHaveBeenCalledWith(
        '系統自動恢復失敗',
        expect.any(Error),
        { component: 'SystemRecovery' }
      );
    });
  });

  describe('health issue management', () => {
    it('should detect new health issues', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('health-issue-detected', eventSpy);

      mockDbManager.query.mockRejectedValue(new Error('Database error'));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      await systemRecovery.performHealthCheck();

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        component: 'database',
        severity: 'high',
        resolved: false
      }));
    });

    it('should detect resolved health issues', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('health-issue-resolved', eventSpy);

      // First check - create issue
      mockDbManager.query.mockRejectedValue(new Error('Database error'));
      await systemRecovery.performHealthCheck();

      // Second check - resolve issue
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      await systemRecovery.performHealthCheck();

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        component: 'database',
        resolved: true
      }));
    });

    it('should resolve health issue manually', () => {
      const issue = {
        component: 'database',
        severity: 'high' as const,
        message: 'Database connection failed',
        timestamp: new Date(),
        resolved: false
      };

      systemRecovery['healthIssues'].set('database-unhealthy', issue);

      const resolved = systemRecovery.resolveHealthIssue('database-unhealthy');

      expect(resolved).toBe(true);
      expect(issue.resolved).toBe(true);
    });

    it('should get health issues list', () => {
      const issue = {
        component: 'database',
        severity: 'high' as const,
        message: 'Database connection failed',
        timestamp: new Date(),
        resolved: false
      };

      systemRecovery['healthIssues'].set('database-unhealthy', issue);

      const issues = systemRecovery.getHealthIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual(issue);
    });
  });

  describe('system status events', () => {
    it('should emit system-degraded event', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('system-degraded', eventSpy);

      // First check - healthy
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      await systemRecovery.performHealthCheck();

      // Second check - degraded
      mockDbManager.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [], rowCount: 0, command: 'SELECT' }), 1500))
      );
      await systemRecovery.performHealthCheck();

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        overall: 'degraded'
      }));
    });

    it('should emit system-recovered event', async () => {
      const eventSpy = jest.fn();
      systemRecovery.on('system-recovered', eventSpy);

      // First check - unhealthy
      mockDbManager.query.mockRejectedValue(new Error('Database error'));
      await systemRecovery.performHealthCheck();

      // Second check - healthy
      mockDbManager.query.mockResolvedValue({ rows: [], rowCount: 0, command: 'SELECT' });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      await systemRecovery.performHealthCheck();

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        overall: 'healthy'
      }));
    });
  });

  describe('stop', () => {
    it('should stop gracefully', async () => {
      await systemRecovery.stop();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '系統恢復機制已停止',
        { component: 'SystemRecovery' }
      );
    });
  });

  describe('configuration', () => {
    it('should set PDF downloader', () => {
      const newDownloader = new PDFDownloader('./new-path');
      systemRecovery.setPDFDownloader(newDownloader);

      expect(systemRecovery['pdfDownloader']).toBe(newDownloader);
    });

    it('should set LINE notifier', () => {
      const newNotifier = new LineNotifier('new-token');
      systemRecovery.setLineNotifier(newNotifier);

      expect(systemRecovery['lineNotifier']).toBe(newNotifier);
    });
  });
});