import cron from 'node-cron';
import { EventEmitter } from 'events';
import { Logger } from './Logger';

/**
 * 任務狀態列舉
 */
export enum TaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * 任務資訊介面
 */
export interface TaskInfo {
  id: string;
  name: string;
  cronExpression: string;
  status: TaskStatus;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  lastError?: Error;
}

/**
 * 任務執行結果介面
 */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  duration: number;
  error?: Error;
  timestamp: Date;
}

/**
 * 任務排程器事件介面
 */
export interface TaskSchedulerEvents {
  'task-started': (taskId: string) => void;
  'task-completed': (result: TaskExecutionResult) => void;
  'task-failed': (result: TaskExecutionResult) => void;
  'task-scheduled': (taskInfo: TaskInfo) => void;
  'task-unscheduled': (taskId: string) => void;
  'scheduler-error': (error: Error) => void;
}

/**
 * 任務執行函數類型
 */
export type TaskFunction = () => Promise<void> | void;

/**
 * 任務排程器 - 使用node-cron管理定時任務
 * 
 * 基於Node.js EventEmitter模式實現任務狀態通知
 * 支援可配置的檢查間隔和任務狀態管理
 * 參考: https://github.com/node-cron/node-cron
 */
export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, {
    info: TaskInfo;
    cronJob: cron.ScheduledTask;
    taskFunction: TaskFunction;
  }> = new Map();
  
  private logger: Logger;
  private isShuttingDown = false;

  constructor(logger?: Logger) {
    super();
    this.logger = logger || Logger.getInstance();
    this.setupErrorHandling();
  }

  /**
   * 排程新任務
   * 
   * @param taskId 任務唯一識別碼
   * @param taskName 任務名稱
   * @param cronExpression Cron表達式 (支援秒級精度)
   * @param taskFunction 任務執行函數
   * @param options 任務選項
   */
  scheduleTask(
    taskId: string,
    taskName: string,
    cronExpression: string,
    taskFunction: TaskFunction,
    options: {
      timezone?: string;
      scheduled?: boolean;
      recoverMissedExecutions?: boolean;
    } = {}
  ): void {
    try {
      // 檢查任務是否已存在
      if (this.tasks.has(taskId)) {
        throw new Error(`任務 ${taskId} 已存在`);
      }

      // 驗證cron表達式
      if (!cron.validate(cronExpression)) {
        throw new Error(`無效的cron表達式: ${cronExpression}`);
      }

      // 建立任務資訊
      const taskInfo: TaskInfo = {
        id: taskId,
        name: taskName,
        cronExpression,
        status: TaskStatus.IDLE,
        runCount: 0,
        errorCount: 0,
        nextRun: this.calculateNextRun(cronExpression)
      };

      // 建立cron任務
      const cronJob = cron.schedule(cronExpression, async () => {
        if (!this.isShuttingDown) {
          await this.executeTask(taskId);
        }
      }, {
        scheduled: options.scheduled !== false, // 預設為true
        timezone: options.timezone,
        recoverMissedExecutions: options.recoverMissedExecutions
      });

      // 儲存任務
      this.tasks.set(taskId, {
        info: taskInfo,
        cronJob,
        taskFunction
      });

      this.emit('task-scheduled', taskInfo);
      this.logger.info(`任務已排程: ${taskName}`, {
        component: 'TaskScheduler',
        taskId,
        cronExpression
      });

    } catch (error) {
      this.logger.error(`排程任務失敗: ${taskName}`, error, {
        component: 'TaskScheduler',
        taskId
      });
      this.emit('scheduler-error', error as Error);
      throw error;
    }
  }

  /**
   * 使用間隔時間排程任務（毫秒）
   * 
   * @param taskId 任務唯一識別碼
   * @param taskName 任務名稱
   * @param intervalMs 間隔時間（毫秒）
   * @param taskFunction 任務執行函數
   */
  scheduleTaskWithInterval(
    taskId: string,
    taskName: string,
    intervalMs: number,
    taskFunction: TaskFunction
  ): void {
    // 將毫秒轉換為cron表達式
    const cronExpression = this.intervalToCron(intervalMs);
    this.scheduleTask(taskId, taskName, cronExpression, taskFunction);
  }

  /**
   * 取消任務排程
   */
  unscheduleTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`嘗試取消不存在的任務: ${taskId}`, {
        component: 'TaskScheduler'
      });
      return false;
    }

    try {
      // 停止cron任務
      task.cronJob.stop();
      
      // 從任務列表中移除
      this.tasks.delete(taskId);

      this.emit('task-unscheduled', taskId);
      this.logger.info(`任務已取消排程: ${task.info.name}`, {
        component: 'TaskScheduler',
        taskId
      });

      return true;
    } catch (error) {
      this.logger.error(`取消任務排程失敗: ${taskId}`, error, {
        component: 'TaskScheduler'
      });
      this.emit('scheduler-error', error as Error);
      return false;
    }
  }

  /**
   * 暫停任務
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    try {
      task.cronJob.stop();
      task.info.status = TaskStatus.PAUSED;
      
      this.logger.info(`任務已暫停: ${task.info.name}`, {
        component: 'TaskScheduler',
        taskId
      });

      return true;
    } catch (error) {
      this.logger.error(`暫停任務失敗: ${taskId}`, error, {
        component: 'TaskScheduler'
      });
      return false;
    }
  }

  /**
   * 恢復任務
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    try {
      task.cronJob.start();
      task.info.status = TaskStatus.IDLE;
      task.info.nextRun = this.calculateNextRun(task.info.cronExpression);
      
      this.logger.info(`任務已恢復: ${task.info.name}`, {
        component: 'TaskScheduler',
        taskId
      });

      return true;
    } catch (error) {
      this.logger.error(`恢復任務失敗: ${taskId}`, error, {
        component: 'TaskScheduler'
      });
      return false;
    }
  }

  /**
   * 手動執行任務
   */
  async runTaskNow(taskId: string): Promise<TaskExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任務不存在: ${taskId}`);
    }

    return await this.executeTask(taskId);
  }

  /**
   * 取得任務資訊
   */
  getTaskInfo(taskId: string): TaskInfo | undefined {
    const task = this.tasks.get(taskId);
    return task ? { ...task.info } : undefined;
  }

  /**
   * 取得所有任務資訊
   */
  getAllTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).map(task => ({ ...task.info }));
  }

  /**
   * 取得運行中的任務數量
   */
  getRunningTaskCount(): number {
    return Array.from(this.tasks.values())
      .filter(task => task.info.status === TaskStatus.RUNNING).length;
  }

  /**
   * 檢查任務是否存在
   */
  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  /**
   * 停止所有任務並清理資源
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    this.logger.info('開始關閉任務排程器...', {
      component: 'TaskScheduler'
    });

    const taskIds = Array.from(this.tasks.keys());
    
    // 停止所有任務
    for (const taskId of taskIds) {
      this.unscheduleTask(taskId);
    }

    // 等待所有運行中的任務完成（最多等待30秒）
    const maxWaitTime = 30000;
    const startTime = Date.now();
    
    while (this.getRunningTaskCount() > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.info('任務排程器已關閉', {
      component: 'TaskScheduler',
      remainingTasks: this.getRunningTaskCount()
    });
  }

  /**
   * 執行任務
   */
  private async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任務不存在: ${taskId}`);
    }

    const startTime = Date.now();
    let result: TaskExecutionResult;

    try {
      // 更新任務狀態
      task.info.status = TaskStatus.RUNNING;
      task.info.lastRun = new Date();
      task.info.nextRun = this.calculateNextRun(task.info.cronExpression);

      this.emit('task-started', taskId);
      this.logger.debug(`開始執行任務: ${task.info.name}`, {
        component: 'TaskScheduler',
        taskId
      });

      // 執行任務函數
      await task.taskFunction();

      // 任務執行成功
      const duration = Date.now() - startTime;
      task.info.status = TaskStatus.IDLE;
      task.info.runCount++;
      task.info.lastError = undefined;

      result = {
        taskId,
        success: true,
        duration,
        timestamp: new Date()
      };

      this.emit('task-completed', result);
      this.logger.info(`任務執行完成: ${task.info.name}`, {
        component: 'TaskScheduler',
        taskId,
        duration
      });

    } catch (error) {
      // 任務執行失敗
      const duration = Date.now() - startTime;
      task.info.status = TaskStatus.ERROR;
      task.info.errorCount++;
      task.info.lastError = error as Error;

      result = {
        taskId,
        success: false,
        duration,
        error: error as Error,
        timestamp: new Date()
      };

      this.emit('task-failed', result);
      this.logger.error(`任務執行失敗: ${task.info.name}`, error, {
        component: 'TaskScheduler',
        taskId,
        duration
      });
    }

    return result;
  }

  /**
   * 將間隔時間（毫秒）轉換為cron表達式
   */
  private intervalToCron(intervalMs: number): string {
    if (intervalMs < 1000) {
      throw new Error('間隔時間不能少於1秒');
    }

    const seconds = Math.floor(intervalMs / 1000);
    
    if (seconds < 60) {
      // 每N秒執行一次
      return `*/${seconds} * * * * *`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      // 每N分鐘執行一次
      return `0 */${minutes} * * * *`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      // 每N小時執行一次
      return `0 0 */${hours} * * *`;
    }

    // 每天執行一次（如果間隔超過24小時）
    return '0 0 0 * * *';
  }

  /**
   * 計算下次執行時間
   */
  private calculateNextRun(cronExpression: string): Date | undefined {
    try {
      // 這裡可以使用cron-parser庫來計算下次執行時間
      // 目前簡化實現，返回當前時間加上估算的間隔
      const now = new Date();
      
      // 簡單的估算邏輯（實際應該使用cron-parser）
      if (cronExpression.includes('*/')) {
        const parts = cronExpression.split(' ');
        if (parts[1] && parts[1].includes('*/')) {
          const minutes = parseInt(parts[1].split('/')[1]);
          return new Date(now.getTime() + minutes * 60 * 1000);
        }
      }
      
      // 預設返回1小時後
      return new Date(now.getTime() + 60 * 60 * 1000);
    } catch (error) {
      this.logger.error('計算下次執行時間失敗', error, {
        component: 'TaskScheduler',
        cronExpression
      });
      return undefined;
    }
  }

  /**
   * 設定錯誤處理
   */
  private setupErrorHandling(): void {
    this.on('scheduler-error', (error: Error) => {
      this.logger.error('任務排程器發生錯誤', error, {
        component: 'TaskScheduler'
      });
    });
  }

  /**
   * 取得任務統計資訊
   */
  getStatistics(): {
    totalTasks: number;
    runningTasks: number;
    pausedTasks: number;
    errorTasks: number;
    totalRuns: number;
    totalErrors: number;
  } {
    const tasks = Array.from(this.tasks.values());
    
    return {
      totalTasks: tasks.length,
      runningTasks: tasks.filter(t => t.info.status === TaskStatus.RUNNING).length,
      pausedTasks: tasks.filter(t => t.info.status === TaskStatus.PAUSED).length,
      errorTasks: tasks.filter(t => t.info.status === TaskStatus.ERROR).length,
      totalRuns: tasks.reduce((sum, t) => sum + t.info.runCount, 0),
      totalErrors: tasks.reduce((sum, t) => sum + t.info.errorCount, 0)
    };
  }

  /**
   * 驗證cron表達式
   */
  static validateCronExpression(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * 取得cron表達式的人類可讀描述
   */
  static describeCronExpression(expression: string): string {
    // 這裡可以實現cron表達式的人類可讀轉換
    // 目前返回簡化的描述
    if (expression.includes('*/')) {
      const parts = expression.split(' ');
      if (parts[1] && parts[1].includes('*/')) {
        const minutes = parts[1].split('/')[1];
        return `每 ${minutes} 分鐘執行一次`;
      }
    }
    
    return `Cron表達式: ${expression}`;
  }
}

// 匯出事件類型以供TypeScript使用
export declare interface TaskScheduler {
  on<K extends keyof TaskSchedulerEvents>(event: K, listener: TaskSchedulerEvents[K]): this;
  emit<K extends keyof TaskSchedulerEvents>(event: K, ...args: Parameters<TaskSchedulerEvents[K]>): boolean;
}