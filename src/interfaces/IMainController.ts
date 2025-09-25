import { SystemConfig, MonitorStatus } from '../types';

/**
 * 主控制器介面
 * 負責協調各個模組的運作，管理應用程式生命週期
 */
export interface IMainController {
  /**
   * 啟動系統
   */
  start(): Promise<void>;

  /**
   * 停止系統
   */
  stop(): Promise<void>;

  /**
   * 獲取系統狀態
   */
  getStatus(): Promise<MonitorStatus>;

  /**
   * 更新系統設定
   * @param config 新的設定
   */
  updateConfig(config: Partial<SystemConfig>): Promise<void>;

  /**
   * 獲取當前設定
   */
  getConfig(): Promise<SystemConfig>;

  /**
   * 檢查系統健康狀態
   */
  healthCheck(): Promise<boolean>;
}