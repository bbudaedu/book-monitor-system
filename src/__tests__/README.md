# 測試文件

本目錄包含書籍監控系統的完整測試套件，涵蓋單元測試、整合測試、效能測試和端到端測試。

## 測試結構

```
src/__tests__/
├── README.md                    # 測試文件
├── setup.ts                     # Jest 測試環境設定
├── testUtils.ts                 # 測試工具函數
├── mockFactories.ts             # 模擬物件工廠
├── main.test.ts                 # 主程序測試
├── integration/                 # 整合測試
│   └── system.integration.test.ts
└── performance/                 # 效能測試
    └── performance.test.ts
```

## 測試類型

### 1. 單元測試 (Unit Tests)
- **位置**: `src/*/\__tests__/*.test.ts`
- **目的**: 測試個別模組和函數的功能
- **覆蓋範圍**: 所有核心服務、模型和控制器

#### 主要測試模組:
- `ConfigManager.test.ts` - 設定管理測試
- `DatabaseManager.test.ts` - 資料庫管理測試
- `Book.test.ts` - 書籍模型測試
- `MainController.test.ts` - 主控制器測試
- `LineNotifier.test.ts` - LINE 通知測試
- `PDFDownloader.test.ts` - PDF 下載測試
- `WebScraper.test.ts` - 網頁爬蟲測試
- `BookParser.test.ts` - 書籍解析測試
- `BookDetector.test.ts` - 書籍檢測測試

### 2. 整合測試 (Integration Tests)
- **位置**: `src/__tests__/integration/`
- **目的**: 測試模組間的協作和端到端流程
- **覆蓋範圍**: 完整的系統工作流程

#### 測試場景:
- 完整系統生命週期（初始化、啟動、停止、關閉）
- 監控任務流程（爬取、解析、檢測、下載、通知）
- 錯誤處理和恢復機制
- 並發和競爭條件處理
- 記憶體和資源管理

### 3. 效能測試 (Performance Tests)
- **位置**: `src/__tests__/performance/`
- **目的**: 驗證系統效能和資源使用
- **覆蓋範圍**: 關鍵操作的效能基準

#### 效能指標:
- 書籍檢測: < 1000ms (1000本書)
- 書籍解析: < 2000ms (500本書)
- 檔案操作: < 500ms
- 記憶體使用: < 100MB 增長
- 並發處理效能

### 4. 主程序測試 (Main Process Tests)
- **位置**: `src/__tests__/main.test.ts`
- **目的**: 測試 Electron 主程序功能
- **覆蓋範圍**: 應用程式初始化、IPC 通訊、視窗管理

## 測試工具

### 測試設定 (setup.ts)
- 全域測試環境配置
- 模擬物件設定
- 測試清理邏輯
- 錯誤處理設定

### 測試工具 (testUtils.ts)
提供常用的測試輔助函數：

```typescript
// 等待函數
sleep(ms: number): Promise<void>
waitFor(condition: () => boolean, timeout?: number): Promise<void>

// 模擬資料生成
createMockBookInfo(overrides?: Partial<BookInfo>): BookInfo
createMockBookList(count: number): BookInfo[]
createMockSystemConfig(overrides?: Partial<SystemConfig>): SystemConfig

// 檔案系統模擬
mockFileSystem(): MockFileSystem

// 測試驗證
expectObjectStructure(obj: any, expectedKeys: string[]): void
expectArrayContent<T>(array: T[], expectedLength: number): void
```

### 模擬工廠 (mockFactories.ts)
提供各種服務的模擬實作：

```typescript
// 服務模擬
createMockDatabaseManager(): jest.Mocked<DatabaseManager>
createMockConfigManager(): jest.Mocked<ConfigManager>
createMockLogger(): jest.Mocked<Logger>
createMockWebScraper(): jest.Mocked<WebScraper>
createMockPDFDownloader(): jest.Mocked<PDFDownloader>
createMockLineNotifier(): jest.Mocked<LineNotifier>

// 外部依賴模擬
createMockPuppeteerBrowser(): { mockBrowser, mockPage }
createMockAxios(): MockAxios
```

## 執行測試

### 基本命令

