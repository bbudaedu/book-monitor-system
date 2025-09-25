import { DatabaseManager } from './DatabaseManager';
import { DatabaseConfig } from '../types/database';

/**
 * 資料庫初始化工具
 */
export class DatabaseInitializer {
  private dbManager: DatabaseManager;

  constructor(config: DatabaseConfig) {
    this.dbManager = new DatabaseManager(config);
  }

  /**
   * 初始化資料庫
   */
  async initialize(): Promise<void> {
    try {
      console.log('開始初始化資料庫...');
      
      // 連接資料庫
      await this.dbManager.connect();
      
      // 執行遷移
      await this.dbManager.migrate();
      
      // 插入預設設定
      await this.insertDefaultConfig();
      
      // 驗證資料庫結構
      await this.validateDatabaseStructure();
      
      console.log('資料庫初始化完成');
    } catch (error) {
      console.error('資料庫初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 插入預設設定
   */
  private async insertDefaultConfig(): Promise<void> {
    const defaultConfigs = [
      { key: 'monitor_interval', value: '300000', encrypted: false }, // 5分鐘
      { key: 'download_path', value: './downloads', encrypted: false },
      { key: 'max_retries', value: '3', encrypted: false },
      { key: 'log_level', value: 'info', encrypted: false },
      { key: 'auto_start', value: 'false', encrypted: false }
    ];

    for (const config of defaultConfigs) {
      try {
        await this.dbManager.query(
          `INSERT INTO config (key, value, encrypted) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (key) DO NOTHING`,
          [config.key, config.value, config.encrypted]
        );
      } catch (error) {
        console.warn(`插入預設設定失敗: ${config.key}`, error);
      }
    }
  }

  /**
   * 驗證資料庫結構
   */
  private async validateDatabaseStructure(): Promise<void> {
    const tables = ['books', 'config', 'logs', 'migrations'];
    
    for (const table of tables) {
      const result = await this.dbManager.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      
      if (!result.rows[0].exists) {
        throw new Error(`資料表 ${table} 不存在`);
      }
    }
    
    console.log('資料庫結構驗證通過');
  }

  /**
   * 清理資料庫（開發用）
   */
  async cleanup(): Promise<void> {
    try {
      console.log('開始清理資料庫...');
      
      const tables = ['logs', 'config', 'books', 'migrations'];
      
      for (const table of tables) {
        await this.dbManager.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
      
      console.log('資料庫清理完成');
    } catch (error) {
      console.error('資料庫清理失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取資料庫管理器實例
   */
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }
}

/**
 * 建立資料庫連接的工廠函數
 */
export function createDatabaseManager(connectionString: string): DatabaseManager {
  const config: DatabaseConfig = {
    connectionString,
    maxConnections: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: true
  };
  
  return new DatabaseManager(config);
}

/**
 * 從環境變數建立資料庫連接
 */
export function createDatabaseManagerFromEnv(): DatabaseManager {
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('未找到資料庫連接字串，請設定 DATABASE_URL 或 NEON_DATABASE_URL 環境變數');
  }
  
  return createDatabaseManager(connectionString);
}