# 設計文件

## 概述

書籍監控系統是一個基於Node.js的桌面應用程式，使用Electron框架提供跨平台的使用者介面。系統採用模組化架構，包含網站爬蟲、檔案下載、LINE通知、日誌記錄等核心模組。系統使用Neon作為雲端PostgreSQL資料庫來儲存書籍資訊和設定，並提供直觀的GUI介面供使用者操作。

## 架構

### 系統架構圖

```mermaid
graph TB
    UI[Electron UI] --> Controller[主控制器]
    Controller --> Monitor[網站監控模組]
    Controller --> Downloader[PDF下載模組]
    Controller --> LineNotifier[LINE通知模組]
    Controller --> Logger[日誌模組]
    Controller --> ConfigManager[設定管理模組]
    Controller --> Database[(Neon PostgreSQL資料庫)]
    
    Monitor --> WebScraper[網頁爬蟲]
    Monitor --> BookParser[書籍解析器]
    
    Downloader --> ProgressTracker[進度追蹤器]
    Downloader --> FileValidator[檔案驗證器]
    
    LineNotifier --> MessageTemplates[訊息模板]
    LineNotifier --> LineAPI[LINE Messaging API]
    
    Logger --> LogRotator[日誌輪轉器]
```

### 技術堆疊

- **前端框架**: Electron + HTML/CSS/JavaScript
- **後端語言**: Node.js
- **資料庫**: Neon (PostgreSQL)
- **資料庫客戶端**: @neondatabase/serverless 或 pg (PostgreSQL客戶端)
- **網頁爬蟲**: Puppeteer (處理SPA網站)
- **HTTP客戶端**: Axios
- **日誌系統**: Winston
- **任務排程**: node-cron
- **加密**: crypto (Node.js內建)

## 元件和介面

### 1. 主控制器 (MainController)

**職責**: 協調各個模組的運作，管理應用程式生命週期

**介面**:
```javascript
class MainController {
    async start()
    async stop()
    async getStatus()
    async updateConfig(config)
}
```

### 2. 網站監控模組 (WebsiteMonitor)

**職責**: 定期檢查目標網站，檢測新書籍

**介面**:
```javascript
class WebsiteMonitor {
    async startMonitoring(interval)
    async stopMonitoring()
    async checkForNewBooks()
    async parseBookList(html)
}
```

**實作細節**:
- 使用Puppeteer啟動無頭瀏覽器
- 處理SPA (Single Page Application) 的動態內容載入
- 實作智慧重試機制處理網路錯誤
- 比較當前書籍列表與資料庫中的記錄

### 3. PDF下載模組 (PDFDownloader)

**職責**: 下載PDF檔案並管理本地儲存

**介面**:
```javascript
class PDFDownloader extends EventEmitter {
    async downloadPDF(bookInfo)
    async validatePDF(filePath)
    generateFileName(bookInfo)
    async checkFileExists(filePath)
    cancelDownload(bookId)
    cancelAllDownloads()
    getActiveDownloadCount()
    getActiveDownloadIds()
}
```

**實作細節**:
- 支援斷點續傳 (HTTP Range requests)
- 檔案完整性驗證 (PDF header validation)
- 自動建立目錄結構
- 重複檔案檢測
- 下載進度追蹤和事件發送
- 下載取消功能 (使用AbortController)
- 指數退避重試機制
- 並發下載管理
- 智慧檔案命名 (包含標題、作者、時間戳)
- 30秒下載超時設定

### 4. LINE通知模組 (LineNotifier)

**職責**: 透過LINE Messaging API發送通知

**介面**:
```javascript
class LineNotifier {
    // 設定方法
    setUserId(userId: string): void
    setRetryConfig(maxRetries: number, retryDelay: number): void
    setUseFlexMessages(useFlexMessages: boolean): void
    
    // 核心通知功能
    async sendBookNotification(bookInfo: BookInfo): Promise<boolean>
    async sendErrorNotification(errorInfo: ErrorInfo): Promise<boolean>
    async sendStatusNotification(status: string, details?: any): Promise<boolean>
    async sendDailySummaryNotification(summary: DailySummary): Promise<boolean>
    
    // 驗證功能
    async validateToken(): Promise<boolean>
}
```

**實作細節**:
- 使用 @line/bot-sdk 的 MessagingApiClient
- 支援 Flex Message 和純文字訊息格式
- 指數退避重試機制 (exponential backoff)
- Token有效性驗證
- 整合 MessageTemplates 進行訊息格式化
- 支援每日摘要通知功能

### 5. 日誌模組 (Logger)

**職責**: 記錄系統運作日誌

**介面**:
```javascript
class Logger {
    info(message, metadata)
    error(message, error)
    warn(message, metadata)
    debug(message, metadata)
}
```

**實作細節**:
- 多層級日誌 (info, warn, error, debug)
- 自動日誌輪轉
- 結構化日誌格式
- 檔案和控制台雙重輸出

### 6. 設定管理模組 (ConfigManager)

**職責**: 管理應用程式設定和敏感資訊

