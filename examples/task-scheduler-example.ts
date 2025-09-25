/**
 * TaskScheduler 使用範例
 * 
 * 此範例展示如何使用 TaskScheduler 來管理定時任務
 */

import { TaskScheduler, TaskStatus } from '../src/services/TaskScheduler';
import { Logger } from '../src/services/Logger';

async function taskSchedulerExample() {
  console.log('=== TaskScheduler 使用範例 ===\n');

  // 1. 建立任務排程器
  const logger = Logger.getInstance();
  const scheduler = new TaskScheduler(logger);

  // 2. 設定事件監聽器
  scheduler.on('task-started', (taskId) => {
    console.log(`🚀 任務開始: ${taskId}`);
  });

  scheduler.on('task-completed', (result) => {
    console.log(`✅ 任務完成: ${result.taskId} (耗時: ${result.duration}ms)`);
  });

  scheduler.on('task-failed', (result) => {
    console.log(`❌ 任務失敗: ${result.taskId} - ${result.error?.message}`);
  });

  scheduler.on('task-scheduled', (taskInfo) => {
    console.log(`📅 任務已排程: ${taskInfo.name} (${taskInfo.cronExpression})`);
  });

  scheduler.on('scheduler-error', (error) => {
    console.error('🚨 排程器錯誤:', error.message);
  });

  try {
    // 3. 排程不同類型的任務

    // 每30秒執行一次的任務
    scheduler.scheduleTaskWithInterval(
      'heartbeat',
      '心跳檢查',
      30000, // 30秒
      async () => {
        console.log('💓 心跳檢查 - 系統正常運行');
        // 模擬一些工作
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    );

    // 每2分鐘執行一次的任務
    scheduler.scheduleTaskWithInterval(
      'status-report',
      '狀態報告',
      2 * 60 * 1000, // 2分鐘
      async () => {
        const stats = scheduler.getStatistics();
        console.log('📊 系統統計:', stats);
      }
    );

    // 使用cron表達式的任務（每分鐘執行一次）
    scheduler.scheduleTask(
      'minute-task',
      '每分鐘任務',
      '0 * * * * *', // 每分鐘的第0秒
      async () => {
        const now = new Date();
        console.log(`⏰ 每分鐘任務執行 - ${now.toLocaleTimeString()}`);
      }
    );

    // 會失敗的任務（用於測試錯誤處理）
    scheduler.scheduleTaskWithInterval(
      'failing-task',
      '失敗任務',
      45000, // 45秒
      async () => {
        // 隨機失敗
        if (Math.random() < 0.5) {
          throw new Error('隨機失敗測試');
        }
        console.log('🎯 失敗任務成功執行');
      }
    );

    // 4. 顯示所有任務
    console.log('\n📋 所有排程任務:');
    const allTasks = scheduler.getAllTasks();
    allTasks.forEach(task => {
      console.log(`  - ${task.name} (${task.id}): ${task.status}`);
      console.log(`    Cron: ${task.cronExpression}`);
      console.log(`    執行次數: ${task.runCount}, 錯誤次數: ${task.errorCount}`);
    });

    // 5. 手動執行任務
    console.log('\n🔧 手動執行心跳檢查任務...');
    const result = await scheduler.runTaskNow('heartbeat');
    console.log('手動執行結果:', result.success ? '成功' : '失敗');

    // 6. 讓系統運行一段時間
    console.log('\n⏳ 讓任務運行2分鐘...');
    await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));

    // 7. 暫停和恢復任務
    console.log('\n⏸️ 暫停心跳檢查任務...');
    scheduler.pauseTask('heartbeat');

    await new Promise(resolve => setTimeout(resolve, 30000)); // 等待30秒

    console.log('▶️ 恢復心跳檢查任務...');
    scheduler.resumeTask('heartbeat');

    // 8. 顯示最終統計
    console.log('\n📊 最終統計:');
    const finalStats = scheduler.getStatistics();
    console.log(finalStats);

    // 9. 顯示任務詳細資訊
    console.log('\n📋 任務詳細資訊:');
    allTasks.forEach(task => {
      const updatedTask = scheduler.getTaskInfo(task.id);
      if (updatedTask) {
        console.log(`  ${updatedTask.name}:`);
        console.log(`    狀態: ${updatedTask.status}`);
        console.log(`    執行次數: ${updatedTask.runCount}`);
        console.log(`    錯誤次數: ${updatedTask.errorCount}`);
        console.log(`    最後執行: ${updatedTask.lastRun?.toLocaleString() || '未執行'}`);
        console.log(`    下次執行: ${updatedTask.nextRun?.toLocaleString() || '未排程'}`);
      }
    });

    // 10. 測試靜態方法
    console.log('\n🔍 測試靜態方法:');
    console.log('驗證cron表達式 "0 */5 * * * *":', TaskScheduler.validateCronExpression('0 */5 * * * *'));
    console.log('描述cron表達式 "0 */5 * * * *":', TaskScheduler.describeCronExpression('0 */5 * * * *'));

  } catch (error) {
    console.error('❌ 範例執行失敗:', error);
  } finally {
    // 11. 關閉排程器
    console.log('\n🛑 關閉任務排程器...');
    await scheduler.shutdown();
    console.log('✅ 任務排程器已關閉');
  }
}

// 執行範例
if (require.main === module) {
  taskSchedulerExample().catch(console.error);
}

export { taskSchedulerExample };