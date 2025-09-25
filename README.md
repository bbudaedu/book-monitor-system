# 書籍監控系統

自動化書籍監控系統，用於監控佛教教育基金會網站的新書上架情況，並自動下載PDF檔案和發送LINE通知。

## 功能特色

- 🔍 自動監控目標網站新書
- 📥 自動下載PDF檔案
- 📱 LINE通知推送
- 🖥️ 直觀的桌面應用程式介面
- 📊 詳細的日誌記錄
- ⚙️ 靈活的設定管理

## 技術架構

- **前端**: Electron + HTML/CSS/JavaScript
- **後端**: Node.js + TypeScript
- **資料庫**: Neon PostgreSQL (雲端無伺服器)
- **網頁爬蟲**: Puppeteer
- **通知服務**: LINE Messaging API

## 開發環境設定

### 前置需求

- Node.js 18.0 或更高版本
- npm 或 yarn

### 安裝依賴

```bash
npm install
```

### 開發模式執行

```bash
npm run dev
```

### 建置應用程式

```bash
npm run build
npm start
```

### 執行測試

```bash
npm test
```

### 打包應用程式

```bash
npm run pack
```

## 專案結構

```
src/
├── main.ts                 # Electron 主程序
├── renderer/               # 渲染程序 (UI)
├── types/                  # TypeScript 類型定義
├── interfaces/             # 介面定義
├── controllers/            # 控制器
├── services/              # 服務層
├── database/              # 資料庫層
├── utils/                 # 工具函數
└── __tests__/             # 測試檔案
```

## 設定說明

首次啟動時需要設定：

1. **LINE Access Token** - 用於發送通知
2. **PDF下載路徑** - 指定PDF檔案儲存位置
3. **監控間隔時間** - 設定網站檢查頻率

### 資料庫設定

專案使用 **Neon PostgreSQL** 作為資料庫，支援以下功能：

- **雲端無伺服器架構** - 自動擴展，無需維護
- **連接池管理** - 高效能資料庫連接
- **自動遷移** - 資料庫結構版本控制
- **多表結構**：
  - `books` - 書籍資訊和下載狀態
  - `config` - 系統配置設定
  - `logs` - 詳細的操作日誌

資料庫連接透過環境變數 `DATABASE_URL` 配置，支援 SSL 加密連線。

## 授權

MIT License

## 貢獻

歡迎提交 Issue 和 Pull Request。