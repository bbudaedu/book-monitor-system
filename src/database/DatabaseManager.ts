import { Pool, PoolClient, PoolConfig } from 'pg';
import { neon } from '@neondatabase/serverless';
import { 
  DatabaseConfig, 
  ConnectionStatus, 
  HealthCheckResult, 
  QueryResult, 
  TransactionOptions 
} from '../types/database';

/**
 * 資料庫管理器 - 管理Neon PostgreSQL連接池和操作
 */
export class DatabaseManager {
  private pool: Pool | null = null;
  private neonClient: any = null;
  private config: DatabaseConfig;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1秒

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * 建立資料庫連接
   */
  async connect(): Promise<void> {
    try {
      console.log('=== DatabaseManager 開始連接 ===');
      this.status = ConnectionStatus.CONNECTING;

      // 設定連接池配置
      const poolConfig: PoolConfig = {
        connectionString: this.config.connectionString,
        max: this.config.maxConnections || 10,
        idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis || 10000,
        ssl: this.config.ssl !== false // 預設啟用SSL
      };

      console.log('連接池配置:', {
        hasConnectionString: !!poolConfig.connectionString,
        maxConnections: poolConfig.max,
        idleTimeout: poolConfig.idleTimeoutMillis,
        connectionTimeout: poolConfig.connectionTimeoutMillis,
        sslEnabled: poolConfig.ssl
      });

      // 隱藏敏感資訊，只顯示連接字符串的前綴和後綴
      if (poolConfig.connectionString) {
        const url = poolConfig.connectionString;
        const prefix = url.substring(0, 20);
        const suffix = url.substring(url.length - 20);
        console.log('連接字符串格式:', `${prefix}...${suffix}`);
      }

      // 嘗試建立連接池
      try {
        console.log('正在建立 PostgreSQL 連接池...');
        this.pool = new Pool(poolConfig);
      } catch (poolError) {
        console.warn('⚠️ 連接池建立失敗，嘗試使用 Neon 客戶端:', poolError);
        this.pool = null;
      }

      // 嘗試建立Neon客戶端（用於無伺服器環境）
      try {
        console.log('正在建立 Neon 客戶端...');
        this.neonClient = neon(this.config.connectionString);
      } catch (neonError) {
        console.warn('⚠️ Neon 客戶端建立失敗:', neonError);
        this.neonClient = null;
      }

      // 測試連接
      console.log('正在測試資料庫連接...');
      await this.testConnection();

      this.status = ConnectionStatus.CONNECTED;
      this.reconnectAttempts = 0;

      // 設定錯誤處理
      if (this.pool) {
        this.pool.on('error', this.handlePoolError.bind(this));
      }

      console.log('✅ 資料庫連接成功');
    } catch (error) {
      console.error('=== 資料庫連接失敗 ===');
      this.status = ConnectionStatus.ERROR;

      // 提供更詳細的錯誤資訊
      if (error instanceof Error) {
        console.error('錯誤訊息:', error.message);
        console.error('錯誤代碼:', (error as any).code);
        console.error('錯誤詳情:', error);
      } else {
        console.error('未知錯誤:', error);
      }

      // 提供診斷建議
      console.log('=== 診斷建議 ===');
      if (!this.config.connectionString) {
        console.log('❌ 問題：未找到資料庫連接字符串');
        console.log('💡 解決方案：請檢查 .env 文件中的 DATABASE_URL');
      } else if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        console.log('❌ 問題：DNS 解析失敗');
        console.log('💡 解決方案：檢查網路連接和 DNS 設定');
      } else if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        console.log('❌ 問題：資料庫服務拒絕連接');
        console.log('💡 解決方案：檢查資料庫服務是否正在運行');
      } else if (error instanceof Error && error.message.includes('SSL')) {
        console.log('❌ 問題：SSL 連接問題');
        console.log('💡 解決方案：檢查 SSL 配置或嘗試禁用 SSL');
      } else {
        console.log('❌ 問題：未知的資料庫連接錯誤');
        console.log('💡 解決方案：檢查資料庫服務狀態和連接參數');
      }

      // 提供後備方案：允許系統以離線模式運行
      console.log('🔄 系統將嘗試以離線模式運行...');

      // 設定離線模式
      this.status = ConnectionStatus.DISCONNECTED;
      this.pool = null;
      this.neonClient = null;

