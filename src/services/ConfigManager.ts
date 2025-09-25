import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { SystemConfig, LogLevel } from '../types';
import { DatabaseManager } from '../database/DatabaseManager';

const scryptAsync = promisify(scrypt);

/**
 * 設定項目介面
 */
interface ConfigItem {
  key: string;
  value: string;
  encrypted: boolean;
  updatedAt: Date;
}

/**
 * 加密設定介面
 */
interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
}

/**
 * 設定管理器 - 處理應用程式設定和敏感資料加密
 */
export class ConfigManager {
  private dbManager: DatabaseManager;
  private encryptionKey: Buffer | null = null;
  private encryptionConfig: EncryptionConfig = {
    algorithm: 'aes-256-cbc',
    keyLength: 32,
    ivLength: 16
  };
  private configCache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5分鐘快取

  constructor(dbManager: DatabaseManager, masterPassword?: string) {
    this.dbManager = dbManager;
    if (masterPassword) {
      // 同步初始化加密，因為constructor不能是async
      this.initializeEncryptionSync(masterPassword);
    }
  }

  /**
   * 初始化加密金鑰 (異步版本)
   */
  private async initializeEncryption(masterPassword: string): Promise<void> {
    try {
      // 使用固定的salt（在實際應用中應該儲存在安全的地方）
      const salt = Buffer.from('book-monitor-salt', 'utf8');
      this.encryptionKey = (await scryptAsync(masterPassword, salt, this.encryptionConfig.keyLength)) as Buffer;
    } catch (error) {
      console.error('初始化加密金鑰失敗:', error);
      throw new Error('初始化加密金鑰失敗');
    }
  }

  /**
   * 初始化加密金鑰 (同步版本，用於constructor)
   */
  private initializeEncryptionSync(masterPassword: string): void {
    try {
      // 使用固定的salt（在實際應用中應該儲存在安全的地方）
      const salt = Buffer.from('book-monitor-salt', 'utf8');
      // 使用同步版本的scrypt
      const crypto = require('crypto');
      this.encryptionKey = crypto.scryptSync(masterPassword, salt, this.encryptionConfig.keyLength);
    } catch (error) {
      console.error('初始化加密金鑰失敗:', error);
      throw new Error('初始化加密金鑰失敗');
    }
  }

  /**
   * 載入系統設定
   */
  async loadConfig(): Promise<SystemConfig> {
    try {
      const defaultConfig: SystemConfig = {
        monitorInterval: 300000, // 5分鐘
        downloadPath: './downloads',
        lineAccessToken: '',
        maxRetries: 3,
        logLevel: LogLevel.INFO,
        autoStart: false
      };

      // 從資料庫載入設定
      const configItems = await this.getAllConfigItems();
      
      // 合併預設設定和資料庫設定
      const config = { ...defaultConfig };
      
      for (const item of configItems) {
        const value = item.encrypted ? await this.decryptValue(item.value) : item.value;
        
        switch (item.key) {
          case 'monitor_interval':
            config.monitorInterval = parseInt(value, 10);
            break;
          case 'download_path':
            config.downloadPath = value;
            break;
          case 'line_access_token':
            config.lineAccessToken = value;
            break;
          case 'max_retries':
            config.maxRetries = parseInt(value, 10);
            break;
          case 'log_level':
            config.logLevel = value as LogLevel;
            break;
          case 'auto_start':
            config.autoStart = value === 'true';
            break;
        }
      }

      return config;
    } catch (error) {
      console.error('載入設定失敗:', error);
      throw error; // 拋出原始錯誤而不是包裝的錯誤
    }
  }

  /**
   * 儲存系統設定
   */
  async saveConfig(config: SystemConfig): Promise<void> {
    try {
      // 驗證設定
      this.validateConfig(config);

      // 準備設定項目
      const configItems: Array<{ key: string; value: string; encrypted: boolean }> = [
        { key: 'monitor_interval', value: config.monitorInterval.toString(), encrypted: false },
        { key: 'download_path', value: config.downloadPath, encrypted: false },
        { key: 'line_access_token', value: config.lineAccessToken, encrypted: true },
        { key: 'max_retries', value: config.maxRetries.toString(), encrypted: false },
        { key: 'log_level', value: config.logLevel, encrypted: false },
        { key: 'auto_start', value: config.autoStart.toString(), encrypted: false }
      ];

      // 儲存設定項目
      for (const item of configItems) {
        const value = item.encrypted ? await this.encryptValue(item.value) : item.value;
        await this.setConfigItem(item.key, value, item.encrypted);
      }

      // 清除快取
      this.clearCache();

      console.log('設定儲存成功');
    } catch (error) {
      console.error('儲存設定失敗:', error);
      throw error; // 拋出原始錯誤而不是包裝的錯誤
    }
  }

  /**
   * 獲取單一設定值
   */
  async get<T = string>(key: string, defaultValue?: T): Promise<T> {
    try {
      // 檢查快取
      if (this.isCacheValid(key)) {
        return this.configCache.get(key) as T;
      }

      const result = await this.dbManager.query<ConfigItem>(
        'SELECT * FROM config WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        return defaultValue as T;
      }

      const item = result.rows[0];
      let value: any = item.encrypted ? await this.decryptValue(item.value) : item.value;

      // 嘗試解析JSON
      try {
        value = JSON.parse(value);
      } catch {
        // 不是JSON格式，保持原值
      }

      // 更新快取
      this.updateCache(key, value);

      return value as T;
    } catch (error) {
      console.error(`獲取設定 ${key} 失敗:`, error);
      return defaultValue as T;
    }
  }

