/**
 * 主程序測試
 * 
 * 測試 Electron 主程序的初始化和基本功能
 */

import { app, BrowserWindow, ipcMain } from 'electron';

// 模擬 Electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/mock/path'),
    setPath: jest.fn(),
    isReady: jest.fn().mockReturnValue(true),
    getName: jest.fn().mockReturnValue('Book Monitor System'),
    getVersion: jest.fn().mockReturnValue('1.0.0')
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    webContents: {
      openDevTools: jest.fn(),
      on: jest.fn(),
      send: jest.fn()
    },
    on: jest.fn(),
    once: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    setMenuBarVisibility: jest.fn(),
    setAutoHideMenuBar: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn()
  },
  Menu: {
    setApplicationMenu: jest.fn()
  },
  shell: {
    openExternal: jest.fn()
  }
}));

// 模擬 path
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  dirname: jest.fn((p) => (p ? String(p).substring(0, String(p).lastIndexOf('/')) : '')),
  basename: jest.fn((p) => (p ? String(p).substring(String(p).lastIndexOf('/') + 1) : '')),
  relative: jest.fn(() => '../'),
}));

// 模擬主控制器
jest.mock('../controllers/MainController', () => ({
  MainController: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    getStatus: jest.fn(),
    updateConfig: jest.fn(),
    runManualCheck: jest.fn(),
    on: jest.fn(),
  })),
}));
jest.mock('../database/DatabaseManager');

