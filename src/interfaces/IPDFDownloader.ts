import { BookInfo, DownloadProgress } from '../types';

/**
 * PDF下載模組介面
 * 負責下載PDF檔案並管理本地儲存
 */
export interface IPDFDownloader {
  /**
   * 下載PDF檔案
   * @param bookInfo 書籍資訊
   * @returns 下載完成的檔案路徑
   */
  downloadPDF(bookInfo: BookInfo): Promise<string>;

  /**
   * 驗證PDF檔案完整性
   * @param filePath 檔案路徑
   * @returns 是否有效
   */
  validatePDF(filePath: string): Promise<boolean>;

  /**
   * 產生檔案名稱
   * @param bookInfo 書籍資訊
   * @returns 檔案名稱
   */
  generateFileName(bookInfo: BookInfo): string;

  /**
   * 檢查檔案是否已存在
   * @param fileName 檔案名稱
   * @returns 是否存在
   */
  checkFileExists(fileName: string): Promise<boolean>;

  /**
   * 設定下載路徑
   * @param path 下載路徑
   */
  setDownloadPath(path: string): void;

  /**
   * 獲取下載進度
   * @param bookId 書籍ID
   */
  getDownloadProgress(bookId: number): DownloadProgress | null;

  /**
   * 取消下載
   * @param bookId 書籍ID
   */
  cancelDownload(bookId: number): Promise<void>;
}