  /**
   * 設定單一設定值
   */
  async set(key: string, value: any, encrypted: boolean = false): Promise<void> {
    try {
      let stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (encrypted) {
        stringValue = await this.encryptValue(stringValue);
      }

      await this.setConfigItem(key, stringValue, encrypted);
      
      // 更新快取
      this.updateCache(key, value);
    } catch (error) {
      console.error(`設定 ${key} 失敗:`, error);
      throw new Error(`設定 ${key} 失敗`);
    }
  }

  /**
   * 刪除設定項目
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.dbManager.query(
        'DELETE FROM config WHERE key = $1',
        [key]
      );

      // 從快取中移除
      this.configCache.delete(key);
      this.cacheExpiry.delete(key);

      return result.rowCount > 0;
    } catch (error) {
      console.error(`刪除設定 ${key} 失敗:`, error);
      throw new Error(`刪除設定 ${key} 失敗`);
    }
  }

  /**
   * 獲取所有設定項目
   */
  async getAllConfigItems(): Promise<ConfigItem[]> {
    try {
      const result = await this.dbManager.query<ConfigItem>(
        'SELECT * FROM config ORDER BY key'
      );

      return result.rows.map(row => ({
        key: row.key,
        value: row.value,
        encrypted: row.encrypted,
        updatedAt: new Date((row as any).updated_at)
      }));
    } catch (error) {
      console.error('獲取所有設定項目失敗:', error);
      throw new Error('獲取所有設定項目失敗');
    }
  }

  /**
   * 加密敏感資料
   */
  async encryptSensitiveData(data: string): Promise<string> {
    return this.encryptValue(data);
  }

  /**
   * 解密敏感資料
   */
  async decryptSensitiveData(encryptedData: string): Promise<string> {
    return this.decryptValue(encryptedData);
  }

  /**
   * 驗證設定
   */
  private validateConfig(config: SystemConfig): void {
    const errors: string[] = [];

    // 監控間隔驗證（最小5分鐘）
    if (config.monitorInterval < 300000) {
      errors.push('監控間隔不能少於5分鐘');
    }

    // 下載路徑驗證
    if (!config.downloadPath || config.downloadPath.trim().length === 0) {
      errors.push('下載路徑不能為空');
    }

    // 重試次數驗證
    if (config.maxRetries < 0 || config.maxRetries > 10) {
      errors.push('重試次數必須在0-10之間');
    }

    // 日誌等級驗證
    if (!Object.values(LogLevel).includes(config.logLevel)) {
      errors.push('無效的日誌等級');
    }

    if (errors.length > 0) {
      throw new Error(`設定驗證失敗: ${errors.join(', ')}`);
    }
  }

  /**
   * 設定設定項目
   */
  private async setConfigItem(key: string, value: string, encrypted: boolean): Promise<void> {
    await this.dbManager.query(
      `INSERT INTO config (key, value, encrypted, updated_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, encrypted = $3, updated_at = CURRENT_TIMESTAMP`,
      [key, value, encrypted]
    );
  }

  /**
   * 加密值
   */
  private async encryptValue(value: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('加密金鑰未初始化');
    }

    try {
      const iv = randomBytes(this.encryptionConfig.ivLength);
      const cipher = createCipheriv(this.encryptionConfig.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 將IV和加密資料組合
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('加密失敗:', error);
      throw new Error('加密失敗');
    }
  }

  /**
   * 解密值
   */
  private async decryptValue(encryptedValue: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('加密金鑰未初始化');
    }

    try {
      const parts = encryptedValue.split(':');
      if (parts.length !== 2) {
        throw new Error('無效的加密資料格式');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = createDecipheriv(this.encryptionConfig.algorithm, this.encryptionKey, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('解密失敗:', error);
      throw new Error('解密失敗');
    }
  }

  /**
   * 檢查快取是否有效
   */
  private isCacheValid(key: string): boolean {
    if (!this.configCache.has(key)) {
      return false;
    }

    const expiry = this.cacheExpiry.get(key);
    if (!expiry || Date.now() > expiry) {
      this.configCache.delete(key);
      this.cacheExpiry.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 更新快取
   */
  private updateCache(key: string, value: any): void {
    this.configCache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.cacheTimeout);
  }

  /**
   * 清除快取
   */
  private clearCache(): void {
    this.configCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * 檢查是否已初始化加密
   */
  isEncryptionInitialized(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * 重新初始化加密（更改主密碼時使用）
   */
  async reinitializeEncryption(oldPassword: string, newPassword: string): Promise<void> {
    try {
      // 使用舊密碼載入所有加密的設定
      await this.initializeEncryption(oldPassword);
      const encryptedItems = await this.dbManager.query<ConfigItem>(
        'SELECT * FROM config WHERE encrypted = true'
      );

      const decryptedItems: Array<{ key: string; value: string }> = [];
      for (const item of encryptedItems.rows) {
        const decryptedValue = await this.decryptValue(item.value);
        decryptedItems.push({ key: item.key, value: decryptedValue });
      }

      // 使用新密碼重新加密
      await this.initializeEncryption(newPassword);
      for (const item of decryptedItems) {
        const encryptedValue = await this.encryptValue(item.value);
        await this.setConfigItem(item.key, encryptedValue, true);
      }

      this.clearCache();
      console.log('加密金鑰更新成功');
    } catch (error) {
      console.error('重新初始化加密失敗:', error);
      throw new Error('重新初始化加密失敗');
    }
  }
}