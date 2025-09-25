/**
 * 測試工具函數
 * 
 * 提供常用的測試輔助函數、模擬資料生成器和測試工具
 */

import { BookInfo, BookStatus, SystemConfig, LogLevel, ErrorInfo, DailySummary } from '../types';
import { DatabaseConfig } from '../types/database';

/**
 * 等待指定時間
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 等待條件成立
 */
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
};

/**
 * 建立模擬的書籍資料
 */
export const createMockBookInfo = (overrides: Partial<BookInfo> = {}): BookInfo => {
  const defaultBook: BookInfo = {
    id: 1,
    title: '測試書籍標題',
    author: '測試作者',
    description: '這是一本測試書籍的描述',
    pdfUrl: 'https://example.com/test-book.pdf',
    downloadUrl: 'https://example.com/download/test-book.pdf',
    filePath: '/downloads/test-book.pdf',
    fileSize: 1024000, // 1MB
    status: BookStatus.PENDING,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    downloadedAt: undefined
  };

  return { ...defaultBook, ...overrides };
};

/**
 * 建立多個模擬書籍資料
 */
export const createMockBookList = (count: number): BookInfo[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockBookInfo({
      id: index + 1,
      title: `測試書籍 ${index + 1}`,
      pdfUrl: `https://example.com/book-${index + 1}.pdf`,
      downloadUrl: `https://example.com/download/book-${index + 1}.pdf`,
      filePath: `/downloads/book-${index + 1}.pdf`
    })
  );
};

/**
 * 建立模擬的系統設定
 */
export const createMockSystemConfig = (overrides: Partial<SystemConfig> = {}): SystemConfig => {
  const defaultConfig: SystemConfig = {
    monitorInterval: 300000, // 5分鐘
    downloadPath: './test-downloads',
    lineAccessToken: 'test-line-token-12345',
    maxRetries: 3,
    logLevel: LogLevel.INFO,
    autoStart: false
  };

  return { ...defaultConfig, ...overrides };
};

/**
 * 建立模擬的資料庫設定
 */
export const createMockDatabaseConfig = (overrides: Partial<DatabaseConfig> = {}): DatabaseConfig => {
  const defaultConfig: DatabaseConfig = {
    connectionString: 'postgresql://test:test@localhost:5432/test_db',
    ssl: false,
    maxConnections: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  };

  return { ...defaultConfig, ...overrides };
};

/**
 * 建立模擬的錯誤資訊
 */
export const createMockErrorInfo = (overrides: Partial<ErrorInfo> = {}): ErrorInfo => {
  const defaultError: ErrorInfo = {
    code: 'NETWORK_ERROR',
    message: '網路連線錯誤',
    details: '無法連接到目標伺服器',
    timestamp: new Date(),
    retryCount: 0
  };

  return { ...defaultError, ...overrides };
};

/**
 * 建立模擬的每日摘要
 */
export const createMockDailySummary = (overrides: Partial<DailySummary> = {}): DailySummary => {
  const defaultSummary: DailySummary = {
    date: new Date(),
    totalBooks: 10,
    newBooks: 5,
    downloaded: 3,
    failed: 1
  };

  return { ...defaultSummary, ...overrides };
};

/**
 * 建立模擬的 HTML 內容
 */
export const createMockBookListHTML = (bookCount: number = 3): string => {
  const books = Array.from({ length: bookCount }, (_, index) => `
    <div class="book-item">
      <h3 class="book-title">測試書籍 ${index + 1}</h3>
      <p class="book-author">作者：測試作者 ${index + 1}</p>
      <p class="book-description">這是測試書籍 ${index + 1} 的描述</p>
      <a href="https://example.com/book-${index + 1}.pdf" class="pdf-link">下載PDF</a>
    </div>
  `).join('');

  return `
    <html>
      <head><title>書籍列表</title></head>
      <body>
        <div class="book-list">
          ${books}
        </div>
      </body>
    </html>
  `;
};

/**
 * 模擬檔案系統操作
 */