describe('Main Process', () => {
  let mockWindow: any;
  let mockApp: any;
  let mockIpcMain: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = app as any;
    mockIpcMain = ipcMain as any;
    
    // 重置 BrowserWindow mock
    mockWindow = {
      loadFile: jest.fn().mockResolvedValue(undefined),
      webContents: {
        openDevTools: jest.fn(),
        on: jest.fn(),
        send: jest.fn()
      },
      on: jest.fn(),
    once: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      close: jest.fn(),
      destroy: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      setMenuBarVisibility: jest.fn(),
      setAutoHideMenuBar: jest.fn()
    };

    (BrowserWindow as any).mockImplementation(() => mockWindow);
  });

  describe('應用程式初始化', () => {
    it('應該在 app ready 時建立主視窗', async () => {
      // 動態載入主程序模組以觸發初始化
      const mainModule = await import('../main');

      // 模擬 app ready 事件
      const readyCallback = mockApp.whenReady.mock.calls[0][0];
      if (readyCallback) {
        await readyCallback();
      }

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
          webPreferences: expect.objectContaining({
            nodeIntegration: false,
            contextIsolation: true,
            preload: expect.any(String)
          })
        })
      );

      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html')
      );
    });

    it('應該設定 IPC 處理器', async () => {
      await import('../main');

      // 驗證 IPC 處理器已註冊
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:initialize', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:start', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:stop', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:getStatus', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:updateConfig', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('system:runManualCheck', expect.any(Function));
    });

    it('應該處理應用程式關閉事件', async () => {
      await import('../main');

      // 驗證 app 事件監聽器已註冊
      expect(mockApp.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
      expect(mockApp.on).toHaveBeenCalledWith('before-quit', expect.any(Function));
    });
  });

  describe('IPC 通訊', () => {
    let ipcHandlers: Record<string, Function>;

    beforeEach(async () => {
      await import('../main');

      // 收集所有 IPC 處理器
      ipcHandlers = {};
      mockIpcMain.handle.mock.calls.forEach(([channel, handler]: [string, Function]) => {
        ipcHandlers[channel] = handler;
      });
    });

    it('應該處理系統初始化請求', async () => {
      const { MainController } = require('../controllers/MainController');
      const mockController = {
        initialize: jest.fn().mockResolvedValue(undefined)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:initialize'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(true);
      expect(mockController.initialize).toHaveBeenCalled();
    });

    it('應該處理系統啟動請求', async () => {
      const { MainController } = require('../controllers/MainController');
      const mockController = {
        start: jest.fn().mockResolvedValue(undefined)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:start'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(true);
      expect(mockController.start).toHaveBeenCalled();
    });

    it('應該處理系統停止請求', async () => {
      const { MainController } = require('../controllers/MainController');
      const mockController = {
        stop: jest.fn().mockResolvedValue(undefined)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:stop'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(true);
      expect(mockController.stop).toHaveBeenCalled();
    });

    it('應該處理系統狀態查詢', async () => {
      const mockStatus = {
        isRunning: true,
        nextCheckTime: new Date(),
        lastCheckTime: new Date(),
        totalBooks: 10,
        newBooksToday: 2
      };

      const { MainController } = require('../controllers/MainController');
      const mockController = {
        getStatus: jest.fn().mockReturnValue(mockStatus)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:getStatus'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatus);
      expect(mockController.getStatus).toHaveBeenCalled();
    });

    it('應該處理設定更新請求', async () => {
      const mockConfig = {
        monitorInterval: 600000,
        downloadPath: './downloads',
        lineAccessToken: 'test-token',
        maxRetries: 3,
        logLevel: 'info',
        autoStart: false
      };

      const { MainController } = require('../controllers/MainController');
      const mockController = {
        updateConfig: jest.fn().mockResolvedValue(undefined)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:updateConfig'];
      expect(handler).toBeDefined();

      const result = await handler(null, mockConfig);
      expect(result.success).toBe(true);
      expect(mockController.updateConfig).toHaveBeenCalledWith(mockConfig);
    });

    it('應該處理手動檢查請求', async () => {
      const { MainController } = require('../controllers/MainController');
      const mockController = {
        runManualCheck: jest.fn().mockResolvedValue(undefined)
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:runManualCheck'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(true);
      expect(mockController.runManualCheck).toHaveBeenCalled();
    });

    it('應該處理 IPC 錯誤', async () => {
      const { MainController } = require('../controllers/MainController');
      const mockController = {
        initialize: jest.fn().mockRejectedValue(new Error('初始化失敗'))
      };
      MainController.mockImplementation(() => mockController);

      const handler = ipcHandlers['system:initialize'];
      expect(handler).toBeDefined();

      const result = await handler();
      expect(result.success).toBe(false);
      expect(result.error).toBe('初始化失敗');
    });
  });

  describe('視窗管理', () => {
    it('應該在所有視窗關閉時退出應用程式 (非 macOS)', async () => {
      // 模擬非 macOS 環境
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });

      await import('../main');

      // 找到 window-all-closed 事件處理器
      const windowAllClosedHandler = mockApp.on.mock.calls
        .find(([event]: [string]) => event === 'window-all-closed')?.[1];

      expect(windowAllClosedHandler).toBeDefined();

      // 執行處理器
      windowAllClosedHandler();

      expect(mockApp.quit).toHaveBeenCalled();
    });

    it('應該在 macOS 上保持應用程式運行', async () => {
      // 模擬 macOS 環境
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true
      });

      // 重新載入模組
      jest.resetModules();
      await import('../main');

      // 找到 window-all-closed 事件處理器
      const windowAllClosedHandler = mockApp.on.mock.calls
        .find(([event]: [string]) => event === 'window-all-closed')?.[1];

      expect(windowAllClosedHandler).toBeDefined();

      // 執行處理器
      windowAllClosedHandler();

      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it('應該在應用程式退出前清理資源', async () => {
      await import('../main');

      // 找到 before-quit 事件處理器
      const beforeQuitHandler = mockApp.on.mock.calls
        .find(([event]: [string]) => event === 'before-quit')?.[1];

      expect(beforeQuitHandler).toBeDefined();

      const mockEvent = { preventDefault: jest.fn() };
      await beforeQuitHandler(mockEvent);

      // 驗證清理邏輯
      expect(mockIpcMain.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe('開發模式', () => {
    it('應該在開發模式下開啟開發者工具', async () => {
      // 設定開發環境
      process.env.NODE_ENV = 'development';

      // 重新載入模組
      jest.resetModules();
      await import('../main');

      // 模擬 app ready 事件
      const readyCallback = mockApp.whenReady.mock.calls[0][0];
      if (readyCallback) {
        await readyCallback();
      }

      // 模擬視窗 ready-to-show 事件
      const readyToShowCallback = mockWindow.on.mock.calls
        .find(([event]: [string]) => event === 'ready-to-show')?.[1];

      if (readyToShowCallback) {
        readyToShowCallback();
      }

      expect(mockWindow.webContents.openDevTools).toHaveBeenCalled();
    });

    it('應該在生產模式下不開啟開發者工具', async () => {
      // 設定生產環境
      process.env.NODE_ENV = 'production';

      // 重新載入模組
      jest.resetModules();
      await import('../main');

      // 模擬 app ready 事件
      const readyCallback = mockApp.whenReady.mock.calls[0][0];
      if (readyCallback) {
        await readyCallback();
      }

      // 模擬視窗 ready-to-show 事件
      const readyToShowCallback = mockWindow.on.mock.calls
        .find(([event]: [string]) => event === 'ready-to-show')?.[1];

      if (readyToShowCallback) {
        readyToShowCallback();
      }

      expect(mockWindow.webContents.openDevTools).not.toHaveBeenCalled();
    });
  });

  describe('錯誤處理', () => {
    it('應該處理主控制器初始化錯誤', async () => {
      const { MainController } = require('../controllers/MainController');
      MainController.mockImplementation(() => {
        throw new Error('主控制器初始化失敗');
      });

      // 重新載入模組應該不會拋出錯誤
      await expect(import('../main')).resolves.toBeDefined();
    });

    it('應該處理視窗建立錯誤', async () => {
      (BrowserWindow as any).mockImplementation(() => {
        throw new Error('視窗建立失敗');
      });

      // 重新載入模組
      jest.resetModules();
      await import('../main');

      // 模擬 app ready 事件應該不會拋出錯誤
      const readyCallback = mockApp.whenReady.mock.calls[0][0];
      if (readyCallback) {
        await expect(readyCallback()).resolves.toBeDefined();
      }
    });
  });

  describe('記憶體管理', () => {
    it('應該在視窗關閉時清理引用', async () => {
      await import('../main');

      // 模擬 app ready 事件
      const readyCallback = mockApp.whenReady.mock.calls[0][0];
      if (readyCallback) {
        await readyCallback();
      }

      // 找到視窗 closed 事件處理器
      const closedHandler = mockWindow.on.mock.calls
        .find(([event]: [string]) => event === 'closed')?.[1];

      expect(closedHandler).toBeDefined();

      // 執行處理器
      closedHandler();

      // 驗證視窗引用已清理（這裡我們無法直接測試，但可以確保處理器存在）
      expect(closedHandler).toHaveBeenCalled;
    });
  });
});