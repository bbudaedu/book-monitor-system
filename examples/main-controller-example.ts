/**
 * MainController 使用範例
 * 
 * 此範例展示如何使用 MainController 來管理書籍監控系統
 */

import { MainController } from '../src/controllers/MainController';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { LogLevel } from '../src/types';

async function mainControllerExample() {
  console.log('=== MainController 使用範例 ===\n');

  // 1. 建立資料庫管理器
  const dbManager = new DatabaseManager({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/book_monitor'
  });

  // 2. 建立主控制器
  const mainController = new MainController(dbManager, 'master-password');

  // 3. 設定事件監聽器
  mainController.on('status-changed', (status) => {
    console.log('📊 系統狀態變更:', {
      isRunning: status.isRunning,
      totalBooks: status.totalBooksFound,
      downloaded: status.totalDownloaded,
      errors: status.errors
    });
  });

  mainController.on('new-book-detected', (book) => {
    console.log('📚 檢測到新書:', book.title);
  });

  mainController.on('download-completed', (book) => {
    console.log('✅ 下載完成:', book.title);
  });

  mainController.on('download-failed', (book, error) => {
    console.log('❌ 下載失敗:', book.title, error.message);
  });

  mainController.on('notification-sent', (book) => {
    console.log('📱 通知已發送:', book.title);
  });

  mainController.on('error', (error) => {
    console.error('🚨 系統錯誤:', error.message);
  });

  try {
    // 4. 初始化系統
    console.log('🚀 初始化系統...');
    await mainController.initialize();

    // 5. 更新設定
    console.log('⚙️ 更新系統設定...');
    await mainController.updateConfig({
      monitorInterval: 300000, // 5分鐘
      downloadPath: './downloads',
      lineAccessToken: process.env.LINE_ACCESS_TOKEN || '',
      maxRetries: 3,
      logLevel: LogLevel.INFO,
      autoStart: false
    });

    // 6. 啟動監控
    console.log('▶️ 啟動監控系統...');
    await mainController.start();

    // 7. 顯示系統狀態
    const status = mainController.getStatus();
    console.log('📈 當前狀態:', status);

    // 8. 顯示任務統計
    const taskStats = mainController.getTaskStatistics();
    console.log('📊 任務統計:', taskStats);

    // 9. 顯示監控任務資訊
    const taskInfo = mainController.getMonitoringTaskInfo();
    console.log('📋 監控任務:', taskInfo);

    // 10. 執行手動檢查
    console.log('🔍 執行手動檢查...');
    await mainController.runManualCheck();

    // 11. 暫停監控
    console.log('⏸️ 暫停監控...');
    mainController.pauseMonitoring();

    // 等待一段時間
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 12. 恢復監控
    console.log('▶️ 恢復監控...');
    mainController.resumeMonitoring();

    // 等待一段時間讓系統運行
    console.log('⏳ 讓系統運行30秒...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ 範例執行失敗:', error);
  } finally {
    // 13. 關閉系統
    console.log('🛑 關閉系統...');
    await mainController.shutdown();
    console.log('✅ 系統已關閉');
  }
}

// 執行範例
if (require.main === module) {
  mainControllerExample().catch(console.error);
}

export { mainControllerExample };