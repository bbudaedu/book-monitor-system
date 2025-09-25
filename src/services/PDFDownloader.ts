import axios, { AxiosResponse } from 'axios';
import { createWriteStream, existsSync, mkdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { BookInfo, DownloadProgress } from '../types';
import { Logger } from './Logger';
import { EventEmitter } from 'events';

/**
 * PDF下載管理器
 * 負責處理PDF檔案的下載、進度追蹤和斷點續傳功能
 */
export class PDFDownloader extends EventEmitter {
  private logger: Logger;
  private activeDownloads: Map<number, AbortController> = new Map();
  private downloadPath: string;
  private maxRetries: number;

  constructor(downloadPath: string, maxRetries: number = 3) {
    super();
    this.logger = new Logger();
    this.downloadPath = downloadPath;
    this.maxRetries = maxRetries;
    
    // 確保下載目錄存在
    this.ensureDirectoryExists(this.downloadPath);
  }

  /**
   * 下載PDF檔案
   * @param bookInfo 書籍資訊
   * @returns Promise<string> 下載完成的檔案路徑
   */
  async downloadPDF(bookInfo: BookInfo): Promise<string> {
    const fileName = this.generateFileName(bookInfo);
    const filePath = join(this.downloadPath, fileName);
    
    // 檢查檔案是否已存在
    if (await this.checkFileExists(filePath)) {
      this.logger.info(`檔案已存在，跳過下載: ${fileName}`);
      return filePath;
    }

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount <= this.maxRetries) {
      try {
        const downloadedPath = await this.performDownload(bookInfo, filePath, retryCount);
        
        // 驗證下載的PDF檔案
        if (await this.validatePDF(downloadedPath)) {
          this.logger.info(`PDF下載並驗證成功: ${fileName}`);
          return downloadedPath;
        } else {
          throw new Error('PDF檔案驗證失敗');
        }
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        if (retryCount <= this.maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // 指數退避
          this.logger.warn(`下載失敗，${delay}ms後重試 (${retryCount}/${this.maxRetries}): ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`下載失敗，已重試${this.maxRetries}次: ${lastError?.message}`);
  }

  /**
   * 執行實際的下載操作
   */
  private async performDownload(bookInfo: BookInfo, filePath: string, _retryCount: number): Promise<string> {
    const abortController = new AbortController();
    
    if (bookInfo.id) {
      this.activeDownloads.set(bookInfo.id, abortController);
    }

    try {
      // 檢查是否支援斷點續傳
      const existingSize = await this.getExistingFileSize(filePath);
      const headers: any = {};
      
      if (existingSize > 0) {
        headers['Range'] = `bytes=${existingSize}-`;
        this.logger.info(`嘗試斷點續傳，從位置 ${existingSize} 開始下載`);
      }

      const response = await axios({
        method: 'GET',
        url: bookInfo.pdfUrl,
        responseType: 'stream',
        headers,
        signal: abortController.signal,
        timeout: 30000, // 30秒超時
        onDownloadProgress: (progressEvent) => {
          if (bookInfo.id) {
            this.handleDownloadProgress(bookInfo.id, progressEvent, existingSize);
          }
        }
      });

      // 檢查是否支援斷點續傳
      const isPartialContent = response.status === 206;
      const writeMode = isPartialContent ? 'a' : 'w'; // append 或 write
      
      if (!isPartialContent && existingSize > 0) {
        this.logger.info('伺服器不支援斷點續傳，重新下載完整檔案');
      }

      const writer = createWriteStream(filePath, { flags: writeMode });
      const totalSize = this.getTotalSize(response, existingSize);

      return new Promise((resolve, reject) => {
        let downloadedBytes = existingSize;

        response.data.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          
          if (bookInfo.id) {
            this.emitProgress(bookInfo.id, downloadedBytes, totalSize, bookInfo.title);
          }
        });

        response.data.on('error', (error: Error) => {
          writer.destroy();
          reject(error);
        });

        writer.on('error', (error: Error) => {
          reject(error);
        });

        writer.on('finish', () => {
          resolve(filePath);
        });

        response.data.pipe(writer);
      });

    } finally {
      if (bookInfo.id) {
        this.activeDownloads.delete(bookInfo.id);
      }
    }
  }

  /**
   * 處理下載進度
   */
  private handleDownloadProgress(bookId: number, progressEvent: any, existingSize: number) {
    const { loaded, total } = progressEvent;
    const actualLoaded = (loaded || 0) + existingSize;
    const actualTotal = (total || 0) + existingSize;
    
    if (actualTotal > 0) {
      this.emitProgress(bookId, actualLoaded, actualTotal);
    }
  }

  /**
   * 發送進度事件
   */
  private emitProgress(bookId: number, downloadedBytes: number, totalBytes: number, fileName?: string) {
    const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
    const progress: DownloadProgress = {
      bookId,
      fileName: fileName || '',
      totalBytes,
      downloadedBytes,
      percentage: Math.round(percentage * 100) / 100,
      speed: 0, // 將在後續版本中實作速度計算
      estimatedTimeRemaining: 0 // 將在後續版本中實作時間估算
    };

    this.emit('progress', progress);
  }

  /**
   * 取得檔案總大小
   */
  private getTotalSize(response: AxiosResponse, existingSize: number): number {
    const contentLength = response.headers['content-length'];
    const contentRange = response.headers['content-range'];
    
    if (contentRange) {
      // 格式: bytes 200-1023/1024
      const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    if (contentLength) {
      return parseInt(contentLength, 10) + existingSize;
    }
    
    return 0;
  }

  /**
   * 取得已存在檔案的大小
   */
  private async getExistingFileSize(filePath: string): Promise<number> {
    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        return stats.size;
      }
    } catch (error) {
      this.logger.warn(`無法取得檔案大小: ${error}`);
    }
    return 0;
  }

  /**
   * 生成檔案名稱
   */
  generateFileName(bookInfo: BookInfo): string {
    // 清理檔案名稱中的非法字元
    const cleanTitle = bookInfo.title
      .replace(/[<>:"/\\|?*]/g, '_') // 替換非法字元
      .replace(/\s+/g, '_') // 替換空格
      .substring(0, 100); // 限制長度

    const author = bookInfo.author ? `_${bookInfo.author.replace(/[<>:"/\\|?*\s]/g, '_')}` : '';
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    
    return `${cleanTitle}${author}_${timestamp}.pdf`;
  }

  /**
   * 檢查檔案是否存在
   */
  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      return existsSync(filePath) && statSync(filePath).size > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 驗證PDF檔案完整性
   */
  async validatePDF(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) {
        return false;
      }

      const stats = statSync(filePath);
      if (stats.size === 0) {
        return false;
      }

      // 檢查PDF檔案頭
      return new Promise((resolve) => {
        const stream = createReadStream(filePath, { start: 0, end: 7 });
        let header = '';

        stream.on('data', (chunk) => {
          header += chunk.toString();
        });

        stream.on('end', () => {
          // PDF檔案應該以 %PDF- 開頭
          resolve(header.startsWith('%PDF-'));
        });

        stream.on('error', () => {
          resolve(false);
        });
      });

    } catch (error) {
      this.logger.error(`PDF驗證失敗: ${error}`);
      return false;
    }
  }

  /**
   * 取消下載
   */
  cancelDownload(bookId: number): boolean {
    const controller = this.activeDownloads.get(bookId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(bookId);
      this.logger.info(`已取消書籍 ${bookId} 的下載`);
      return true;
    }
    return false;
  }

  /**
   * 取消所有下載
   */
  cancelAllDownloads(): void {
    for (const [bookId, controller] of this.activeDownloads) {
      controller.abort();
      this.logger.info(`已取消書籍 ${bookId} 的下載`);
    }
    this.activeDownloads.clear();
  }

  /**
   * 確保目錄存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      this.logger.info(`建立下載目錄: ${dirPath}`);
    }
  }

  /**
   * 延遲函數
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 取得活躍下載數量
   */
  getActiveDownloadCount(): number {
    return this.activeDownloads.size;
  }

  /**
   * 取得活躍下載的書籍ID列表
   */
  getActiveDownloadIds(): number[] {
    return Array.from(this.activeDownloads.keys());
  }
}