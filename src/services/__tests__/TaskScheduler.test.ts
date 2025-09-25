import { TaskScheduler, TaskStatus } from '../TaskScheduler';
import { Logger } from '../Logger';

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
  validate: jest.fn()
}));

// Mock Logger
jest.mock('../Logger');

describe('TaskScheduler', () => {
  let taskScheduler: TaskScheduler;
  let mockLogger: jest.Mocked<Logger>;
  let mockCronJob: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock cron job
    mockCronJob = {
      start: jest.fn(),
      stop: jest.fn()
    };

    // Mock node-cron
    const cron = require('node-cron');
    cron.schedule.mockReturnValue(mockCronJob);
    cron.validate.mockReturnValue(true);

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    taskScheduler = new TaskScheduler();
  });

  afterEach(async () => {
    await taskScheduler.shutdown();
  });

  describe('scheduleTask', () => {
    it('應該成功排程新任務', () => {
      const taskFunction = jest.fn();
      
      taskScheduler.scheduleTask(
        'test-task',
        '測試任務',
        '0 */5 * * * *',
        taskFunction
      );

      expect(taskScheduler.hasTask('test-task')).toBe(true);
      
      const taskInfo = taskScheduler.getTaskInfo('test-task');
      expect(taskInfo).toMatchObject({
        id: 'test-task',
        name: '測試任務',
        cronExpression: '0 */5 * * * *',
        status: TaskStatus.IDLE,
        runCount: 0,
        errorCount: 0
      });
    });

    it('應該拒絕重複的任務ID', () => {
      const taskFunction = jest.fn();
      
      taskScheduler.scheduleTask('test-task', '測試任務1', '0 */5 * * * *', taskFunction);
      
      expect(() => {
        taskScheduler.scheduleTask('test-task', '測試任務2', '0 */10 * * * *', taskFunction);
      }).toThrow('任務 test-task 已存在');
    });

    it('應該拒絕無效的cron表達式', () => {
      const cron = require('node-cron');
      cron.validate.mockReturnValue(false);
      
      const taskFunction = jest.fn();
      
      expect(() => {
        taskScheduler.scheduleTask('test-task', '測試任務', 'invalid-cron', taskFunction);
      }).toThrow('無效的cron表達式: invalid-cron');
    });
  });

  describe('scheduleTaskWithInterval', () => {
    it('應該將間隔時間轉換為cron表達式', () => {
      const taskFunction = jest.fn();
      
      // 測試5分鐘間隔
      taskScheduler.scheduleTaskWithInterval(
        'interval-task',
        '間隔任務',
        5 * 60 * 1000, // 5分鐘
        taskFunction
      );

      expect(taskScheduler.hasTask('interval-task')).toBe(true);
      
      const taskInfo = taskScheduler.getTaskInfo('interval-task');
      expect(taskInfo?.cronExpression).toBe('0 */5 * * * *');
    });

    it('應該處理秒級間隔', () => {
      const taskFunction = jest.fn();
      
      // 測試30秒間隔
      taskScheduler.scheduleTaskWithInterval(
        'seconds-task',
        '秒級任務',
        30 * 1000, // 30秒
        taskFunction
      );

      const taskInfo = taskScheduler.getTaskInfo('seconds-task');
      expect(taskInfo?.cronExpression).toBe('*/30 * * * * *');
    });

    it('應該拒絕小於1秒的間隔', () => {
      const taskFunction = jest.fn();
      
      expect(() => {
        taskScheduler.scheduleTaskWithInterval(
          'invalid-interval',
          '無效間隔',
          500, // 500毫秒
          taskFunction
        );
      }).toThrow('間隔時間不能少於1秒');
    });
  });

  describe('unscheduleTask', () => {
    it('應該成功取消任務排程', () => {
      const taskFunction = jest.fn();
      
      taskScheduler.scheduleTask('test-task', '測試任務', '0 */5 * * * *', taskFunction);
      expect(taskScheduler.hasTask('test-task')).toBe(true);
      
      const result = taskScheduler.unscheduleTask('test-task');
      expect(result).toBe(true);
      expect(taskScheduler.hasTask('test-task')).toBe(false);
      expect(mockCronJob.stop).toHaveBeenCalled();
    });

    it('應該處理不存在的任務', () => {
      const result = taskScheduler.unscheduleTask('non-existent');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '嘗試取消不存在的任務: non-existent',
        { component: 'TaskScheduler' }
      );
    });
  });

  describe('pauseTask and resumeTask', () => {
    beforeEach(() => {
      const taskFunction = jest.fn();
      taskScheduler.scheduleTask('test-task', '測試任務', '0 */5 * * * *', taskFunction);
    });

    it('應該成功暫停任務', () => {
      const result = taskScheduler.pauseTask('test-task');
      expect(result).toBe(true);
      expect(mockCronJob.stop).toHaveBeenCalled();
      
      const taskInfo = taskScheduler.getTaskInfo('test-task');
      expect(taskInfo?.status).toBe(TaskStatus.PAUSED);
    });

    it('應該成功恢復任務', () => {
      taskScheduler.pauseTask('test-task');
      
      const result = taskScheduler.resumeTask('test-task');
      expect(result).toBe(true);
      expect(mockCronJob.start).toHaveBeenCalled();
      
      const taskInfo = taskScheduler.getTaskInfo('test-task');
      expect(taskInfo?.status).toBe(TaskStatus.IDLE);
    });

    it('應該處理不存在的任務', () => {
      const pauseResult = taskScheduler.pauseTask('non-existent');
      expect(pauseResult).toBe(false);
      
      const resumeResult = taskScheduler.resumeTask('non-existent');
      expect(resumeResult).toBe(false);
    });
  });

  describe('runTaskNow', () => {
    it('應該手動執行任務', async () => {
      const taskFunction = jest.fn().mockResolvedValue(undefined);
      
      taskScheduler.scheduleTask('test-task', '測試任務', '0 */5 * * * *', taskFunction);
      
      const result = await taskScheduler.runTaskNow('test-task');
      
      expect(taskFunction).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('test-task');
      expect(typeof result.duration).toBe('number');
    });

    it('應該處理任務執行錯誤', async () => {
      const error = new Error('任務執行失敗');
      const taskFunction = jest.fn().mockRejectedValue(error);
      
      taskScheduler.scheduleTask('test-task', '測試任務', '0 */5 * * * *', taskFunction);
      
      const result = await taskScheduler.runTaskNow('test-task');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      
      const taskInfo = taskScheduler.getTaskInfo('test-task');
      expect(taskInfo?.status).toBe(TaskStatus.ERROR);
      expect(taskInfo?.errorCount).toBe(1);
    });

    it('應該拒絕不存在的任務', async () => {
      await expect(taskScheduler.runTaskNow('non-existent'))
        .rejects.toThrow('任務不存在: non-existent');
    });
  });

  describe('getAllTasks', () => {
    it('應該返回所有任務資訊', () => {
      const taskFunction = jest.fn();
      
      taskScheduler.scheduleTask('task1', '任務1', '0 */5 * * * *', taskFunction);
      taskScheduler.scheduleTask('task2', '任務2', '0 */10 * * * *', taskFunction);
      
      const tasks = taskScheduler.getAllTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.id)).toEqual(['task1', 'task2']);
    });

    it('應該返回任務的副本而不是原始物件', () => {
      const taskFunction = jest.fn();
      taskScheduler.scheduleTask('test-task', '測試任務', '0 */5 * * * *', taskFunction);
      
      const tasks = taskScheduler.getAllTasks();
      const taskInfo = taskScheduler.getTaskInfo('test-task');
      
      // 修改返回的任務資訊不應影響原始資料
      tasks[0].name = '修改後的名稱';
      expect(taskInfo?.name).toBe('測試任務');
    });
  });

  describe('getStatistics', () => {
    it('應該返回正確的統計資訊', async () => {
      const taskFunction1 = jest.fn().mockResolvedValue(undefined);
      const taskFunction2 = jest.fn().mockRejectedValue(new Error('失敗'));
      
      taskScheduler.scheduleTask('task1', '任務1', '0 */5 * * * *', taskFunction1);
      taskScheduler.scheduleTask('task2', '任務2', '0 */10 * * * *', taskFunction2);
      
      // 執行任務以產生統計資料
      await taskScheduler.runTaskNow('task1');
      await taskScheduler.runTaskNow('task2');
      
      // 檢查任務資訊
      const task1Info = taskScheduler.getTaskInfo('task1');
      const task2Info = taskScheduler.getTaskInfo('task2');
      
      // 暫停一個任務
      taskScheduler.pauseTask('task1');
      
      const stats = taskScheduler.getStatistics();
      
      expect(stats.totalTasks).toBe(2);
      expect(stats.pausedTasks).toBe(1);
      expect(stats.errorTasks).toBe(1);
      // 根據實際的runCount來驗證
      expect(stats.totalRuns).toBe((task1Info?.runCount || 0) + (task2Info?.runCount || 0));
      expect(stats.totalErrors).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('應該停止所有任務並清理資源', async () => {
      const taskFunction = jest.fn();
      
      taskScheduler.scheduleTask('task1', '任務1', '0 */5 * * * *', taskFunction);
      taskScheduler.scheduleTask('task2', '任務2', '0 */10 * * * *', taskFunction);
      
      expect(taskScheduler.getAllTasks()).toHaveLength(2);
      
      await taskScheduler.shutdown();
      
      expect(taskScheduler.getAllTasks()).toHaveLength(0);
      expect(mockCronJob.stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('static methods', () => {
    it('validateCronExpression 應該驗證cron表達式', () => {
      const cron = require('node-cron');
      cron.validate.mockReturnValue(true);
      
      expect(TaskScheduler.validateCronExpression('0 */5 * * * *')).toBe(true);
      expect(cron.validate).toHaveBeenCalledWith('0 */5 * * * *');
    });

    it('describeCronExpression 應該提供人類可讀描述', () => {
      const description = TaskScheduler.describeCronExpression('0 */5 * * * *');
      expect(description).toBe('每 5 分鐘執行一次');
      
      const genericDescription = TaskScheduler.describeCronExpression('0 0 12 * * *');
      expect(genericDescription).toBe('Cron表達式: 0 0 12 * * *');
    });
  });
});