export const mockFileSystem = () => {
  const fs = require('fs');
  const path = require('path');

  const mockFiles: Record<string, string | Buffer> = {};
  const mockDirs: Set<string> = new Set();

  return {
    // 模擬檔案存在檢查
    existsSync: jest.fn((filePath: string) => {
      return mockFiles.hasOwnProperty(filePath) || mockDirs.has(filePath);
    }),

    // 模擬讀取檔案
    readFileSync: jest.fn((filePath: string) => {
      if (mockFiles.hasOwnProperty(filePath)) {
        return mockFiles[filePath];
      }
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }),

    // 模擬寫入檔案
    writeFileSync: jest.fn((filePath: string, data: string | Buffer) => {
      mockFiles[filePath] = data;
    }),

    // 模擬建立目錄
    mkdirSync: jest.fn((dirPath: string) => {
      mockDirs.add(dirPath);
    }),

    // 模擬刪除檔案
    unlinkSync: jest.fn((filePath: string) => {
      delete mockFiles[filePath];
    }),

    // 模擬取得檔案狀態
    statSync: jest.fn((filePath: string) => {
      if (mockFiles.hasOwnProperty(filePath)) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: typeof mockFiles[filePath] === 'string' 
            ? Buffer.byteLength(mockFiles[filePath] as string) 
            : (mockFiles[filePath] as Buffer).length
        };
      }
      if (mockDirs.has(filePath)) {
        return {
          isFile: () => false,
          isDirectory: () => true,
          size: 0
        };
      }
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }),

    // 輔助方法：新增模擬檔案
    addMockFile: (filePath: string, content: string | Buffer) => {
      mockFiles[filePath] = content;
    },

    // 輔助方法：新增模擬目錄
    addMockDir: (dirPath: string) => {
      mockDirs.add(dirPath);
    },

    // 輔助方法：清理模擬資料
    clearMocks: () => {
      Object.keys(mockFiles).forEach(key => delete mockFiles[key]);
      mockDirs.clear();
    }
  };
};

/**
 * 建立模擬的資料庫查詢結果
 */
export const createMockQueryResult = <T = any>(
  rows: T[] = [],
  command: string = 'SELECT',
  rowCount?: number
) => {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command,
    fields: [],
    oid: 0
  };
};

/**
 * 建立模擬的 HTTP 回應
 */
export const createMockHttpResponse = (
  status: number = 200,
  data: any = {},
  headers: Record<string, string> = {}
) => {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    data,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    config: {},
    request: {}
  };
};

/**
 * 建立模擬的 LINE API 回應
 */
export const createMockLineResponse = (success: boolean = true) => {
  if (success) {
    return Promise.resolve({
      status: 200,
      data: { message: 'success' }
    });
  } else {
    return Promise.reject({
      response: {
        status: 400,
        data: { message: 'Bad Request' }
      }
    });
  }
};

/**
 * 測試資料清理工具
 */
export const cleanupTestData = async () => {
  // 清理測試檔案
  const fs = require('fs');
  const path = require('path');
  
  const testDirs = ['./test-downloads', './test-logs', './coverage'];
  
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup test directory ${dir}:`, error);
      }
    }
  }
};

/**
 * 驗證物件結構的輔助函數
 */
export const expectObjectStructure = (obj: any, expectedKeys: string[]) => {
  expect(obj).toBeDefined();
  expect(typeof obj).toBe('object');
  
  for (const key of expectedKeys) {
    expect(obj).toHaveProperty(key);
  }
};

/**
 * 驗證陣列內容的輔助函數
 */
export const expectArrayContent = <T>(
  array: T[],
  expectedLength: number,
  validator?: (item: T, index: number) => void
) => {
  expect(Array.isArray(array)).toBe(true);
  expect(array).toHaveLength(expectedLength);
  
  if (validator) {
    array.forEach(validator);
  }
};

/**
 * 建立測試用的臨時目錄
 */
export const createTempDir = (prefix: string = 'test'): string => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  const tempDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  return tempDir;
};

/**
 * 清理臨時目錄
 */
export const cleanupTempDir = (dirPath: string) => {
  const fs = require('fs');
  
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
};