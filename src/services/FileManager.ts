import { existsSync, statSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join, dirname, basename, extname, resolve } from 'path';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { BookInfo } from '../types';
import { Logger } from './Logger';

/**
 * 檔案管理器
 * 負責檔案命名、目錄管理、重複檔案檢測等功能
 */
export class FileManager {
  private logger: Logger;
  private downloadPath: string;

  constructor(downloadPath: string) {
    this.logger = new Logger();
    this.downloadPath = resolve(downloadPath);
    this.ensureDirectoryExists(this.downloadPath);
  }

  /**
   * 生成唯一的檔案名稱
   * @param bookInfo 書籍資訊
   * @param avoidDuplicates 是否避免重複檔案名稱
   * @returns 檔案名稱
   */
  generateUniqueFileName(bookInfo: BookInfo, avoidDuplicates: boolean = true): string {
    const baseFileName = this.generateBaseFileName(bookInfo);
    
    if (!avoidDuplicates) {
      return baseFileName;
    }

    const filePath = join(this.downloadPath, baseFileName);
    
    if (!existsSync(filePath)) {
      return baseFileName;
    }

    // 如果檔案已存在，生成唯一名稱
    return this.generateUniqueFileNameWithCounter(baseFileName);
  }

  /**
   * 生成基礎檔案名稱
   */
  private generateBaseFileName(bookInfo: BookInfo): string {
    // 清理標題
    const cleanTitle = this.sanitizeFileName(bookInfo.title);
    
    // 清理作者名稱
    const cleanAuthor = bookInfo.author ? this.sanitizeFileName(bookInfo.author) : '';
    
    // 生成時間戳
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // 組合檔案名稱
    let fileName = cleanTitle;
    
    if (cleanAuthor && cleanAuthor.length > 0) {
      fileName += `_${cleanAuthor}`;
    }
    
    fileName += `_${timestamp}`;
    
    // 限制檔案名稱長度（Windows檔案名稱限制為255字元）
    if (fileName.length > 200) {
      fileName = fileName.substring(0, 200);
    }
    
    return `${fileName}.pdf`;
  }

  /**
   * 清理檔案名稱中的非法字元
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_') // 替換Windows非法字元
      .replace(/[\x00-\x1f\x80-\x9f]/g, '_') // 替換控制字元
      .replace(/^\.+/, '_') // 不能以點開頭
      .replace(/\.+$/, '_') // 不能以點結尾
      .replace(/\s+/g, '_') // 替換空格
      .replace(/_+/g, '_') // 合併多個底線
      .trim();
  }

  /**
   * 生成帶計數器的唯一檔案名稱
   */
  private generateUniqueFileNameWithCounter(baseFileName: string): string {
    const nameWithoutExt = basename(baseFileName, extname(baseFileName));
    const ext = extname(baseFileName);
    let counter = 1;
    let uniqueFileName: string;

    do {
      uniqueFileName = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    } while (existsSync(join(this.downloadPath, uniqueFileName)));

    return uniqueFileName;
  }

  /**
   * 檢查重複檔案
   * @param bookInfo 書籍資訊
   * @returns 重複檔案的路徑陣列
   */
  async findDuplicateFiles(bookInfo: BookInfo): Promise<string[]> {
    const duplicates: string[] = [];
    
    try {
      const files = readdirSync(this.downloadPath);
      const pdfFiles = files.filter(file => extname(file).toLowerCase() === '.pdf');
      
      // 基於檔案名稱的模糊匹配
      const titleKeywords = this.extractKeywords(bookInfo.title);
      const authorKeywords = bookInfo.author ? this.extractKeywords(bookInfo.author) : [];
      
      for (const file of pdfFiles) {
        const filePath = join(this.downloadPath, file);
        const fileNameLower = file.toLowerCase();
        
        // 檢查標題關鍵字匹配
        const titleMatches = titleKeywords.some(keyword => 
          fileNameLower.includes(keyword.toLowerCase())
        );
        
        // 檢查作者關鍵字匹配
        const authorMatches = authorKeywords.length === 0 || authorKeywords.some(keyword =>
          fileNameLower.includes(keyword.toLowerCase())
        );
        
        if (titleMatches && authorMatches) {
          duplicates.push(filePath);
        }
      }
      
    } catch (error) {
      this.logger.error(`檢查重複檔案時發生錯誤: ${error}`);
    }
    
    return duplicates;
  }

  /**
   * 提取關鍵字
   */
  private extractKeywords(text: string): string[] {
    return text
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留中文、英文、數字
      .split(/\s+/)
      .filter(word => word.length > 1) // 過濾單字元
      .slice(0, 5); // 限制關鍵字數量
  }

  /**
   * 計算檔案的MD5雜湊值
   * @param filePath 檔案路徑
   * @returns Promise<string> MD5雜湊值
   */
  async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      const stream = createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 檢查檔案是否完全相同（基於內容雜湊）
   * @param filePath1 第一個檔案路徑
   * @param filePath2 第二個檔案路徑
   * @returns Promise<boolean> 是否相同
   */
  async areFilesIdentical(filePath1: string, filePath2: string): Promise<boolean> {
    try {
      if (!existsSync(filePath1) || !existsSync(filePath2)) {
        return false;
      }
      
      // 先比較檔案大小
      const stat1 = statSync(filePath1);
      const stat2 = statSync(filePath2);
      
      if (stat1.size !== stat2.size) {
        return false;
      }
      
      // 如果大小相同，比較雜湊值
      const hash1 = await this.calculateFileHash(filePath1);
      const hash2 = await this.calculateFileHash(filePath2);
      
      return hash1 === hash2;
      
    } catch (error) {
      this.logger.error(`比較檔案時發生錯誤: ${error}`);
      return false;
    }
  }

