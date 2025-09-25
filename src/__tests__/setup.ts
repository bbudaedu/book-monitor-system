/**
 * Jest 測試環境設定檔
 * 
 * 此檔案在每個測試檔案執行前載入，用於：
 * - 設定全域測試環境
 * - 配置模擬物件
 * - 設定測試工具
 * - 處理測試清理
 */

import { jest } from '@jest/globals';

// 設定 Node.js 環境變數
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // 減少測試期間的日誌輸出

// 增加 EventEmitter 的最大監聽器數量，避免測試中的警告
require('events').EventEmitter.defaultMaxListeners = 20;

// 全域模擬設定
beforeAll(() => {
  // 模擬 console 方法以減少測試輸出噪音
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  
  // 設定全域超時
  jest.setTimeout(30000);
});

// 每個測試後清理
afterEach(() => {
  // 清理所有模擬
  jest.clearAllMocks();
  
  // 清理環境變數
  delete process.env.TEST_DATABASE_URL;
  delete process.env.TEST_LINE_TOKEN;
  delete process.env.TEST_DOWNLOAD_PATH;
});

// 全域測試結束清理
afterAll(() => {
  // 恢復所有模擬
  jest.restoreAllMocks();
});

// 處理未捕獲的 Promise 拒絕
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// 匯出測試工具
export {};