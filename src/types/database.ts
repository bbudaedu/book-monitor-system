// 資料庫相關類型定義

/**
 * 資料庫連接設定介面
 */
export interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean;
}

/**
 * 資料庫連接狀態
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * 資料庫健康檢查結果
 */
export interface HealthCheckResult {
  status: ConnectionStatus;
  latency?: number; // 毫秒
  error?: string;
  timestamp: Date;
}

/**
 * 資料庫遷移介面
 */
export interface Migration {
  version: number;
  name: string;
  up: string; // SQL for upgrade
  down: string; // SQL for downgrade
}

/**
 * 查詢結果介面
 */
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

/**
 * 事務選項
 */
export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  readOnly?: boolean;
}