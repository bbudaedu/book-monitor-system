import { LogRotationManager, LogRotationConfig } from '../LogRotationManager';
import { Logger } from '../Logger';
import fs from 'fs';
import path from 'path';

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock zlib
jest.mock('zlib', () => ({
  createGzip: jest.fn(() => ({
    pipe: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis()
  }))
}));

describe('LogRotationManager', () => {
  let logRotationManager: LogRotationManager;
  let mockLogger: jest.Mocked<Logger>;
  let testConfig: Partial<LogRotationConfig>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    testConfig = {
      logDir: './test-logs',
      maxFiles: 5,
      maxAge: 7,
      maxSize: 1024 * 1024, // 1MB
      compressionEnabled: true,
      cleanupInterval: 1000 // 1 second for testing
    };

    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({
      size: 1024,
      birthtime: new Date('2023-01-01'),
      mtime: new Date('2023-01-01')
    } as any);
    mockFs.writeFileSync.mockImplementation();
    mockFs.unlinkSync.mockImplementation();
    mockFs.createReadStream.mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis()
    } as any);
    mockFs.createWriteStream.mockReturnValue({
      on: jest.fn().mockReturnThis()
    } as any);

    logRotationManager = new LogRotationManager(testConfig, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
    logRotationManager.destroy();
  });

  describe('建構函式', () => {
    it('應該使用預設設定', () => {
      const manager = new LogRotationManager({}, mockLogger);
      expect(manager).toBeInstanceOf(LogRotationManager);
    });

    it('應該使用提供的設定', () => {
      expect(logRotationManager).toBeInstanceOf(LogRotationManager);
    });
  });

  describe('自動清理排程', () => {
    it('應該啟動自動清理排程', () => {
      logRotationManager.startAutoCleanup();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '日誌自動清理排程已啟動',
        expect.objectContaining({
          interval: 1000,
          operation: 'log_rotation_start'
        })
      );
    });

    it('應該停止自動清理排程', () => {
      logRotationManager.startAutoCleanup();
      logRotationManager.stopAutoCleanup();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '日誌自動清理排程已停止',
        { operation: 'log_rotation_stop' }
      );
    });

    it('應該定期執行清理', async () => {
      const performCleanupSpy = jest.spyOn(logRotationManager, 'performCleanup')
        .mockResolvedValue({
          deletedFiles: [],
          compressedFiles: [],
          totalSpaceFreed: 0
        });

      logRotationManager.startAutoCleanup();

      // 快進時間
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // 等待異步操作

      expect(performCleanupSpy).toHaveBeenCalled();
    });
  });

  describe('日誌清理', () => {
    it('應該清理過期檔案', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10天前

      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 1); // 1天前

      mockFs.readdirSync.mockReturnValue(['old.log', 'new.log'] as any);
      mockFs.statSync
        .mockReturnValueOnce({
          size: 1024,
          birthtime: oldDate,
          mtime: oldDate
        } as any)
        .mockReturnValueOnce({
          size: 2048,
          birthtime: newDate,
          mtime: newDate
        } as any);

      const result = await logRotationManager.performCleanup();

      expect(result.deletedFiles).toContain('old.log');
      expect(result.deletedFiles).not.toContain('new.log');
      expect(result.totalSpaceFreed).toBe(1024);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join('./test-logs', 'old.log'));
    });

    it('應該清理超量檔案', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // 1天前

      // 模擬7個檔案，但maxFiles設定為5
      const files = Array.from({ length: 7 }, (_, i) => `file${i}.log`);
      mockFs.readdirSync.mockReturnValue(files as any);
      
      // 所有檔案都是最近的，不會因為過期被刪除
      mockFs.statSync.mockReturnValue({
        size: 1024,
        birthtime: recentDate,
        mtime: recentDate
      } as any);

      const result = await logRotationManager.performCleanup();

      // 應該刪除2個最舊的檔案 (7 - 5 = 2)
      expect(result.deletedFiles.length).toBe(2);
      expect(result.totalSpaceFreed).toBe(2048);
    });

    it('應該處理清理過程中的錯誤', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('無法讀取目錄');
      });

      await expect(logRotationManager.performCleanup()).rejects.toThrow('無法讀取目錄');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '執行日誌清理時發生錯誤',
        expect.any(Error),
        { operation: 'log_cleanup' }
      );
    });
  });

  describe('日誌統計', () => {
    it('應該取得正確的統計資訊', async () => {
      const files = ['app-2023-01-01.log', 'error-2023-01-02.log', 'combined-2023-01-03.log.gz'];
      mockFs.readdirSync.mockReturnValue(files as any);
      
      mockFs.statSync
        .mockReturnValueOnce({
          size: 1024,
          birthtime: new Date('2023-01-01'),
          mtime: new Date('2023-01-01')
        } as any)
        .mockReturnValueOnce({
          size: 2048,
          birthtime: new Date('2023-01-02'),
          mtime: new Date('2023-01-02')
        } as any)
        .mockReturnValueOnce({
          size: 512,
          birthtime: new Date('2023-01-03'),
          mtime: new Date('2023-01-03')
        } as any);

      const stats = await logRotationManager.getLogStatistics();

      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBe(3584);
      expect(stats.compressedFiles).toBe(1);
      expect(stats.averageFileSize).toBe(Math.round(3584 / 3));
      expect(stats.oldestFile?.filename).toBe('app-2023-01-01.log');
      expect(stats.newestFile?.filename).toBe('combined-2023-01-03.log.gz');
    });

    it('應該處理空目錄', async () => {
      mockFs.readdirSync.mockReturnValue([]);

      const stats = await logRotationManager.getLogStatistics();

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.compressedFiles).toBe(0);
      expect(stats.averageFileSize).toBe(0);
    });
  });

  describe('健康檢查', () => {
    it('應該返回健康狀態', async () => {
      mockFs.readdirSync.mockReturnValue(['app.log'] as any);
      mockFs.statSync.mockReturnValue({
        size: 1024,
        birthtime: new Date(),
        mtime: new Date()
      } as any);

      const health = await logRotationManager.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.issues).toHaveLength(0);
    });

    it('應該檢測目錄不存在的問題', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const health = await logRotationManager.healthCheck();

      expect(health.status).toBe('critical');
      expect(health.issues).toContain('日誌目錄不存在');
    });

    it('應該檢測檔案數量過多的問題', async () => {
      const files = Array.from({ length: 10 }, (_, i) => `file${i}.log`);
      mockFs.readdirSync.mockReturnValue(files as any);
      mockFs.statSync.mockReturnValue({
        size: 1024,
        birthtime: new Date(),
        mtime: new Date()
      } as any);

      const health = await logRotationManager.healthCheck();

      expect(health.status).toBe('warning');
      expect(health.issues.some(issue => issue.includes('日誌檔案數量過多'))).toBe(true);
    });

    it('應該檢測過舊檔案的問題', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 15); // 15天前

      mockFs.readdirSync.mockReturnValue(['old.log'] as any);
      mockFs.statSync.mockReturnValue({
        size: 1024,
        birthtime: oldDate,
        mtime: oldDate
      } as any);

      const health = await logRotationManager.healthCheck();

      expect(health.status).toBe('warning');
      expect(health.issues.some(issue => issue.includes('存在過舊的日誌檔案'))).toBe(true);
    });
  });

  describe('手動輪轉', () => {
    it('應該執行手動輪轉', async () => {
      const performCleanupSpy = jest.spyOn(logRotationManager, 'performCleanup')
        .mockResolvedValue({
          deletedFiles: [],
          compressedFiles: [],
          totalSpaceFreed: 0
        });

      await logRotationManager.rotateNow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '手動觸發日誌輪轉',
        { operation: 'manual_rotation' }
      );
      expect(performCleanupSpy).toHaveBeenCalled();
    });
  });

  describe('資源清理', () => {
    it('應該清理資源', () => {
      const stopSpy = jest.spyOn(logRotationManager, 'stopAutoCleanup');
      
      logRotationManager.destroy();

      expect(stopSpy).toHaveBeenCalled();
    });
  });
});