```bash
# 執行所有測試
npm test

# 執行測試並監視變更
npm run test:watch

# 執行測試並生成覆蓋率報告
npm run test:coverage

# 執行單元測試
npm run test:unit

# 執行整合測試
npm run test:integration

# CI 環境測試
npm run test:ci

# 除錯模式
npm run test:debug
```

### 測試篩選

```bash
# 執行特定測試檔案
npm test -- ConfigManager.test.ts

# 執行特定測試套件
npm test -- --testNamePattern="ConfigManager"

# 執行特定測試案例
npm test -- --testNamePattern="應該正確初始化"

# 執行失敗的測試
npm test -- --onlyFailures
```

## 覆蓋率目標

系統設定了以下覆蓋率目標：

- **分支覆蓋率**: 80%
- **函數覆蓋率**: 80%
- **行覆蓋率**: 80%
- **語句覆蓋率**: 80%

### 覆蓋率排除項目

以下檔案被排除在覆蓋率計算之外：
- `src/main.ts` - Electron 主程序
- `src/renderer/**` - 渲染程序檔案
- `src/types/**` - 型別定義檔案
- `src/constants/**` - 常數定義檔案
- `src/**/index.ts` - 匯出檔案

## 測試最佳實踐

### 1. 測試命名
- 使用描述性的測試名稱
- 中文測試名稱以便理解
- 遵循 "應該...在...時" 的格式

```typescript
describe('ConfigManager', () => {
  it('應該在提供有效設定時成功儲存', async () => {
    // 測試實作
  });
});
```

### 2. 測試結構
- 使用 AAA 模式 (Arrange, Act, Assert)
- 每個測試只驗證一個行為
- 適當使用 beforeEach 和 afterEach

```typescript
it('應該驗證書籍資料', () => {
  // Arrange
  const validBook = createMockBookInfo();
  
  // Act
  const result = Book.validate(validBook);
  
  // Assert
  expect(result.isValid).toBe(true);
});
```

### 3. 模擬使用
- 優先使用 mockFactories 中的模擬物件
- 避免過度模擬，只模擬必要的依賴
- 在每個測試後清理模擬狀態

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockDbManager = createMockDatabaseManager();
});
```

### 4. 異步測試
- 正確處理 Promise 和 async/await
- 使用適當的超時設定
- 測試錯誤情況

```typescript
it('應該處理異步錯誤', async () => {
  mockService.method.mockRejectedValue(new Error('測試錯誤'));
  
  await expect(service.performAction()).rejects.toThrow('測試錯誤');
});
```

### 5. 效能測試
- 設定合理的效能基準
- 記錄執行時間以便監控
- 測試記憶體使用情況

```typescript
it('應該在合理時間內完成', async () => {
  const startTime = performance.now();
  
  await service.performLargeOperation();
  
  const executionTime = performance.now() - startTime;
  expect(executionTime).toBeLessThan(1000); // 1秒
});
```

## 持續整合

測試套件設計為在 CI/CD 環境中運行：

- 使用 `npm run test:ci` 命令
- 生成覆蓋率報告
- 支援並行執行
- 適當的超時設定

## 故障排除

### 常見問題

1. **測試超時**
   - 檢查異步操作是否正確等待
   - 增加測試超時時間
   - 確保模擬物件正確設定

2. **記憶體洩漏**
   - 確保在 afterEach 中清理資源
   - 檢查事件監聽器是否正確移除
   - 使用 --detectOpenHandles 標誌

3. **模擬問題**
   - 確保模擬在正確的時機設定
   - 檢查模擬的返回值類型
   - 使用 jest.clearAllMocks() 清理狀態

### 除錯技巧

```bash
# 執行特定測試並顯示詳細輸出
npm test -- --verbose ConfigManager.test.ts

# 檢測未關閉的句柄
npm test -- --detectOpenHandles

# 檢測記憶體洩漏
npm test -- --detectLeaks

# 執行測試並保持進程運行以便除錯
npm run test:debug
```

## 貢獻指南

新增測試時請遵循以下步驟：

1. 確定測試類型（單元/整合/效能）
2. 使用適當的測試工具和模擬物件
3. 遵循命名和結構慣例
4. 確保測試覆蓋率達標
5. 更新相關文件

測試是確保系統品質的重要環節，請確保所有新功能都有相應的測試覆蓋。