**介面**:
```javascript
class ConfigManager {
    async loadConfig()
    async saveConfig(config)
    async encryptSensitiveData(data)
    async decryptSensitiveData(encryptedData)
}
```

### 7. 訊息模板模組 (MessageTemplates)

**職責**: 管理LINE通知的訊息格式和模板

**介面**:
```javascript
class MessageTemplates {
    static createBookNotificationTextMessage(bookInfo: BookInfo): LineMessage
    static createBookNotificationFlexMessage(bookInfo: BookInfo): LineMessage
    static createErrorNotificationTextMessage(errorInfo: ErrorInfo): LineMessage
    static createErrorNotificationFlexMessage(errorInfo: ErrorInfo): LineMessage
    static createStatusNotificationTextMessage(status: string, details?: any): LineMessage
    static createStatusNotificationFlexMessage(status: string, details?: any): LineMessage
    static createDailySummaryFlexMessage(summary: DailySummary): LineMessage
}
```

**實作細節**:
- 提供純文字和 Flex Message 兩種格式
- 支援書籍通知、錯誤通知、狀態通知和每日摘要
- 使用靜態方法提供模板生成功能
- 遵循 LINE Messaging API 的訊息格式規範

### 8. 資料庫連接模組 (DatabaseManager)

**職責**: 管理Neon PostgreSQL資料庫連接和操作

**介面**:
```javascript
class DatabaseManager {
    async connect()
    async disconnect()
    async query(sql, params)
    async transaction(callback)
    async migrate()
    async healthCheck()
}
```

**實作細節**:
- 使用連接池管理資料庫連接
- 支援事務處理
- 自動重連機制
- 資料庫遷移管理
- 連接狀態監控

## 資料模型

### 書籍資料模型 (Book)

```sql
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    description TEXT,
    pdf_url TEXT NOT NULL,
    download_url TEXT,
    file_path TEXT,
    file_size BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    downloaded_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' -- pending, downloading, completed, failed
);
```

### 設定資料模型 (Config)

```sql
CREATE TABLE config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 日誌資料模型 (Logs)

```sql
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB, -- JSON格式，使用JSONB提供更好的查詢效能
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 錯誤處理

### 錯誤分類

1. **網路錯誤**: 網站無法訪問、連線逾時
2. **解析錯誤**: 網頁結構變更、資料格式錯誤
3. **下載錯誤**: PDF檔案損壞、儲存空間不足、網路中斷、伺服器不支援斷點續傳
4. **API錯誤**: LINE API呼叫失敗、Token過期
5. **資料庫錯誤**: Neon連接失敗、查詢逾時、事務回滾
6. **系統錯誤**: 檔案系統錯誤、記憶體不足

### 錯誤處理策略

```javascript
class ErrorHandler {
    async handleNetworkError(error, retryCount = 0)
    async handleParsingError(error, context)
    async handleDownloadError(error, bookInfo)
    async handleAPIError(error, apiType)
    async handleDatabaseError(error, operation)
    async handleSystemError(error)
}
```

**重試機制**:
- 指數退避算法 (Exponential Backoff)
- 最大重試次數限制
- 不同錯誤類型的不同重試策略

## 測試策略

### 單元測試

- **測試框架**: Jest
- **覆蓋率目標**: 80%以上
- **測試範圍**: 所有核心模組的公開方法

### 整合測試

- **網站監控**: 使用模擬網站測試爬蟲功能
- **PDF下載**: 測試檔案下載和儲存
- **LINE API**: 使用測試Token驗證API整合
- **Neon資料庫**: 測試CRUD操作、事務處理和連接池管理
- **資料庫遷移**: 測試schema變更和資料遷移

### 端到端測試

- **完整流程**: 從檢測新書到發送通知的完整流程
- **錯誤場景**: 網路中斷、API失敗等異常情況
- **效能測試**: 大量書籍處理的效能表現

### 測試資料

```javascript
// 測試用書籍資料
const mockBookData = {
    title: "測試書籍",
    author: "測試作者",
    pdfUrl: "https://example.com/test.pdf",
    description: "這是一本測試書籍"
};

// 測試用設定
const testConfig = {
    monitorInterval: 300000, // 5分鐘
    downloadPath: "./downloads",
    lineAccessToken: "test_token",
    maxRetries: 3,
    neonConnectionString: "postgresql://test_user:test_password@test-host.neon.tech/test_db"
};
```

### 測試環境設定

**Jest Setup Configuration** (`src/__tests__/setup.ts`):
- 全域測試環境配置和清理
- EventEmitter 最大監聽器數量優化
- 控制台輸出管理（減少測試噪音）
- 環境變數隔離和清理
- 未處理 Promise 拒絕和異常捕獲
- 30秒全域測試超時設定

**測試隔離策略**:
- 每個測試後自動清理模擬物件
- 環境變數在測試間重置
- 資源洩漏防護機制

### 自動化測試

- **CI/CD整合**: GitHub Actions
- **測試環境**: 多平台測試 (Windows, macOS, Linux)
- **回歸測試**: 每次程式碼變更後自動執行
- **效能基準**: 監控關鍵操作的效能指標