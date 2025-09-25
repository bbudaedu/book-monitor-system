/**
 * 資料庫連接測試
 *
 * 測試 Neon PostgreSQL 資料庫連接
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { Logger } from '../services/Logger';
import { DatabaseConfig } from '../types/database';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 載入環境變數
const loadEnv = () => {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('✅ 已載入 .env 檔案');
  } else {
    console.log('⚠️ .env 檔案不存在');
  }
};

async function testDatabaseConnection() {
  // 載入環境變數
  loadEnv();

  const logger = Logger.getInstance();

  logger.info('🔍 開始資料庫連接測試...');
  logger.info('📍 測試時間:', { timestamp: new Date().toISOString() });
  logger.info('🌐 Node 版本:', { nodeVersion: process.version });
  logger.info('💻 平台:', { platform: process.platform });

  // 檢查環境變數
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    logger.info('✅ DATABASE_URL 已設定');
    logger.info('🔒 資料庫主機:', { hostname: new URL(dbUrl).hostname });
  } else {
    logger.error('❌ DATABASE_URL 未設定');
    return;
  }

  // 建立資料庫配置
  const dbConfig: DatabaseConfig = {
    connectionString: dbUrl,
    maxConnections: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: true
  };

  const dbManager = new DatabaseManager(dbConfig);

  try {
    logger.info('🔌 嘗試連接資料庫...');

    // 測試基本連接
    await dbManager.connect();
    logger.info('✅ 資料庫連接成功！');

    // 測試基本查詢
    logger.info('🔍 測試基本查詢...');
    const result = await dbManager.query('SELECT NOW() as current_time, version() as db_version');
    logger.info('✅ 基本查詢成功');
    logger.info('📅 資料庫時間:', result.rows[0].current_time);
    logger.info('🏷️ 資料庫版本:', result.rows[0].db_version);

    // 測試表格建立
    logger.info('🔍 測試表格操作...');
    await dbManager.query(`
      CREATE TABLE IF NOT EXISTS connection_test (
        id SERIAL PRIMARY KEY,
        test_message VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    logger.info('✅ 表格建立成功');

    // 插入測試資料
    const insertResult = await dbManager.query(
      'INSERT INTO connection_test (test_message) VALUES ($1) RETURNING id',
      ['Connection test successful!']
    );
    logger.info('✅ 資料插入成功, ID:', insertResult.rows[0].id);

    // 查詢測試資料
    const selectResult = await dbManager.query('SELECT * FROM connection_test ORDER BY id DESC LIMIT 1');
    logger.info('✅ 資料查詢成功:', selectResult.rows[0]);

    // 清理測試資料
    await dbManager.query('DELETE FROM connection_test WHERE test_message = $1', ['Connection test successful!']);
    logger.info('✅ 測試資料清理完成');

    // 測試配置表格
    await dbManager.query(`
      INSERT INTO config (key, value) VALUES ('last_connection_test', $1)
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
    `, [new Date().toISOString()]);
    logger.info('✅ 配置表格測試成功');

    logger.info('🎉 所有資料庫測試都通過了！');

  } catch (error: any) {
    logger.error('❌ 資料庫連接測試失敗');

    // 詳細錯誤診斷
    logger.error('🔍 錯誤詳情:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      hostname: error.hostname,
      port: error.port,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      internalPosition: error.internalPosition,
      internalQuery: error.internalQuery,
      where: error.where,
      schema: error.schema,
      table: error.table,
      column: error.column,
      dataType: error.dataType,
      constraint: error.constraint,
      file: error.file,
      line: error.line,
      routine: error.routine,
      stack: error.stack
    });

    // 提供解決建議
    if (error.code === 'ECONNREFUSED') {
      logger.error('💡 建議: 檢查網路連接和防火牆設定');
    } else if (error.code === 'ENOTFOUND') {
      logger.error('💡 建議: 檢查資料庫主機地址是否正確');
    } else if (error.code === 'EAI_AGAIN') {
      logger.error('💡 建議: 檢查 DNS 解析或網路連線');
    } else if (error.message?.includes('SSL')) {
      logger.error('💡 建議: 檢查 SSL 設定，嘗試移除 sslmode=require');
    } else if (error.message?.includes('authentication')) {
      logger.error('💡 建議: 檢查使用者名稱和密碼');
    }

  } finally {
    try {
      await dbManager.disconnect();
      logger.info('🔌 資料庫連接已關閉');
    } catch (closeError) {
      logger.error('⚠️ 關閉資料庫連接時發生錯誤:', closeError);
    }
  }
}

// 運行測試
testDatabaseConnection().then(() => {
  console.log('📊 資料庫連接測試完成');
  // 移除 process.exit 調用，因為這會干擾測試運行器
}).catch((error) => {
  console.error('💥 測試過程中發生未處理的錯誤:', error);
  // 移除 process.exit 調用，因為這會干擾測試運行器
});