# PDF下載功能使用指南

本指南說明如何使用書籍監控系統的PDF下載功能，包括PDFDownloader和FileManager兩個核心模組。

## 功能概述

### PDFDownloader
- **HTTP下載功能**：支援大檔案下載
- **進度追蹤**：即時監控下載進度
- **斷點續傳**：支援中斷後繼續下載
- **自動重試**：下載失敗時自動重試
- **檔案驗證**：確保下載的PDF檔案完整性

### FileManager
- **檔案命名**：自動生成唯一且有意義的檔案名稱
- **目錄管理**：自動建立和管理目錄結構
- **重複檔案檢測**：避免重複下載相同內容
- **檔案完整性驗證**：MD5雜湊值比較
- **檔案操作**：移動、刪除、重新命名等操作

## 快速開始

### 基本使用

```typescript
import { PDFDownloader } from '../src/services/PDFDownloader';
import { FileManager } from '../src/services/FileManager';
import { BookInfo, BookStatus } from '../src/types';

// 建立實例
const downloadPath = './downloads';
const downloader = new PDFDownloader(downloadPath, 3); // 最多重試3次
const fileManager = new FileManager(downloadPath);

// 書籍資訊
const bookInfo: BookInfo = {
  id: 1,
  title: '書籍標題',
  author: '作者姓名',
  pdfUrl: 'https://example.com/book.pdf',
  status: BookStatus.PENDING
};

// 下載PDF
try {
  const filePath = await downloader.downloadPDF(bookInfo);
  console.log(`下載完成: ${filePath}`);
} catch (error) {
  console.error(`下載失敗: ${error.message}`);
}
```

### 進度監控

```typescript
// 監聽下載進度
downloader.on('progress', (progress) => {
  console.log(`下載進度: ${progress.percentage.toFixed(2)}%`);
  console.log(`速度: ${(progress.speed / 1024).toFixed(2)} KB/s`);
  console.log(`剩餘時間: ${progress.estimatedTimeRemaining}秒`);
});
```

### 檔案管理

```typescript
// 生成唯一檔案名稱
const fileName = fileManager.generateUniqueFileName(bookInfo);

// 檢查重複檔案
const duplicates = await fileManager.findDuplicateFiles(bookInfo);

// 驗證檔案完整性
const isValid = await downloader.validatePDF(filePath);

// 計算檔案雜湊值
const hash = await fileManager.calculateFileHash(filePath);
```

## 進階功能

### 斷點續傳

PDFDownloader自動支援斷點續傳功能：

```typescript
// 如果下載中斷，再次呼叫downloadPDF會自動從中斷點繼續
const filePath = await downloader.downloadPDF(bookInfo);
```

### 下載管理

```typescript
// 取消特定下載
downloader.cancelDownload(bookId);

// 取消所有下載
downloader.cancelAllDownloads();

// 查看活躍下載
const activeCount = downloader.getActiveDownloadCount();
const activeIds = downloader.getActiveDownloadIds();
```

### 檔案操作

```typescript
// 移動檔案
const newPath = fileManager.moveFile(sourcePath, targetDir, newFileName);

// 刪除檔案
const deleted = fileManager.deleteFile(filePath);

// 取得檔案資訊
const fileInfo = fileManager.getFileInfo(filePath);

// 列出PDF檔案
const pdfFiles = fileManager.listPDFFiles();
```

## 設定選項

### PDFDownloader設定

```typescript
const downloader = new PDFDownloader(
  downloadPath,    // 下載路徑
  maxRetries       // 最大重試次數（預設：3）
);
```

### 支援的功能

- **大檔案下載**：使用串流處理，記憶體使用量低
- **進度追蹤**：提供詳細的下載進度資訊
- **錯誤處理**：自動重試和錯誤恢復
- **檔案驗證**：確保PDF檔案格式正確

## 錯誤處理

### 常見錯誤類型

1. **網路錯誤**：連線逾時、無法訪問URL
2. **檔案系統錯誤**：磁碟空間不足、權限問題
3. **檔案格式錯誤**：下載的檔案不是有效的PDF

### 錯誤處理策略

```typescript
try {
  const filePath = await downloader.downloadPDF(bookInfo);
} catch (error) {
  if (error.message.includes('網路')) {
    // 處理網路錯誤
    console.log('網路連線問題，請檢查網路設定');
  } else if (error.message.includes('空間')) {
    // 處理磁碟空間問題
    console.log('磁碟空間不足，請清理空間後重試');
  } else {
    // 其他錯誤
    console.log('未知錯誤:', error.message);
  }
}
```

## 效能優化

### 建議設定

1. **合理的重試次數**：建議設定為2-3次
2. **適當的下載路徑**：選擇有足夠空間的磁碟
3. **定期清理**：定期清理舊檔案和空目錄

### 記憶體使用

- 使用串流處理，記憶體使用量與檔案大小無關
- 建議同時下載的檔案數量不超過5個

## 測試

### 單元測試

```bash
npm test -- --testPathPattern="PDFDownloader|FileManager"
```

### 整合測試

```bash
npm test -- --testPathPattern="integration"
```

### 執行範例

```bash
npx ts-node examples/pdf-download-example.ts
```

## 故障排除

### 常見問題

1. **下載失敗**
   - 檢查網路連線
   - 確認URL有效性
   - 檢查磁碟空間

2. **檔案驗證失敗**
   - 重新下載檔案
   - 檢查來源檔案是否為有效PDF

3. **權限錯誤**
   - 確認下載目錄的寫入權限
   - 以管理員身份執行（如需要）

### 日誌檢查

系統會自動記錄詳細的操作日誌，可以通過日誌檢查問題：

```typescript
// 日誌會包含以下資訊：
// - 下載開始和完成時間
// - 錯誤詳細資訊
// - 檔案操作記錄
// - 重試嘗試記錄
```

## API參考

### PDFDownloader

| 方法 | 說明 | 參數 | 回傳值 |
|------|------|------|--------|
| `downloadPDF(bookInfo)` | 下載PDF檔案 | BookInfo | Promise\<string\> |
| `generateFileName(bookInfo)` | 生成檔案名稱 | BookInfo | string |
| `checkFileExists(filePath)` | 檢查檔案是否存在 | string | Promise\<boolean\> |
| `validatePDF(filePath)` | 驗證PDF檔案 | string | Promise\<boolean\> |
| `cancelDownload(bookId)` | 取消下載 | number | boolean |
| `cancelAllDownloads()` | 取消所有下載 | - | void |

### FileManager

| 方法 | 說明 | 參數 | 回傳值 |
|------|------|------|--------|
| `generateUniqueFileName(bookInfo)` | 生成唯一檔案名稱 | BookInfo | string |
| `findDuplicateFiles(bookInfo)` | 尋找重複檔案 | BookInfo | Promise\<string[]\> |
| `calculateFileHash(filePath)` | 計算檔案雜湊值 | string | Promise\<string\> |
| `areFilesIdentical(path1, path2)` | 比較檔案是否相同 | string, string | Promise\<boolean\> |
| `moveFile(source, target, newName?)` | 移動檔案 | string, string, string? | string |
| `deleteFile(filePath)` | 刪除檔案 | string | boolean |

## 相關文件

- [系統架構文件](../design.md)
- [需求規格文件](../requirements.md)
- [API文件](./API_REFERENCE.md)
- [部署指南](./DEPLOYMENT_GUIDE.md)