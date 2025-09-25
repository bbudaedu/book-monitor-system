import { SystemConfig } from '../types';

/**
 * 設定管理模組介面
 * 負責管理應用程式設定和敏感資訊
 */
export interface IConfigManager {
  /**
   * 載入設定
   * @returns 系統設定
   */
  loadConfig(): Promise<SystemConfig>;

  /**
   * 儲存設定
   * @param config 設定資料
   */
  saveConfig(config: SystemConfig): Promise<void>;

  /**
   * 加密敏感資料
   * @param data 原始資料
   * @returns 加密後的資料
   */
  encryptSensitiveData(data: string): Promise<string>;

  /**
   * 解密敏感資料
   * @param encryptedData 加密的資料
   * @returns 解密後的資料
   */
  decryptSensitiveData(encryptedData: string): Promise<string>;

  /**
   * 獲取特定設定值
   * @param key 設定鍵
   * @returns 設定值
   */
  getConfigValue<T>(key: keyof SystemConfig): Promise<T>;

  /**
   * 設定特定設定值
   * @param key 設定鍵
   * @param value 設定值
   */
  setConfigValue<T>(key: keyof SystemConfig, value: T): Promise<void>;

  /**
   * 驗證設定有效性
   * @param config 設定資料
   * @returns 驗證結果
   */
  validateConfig(config: Partial<SystemConfig>): Promise<boolean>;

  /**
   * 重設為預設設定
   */
  resetToDefaults(): Promise<void>;
}