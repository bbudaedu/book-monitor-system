const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// 完全禁用 autoUpdater，避免初始化問題
const autoUpdater = null;
console.log('🔧 開發模式：已禁用自動更新功能');
const { MainController } = require('./controllers/MainController');
const { Logger } = require('./services/Logger');

// Electron 主程序入口點
// 處理應用程式生命週期和主視窗管理

// 導出主程序函數供測試使用
export { createWindow, initializeMainController, setupIpcHandlers, setupMainControllerEvents };

function createWindow(): Electron.BrowserWindow {
  // 建立瀏覽器視窗
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'renderer/preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'), // 應用程式圖示
    show: false // 先不顯示，等載入完成後再顯示
  });

  // 載入應用程式的 index.html
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // 視窗載入完成後顯示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    // 開發模式下跳過更新檢查
    console.log('🔧 開發模式：跳過自動更新檢查');
  });

  // 開發模式下開啟開發者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Store reference to main window for global access
  return mainWindow;
}

// 全域 MainController 實例
let mainController: typeof MainController | null = null;
let mainWindow: Electron.BrowserWindow | null = null;

// 初始化 MainController
async function initializeMainController(): Promise<void> {
  try {
    console.log('=== 開始初始化 MainController ===');

    // 先初始化 DatabaseManager
    const { DatabaseManager } = await import('./database/DatabaseManager');

    // 載入環境變數
    const dotenv = require('dotenv');
    const path = require('path');

    // 嘗試載入 .env 文件
    const envPath = path.join(__dirname, '../.env');
    console.log('嘗試載入環境變數文件:', envPath);

    const envResult = dotenv.config({ path: envPath });
    if (envResult.error) {
      console.warn('載入 .env 文件失敗:', envResult.error.message);
    } else {
      console.log('成功載入 .env 文件');
    }

    // 記錄所有相關環境變數
    console.log('環境變數檢查:');
    console.log('- DATABASE_URL 存在:', !!process.env.DATABASE_URL);
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- DATABASE_URL 長度:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);

    // 隱藏敏感資訊，只顯示連接字符串的前綴和後綴
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL;
      const prefix = url.substring(0, 20);
      const suffix = url.substring(url.length - 20);
      console.log('- DATABASE_URL 格式檢查:', `${prefix}...${suffix}`);
    }

    // 建立資料庫設定
    const dbConfig = {
      connectionString: process.env.DATABASE_URL || 'postgresql://user:password@ep-example.neon.tech/bookmonitor?sslmode=require',
      maxConnections: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: true
    };

    console.log('資料庫配置:', {
      hasConnectionString: !!dbConfig.connectionString,
      maxConnections: dbConfig.maxConnections,
      ssl: dbConfig.ssl,
      connectionTimeout: dbConfig.connectionTimeoutMillis
    });

    const dbManager = new DatabaseManager(dbConfig);
    console.log('DatabaseManager 實例建立成功');

    // 嘗試連接資料庫，如果失敗則繼續但不初始化 MainController
    try {
      console.log('開始嘗試資料庫連接...');
      await dbManager.connect();

      console.log('資料庫連接成功，開始初始化 MainController');
      mainController = new MainController(dbManager);
      await mainController.initialize();

      // 設定事件監聽器
      if (mainController && mainWindow) {
        setupMainControllerEvents(mainController, mainWindow);
      }

      console.log('MainController 初始化成功');
    } catch (dbError) {
      console.error('=== 資料庫連接失敗 ===');
      console.error('錯誤詳情:', dbError);
      console.error('錯誤堆疊:', dbError instanceof Error ? dbError.stack : '無堆疊資訊');
      console.warn('系統將以離線模式運行');

      // 提供診斷建議
      console.log('=== 診斷建議 ===');
      if (!process.env.DATABASE_URL) {
        console.log('❌ 問題：未找到 DATABASE_URL 環境變數');
        console.log('💡 解決方案：請檢查 .env 文件是否存在且包含有效的 DATABASE_URL');
      } else {
        console.log('❌ 問題：DATABASE_URL 可能無效或服務不可用');
        console.log('💡 解決方案：請檢查資料庫服務是否正常運行');
      }

      // 在實際應用中，這裡可以實作離線模式或顯示設定對話框
    }
  } catch (error) {
    console.error('=== 初始化 MainController 失敗 ===');
    console.error('錯誤詳情:', error);
    console.error('錯誤堆疊:', error instanceof Error ? error.stack : '無堆疊資訊');
  }
}

