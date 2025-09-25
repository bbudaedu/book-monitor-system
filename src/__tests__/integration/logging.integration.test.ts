/**
 * 日誌系統整合測試
 * 
 * 測試 Logger 和 LogRotationManager 之間的整合
 */

import fs from 'fs';
import path from 'path';
import { Logger } from '../../services/Logger';
import { LogRotationManager } from '../../services/LogRotationManager';
import { sleep } from '../testUtils';

describe('Logging System Integration Test', () => {
  const logDir = path.join(__dirname, 'test-logs');
  let logger: Logger;
  let logRotationManager: LogRotationManager;

  beforeEach(() => {
    // 清理並建立測試日誌目錄
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
    fs.mkdirSync(logDir, { recursive: true });
  });

  afterEach(async () => {
    // 停止服務並清理
    if (logRotationManager) {
      logRotationManager.destroy();
    }
    if (logger) {
      await logger.close();
    }
    if (fs.existsSync(logDir)) {
      fs.rmSync(logDir, { recursive: true, force: true });
    }
  });

  it('應該能正確建立日誌檔案，並由 LogRotationManager 清理', async () => {
    // 1. 初始化 Logger
    logger = new Logger({
      logDir,
      level: 'info',
      enableConsole: false,
      maxFiles: 5, // 保留5個檔案
      maxSize: '1k', // 每個檔案最大1KB
      datePattern: 'YYYY-MM-DD-HH-mm-ss' // 使用秒級輪轉以利測試
    });

    // 2. 寫入一些日誌，觸發檔案建立
    for (let i = 0; i < 10; i++) {
      logger.info(`這是第 ${i + 1} 條日誌訊息`);
      await sleep(10); // 確保時間戳不同
    }

    // 3. 初始化 LogRotationManager
    logRotationManager = new LogRotationManager({
      logDir,
      maxFiles: 3, // 設定比 Logger 更嚴格的保留數量
      maxAge: 1, // 1天
      cleanupInterval: 1000 // 1秒清理一次
    }, logger);

    // 4. 執行清理
    await logRotationManager.performCleanup();

    // 5. 驗證結果
    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
    
    // 檔案數量應該被 LogRotationManager 的設定所限制
    expect(files.length).toBeLessThanOrEqual(3);
  });

  it('應該能清理過期的日誌檔案', async () => {
    // 1. 初始化 Logger
    logger = new Logger({
      logDir,
      level: 'info',
      enableConsole: false,
    });

    // 2. 建立一個舊的日誌檔案
    const oldLogPath = path.join(logDir, 'app-old.log');
    fs.writeFileSync(oldLogPath, 'old log content');
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10); // 10天前
    fs.utimesSync(oldLogPath, oldDate, oldDate);

    // 3. 建立一個新的日誌檔案
    const newLogPath = path.join(logDir, 'app-new.log');
    fs.writeFileSync(newLogPath, 'new log content');

    // 4. 初始化 LogRotationManager
    logRotationManager = new LogRotationManager({
      logDir,
      maxAge: 7, // 保留7天內的檔案
    }, logger);

    // 5. 執行清理
    const result = await logRotationManager.performCleanup();

    // 6. 驗證結果
    expect(result.deletedFiles).toContain('app-old.log');
    expect(fs.existsSync(oldLogPath)).toBe(false);
    expect(fs.existsSync(newLogPath)).toBe(true);
  });
});