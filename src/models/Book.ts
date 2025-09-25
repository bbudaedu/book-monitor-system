import { BookInfo, BookStatus } from '../types';
import { DatabaseManager } from '../database/DatabaseManager';
import { QueryResult } from '../types/database';

/**
 * 書籍資料模型類別
 */
export class Book {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * 驗證書籍資料
   */
  static validate(bookInfo: Partial<BookInfo>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 必填欄位驗證
    if (!bookInfo.title || bookInfo.title.trim().length === 0) {
      errors.push('書籍標題不能為空');
    }

    if (!bookInfo.pdfUrl || bookInfo.pdfUrl.trim().length === 0) {
      errors.push('PDF URL不能為空');
    }

    // URL格式驗證
    if (bookInfo.pdfUrl) {
      try {
        new URL(bookInfo.pdfUrl);
      } catch {
        errors.push('PDF URL格式不正確');
      }
    }

    if (bookInfo.downloadUrl) {
      try {
        new URL(bookInfo.downloadUrl);
      } catch {
        errors.push('下載URL格式不正確');
      }
    }

    // 狀態驗證
    if (bookInfo.status && !Object.values(BookStatus).includes(bookInfo.status)) {
      errors.push('書籍狀態不正確');
    }

    // 檔案大小驗證
    if (bookInfo.fileSize !== undefined && bookInfo.fileSize < 0) {
      errors.push('檔案大小不能為負數');
    }

    // 標題長度驗證
    if (bookInfo.title && bookInfo.title.length > 255) {
      errors.push('書籍標題長度不能超過255個字元');
    }

    // 作者長度驗證
    if (bookInfo.author && bookInfo.author.length > 255) {
      errors.push('作者名稱長度不能超過255個字元');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 建立新書籍記錄
   */
  async create(bookInfo: Omit<BookInfo, 'id' | 'createdAt' | 'updatedAt'>): Promise<BookInfo> {
    // 驗證資料
    const validation = Book.validate(bookInfo);
    if (!validation.isValid) {
      throw new Error(`書籍資料驗證失敗: ${validation.errors.join(', ')}`);
    }

    const sql = `
      INSERT INTO books (
        title, author, description, pdf_url, download_url, 
        file_path, file_size, downloaded_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      bookInfo.title,
      bookInfo.author || null,
      bookInfo.description || null,
      bookInfo.pdfUrl,
      bookInfo.downloadUrl || null,
      bookInfo.filePath || null,
      bookInfo.fileSize || null,
      bookInfo.downloadedAt || null,
      bookInfo.status || BookStatus.PENDING
    ];

    try {
      const result = await this.dbManager.query<BookInfo>(sql, params);
      return this.mapRowToBookInfo(result.rows[0]);
    } catch (error) {
      console.error('建立書籍記錄失敗:', error);
      throw new Error('建立書籍記錄失敗');
    }
  }

  /**
   * 根據ID查詢書籍
   */
  async findById(id: number): Promise<BookInfo | null> {
    const sql = 'SELECT * FROM books WHERE id = $1';
    
    try {
      const result = await this.dbManager.query<BookInfo>(sql, [id]);
      return result.rows.length > 0 ? this.mapRowToBookInfo(result.rows[0]) : null;
    } catch (error) {
      console.error('查詢書籍失敗:', error);
      throw new Error('查詢書籍失敗');
    }
  }

  /**
   * 根據PDF URL查詢書籍
   */
  async findByPdfUrl(pdfUrl: string): Promise<BookInfo | null> {
    const sql = 'SELECT * FROM books WHERE pdf_url = $1';
    
    try {
      const result = await this.dbManager.query<BookInfo>(sql, [pdfUrl]);
      return result.rows.length > 0 ? this.mapRowToBookInfo(result.rows[0]) : null;
    } catch (error) {
      console.error('根據PDF URL查詢書籍失敗:', error);
      throw new Error('根據PDF URL查詢書籍失敗');
    }
  }

  /**
   * 根據狀態查詢書籍列表
   */
  async findByStatus(status: BookStatus, limit?: number, offset?: number): Promise<BookInfo[]> {
    let sql = 'SELECT * FROM books WHERE status = $1 ORDER BY created_at DESC';
    const params: any[] = [status];

    if (limit !== undefined) {
      sql += ' LIMIT $2';
      params.push(limit);
      
      if (offset !== undefined) {
        sql += ' OFFSET $3';
        params.push(offset);
      }
    }

    try {
      const result = await this.dbManager.query<BookInfo>(sql, params);
      return result.rows.map(row => this.mapRowToBookInfo(row));
    } catch (error) {
      console.error('根據狀態查詢書籍失敗:', error);
      throw new Error('根據狀態查詢書籍失敗');
    }
  }

  /**
   * 查詢所有書籍
   */
  async findAll(limit?: number, offset?: number): Promise<BookInfo[]> {
    let sql = 'SELECT * FROM books ORDER BY created_at DESC';
    const params: any[] = [];

    if (limit !== undefined) {
      sql += ' LIMIT $1';
      params.push(limit);
      
      if (offset !== undefined) {
        sql += ' OFFSET $2';
        params.push(offset);
      }
    }

    try {
      const result = await this.dbManager.query<BookInfo>(sql, params);
      return result.rows.map(row => this.mapRowToBookInfo(row));
    } catch (error) {
      console.error('查詢所有書籍失敗:', error);
      throw new Error('查詢所有書籍失敗');
    }
  }

  /**
   * 搜尋書籍（根據標題或作者）
   */
  async search(keyword: string, limit?: number, offset?: number): Promise<BookInfo[]> {
    let sql = `
      SELECT * FROM books 
      WHERE title ILIKE $1 OR author ILIKE $1 
      ORDER BY created_at DESC
    `;
    const params: any[] = [`%${keyword}%`];

    if (limit !== undefined) {
      sql += ' LIMIT $2';
      params.push(limit);
      
      if (offset !== undefined) {
        sql += ' OFFSET $3';
        params.push(offset);
      }
    }

    try {
      const result = await this.dbManager.query<BookInfo>(sql, params);
      return result.rows.map(row => this.mapRowToBookInfo(row));
    } catch (error) {
      console.error('搜尋書籍失敗:', error);
      throw new Error('搜尋書籍失敗');
    }
  }

  /**
   * 更新書籍資訊
   */
  async update(id: number, updates: Partial<BookInfo>): Promise<BookInfo | null> {
    // 驗證更新資料
    const validation = Book.validate(updates);
    if (!validation.isValid) {
      throw new Error(`書籍資料驗證失敗: ${validation.errors.join(', ')}`);
    }

    // 建立動態更新SQL
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      params.push(updates.title);
    }
    if (updates.author !== undefined) {
      updateFields.push(`author = $${paramIndex++}`);
      params.push(updates.author);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }
    if (updates.downloadUrl !== undefined) {
      updateFields.push(`download_url = $${paramIndex++}`);
      params.push(updates.downloadUrl);
    }
    if (updates.filePath !== undefined) {
      updateFields.push(`file_path = $${paramIndex++}`);
      params.push(updates.filePath);
    }
    if (updates.fileSize !== undefined) {
      updateFields.push(`file_size = $${paramIndex++}`);
      params.push(updates.fileSize);
    }
    if (updates.downloadedAt !== undefined) {
      updateFields.push(`downloaded_at = $${paramIndex++}`);
      params.push(updates.downloadedAt);
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }

    if (updateFields.length === 0) {
      throw new Error('沒有提供要更新的欄位');
    }

    // 總是更新 updated_at
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE books 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await this.dbManager.query<BookInfo>(sql, params);
      return result.rows.length > 0 ? this.mapRowToBookInfo(result.rows[0]) : null;
    } catch (error) {
      console.error('更新書籍失敗:', error);
      throw new Error('更新書籍失敗');
    }
  }

  /**
   * 刪除書籍
   */
  async delete(id: number): Promise<boolean> {
    const sql = 'DELETE FROM books WHERE id = $1';
    
    try {
      const result = await this.dbManager.query(sql, [id]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('刪除書籍失敗:', error);
      throw new Error('刪除書籍失敗');
    }
  }

  /**
   * 統計書籍數量
   */
  async count(status?: BookStatus): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM books';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    try {
      const result = await this.dbManager.query<{ count: string }>(sql, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('統計書籍數量失敗:', error);
      throw new Error('統計書籍數量失敗');
    }
  }

  /**
   * 批量更新書籍狀態
   */
  async batchUpdateStatus(ids: number[], status: BookStatus): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const sql = `
      UPDATE books 
      SET status = $${ids.length + 1}, updated_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
    `;

    try {
      const result = await this.dbManager.query(sql, [...ids, status]);
      return result.rowCount;
    } catch (error) {
      console.error('批量更新書籍狀態失敗:', error);
      throw new Error('批量更新書籍狀態失敗');
    }
  }

  /**
   * 檢查書籍是否存在（根據PDF URL）
   */
  async exists(pdfUrl: string): Promise<boolean> {
    const sql = 'SELECT EXISTS(SELECT 1 FROM books WHERE pdf_url = $1)';
    
    try {
      const result = await this.dbManager.query<{ exists: boolean }>(sql, [pdfUrl]);
      return result.rows[0].exists;
    } catch (error) {
      console.error('檢查書籍是否存在失敗:', error);
      throw new Error('檢查書籍是否存在失敗');
    }
  }

  /**
   * 將資料庫行映射為BookInfo物件
   */
  private mapRowToBookInfo(row: any): BookInfo {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      pdfUrl: row.pdf_url,
      downloadUrl: row.download_url,
      filePath: row.file_path,
      fileSize: row.file_size,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      downloadedAt: row.downloaded_at ? new Date(row.downloaded_at) : undefined,
      status: row.status as BookStatus
    };
  }
}