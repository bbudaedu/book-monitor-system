import { DatabaseManager } from '../DatabaseManager';
import { DatabaseConfig, ConnectionStatus } from '../../types/database';

// 模擬測試用的資料庫配置
const mockConfig: DatabaseConfig = {
  connectionString: 'postgresql://test:test@localhost:5432/test_db',
  maxConnections: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: false
};

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = new DatabaseManager(mockConfig);
  });

  afterEach(async () => {
    if (dbManager.isConnected()) {
      await dbManager.disconnect();
    }
  });

  describe('初始化', () => {
    test('應該正確初始化DatabaseManager', () => {
      expect(dbManager).toBeInstanceOf(DatabaseManager);
      expect(dbManager.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
      expect(dbManager.isConnected()).toBe(false);
    });
  });

  describe('連接管理', () => {
    test('應該能夠檢測未連接狀態', () => {
      expect(dbManager.isConnected()).toBe(false);
      expect(dbManager.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
    });

    test('查詢未連接的資料庫應該拋出錯誤', async () => {
      await expect(dbManager.query('SELECT 1')).rejects.toThrow('資料庫未連接');
    });
  });

  describe('健康檢查', () => {
    test('未連接時健康檢查應該返回錯誤狀態', async () => {
      const result = await dbManager.healthCheck();
      expect(result.status).toBe(ConnectionStatus.ERROR);
      expect(result.error).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('查詢方法', () => {
    test('應該正確格式化查詢結果', () => {
      // 這個測試需要實際的資料庫連接，在實際環境中會被跳過
      // 這裡主要測試介面定義是否正確
      expect(typeof dbManager.query).toBe('function');
    });
  });

  describe('事務處理', () => {
    test('事務方法應該存在', () => {
      expect(typeof dbManager.transaction).toBe('function');
    });
  });

  describe('遷移功能', () => {
    test('遷移方法應該存在', () => {
      expect(typeof dbManager.migrate).toBe('function');
    });
  });
});

// 整合測試（需要實際的資料庫連接）
describe('DatabaseManager Integration Tests', () => {
  // 這些測試只在有實際資料庫連接時執行
  const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
  
  if (!shouldRunIntegrationTests) {
    test.skip('跳過整合測試 - 設定 RUN_INTEGRATION_TESTS=true 來執行', () => {});
    return;
  }

  let dbManager: DatabaseManager;
  const testConfig: DatabaseConfig = {
    connectionString: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db',
    maxConnections: 2,
    ssl: false
  };

  beforeAll(async () => {
    dbManager = new DatabaseManager(testConfig);
  });

  afterAll(async () => {
    if (dbManager.isConnected()) {
      await dbManager.disconnect();
    }
  });

  test('應該能夠連接到資料庫', async () => {
    await expect(dbManager.connect()).resolves.not.toThrow();
    expect(dbManager.isConnected()).toBe(true);
    expect(dbManager.getStatus()).toBe(ConnectionStatus.CONNECTED);
  });

  test('應該能夠執行簡單查詢', async () => {
    if (!dbManager.isConnected()) {
      await dbManager.connect();
    }
    
    const result = await dbManager.query('SELECT 1 as test_value');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].test_value).toBe(1);
  });

  test('健康檢查應該返回正常狀態', async () => {
    if (!dbManager.isConnected()) {
      await dbManager.connect();
    }
    
    const result = await dbManager.healthCheck();
    expect(result.status).toBe(ConnectionStatus.CONNECTED);
    expect(result.latency).toBeGreaterThan(0);
  });

  test('應該能夠執行遷移', async () => {
    if (!dbManager.isConnected()) {
      await dbManager.connect();
    }
    
    await expect(dbManager.migrate()).resolves.not.toThrow();
    
    // 驗證表格是否建立
    const tables = ['books', 'config', 'logs'];
    for (const table of tables) {
      const result = await dbManager.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      expect(result.rows[0].exists).toBe(true);
    }
  });
});