import { LineNotifier } from '../src/services/LineNotifier';
import { MessageTemplates } from '../src/services/MessageTemplates';
import { BookInfo, BookStatus, ErrorInfo } from '../src/types';

/**
 * LINE 通知系統使用範例
 * 
 * 此範例展示如何使用 LineNotifier 和 MessageTemplates 來發送各種類型的通知
 */

async function demonstrateLineNotifications() {
  // 初始化 LINE 通知器
  const channelAccessToken = 'YOUR_CHANNEL_ACCESS_TOKEN';
  const userId = 'YOUR_USER_ID';
  
  const lineNotifier = new LineNotifier(channelAccessToken, userId);
  
  // 設定使用 Flex Message（預設為 true）
  lineNotifier.setUseFlexMessages(true);
  
  // 設定重試參數
  lineNotifier.setRetryConfig(3, 1000);

  console.log('🚀 開始 LINE 通知系統示範...\n');

  // 1. 驗證 Access Token
  console.log('1. 驗證 LINE Access Token...');
  const isTokenValid = await lineNotifier.validateToken();
  console.log(`   Token 驗證結果: ${isTokenValid ? '✅ 有效' : '❌ 無效'}\n`);

  if (!isTokenValid) {
    console.log('❌ Token 無效，請檢查您的 Channel Access Token');
    return;
  }

  // 2. 發送新書通知
  console.log('2. 發送新書通知...');
  const newBook: BookInfo = {
    id: 1,
    title: '佛教基礎教義',
    author: '釋迦牟尼佛',
    description: '介紹佛教基本教義和修行方法',
    pdfUrl: 'https://www.budaedu.org/books/basic-buddhism.pdf',
    filePath: '/downloads/佛教基礎教義.pdf',
    status: BookStatus.COMPLETED
  };

  const bookNotificationResult = await lineNotifier.sendBookNotification(newBook);
  console.log(`   新書通知發送結果: ${bookNotificationResult ? '✅ 成功' : '❌ 失敗'}\n`);

  // 3. 發送錯誤通知
  console.log('3. 發送錯誤通知...');
  const errorInfo: ErrorInfo = {
    code: 'DOWNLOAD_ERROR',
    message: 'PDF 檔案下載失敗，伺服器連線逾時',
    timestamp: new Date(),
    retryCount: 2
  };

  const errorNotificationResult = await lineNotifier.sendErrorNotification(errorInfo);
  console.log(`   錯誤通知發送結果: ${errorNotificationResult ? '✅ 成功' : '❌ 失敗'}\n`);

  // 4. 發送系統狀態通知
  console.log('4. 發送系統狀態通知...');
  const statusDetails = {
    booksFound: 15,
    downloaded: 12,
    errors: 1
  };

  const statusNotificationResult = await lineNotifier.sendStatusNotification('監控完成', statusDetails);
  console.log(`   狀態通知發送結果: ${statusNotificationResult ? '✅ 成功' : '❌ 失敗'}\n`);

  // 5. 發送每日摘要通知
  console.log('5. 發送每日摘要通知...');
  const dailySummary = {
    date: new Date(),
    totalBooks: 150,
    newBooks: 5,
    downloaded: 4,
    failed: 1
  };

  const summaryNotificationResult = await lineNotifier.sendDailySummaryNotification(dailySummary);
  console.log(`   每日摘要通知發送結果: ${summaryNotificationResult ? '✅ 成功' : '❌ 失敗'}\n`);

  // 6. 示範文字訊息模式
  console.log('6. 切換到文字訊息模式...');
  lineNotifier.setUseFlexMessages(false);

  const textBookNotificationResult = await lineNotifier.sendBookNotification({
    ...newBook,
    title: '佛教進階修行指南',
    status: BookStatus.DOWNLOADING
  });
  console.log(`   文字模式新書通知發送結果: ${textBookNotificationResult ? '✅ 成功' : '❌ 失敗'}\n`);

  console.log('🎉 LINE 通知系統示範完成！');
}

/**
 * 示範訊息模板的直接使用
 */
function demonstrateMessageTemplates() {
  console.log('📝 訊息模板示範...\n');

  const sampleBook: BookInfo = {
    id: 2,
    title: '心經解釋',
    author: '玄奘大師',
    pdfUrl: 'https://example.com/heart-sutra.pdf',
    status: BookStatus.COMPLETED
  };

  // 建立 Flex Message
  const flexMessage = MessageTemplates.createBookNotificationFlexMessage(sampleBook);
  console.log('Flex Message 範例:');
  console.log(JSON.stringify(flexMessage, null, 2));
  console.log('\n');

  // 建立文字訊息
  const textMessage = MessageTemplates.createBookNotificationTextMessage(sampleBook);
  console.log('文字訊息範例:');
  console.log(textMessage.text);
  console.log('\n');

  // 建立錯誤通知 Flex Message
  const errorInfo: ErrorInfo = {
    code: 'CRITICAL_ERROR',
    message: '系統發生嚴重錯誤',
    timestamp: new Date()
  };

  const errorFlexMessage = MessageTemplates.createErrorNotificationFlexMessage(errorInfo);
  console.log('錯誤通知 Flex Message 範例:');
  console.log(JSON.stringify(errorFlexMessage, null, 2));
  console.log('\n');

  // 建立每日摘要
  const summary = {
    date: new Date(),
    totalBooks: 200,
    newBooks: 8,
    downloaded: 7,
    failed: 1
  };

  const summaryMessage = MessageTemplates.createDailySummaryFlexMessage(summary);
  console.log('每日摘要 Flex Message 範例:');
  console.log(JSON.stringify(summaryMessage, null, 2));
}

// 執行示範（需要有效的 LINE Channel Access Token 和 User ID）
if (require.main === module) {
  console.log('⚠️  請注意：此示範需要有效的 LINE Channel Access Token 和 User ID');
  console.log('   請在程式碼中替換 YOUR_CHANNEL_ACCESS_TOKEN 和 YOUR_USER_ID\n');
  
  // 只示範訊息模板，不實際發送訊息
  demonstrateMessageTemplates();
  
  // 如果要測試實際發送，請取消註解下面這行並提供有效的憑證
  // demonstrateLineNotifications();
}

export {
  demonstrateLineNotifications,
  demonstrateMessageTemplates
};