  /**
   * 建立目錄結構
   * @param subPath 子路徑（相對於下載目錄）
   * @returns 完整路徑
   */
  createDirectory(subPath: string = ''): string {
    const fullPath = join(this.downloadPath, subPath);
    this.ensureDirectoryExists(fullPath);
    return fullPath;
  }

  /**
   * 確保目錄存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      this.logger.info(`建立目錄: ${dirPath}`);
    }
  }

  /**
   * 移動檔案到指定目錄
   * @param sourcePath 來源檔案路徑
   * @param targetDir 目標目錄
   * @param newFileName 新檔案名稱（可選）
   * @returns 新的檔案路徑
   */
  moveFile(sourcePath: string, targetDir: string, newFileName?: string): string {
    if (!existsSync(sourcePath)) {
      throw new Error(`來源檔案不存在: ${sourcePath}`);
    }
    
    this.ensureDirectoryExists(targetDir);
    
    const fileName = newFileName || basename(sourcePath);
    const targetPath = join(targetDir, fileName);
    
    // 如果目標檔案已存在，生成唯一名稱
    const uniqueTargetPath = this.getUniqueFilePath(targetPath);
    
    renameSync(sourcePath, uniqueTargetPath);
    this.logger.info(`檔案已移動: ${sourcePath} -> ${uniqueTargetPath}`);
    
    return uniqueTargetPath;
  }

  /**
   * 取得唯一的檔案路徑
   */
  private getUniqueFilePath(filePath: string): string {
    if (!existsSync(filePath)) {
      return filePath;
    }
    
    const dir = dirname(filePath);
    const nameWithoutExt = basename(filePath, extname(filePath));
    const ext = extname(filePath);
    let counter = 1;
    let uniquePath: string;
    
    do {
      uniquePath = join(dir, `${nameWithoutExt}_${counter}${ext}`);
      counter++;
    } while (existsSync(uniquePath));
    
    return uniquePath;
  }

  /**
   * 刪除檔案
   * @param filePath 檔案路徑
   * @returns 是否成功刪除
   */
  deleteFile(filePath: string): boolean {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        this.logger.info(`檔案已刪除: ${filePath}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`刪除檔案失敗: ${error}`);
      return false;
    }
  }

  /**
   * 取得檔案資訊
   * @param filePath 檔案路徑
   * @returns 檔案資訊
   */
  getFileInfo(filePath: string): { size: number; createdAt: Date; modifiedAt: Date } | null {
    try {
      if (!existsSync(filePath)) {
        return null;
      }
      
      const stats = statSync(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (error) {
      this.logger.error(`取得檔案資訊失敗: ${error}`);
      return null;
    }
  }

  /**
   * 列出目錄中的PDF檔案
   * @param dirPath 目錄路徑（可選，預設為下載目錄）
   * @returns PDF檔案路徑陣列
   */
  listPDFFiles(dirPath?: string): string[] {
    const targetDir = dirPath || this.downloadPath;
    
    try {
      if (!existsSync(targetDir)) {
        return [];
      }
      
      const files = readdirSync(targetDir);
      return files
        .filter(file => extname(file).toLowerCase() === '.pdf')
        .map(file => join(targetDir, file));
        
    } catch (error) {
      this.logger.error(`列出PDF檔案失敗: ${error}`);
      return [];
    }
  }

  /**
   * 取得目錄大小
   * @param dirPath 目錄路徑
   * @returns 目錄大小（位元組）
   */
  getDirectorySize(dirPath: string = this.downloadPath): number {
    try {
      if (!existsSync(dirPath)) {
        return 0;
      }
      
      let totalSize = 0;
      const files = readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        
        if (stats.isFile()) {
          totalSize += stats.size;
        } else if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        }
      }
      
      return totalSize;
      
    } catch (error) {
      this.logger.error(`計算目錄大小失敗: ${error}`);
      return 0;
    }
  }

  /**
   * 清理空目錄
   * @param dirPath 目錄路徑
   */
  cleanupEmptyDirectories(dirPath: string = this.downloadPath): void {
    try {
      if (!existsSync(dirPath)) {
        return;
      }
      
      const files = readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        
        if (stats.isDirectory()) {
          this.cleanupEmptyDirectories(filePath);
          
          // 檢查目錄是否為空
          const subFiles = readdirSync(filePath);
          if (subFiles.length === 0) {
            unlinkSync(filePath);
            this.logger.info(`已刪除空目錄: ${filePath}`);
          }
        }
      }
      
    } catch (error) {
      this.logger.error(`清理空目錄失敗: ${error}`);
    }
  }

  /**
   * 取得下載路徑
   */
  getDownloadPath(): string {
    return this.downloadPath;
  }

  /**
   * 設定下載路徑
   */
  setDownloadPath(newPath: string): void {
    this.downloadPath = resolve(newPath);
    this.ensureDirectoryExists(this.downloadPath);
    this.logger.info(`下載路徑已更新: ${this.downloadPath}`);
  }
}