// 設定 MainController 事件監聽器
function setupMainControllerEvents(controller: typeof MainController, window: Electron.BrowserWindow): void {
  // 監聽狀態更新
  controller.on('status-changed', (status) => {
    window.webContents.send('status-update', {
      isRunning: status.isRunning,
      lastCheck: status.lastCheckTime?.toISOString() || null,
      totalBooks: status.totalBooksFound,
      newBooksToday: 0 // 這將在後續計算
    });
  });

  // 監聽新書檢測
  controller.on('new-book-detected', (book) => {
    window.webContents.send('new-book', book);
  });

  // 監聽下載開始
  controller.on('download-started', (book) => {
    window.webContents.send('download-started', book);
  });

  // 監聽下載完成
  controller.on('download-completed', (book) => {
    window.webContents.send('download-completed', book);
  });

  // 監聽下載失敗
  controller.on('download-failed', (book, error) => {
    window.webContents.send('download-failed', { book, error: error.message });
  });

  // 監聽通知發送
  controller.on('notification-sent', (book) => {
    window.webContents.send('notification-sent', book);
  });

  // 監聽錯誤
  controller.on('error', (error) => {
    window.webContents.send('error', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  });

  // 監聽設定更新
  controller.on('config-updated', (config) => {
    window.webContents.send('config-updated', config);
  });
}

// 安全診斷函數 - 檢查已知的安全漏洞
async function performSecurityDiagnostic(): Promise<void> {
  const logger = Logger.getInstance();
  const fs = require('fs');
  const packageJsonPath = path.join(__dirname, '../package.json');

  try {
    logger.info('🔍 開始執行安全診斷', {
      operation: 'security_diagnostic',
      timestamp: new Date().toISOString()
    });

    // 檢查 package.json 版本
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      logger.info('📦 當前套件版本檢查', {
        operation: 'package_versions',
        electron: packageJson.devDependencies?.electron || packageJson.dependencies?.electron,
        puppeteer: packageJson.dependencies?.puppeteer,
        axios: packageJson.dependencies?.axios,
        winston: packageJson.dependencies?.winston
      });

      // 檢查特定漏洞
      const electronVersion = packageJson.devDependencies?.electron || packageJson.dependencies?.electron;
      if (electronVersion && electronVersion.includes('27.')) {
        logger.warn('⚠️ 檢測到 Electron 27.x 版本，可能存在安全漏洞', {
          operation: 'vulnerability_check',
          package: 'electron',
          currentVersion: electronVersion,
          knownIssues: [
            'GHSA-6r2x-8pq8-9489: Heap Buffer Overflow in NativeImage',
            'GHSA-vmqv-hx8q-j7mg: ASAR Integrity Bypass'
          ],
          recommendedAction: '升級到 electron@38.1.2'
        });
      }

      const puppeteerVersion = packageJson.dependencies?.puppeteer;
      if (puppeteerVersion && puppeteerVersion.includes('21.')) {
        logger.warn('⚠️ 檢測到 Puppeteer 21.x 版本，可能存在安全漏洞', {
          operation: 'vulnerability_check',
          package: 'puppeteer',
          currentVersion: puppeteerVersion,
          knownIssues: [
            'tar-fs 路徑遍歷漏洞',
            'ws DoS 漏洞'
          ],
          recommendedAction: '升級到 puppeteer@24.22.3'
        });
      }
    }

    // 檢查 node_modules 中的實際版本
    try {
      const electronPackagePath = path.join(__dirname, '../node_modules/electron/package.json');
      if (fs.existsSync(electronPackagePath)) {
        const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath, 'utf-8'));
        logger.info('🔍 Electron 實際安裝版本', {
          operation: 'installed_versions',
          package: 'electron',
          version: electronPackage.version
        });
      }

      const puppeteerPackagePath = path.join(__dirname, '../node_modules/puppeteer/package.json');
      if (fs.existsSync(puppeteerPackagePath)) {
        const puppeteerPackage = JSON.parse(fs.readFileSync(puppeteerPackagePath, 'utf-8'));
        logger.info('🔍 Puppeteer 實際安裝版本', {
          operation: 'installed_versions',
          package: 'puppeteer',
          version: puppeteerPackage.version
        });
      }
    } catch (error) {
      logger.warn('無法檢查 node_modules 中的實際版本', {
        operation: 'version_check_failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // 檢查系統資訊
    logger.info('🖥️ 系統安全診斷資訊', {
      operation: 'system_info',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome
    });

    // 執行 npm audit 檢查
    try {
      logger.info('🔍 執行 npm audit 檢查', { operation: 'npm_audit_check' });
      const { exec } = require('child_process');
      exec('npm audit --json', { cwd: path.join(__dirname, '..') }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          logger.error('npm audit 執行失敗', error, {
            operation: 'npm_audit_failed',
            stderr: stderr
          });
        } else {
          try {
            const auditResult = JSON.parse(stdout);
            const vulnerabilities = auditResult.vulnerabilities || {};
            const totalVulns = Object.keys(vulnerabilities).length;

            logger.info('📊 npm audit 結果', {
              operation: 'npm_audit_result',
              totalVulnerabilities: totalVulns,
              summary: {
                critical: auditResult.metadata?.vulnerabilities?.critical || 0,
                high: auditResult.metadata?.vulnerabilities?.high || 0,
                moderate: auditResult.metadata?.vulnerabilities?.moderate || 0,
                low: auditResult.metadata?.vulnerabilities?.low || 0,
                info: auditResult.metadata?.vulnerabilities?.info || 0
              }
            });

            if (totalVulns > 0) {
              logger.warn('⚠️ 發現安全漏洞，建議執行 npm audit fix', {
                operation: 'vulnerabilities_detected',
                totalCount: totalVulns,
                recommendation: '執行 npm audit fix --force 來修復漏洞'
              });
            }
          } catch (parseError) {
            logger.error('解析 npm audit 結果失敗', parseError, {
              operation: 'audit_parse_failed',
              stdout: stdout.substring(0, 500)
            });
          }
        }
      });
    } catch (error) {
      logger.error('執行 npm audit 時發生錯誤', error, {
        operation: 'npm_audit_error'
      });
    }

    logger.info('✅ 安全診斷完成', {
      operation: 'security_diagnostic_complete',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('安全診斷執行失敗', error, {
      operation: 'security_diagnostic_failed'
    });
  }
}

// 設定 IPC 處理器
function setupIpcHandlers(): void {
  // 系統控制
  ipcMain.handle('system:start-monitoring', async () => {
    try {
      if (!mainController) {
        console.warn('MainController 尚未初始化，無法啟動監控');
        return false;
      }
      await mainController.startMonitoring();
      return true;
    } catch (error) {
      console.error('啟動監控失敗:', error);
      return false;
    }
  });

  ipcMain.handle('system:stop-monitoring', async () => {
    try {
      if (!mainController) {
        console.warn('MainController 尚未初始化，無法停止監控');
        return false;
      }
      await mainController.stopMonitoring();
      return true;
    } catch (error) {
      console.error('停止監控失敗:', error);
      return false;
    }
  });

  ipcMain.handle('system:get-status', async () => {
    try {
      if (!mainController) {
        return {
          isRunning: false,
          lastCheck: null,
          totalBooks: 0,
          newBooksToday: 0
        };
      }
      
      const status = mainController.getStatus();
      const recentBooks = await mainController.getRecentBooks(100);
      
      // 計算今日新書數量
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newBooksToday = recentBooks.filter(book => 
        book.createdAt && new Date(book.createdAt) >= today
      ).length;

      return {
        isRunning: status.isRunning,
        lastCheck: status.lastCheckTime?.toISOString() || null,
        totalBooks: status.totalBooksFound,
        newBooksToday: newBooksToday
      };
    } catch (error) {
      console.error('取得系統狀態失敗:', error);
      return {
        isRunning: false,
        lastCheck: null,
        totalBooks: 0,
        newBooksToday: 0
      };
    }
  });

  // 書籍管理
  ipcMain.handle('books:get-recent', async (event, limit = 10) => {
    try {
      if (!mainController) {
        return [];
      }
      return await mainController.getRecentBooks(limit);
    } catch (error) {
      console.error('取得最近書籍失敗:', error);
      return [];
    }
  });

  ipcMain.handle('books:download', async (event, bookId: string) => {
    try {
      if (!mainController) {
        throw new Error('MainController 尚未初始化');
      }
      // 這個方法需要在 MainController 中實作
      // await mainController.downloadBook(bookId);
      console.log(`下載書籍請求: ${bookId}`);
      return true;
    } catch (error) {
      console.error('下載書籍失敗:', error);
      return false;
    }
  });

  // 設定管理
  ipcMain.handle('config:get', async () => {
    try {
      if (!mainController) {
        return {};
      }
      return mainController.getConfig();
    } catch (error) {
      console.error('取得設定失敗:', error);
      return {};
    }
  });

  ipcMain.handle('config:update', async (event, config: any) => {
    try {
      if (!mainController) {
        throw new Error('MainController 尚未初始化');
      }
      await mainController.updateConfig(config);
      return true;
    } catch (error) {
      console.error('更新設定失敗:', error);
      return false;
    }
  });

  ipcMain.handle('config:select-download-path', async () => {
    try {
      if (!mainWindow) {
        return null;
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title: '選擇下載資料夾',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: '選擇資料夾'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('選擇下載路徑失敗:', error);
      return null;
    }
  });

  // 日誌管理
  ipcMain.handle('logs:get', async (event, options: any) => {
    try {
      console.log('取得日誌:', options);
      
      // 建立模擬日誌資料用於測試
      const mockLogs = [
        {
          id: 1,
          level: 'info',
          message: '系統啟動成功',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          metadata: { component: 'MainController', version: '1.0.0' }
        },
        {
          id: 2,
          level: 'warn',
          message: '資料庫連接失敗，系統將以離線模式運行',
          timestamp: new Date(Date.now() - 3000000).toISOString(),
          metadata: { component: 'DatabaseManager', error: 'Connection timeout' }
        },
        {
          id: 3,
          level: 'info',
          message: '使用者介面已載入',
          timestamp: new Date(Date.now() - 2400000).toISOString(),
          metadata: { component: 'Renderer', page: 'dashboard' }
        },
        {
          id: 4,
          level: 'error',
          message: '無法連接到目標網站',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { component: 'WebScraper', url: 'https://www.budaedu.org', error: 'Network timeout' }
        },
        {
          id: 5,
          level: 'debug',
          message: '開始解析網頁內容',
          timestamp: new Date(Date.now() - 1200000).toISOString(),
          metadata: { component: 'BookParser', strategy: 'strategy1' }
        },
        {
          id: 6,
          level: 'info',
          message: '檢測到 3 本新書',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          metadata: { component: 'BookDetector', newBooks: 3, totalBooks: 15 }
        }
      ];

      // 根據選項篩選日誌
      let filteredLogs = [...mockLogs];

      if (options?.level) {
        filteredLogs = filteredLogs.filter(log => log.level === options.level);
      }

      if (options?.search) {
        const searchTerm = options.search.toLowerCase();
        filteredLogs = filteredLogs.filter(log => 
          log.message.toLowerCase().includes(searchTerm) ||
          JSON.stringify(log.metadata).toLowerCase().includes(searchTerm)
        );
      }

      // 限制返回數量
      const limit = options?.limit || 100;
      filteredLogs = filteredLogs.slice(0, limit);

      return filteredLogs;
    } catch (error) {
      console.error('取得日誌失敗:', error);
      return [];
    }
  });

  ipcMain.handle('logs:export', async () => {
    try {
      if (!mainWindow) {
        return null;
      }

      // 顯示儲存對話框
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '匯出日誌',
        defaultPath: `logs-${new Date().toISOString().split('T')[0]}.txt`,
        filters: [
          { name: '文字檔案', extensions: ['txt'] },
          { name: '所有檔案', extensions: ['*'] }
        ],
        buttonLabel: '匯出'
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      // 這裡應該從 Logger 或資料庫取得日誌資料
      // 暫時建立模擬的日誌內容
      const fs = await import('fs/promises');
      const logContent = `書籍監控系統日誌匯出
匯出時間: ${new Date().toLocaleString('zh-TW')}
========================================

[${new Date().toISOString()}] INFO: 系統啟動
[${new Date().toISOString()}] INFO: 資料庫連接失敗，系統將以離線模式運行
[${new Date().toISOString()}] INFO: 使用者介面已載入

注意：這是示範內容，實際應用中會從日誌系統取得真實資料。
`;

      await fs.writeFile(result.filePath, logContent, 'utf-8');
      return result.filePath;
    } catch (error) {
      console.error('匯出日誌失敗:', error);
      return null;
    }
  });
}

// 當 Electron 完成初始化並準備建立瀏覽器視窗時呼叫此方法
app.whenReady().then(async () => {
  setupIpcHandlers();

  // 執行安全診斷
  await performSecurityDiagnostic();

  createWindow();

  // 初始化 MainController
  await initializeMainController();
});

// 當所有視窗都關閉時退出應用程式
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});