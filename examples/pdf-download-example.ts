import { PDFDownloader } from '../src/services/PDFDownloader';
import { FileManager } from '../src/services/FileManager';
import { BookInfo, BookStatus } from '../src/types';

/**
 * PDF下載功能使用範例
 * 
 * 此範例展示如何使用PDFDownloader和FileManager來：
 * 1. 下載PDF檔案
 * 2. 管理檔案命名和目錄
 * 3. 檢測重複檔案
 * 4. 追蹤下載進度
 */

async function main() {
  // 設定下載路徑
  const downloadPath = './downloads';
  
  // 建立下載器和檔案管理器實例
  const downloader = new PDFDownloader(downloadPath, 3); // 最多重試3次
  const fileManager = new FileManager(downloadPath);
  
  // 範例書籍資料
  const bookInfo: BookInfo = {
    id: 1,
    title: '佛教基礎教義',
    author: '釋迦牟尼佛',
    description: '佛教基本教義的介紹',
    pdfUrl: 'https://example.com/buddhist-basics.pdf', // 實際使用時請替換為真實URL
    status: BookStatus.PENDING
  };

  try {
    console.log('=== PDF下載功能示範 ===\n');

    // 1. 生成檔案名稱
    console.log('1. 生成檔案名稱');
    const fileName = fileManager.generateUniqueFileName(bookInfo);
    console.log(`生成的檔案名稱: ${fileName}\n`);

    // 2. 檢查重複檔案
    console.log('2. 檢查重複檔案');
    const duplicates = await fileManager.findDuplicateFiles(bookInfo);
    console.log(`找到 ${duplicates.length} 個可能的重複檔案`);
    if (duplicates.length > 0) {
      console.log('重複檔案列表:');
      duplicates.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
      });
    }
    console.log();

    // 3. 設定進度監聽器
    console.log('3. 設定下載進度監聽器');
    downloader.on('progress', (progress) => {
      console.log(`下載進度: ${progress.percentage.toFixed(2)}% (${progress.downloadedBytes}/${progress.totalBytes} bytes)`);
    });

    // 4. 檢查檔案是否已存在
    console.log('4. 檢查檔案是否已存在');
    const filePath = `${downloadPath}/${fileName}`;
    const fileExists = await downloader.checkFileExists(filePath);
    console.log(`檔案是否存在: ${fileExists ? '是' : '否'}\n`);

    // 5. 模擬下載過程（實際使用時會進行真實下載）
    console.log('5. 開始下載過程');
    console.log('注意: 此為示範模式，不會進行實際下載');
    console.log('實際使用時，請提供有效的PDF URL\n');

    /*
    // 實際下載代碼（取消註解以進行真實下載）
    try {
      const downloadedPath = await downloader.downloadPDF(bookInfo);
      console.log(`下載完成: ${downloadedPath}`);
      
      // 驗證PDF檔案
      const isValidPDF = await downloader.validatePDF(downloadedPath);
      console.log(`PDF驗證結果: ${isValidPDF ? '有效' : '無效'}`);
      
    } catch (error) {
      console.error(`下載失敗: ${error.message}`);
    }
    */

    // 6. 檔案管理功能示範
    console.log('6. 檔案管理功能');
    
    // 列出現有PDF檔案
    const pdfFiles = fileManager.listPDFFiles();
    console.log(`目錄中的PDF檔案數量: ${pdfFiles.length}`);
    
    // 計算目錄大小
    const dirSize = fileManager.getDirectorySize();
    console.log(`目錄總大小: ${(dirSize / 1024 / 1024).toFixed(2)} MB`);
    
    // 取得下載路徑
    console.log(`下載路徑: ${fileManager.getDownloadPath()}\n`);

    // 7. 活躍下載管理
    console.log('7. 活躍下載管理');
    const activeCount = downloader.getActiveDownloadCount();
    const activeIds = downloader.getActiveDownloadIds();
    console.log(`活躍下載數量: ${activeCount}`);
    console.log(`活躍下載ID: [${activeIds.join(', ')}]\n`);

    // 8. 檔案操作示範
    console.log('8. 檔案操作功能');
    
    // 建立子目錄
    const subDir = fileManager.createDirectory('completed');
    console.log(`建立子目錄: ${subDir}`);
    
    // 檔案資訊（如果檔案存在）
    const fileInfo = fileManager.getFileInfo(filePath);
    if (fileInfo) {
      console.log(`檔案資訊:`);
      console.log(`  大小: ${fileInfo.size} bytes`);
      console.log(`  建立時間: ${fileInfo.createdAt}`);
      console.log(`  修改時間: ${fileInfo.modifiedAt}`);
    } else {
      console.log('檔案不存在，無法取得檔案資訊');
    }

    console.log('\n=== 示範完成 ===');

  } catch (error) {
    console.error('發生錯誤:', error);
  } finally {
    // 清理：取消所有活躍下載
    downloader.cancelAllDownloads();
    console.log('已清理所有活躍下載');
  }
}

// 執行示範
if (require.main === module) {
  main().catch(console.error);
}

export { main as runPDFDownloadExample };