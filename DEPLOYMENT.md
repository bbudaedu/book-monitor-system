# 部署指南

本文件說明如何打包和部署「書籍監控系統」應用程式。

## 1. 前置準備

請確保您已安裝 Node.js 和 npm。

## 2. 安裝依賴

在專案根目錄執行以下命令：

```bash
npm install
```

## 3. 建置應用程式

執行以下命令來編譯 TypeScript 程式碼和複製前端資源：

```bash
npm run build
```

## 4. 打包應用程式

`electron-builder` 已設定為可為 Windows、macOS 和 Linux 進行打包。

### 打包目前平台

執行以下命令：

```bash
npm run pack
```

這會在 `dist-electron` 目錄下建立目前作業系統的安裝程式。

### 跨平台打包

- **打包 Windows 版本:**
  ```bash
  npm run pack -- --win
  ```

- **打包 macOS 版本:**
  ```bash
  npm run pack -- --mac
  ```

- **打包 Linux 版本:**
  ```bash
  npm run pack -- --linux
  ```

## 5. 自動更新

本應用程式已整合 `electron-updater` 來處理自動更新。

為了讓自動更新正常運作，您需要設定一個發布提供者 (例如 GitHub Releases)。在 `package.json` 的 `build` 設定中加入 `publish` 欄位：

```json
"build": {
  ...
  "publish": {
    "provider": "github",
    "owner": "your-github-username",
    "repo": "your-github-repo"
  }
}
```

當您建立一個新的 GitHub Release 並上傳打包好的安裝程式時，應用程式將能夠自動檢測並下載更新。