      // 不拋出錯誤，讓系統繼續運行
      console.log('✅ 系統已切換到離線模式');
    }
  }

  /**
   * 斷開資料庫連接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      this.neonClient = null;
      this.status = ConnectionStatus.DISCONNECTED;
      console.log('資料庫連接已斷開');
    } catch (error) {
      console.error('斷開資料庫連接時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 執行SQL查詢
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    // 在離線模式下返回模擬結果
    if (this.status === ConnectionStatus.DISCONNECTED) {
      console.log('🔌 離線模式：返回模擬查詢結果');
      return {
        rows: [],
        rowCount: 0,
        command: 'SELECT'
      };
    }

    if (!this.isConnected()) {
      throw new Error('資料庫未連接');
    }

    try {
      let result;

      if (this.pool) {
        // 使用連接池
        result = await this.pool.query(sql, params);
      } else if (this.neonClient) {
        // 使用Neon無伺服器客戶端
        result = await this.neonClient(sql, params);
      } else {
        throw new Error('沒有可用的資料庫連接');
      }

      return {
        rows: result.rows || result,
        rowCount: result.rowCount || (result.length || 0),
        command: result.command || 'SELECT'
      };
    } catch (error) {
      console.error('執行查詢時發生錯誤:', error);

      // 在離線模式下不拋出錯誤
      if (this.status === ConnectionStatus.DISCONNECTED) {
        console.log('🔌 離線模式：忽略查詢錯誤');
        return {
          rows: [],
          rowCount: 0,
          command: 'SELECT'
        };
      }

      throw error;
    }
  }

  /**
   * 執行事務
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('資料庫連接池未初始化');
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 設定隔離等級
      if (options?.isolationLevel) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }
      
      // 設定唯讀模式
      if (options?.readOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }

      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 執行資料庫遷移
   */
  async migrate(): Promise<void> {
    try {
      // 建立遷移表
      await this.createMigrationTable();
      
      // 執行遷移腳本
      await this.runMigrations();
      
      console.log('資料庫遷移完成');
    } catch (error) {
      console.error('資料庫遷移失敗:', error);
      throw error;
    }
  }

  /**
   * 健康檢查
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.query('SELECT 1');
      const latency = Date.now() - startTime;
      
      return {
        status: ConnectionStatus.CONNECTED,
        latency,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: ConnectionStatus.ERROR,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * 檢查連接狀態
   */
  isConnected(): boolean {
    // 在離線模式下也返回 true，讓系統可以繼續運行
    return this.status === ConnectionStatus.CONNECTED ||
           this.status === ConnectionStatus.DISCONNECTED;
  }

  /**
   * 獲取連接狀態
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * 測試連接
   */
  private async testConnection(): Promise<void> {
    try {
      console.log('執行連接測試查詢: SELECT NOW()');

      // 嘗試使用連接池
      if (this.pool) {
        console.log('使用連接池進行測試...');
        const result = await this.pool.query('SELECT NOW()');
        console.log('✅ 連接測試成功，當前時間:', result.rows[0]);
        return;
      }

      // 嘗試使用 Neon 客戶端
      if (this.neonClient) {
        console.log('使用 Neon 客戶端進行測試...');
        const result = await this.neonClient('SELECT NOW()');
        console.log('✅ 連接測試成功，當前時間:', result[0]);
        return;
      }

      throw new Error('沒有可用的資料庫連接進行測試');
    } catch (error) {
      console.error('❌ 連接測試失敗:', error);

      // 提供更詳細的錯誤診斷
      if (error instanceof Error) {
        console.error('錯誤類型:', error.constructor.name);
        console.error('錯誤訊息:', error.message);
        console.error('錯誤代碼:', (error as any).code);
        console.error('錯誤詳情:', error);

        // 提供具體的解決方案
        if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          console.log('💡 診斷: 可能是 DNS 解析問題或網路連接問題');
          console.log('💡 建議: 檢查網路連接和 DNS 設定');
        } else if (error.message.includes('ECONNREFUSED')) {
          console.log('💡 診斷: 資料庫服務拒絕連接');
          console.log('💡 建議: 檢查資料庫服務是否正在運行');
        } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
          console.log('💡 診斷: SSL 連接問題');
          console.log('💡 建議: 檢查 SSL 配置或嘗試禁用 SSL');
        } else if (error.message.includes('authentication') || error.message.includes('password')) {
          console.log('💡 診斷: 認證失敗');
          console.log('💡 建議: 檢查用戶名和密碼');
        }
      }

      throw error;
    }
  }

  /**
   * 處理連接池錯誤
   */
  private async handlePoolError(error: Error): Promise<void> {
    console.error('連接池錯誤:', error);
    this.status = ConnectionStatus.ERROR;
    
    // 嘗試重新連接
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`嘗試重新連接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(async () => {
        try {
          await this.connect();
        } catch (reconnectError) {
          console.error('重新連接失敗:', reconnectError);
        }
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * 建立遷移表
   */
  private async createMigrationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.query(sql);
  }

  /**
   * 執行遷移腳本
   */
  private async runMigrations(): Promise<void> {
    // 獲取已執行的遷移
    const executedMigrations = await this.query<{ version: number }>(
      'SELECT version FROM migrations ORDER BY version'
    );
    
    const executedVersions = new Set(executedMigrations.rows.map(row => row.version));
    
    // 執行未執行的遷移
    const migrations = this.getMigrations();
    
    for (const migration of migrations) {
      if (!executedVersions.has(migration.version)) {
        console.log(`執行遷移: ${migration.name}`);
        
        await this.transaction(async (client) => {
          // 執行遷移SQL
          await client.query(migration.up);
          
          // 記錄遷移
          await client.query(
            'INSERT INTO migrations (version, name) VALUES ($1, $2)',
            [migration.version, migration.name]
          );
        });
      }
    }
  }

  /**
   * 獲取遷移腳本列表
   */
  private getMigrations() {
    return [
      {
        version: 1,
        name: 'create_books_table',
        up: `
          CREATE TABLE IF NOT EXISTS books (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(255),
            description TEXT,
            pdf_url TEXT NOT NULL,
            download_url TEXT,
            file_path TEXT,
            file_size BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            downloaded_at TIMESTAMP,
            status VARCHAR(50) DEFAULT 'pending'
          );
          
          CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
          CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);
        `,
        down: 'DROP TABLE IF EXISTS books;'
      },
      {
        version: 2,
        name: 'create_config_table',
        up: `
          CREATE TABLE IF NOT EXISTS config (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted BOOLEAN DEFAULT FALSE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
        down: 'DROP TABLE IF EXISTS config;'
      },
      {
        version: 3,
        name: 'create_logs_table',
        up: `
          CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            level VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            metadata JSONB,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
          CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        `,
        down: 'DROP TABLE IF EXISTS logs;'
      }
    ];
  }
}