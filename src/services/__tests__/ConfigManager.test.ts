import { ConfigManager } from '../ConfigManager';
import { SystemConfig, LogLevel } from '../../types';
import { DatabaseManager } from '../../database/DatabaseManager';
import { DatabaseConfig } from '../../types/database';

// 模擬DatabaseManager
jest.mock('../../database/DatabaseManager');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDbManager = new DatabaseManager({} as DatabaseConfig) as jest.Mocked<DatabaseManager>;
    configManager = new ConfigManager(mockDbManager, 'test-password');
  });

  describe('初始化', () => {
    test('應該正確初始化ConfigManager', () => {
      expect(configManager).toBeInstanceOf(ConfigManager);
      expect(configManager.isEncryptionInitialized()).toBe(true);
    });

    test('應該能夠在沒有主密碼的情況下初始化', () => {
      const configManagerWithoutPassword = new ConfigManager(mockDbManager);
      expect(configManagerWithoutPassword.isEncryptionInitialized()).toBe(false);
    });
  });

  describe('設定驗證', () => {
    test('應該拒絕過短的監控間隔', async () => {
      const invalidConfig: SystemConfig = {
        monitorInterval: 60000, // 1分鐘，少於最小值5分鐘
        downloadPath: './downloads',
        lineAccessToken: 'test-token',
        maxRetries: 3,
        logLevel: LogLevel.INFO,
        autoStart: false
      };

      await expect(configManager.saveConfig(invalidConfig)).rejects.toThrow('監控間隔不能少於5分鐘');
    });

    test('應該拒絕空的下載路徑', async () => {
      const invalidConfig: SystemConfig = {
        monitorInterval: 300000,
        downloadPath: '',
        lineAccessToken: 'test-token',
        maxRetries: 3,
        logLevel: LogLevel.INFO,
        autoStart: false
      };

      await expect(configManager.saveConfig(invalidConfig)).rejects.toThrow('下載路徑不能為空');
    });

    test('應該拒絕無效的重試次數', async () => {
      const invalidConfig: SystemConfig = {
        monitorInterval: 300000,
        downloadPath: './downloads',
        lineAccessToken: 'test-token',
        maxRetries: 15, // 超過最大值10
        logLevel: LogLevel.INFO,
        autoStart: false
      };

      await expect(configManager.saveConfig(invalidConfig)).rejects.toThrow('重試次數必須在0-10之間');
    });

    test('應該拒絕無效的日誌等級', async () => {
      const invalidConfig: SystemConfig = {
        monitorInterval: 300000,
        downloadPath: './downloads',
        lineAccessToken: 'test-token',
        maxRetries: 3,
        logLevel: 'invalid' as LogLevel,
        autoStart: false
      };

      await expect(configManager.saveConfig(invalidConfig)).rejects.toThrow('無效的日誌等級');
    });
  });

  describe('設定載入和儲存', () => {
    const validConfig: SystemConfig = {
      monitorInterval: 600000, // 10分鐘
      downloadPath: './test-downloads',
      lineAccessToken: 'test-line-token',
      maxRetries: 5,
      logLevel: LogLevel.DEBUG,
      autoStart: true
    };

    test('應該成功儲存有效的設定', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'INSERT'
      });

      await expect(configManager.saveConfig(validConfig)).resolves.not.toThrow();
      
      // 驗證是否呼叫了正確的資料庫操作
      expect(mockDbManager.query).toHaveBeenCalledTimes(6); // 6個設定項目
    });

    test('應該成功載入設定', async () => {
      // 先加密一個測試token
      const testToken = 'test-line-token';
      const encryptedToken = await configManager.encryptSensitiveData(testToken);
      
      // 模擬資料庫返回的設定資料
      const mockConfigRows = [
        { key: 'monitor_interval', value: '600000', encrypted: false, updated_at: new Date() },
        { key: 'download_path', value: './test-downloads', encrypted: false, updated_at: new Date() },
        { key: 'line_access_token', value: encryptedToken, encrypted: true, updated_at: new Date() },
        { key: 'max_retries', value: '5', encrypted: false, updated_at: new Date() },
        { key: 'log_level', value: 'debug', encrypted: false, updated_at: new Date() },
        { key: 'auto_start', value: 'true', encrypted: false, updated_at: new Date() }
      ];

      mockDbManager.query.mockResolvedValue({
        rows: mockConfigRows,
        rowCount: mockConfigRows.length,
        command: 'SELECT'
      });

      const loadedConfig = await configManager.loadConfig();
      
      expect(loadedConfig.monitorInterval).toBe(600000);
      expect(loadedConfig.downloadPath).toBe('./test-downloads');
      expect(loadedConfig.lineAccessToken).toBe(testToken); // 應該是解密後的值
      expect(loadedConfig.maxRetries).toBe(5);
      expect(loadedConfig.logLevel).toBe(LogLevel.DEBUG);
      expect(loadedConfig.autoStart).toBe(true);
    });

    test('應該在沒有設定時返回預設值', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT'
      });

      const loadedConfig = await configManager.loadConfig();
      
      expect(loadedConfig.monitorInterval).toBe(300000); // 預設5分鐘
      expect(loadedConfig.downloadPath).toBe('./downloads');
      expect(loadedConfig.lineAccessToken).toBe('');
      expect(loadedConfig.maxRetries).toBe(3);
      expect(loadedConfig.logLevel).toBe(LogLevel.INFO);
      expect(loadedConfig.autoStart).toBe(false);
    });
  });

  describe('單一設定項目操作', () => {
    test('應該能夠設定和獲取字串值', async () => {
      mockDbManager.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT' }) // set
        .mockResolvedValueOnce({ 
          rows: [{ key: 'test_key', value: 'test_value', encrypted: false, updated_at: new Date() }], 
          rowCount: 1, 
          command: 'SELECT' 
        }); // get

      await configManager.set('test_key', 'test_value');
      const value = await configManager.get('test_key');
      
      expect(value).toBe('test_value');
    });

    test('應該能夠設定和獲取JSON值', async () => {
      const testObject = { name: 'test', value: 123 };
      
      mockDbManager.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT' }) // set
        .mockResolvedValueOnce({ 
          rows: [{ key: 'test_object', value: JSON.stringify(testObject), encrypted: false, updated_at: new Date() }], 
          rowCount: 1, 
          command: 'SELECT' 
        }); // get

      await configManager.set('test_object', testObject);
      const value = await configManager.get('test_object');
      
      expect(value).toEqual(testObject);
    });

    test('應該在找不到設定時返回預設值', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT'
      });

      const value = await configManager.get('non_existent_key', 'default_value');
      expect(value).toBe('default_value');
    });

    test('應該能夠刪除設定項目', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'DELETE'
      });

      const result = await configManager.delete('test_key');
      expect(result).toBe(true);
      
      expect(mockDbManager.query).toHaveBeenCalledWith(
        'DELETE FROM config WHERE key = $1',
        ['test_key']
      );
    });

    test('應該在刪除不存在的設定時返回false', async () => {
      mockDbManager.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'DELETE'
      });

      const result = await configManager.delete('non_existent_key');
      expect(result).toBe(false);
    });
  });

  describe('加密功能', () => {
    test('應該能夠加密和解密敏感資料', async () => {
      const sensitiveData = 'sensitive-line-token-12345';
      
      const encrypted = await configManager.encryptSensitiveData(sensitiveData);
      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted).toContain(':'); // 應該包含IV分隔符
      
      const decrypted = await configManager.decryptSensitiveData(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    test('應該在沒有初始化加密時拋出錯誤', async () => {
      const configManagerWithoutEncryption = new ConfigManager(mockDbManager);
      
      await expect(
        configManagerWithoutEncryption.encryptSensitiveData('test')
      ).rejects.toThrow('加密金鑰未初始化');
    });

    test('應該在解密無效資料時拋出錯誤', async () => {
      await expect(
        configManager.decryptSensitiveData('invalid-encrypted-data')
      ).rejects.toThrow('解密失敗');
    });
  });

  describe('快取功能', () => {
    test('應該使用快取來提高效能', async () => {
      const testValue = 'cached_value';
      
      // 第一次呼叫會查詢資料庫
      mockDbManager.query.mockResolvedValueOnce({
        rows: [{ key: 'cached_key', value: testValue, encrypted: false, updated_at: new Date() }],
        rowCount: 1,
        command: 'SELECT'
      });

      const value1 = await configManager.get('cached_key');
      expect(value1).toBe(testValue);
      expect(mockDbManager.query).toHaveBeenCalledTimes(1);

      // 第二次呼叫應該使用快取，不會再查詢資料庫
      const value2 = await configManager.get('cached_key');
      expect(value2).toBe(testValue);
      expect(mockDbManager.query).toHaveBeenCalledTimes(1); // 仍然是1次
    });
  });

  describe('獲取所有設定項目', () => {
    test('應該能夠獲取所有設定項目', async () => {
      const mockConfigItems = [
        { key: 'key1', value: 'value1', encrypted: false, updated_at: new Date() },
        { key: 'key2', value: 'value2', encrypted: true, updated_at: new Date() }
      ];

      mockDbManager.query.mockResolvedValue({
        rows: mockConfigItems,
        rowCount: mockConfigItems.length,
        command: 'SELECT'
      });

      const items = await configManager.getAllConfigItems();
      
      expect(items).toHaveLength(2);
      expect(items[0].key).toBe('key1');
      expect(items[1].encrypted).toBe(true);
    });
  });
});