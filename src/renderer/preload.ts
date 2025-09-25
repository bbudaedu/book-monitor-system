import { contextBridge, ipcRenderer } from 'electron';

// 定義 Electron API 介面
export interface ElectronAPI {
  // 系統控制
  startMonitoring: () => Promise<boolean>;
  stopMonitoring: () => Promise<boolean>;
  getSystemStatus: () => Promise<{
    isRunning: boolean;
    lastCheck: string | null;
    totalBooks: number;
    newBooksToday: number;
  }>;

  // 書籍管理
  getRecentBooks: (limit?: number) => Promise<any[]>;
  downloadBook: (bookId: string) => Promise<boolean>;

  // 設定管理
  getConfig: () => Promise<any>;
  updateConfig: (config: any) => Promise<boolean>;
  selectDownloadPath: () => Promise<string | null>;

  // 日誌管理
  getLogs: (options?: {
    level?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => Promise<any[]>;
  exportLogs: () => Promise<string | null>;

  // 事件監聽
  onStatusUpdate: (callback: (status: any) => void) => void;
  onNewBook: (callback: (book: any) => void) => void;
  onDownloadStarted: (callback: (book: any) => void) => void;
  onDownloadCompleted: (callback: (book: any) => void) => void;
  onDownloadFailed: (callback: (data: any) => void) => void;
  onNotificationSent: (callback: (book: any) => void) => void;
  onError: (callback: (error: any) => void) => void;
  onConfigUpdated: (callback: (config: any) => void) => void;
  onLogUpdate: (callback: (log: any) => void) => void;

  // 移除事件監聽器
  removeAllListeners: (channel: string) => void;
}

// 透過 contextBridge 安全地暴露 API 給渲染程序
contextBridge.exposeInMainWorld('electronAPI', {
  // 系統控制
  startMonitoring: () => ipcRenderer.invoke('system:start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('system:stop-monitoring'),
  getSystemStatus: () => ipcRenderer.invoke('system:get-status'),

  // 書籍管理
  getRecentBooks: (limit?: number) => ipcRenderer.invoke('books:get-recent', limit),
  downloadBook: (bookId: string) => ipcRenderer.invoke('books:download', bookId),

  // 設定管理
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (config: any) => ipcRenderer.invoke('config:update', config),
  selectDownloadPath: () => ipcRenderer.invoke('config:select-download-path'),

  // 日誌管理
  getLogs: (options?: any) => ipcRenderer.invoke('logs:get', options),
  exportLogs: () => ipcRenderer.invoke('logs:export'),

  // 事件監聽
  onStatusUpdate: (callback: (status: any) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },
  onNewBook: (callback: (book: any) => void) => {
    ipcRenderer.on('new-book', (_event, book) => callback(book));
  },
  onDownloadStarted: (callback: (book: any) => void) => {
    ipcRenderer.on('download-started', (_event, book) => callback(book));
  },
  onDownloadCompleted: (callback: (book: any) => void) => {
    ipcRenderer.on('download-completed', (_event, book) => callback(book));
  },
  onDownloadFailed: (callback: (data: any) => void) => {
    ipcRenderer.on('download-failed', (_event, data) => callback(data));
  },
  onNotificationSent: (callback: (book: any) => void) => {
    ipcRenderer.on('notification-sent', (_event, book) => callback(book));
  },
  onError: (callback: (error: any) => void) => {
    ipcRenderer.on('error', (_event, error) => callback(error));
  },
  onConfigUpdated: (callback: (config: any) => void) => {
    ipcRenderer.on('config-updated', (_event, config) => callback(config));
  },
  onLogUpdate: (callback: (log: any) => void) => {
    ipcRenderer.on('log-update', (_event, log) => callback(log));
  },

  // 移除事件監聽器
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
} as ElectronAPI);

// 宣告全域類型
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}