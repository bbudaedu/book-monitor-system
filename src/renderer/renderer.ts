// 渲染程序主要邏輯
// 處理使用者介面互動和與主程序的通訊

class BookMonitorUI {
    private currentPage: string = 'dashboard';
    private systemStatus: any = {
        isRunning: false,
        lastCheck: null,
        totalBooks: 0,
        newBooksToday: 0
    };

    constructor() {
        this.initializeUI();
        this.setupEventListeners();
        this.loadInitialData();
        this.startPeriodicUpdates();
    }

    /**
     * 初始化使用者介面
     */
    private initializeUI(): void {
        // 設定導航
        this.setupNavigation();
        
        // 設定控制按鈕
        this.setupControlButtons();
        
        // 設定其他 UI 元素
        this.setupUIElements();
    }

    /**
     * 設定導航功能
     */
    private setupNavigation(): void {
        const navItems = document.querySelectorAll('.nav-item');
        const pages = document.querySelectorAll('.page');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetPage = item.getAttribute('data-page');
                if (targetPage) {
                    this.switchPage(targetPage);
                }
            });
        });
    }

    /**
     * 切換頁面
     */
    private switchPage(pageName: string): void {
        // 移除所有活動狀態
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 設定新的活動狀態
        const targetNavItem = document.querySelector(`[data-page="${pageName}"]`);
        const targetPage = document.getElementById(`${pageName}-page`);

        if (targetNavItem && targetPage) {
            targetNavItem.classList.add('active');
            targetPage.classList.add('active');
            this.currentPage = pageName;

            // 載入頁面特定資料
            this.loadPageData(pageName);
        }
    }

    /**
     * 設定控制按鈕
     */
    private setupControlButtons(): void {
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startMonitoring());
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopMonitoring());
        }
    }

    /**
     * 設定其他 UI 元素
     */
    private setupUIElements(): void {
        // 搜尋功能
        const bookSearch = document.getElementById('bookSearch') as HTMLInputElement;
        if (bookSearch) {
            bookSearch.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.searchBooks(target.value);
            });
        }

        // 日誌搜尋
        const logSearch = document.getElementById('logSearch') as HTMLInputElement;
        if (logSearch) {
            let searchTimeout: NodeJS.Timeout;
            logSearch.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchLogs(target.value);
                }, 300); // 防抖動，300ms 後執行搜尋
            });
        }

        // 日誌等級篩選
        const logLevelFilter = document.getElementById('logLevelFilter') as HTMLSelectElement;
        if (logLevelFilter) {
            logLevelFilter.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.filterLogs(target.value);
            });
        }

        // 清除日誌按鈕
        const clearLogsBtn = document.getElementById('clearLogsBtn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => this.clearLogs());
        }

        // 匯出日誌按鈕
        const exportLogsBtn = document.getElementById('exportLogsBtn');
        if (exportLogsBtn) {
            exportLogsBtn.addEventListener('click', () => this.exportLogs());
        }

        // 設定頁面相關元素
        this.setupSettingsElements();
    }

    /**
     * 設定設定頁面的 UI 元素
     */
    private setupSettingsElements(): void {
        // 儲存設定按鈕
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }

        // 重設設定按鈕
        const resetSettingsBtn = document.getElementById('resetSettingsBtn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }

        // 選擇下載路徑按鈕
        const selectPathBtn = document.getElementById('selectPathBtn');
        if (selectPathBtn) {
            selectPathBtn.addEventListener('click', () => this.selectDownloadPath());
        }

        // 測試 LINE 連接按鈕
        const testLineBtn = document.getElementById('testLineBtn');
        if (testLineBtn) {
            testLineBtn.addEventListener('click', () => this.testLineConnection());
        }

        // LINE Token 說明連結
        const lineTokenHelp = document.getElementById('lineTokenHelp');
        if (lineTokenHelp) {
            lineTokenHelp.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLineTokenModal();
            });
        }

        // 關閉模態對話框
        const closeLineTokenModal = document.getElementById('closeLineTokenModal');
        if (closeLineTokenModal) {
            closeLineTokenModal.addEventListener('click', () => this.hideLineTokenModal());
        }

        // 點擊模態背景關閉對話框
        const lineTokenModal = document.getElementById('lineTokenModal');
        if (lineTokenModal) {
            lineTokenModal.addEventListener('click', (e) => {
                if (e.target === lineTokenModal) {
                    this.hideLineTokenModal();
                }
            });
        }

        // 表單驗證
        const settingsForm = document.getElementById('settingsForm') as HTMLFormElement;
        if (settingsForm) {
            settingsForm.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.validateFormField(target);
            });
        }
    }

    /**
     * 設定事件監聽器
     */
    private setupEventListeners(): void {
        if (window.electronAPI) {
            // 監聽系統狀態更新
            window.electronAPI.onStatusUpdate((status) => {
                this.updateSystemStatus(status);
            });

            // 監聽新書通知
            window.electronAPI.onNewBook((book) => {
                this.handleNewBook(book);
            });

            // 監聽下載開始
            window.electronAPI.onDownloadStarted((book) => {
                this.handleDownloadStarted(book);
            });

            // 監聽下載完成
            window.electronAPI.onDownloadCompleted((book) => {
                this.handleDownloadCompleted(book);
            });

            // 監聽下載失敗
            window.electronAPI.onDownloadFailed((data) => {
                this.handleDownloadFailed(data);
            });

            // 監聽通知發送
            window.electronAPI.onNotificationSent((book) => {
                this.handleNotificationSent(book);
            });

            // 監聽錯誤通知
            window.electronAPI.onError((error) => {
                this.handleError(error);
            });

            // 監聽設定更新
            window.electronAPI.onConfigUpdated((config) => {
                this.handleConfigUpdated(config);
            });

            // 監聽日誌更新
            window.electronAPI.onLogUpdate((log) => {
                this.handleLogUpdate(log);
            });
        }
    }

    /**
     * 載入初始資料
     */
    private async loadInitialData(): Promise<void> {
        try {
            this.showLoading(true);

            if (window.electronAPI) {
                // 載入系統狀態
                const status = await window.electronAPI.getSystemStatus();
                this.updateSystemStatus(status);

                // 載入最近的書籍
                const recentBooks = await window.electronAPI.getRecentBooks(10);
                this.updateRecentBooks(recentBooks);
            }
        } catch (error) {
            console.error('載入初始資料失敗:', error);
            this.showNotification('錯誤', '載入初始資料失敗', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 載入頁面特定資料
     */
    private async loadPageData(pageName: string): Promise<void> {
        if (!window.electronAPI) return;

        try {
            switch (pageName) {
                case 'books':
                    const allBooks = await window.electronAPI.getRecentBooks();
                    this.updateBooksGrid(allBooks);
                    break;
                case 'logs':
                    const logs = await window.electronAPI.getLogs({ limit: 100 });
                    this.updateLogsContainer(logs);
                    break;
                case 'settings':
                    const config = await window.electronAPI.getConfig();
                    this.updateSettingsForm(config);
                    break;
            }
        } catch (error) {
            console.error(`載入 ${pageName} 頁面資料失敗:`, error);
        }
    }

    /**
     * 開始監控
     */
    private async startMonitoring(): Promise<void> {
        try {
            this.showLoading(true);
            
            if (window.electronAPI) {
                const success = await window.electronAPI.startMonitoring();
                if (success) {
                    this.showNotification('成功', '監控已開始', 'success');
                } else {
                    this.showNotification('錯誤', '啟動監控失敗', 'error');
                }
            }
        } catch (error) {
            console.error('啟動監控失敗:', error);
            this.showNotification('錯誤', '啟動監控失敗', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 停止監控
     */
    private async stopMonitoring(): Promise<void> {
        try {
            this.showLoading(true);
            
            if (window.electronAPI) {
                const success = await window.electronAPI.stopMonitoring();
                if (success) {
                    this.showNotification('成功', '監控已停止', 'success');
                } else {
                    this.showNotification('錯誤', '停止監控失敗', 'error');
                }
            }
        } catch (error) {
            console.error('停止監控失敗:', error);
            this.showNotification('錯誤', '停止監控失敗', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 更新系統狀態
     */
    private updateSystemStatus(status: any): void {
        this.systemStatus = status;

        // 更新狀態指示器
        const statusIndicator = document.getElementById('statusIndicator');
        const statusDot = statusIndicator?.querySelector('.status-dot');
        const statusText = statusIndicator?.querySelector('.status-text');

        if (statusDot && statusText) {
            if (status.isRunning) {
                statusDot.classList.add('running');
                statusText.textContent = '運行中';
            } else {
                statusDot.classList.remove('running');
                statusText.textContent = '已停止';
            }
        }

        // 更新控制按鈕
        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;

        if (startBtn && stopBtn) {
            startBtn.disabled = status.isRunning;
            stopBtn.disabled = !status.isRunning;
        }

        // 更新統計資料
        this.updateStats(status);
    }

    /**
     * 更新統計資料
     */
    private updateStats(status: any): void {
        const totalBooksEl = document.getElementById('totalBooks');
        const newBooksTodayEl = document.getElementById('newBooksToday');
        const lastCheckEl = document.getElementById('lastCheck');

        if (totalBooksEl) {
            totalBooksEl.textContent = status.totalBooks.toString();
        }

        if (newBooksTodayEl) {
            newBooksTodayEl.textContent = status.newBooksToday.toString();
        }

        if (lastCheckEl) {
            if (status.lastCheck) {
                const lastCheckTime = new Date(status.lastCheck);
                const now = new Date();
                const diffMinutes = Math.floor((now.getTime() - lastCheckTime.getTime()) / (1000 * 60));
                
                if (diffMinutes < 1) {
                    lastCheckEl.textContent = '剛剛';
                } else if (diffMinutes < 60) {
                    lastCheckEl.textContent = `${diffMinutes} 分鐘前`;
                } else if (diffMinutes < 1440) {
                    const diffHours = Math.floor(diffMinutes / 60);
                    lastCheckEl.textContent = `${diffHours} 小時前`;
                } else {
                    lastCheckEl.textContent = lastCheckTime.toLocaleString('zh-TW');
                }
            } else {
                lastCheckEl.textContent = '從未檢查';
            }
        }
    }

    /**
     * 更新最近書籍列表
     */
    private updateRecentBooks(books: any[]): void {
        const recentBooksList = document.getElementById('recentBooksList');
        if (!recentBooksList) return;

        if (books.length === 0) {
            recentBooksList.innerHTML = `
                <div class="empty-state">
                    <p>尚未檢測到任何書籍</p>
                </div>
            `;
            return;
        }

        const booksHTML = books.map(book => `
            <div class="book-item">
                <div class="book-info">
                    <div class="book-title">${this.escapeHtml(book.title)}</div>
                    <div class="book-author">${this.escapeHtml(book.author || '未知作者')}</div>
                    <div class="book-date">${new Date(book.createdAt).toLocaleString('zh-TW')}</div>
                </div>
                <div class="book-actions">
                    <button class="btn btn-small btn-primary" onclick="bookMonitorUI.downloadBook('${book.id}')">
                        下載
                    </button>
                </div>
            </div>
        `).join('');

        recentBooksList.innerHTML = booksHTML;
    }

    /**
     * 更新書籍網格
     */
    private updateBooksGrid(books: any[]): void {
        const booksGrid = document.getElementById('booksGrid');
        if (!booksGrid) return;

        if (books.length === 0) {
            booksGrid.innerHTML = `
                <div class="empty-state">
                    <p>沒有找到任何書籍</p>
                </div>
            `;
            return;
        }

        const booksHTML = books.map(book => `
            <div class="book-card">
                <div class="book-title">${this.escapeHtml(book.title)}</div>
                <div class="book-author">${this.escapeHtml(book.author || '未知作者')}</div>
                <div class="book-date">${new Date(book.createdAt).toLocaleString('zh-TW')}</div>
                <div class="book-actions" style="margin-top: 15px;">
                    <button class="btn btn-small btn-primary" onclick="bookMonitorUI.downloadBook('${book.id}')">
                        下載
                    </button>
                </div>
            </div>
        `).join('');

        booksGrid.innerHTML = booksHTML;
    }

    /**
     * 更新日誌容器
     */
    private updateLogsContainer(logs: any[]): void {
        const logsContainer = document.getElementById('logsContainer');
        if (!logsContainer) return;

        if (logs.length === 0) {
            logsContainer.innerHTML = `
                <div class="empty-state">
                    <p>沒有找到任何日誌</p>
                </div>
            `;
            return;
        }

        // 建立日誌標題列
        const headerHTML = `
            <div class="log-header">
                <div class="log-header-item">時間</div>
                <div class="log-header-item">等級</div>
                <div class="log-header-item">訊息</div>
                <div class="log-header-item">詳細資訊</div>
            </div>
        `;

        const logsHTML = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('zh-TW');
            const levelBadge = this.getLevelBadge(log.level);
            const message = this.escapeHtml(log.message);
            const metadata = log.metadata ? JSON.stringify(log.metadata, null, 2) : '';

            return `
                <div class="log-entry ${log.level}" data-level="${log.level}">
                    <div class="log-timestamp">${timestamp}</div>
                    <div class="log-level">${levelBadge}</div>
                    <div class="log-message">${message}</div>
                    <div class="log-metadata">
                        ${metadata ? `<button class="log-details-btn" onclick="bookMonitorUI.toggleLogDetails(this)">詳細</button>` : ''}
                        ${metadata ? `<pre class="log-details" style="display: none;">${this.escapeHtml(metadata)}</pre>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        logsContainer.innerHTML = headerHTML + logsHTML;
    }

    /**
     * 取得日誌等級徽章
     */
    private getLevelBadge(level: string): string {
        const badges = {
            error: '<span class="log-badge error">錯誤</span>',
            warn: '<span class="log-badge warn">警告</span>',
            info: '<span class="log-badge info">資訊</span>',
            debug: '<span class="log-badge debug">除錯</span>'
        };
        return badges[level as keyof typeof badges] || `<span class="log-badge">${level}</span>`;
    }

    /**
     * 切換日誌詳細資訊顯示
     */
    public toggleLogDetails(button: HTMLButtonElement): void {
        const details = button.nextElementSibling as HTMLElement;
        if (details) {
            if (details.style.display === 'none') {
                details.style.display = 'block';
                button.textContent = '隱藏';
            } else {
                details.style.display = 'none';
                button.textContent = '詳細';
            }
        }
    }

    /**
     * 更新設定表單
     */
    private updateSettingsForm(config: any): void {
        if (!config) return;

        // 監控設定
        const monitorInterval = document.getElementById('monitorInterval') as HTMLInputElement;
        if (monitorInterval && config.monitorInterval) {
            monitorInterval.value = Math.floor(config.monitorInterval / 60000).toString(); // 轉換為分鐘
        }

        const autoStart = document.getElementById('autoStart') as HTMLInputElement;
        if (autoStart) {
            autoStart.checked = config.autoStart || false;
        }

        // 下載設定
        const downloadPath = document.getElementById('downloadPath') as HTMLInputElement;
        if (downloadPath && config.downloadPath) {
            downloadPath.value = config.downloadPath;
        }

        const maxRetries = document.getElementById('maxRetries') as HTMLInputElement;
        if (maxRetries && config.maxRetries) {
            maxRetries.value = config.maxRetries.toString();
        }

        // LINE 設定
        const lineAccessToken = document.getElementById('lineAccessToken') as HTMLInputElement;
        if (lineAccessToken && config.lineAccessToken) {
            lineAccessToken.value = config.lineAccessToken;
        }

        const lineUserId = document.getElementById('lineUserId') as HTMLInputElement;
        if (lineUserId && config.lineUserId) {
            lineUserId.value = config.lineUserId;
        }

        // 日誌設定
        const logLevel = document.getElementById('logLevel') as HTMLSelectElement;
        if (logLevel && config.logLevel) {
            logLevel.value = config.logLevel;
        }
    }

    /**
     * 處理新書通知
     */
    private handleNewBook(book: any): void {
        this.showNotification('新書通知', `檢測到新書: ${book.title}`, 'success');
        
        // 更新統計資料
        this.systemStatus.newBooksToday++;
        this.systemStatus.totalBooks++;
        this.updateStats(this.systemStatus);

        // 如果在監控面板頁面，更新最近書籍列表
        if (this.currentPage === 'dashboard') {
            this.loadPageData('dashboard');
        }
    }

    /**
     * 處理下載開始通知
     */
    private handleDownloadStarted(book: any): void {
        this.showNotification('下載開始', `開始下載: ${book.title}`, 'info');
        
        // 更新下載計數
        const downloadCountEl = document.getElementById('downloadCount');
        if (downloadCountEl) {
            const currentCount = parseInt(downloadCountEl.textContent || '0');
            downloadCountEl.textContent = (currentCount + 1).toString();
        }
    }

    /**
     * 處理下載完成通知
     */
    private handleDownloadCompleted(book: any): void {
        this.showNotification('下載完成', `${book.title} 下載完成`, 'success');
        
        // 更新下載計數
        const downloadCountEl = document.getElementById('downloadCount');
        if (downloadCountEl) {
            const currentCount = parseInt(downloadCountEl.textContent || '0');
            downloadCountEl.textContent = Math.max(0, currentCount - 1).toString();
        }
    }

    /**
     * 處理下載失敗通知
     */
    private handleDownloadFailed(data: any): void {
        this.showNotification('下載失敗', `${data.book.title} 下載失敗: ${data.error}`, 'error');
        
        // 更新下載計數
        const downloadCountEl = document.getElementById('downloadCount');
        if (downloadCountEl) {
            const currentCount = parseInt(downloadCountEl.textContent || '0');
            downloadCountEl.textContent = Math.max(0, currentCount - 1).toString();
        }
    }

    /**
     * 處理通知發送完成
     */
    private handleNotificationSent(book: any): void {
        console.log(`LINE通知已發送: ${book.title}`);
    }

    /**
     * 處理設定更新
     */
    private handleConfigUpdated(config: any): void {
        this.showNotification('設定更新', '系統設定已更新', 'success');
        
        // 如果在設定頁面，重新載入設定
        if (this.currentPage === 'settings') {
            this.updateSettingsForm(config);
        }
    }

    /**
     * 處理錯誤通知
     */
    private handleError(error: any): void {
        this.showNotification('系統錯誤', error.message || '發生未知錯誤', 'error');
    }

    /**
     * 處理日誌更新
     */
    private handleLogUpdate(log: any): void {
        // 如果在日誌頁面，即時更新日誌
        if (this.currentPage === 'logs') {
            const logsContainer = document.getElementById('logsContainer');
            if (logsContainer && !logsContainer.querySelector('.empty-state')) {
                const logHTML = `
                    <div class="log-entry ${log.level}">
                        <div class="log-timestamp">${new Date(log.timestamp).toLocaleString('zh-TW')}</div>
                        <div class="log-message">${this.escapeHtml(log.message)}</div>
                    </div>
                `;
                logsContainer.insertAdjacentHTML('afterbegin', logHTML);
            }
        }
    }

    /**
     * 下載書籍
     */
    public async downloadBook(bookId: string): Promise<void> {
        try {
            if (window.electronAPI) {
                const success = await window.electronAPI.downloadBook(bookId);
                if (success) {
                    this.showNotification('成功', '書籍下載已開始', 'success');
                } else {
                    this.showNotification('錯誤', '書籍下載失敗', 'error');
                }
            }
        } catch (error) {
            console.error('下載書籍失敗:', error);
            this.showNotification('錯誤', '書籍下載失敗', 'error');
        }
    }

    /**
     * 搜尋書籍
     */
    private searchBooks(query: string): void {
        // 這個方法將在後續任務中實作完整功能
        console.log('搜尋書籍:', query);
    }

    /**
     * 篩選日誌
     */
    private async filterLogs(level: string): Promise<void> {
        try {
            if (window.electronAPI) {
                const searchInput = document.getElementById('logSearch') as HTMLInputElement;
                const searchQuery = searchInput ? searchInput.value : '';

                const options: any = { limit: 100 };
                if (level) {
                    options.level = level;
                }
                if (searchQuery) {
                    options.search = searchQuery;
                }

                const logs = await window.electronAPI.getLogs(options);
                this.updateLogsContainer(logs);
            }
        } catch (error) {
            console.error('篩選日誌失敗:', error);
        }
    }

    /**
     * 搜尋日誌
     */
    private async searchLogs(query: string): Promise<void> {
        try {
            if (window.electronAPI) {
                const levelFilter = document.getElementById('logLevelFilter') as HTMLSelectElement;
                const selectedLevel = levelFilter ? levelFilter.value : '';

                const options: any = { limit: 100 };
                if (selectedLevel) {
                    options.level = selectedLevel;
                }
                if (query) {
                    options.search = query;
                }

                const logs = await window.electronAPI.getLogs(options);
                this.updateLogsContainer(logs);
            }
        } catch (error) {
            console.error('搜尋日誌失敗:', error);
        }
    }

    /**
     * 清除日誌
     */
    private async clearLogs(): Promise<void> {
        if (confirm('確定要清除所有日誌嗎？此操作無法復原。')) {
            try {
                // 這個功能需要在後端實作
                // await window.electronAPI.clearLogs();
                
                // 暫時清除 UI 中的日誌顯示
                const logsContainer = document.getElementById('logsContainer');
                if (logsContainer) {
                    logsContainer.innerHTML = `
                        <div class="empty-state">
                            <p>日誌已清除</p>
                        </div>
                    `;
                }
                
                this.showNotification('成功', '日誌已清除', 'success');
            } catch (error) {
                console.error('清除日誌失敗:', error);
                this.showNotification('錯誤', '清除日誌失敗', 'error');
            }
        }
    }

    /**
     * 匯出日誌
     */
    private async exportLogs(): Promise<void> {
        try {
            if (window.electronAPI) {
                const filePath = await window.electronAPI.exportLogs();
                if (filePath) {
                    this.showNotification('成功', `日誌已匯出至: ${filePath}`, 'success');
                } else {
                    this.showNotification('錯誤', '日誌匯出失敗', 'error');
                }
            }
        } catch (error) {
            console.error('匯出日誌失敗:', error);
            this.showNotification('錯誤', '日誌匯出失敗', 'error');
        }
    }

    /**
     * 顯示載入狀態
     */
    private showLoading(show: boolean): void {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            if (show) {
                loadingOverlay.classList.add('show');
            } else {
                loadingOverlay.classList.remove('show');
            }
        }
    }

    /**
     * 顯示通知
     */
    private showNotification(title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
        const container = document.getElementById('notificationContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-title">${this.escapeHtml(title)}</div>
            <div class="notification-message">${this.escapeHtml(message)}</div>
        `;

        container.appendChild(notification);

        // 3秒後自動移除通知
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    /**
     * 開始定期更新
     */
    private startPeriodicUpdates(): void {
        // 每30秒更新一次狀態
        setInterval(async () => {
            if (window.electronAPI) {
                try {
                    const status = await window.electronAPI.getSystemStatus();
                    this.updateSystemStatus(status);
                } catch (error) {
                    console.error('定期狀態更新失敗:', error);
                }
            }
        }, 30000);

        // 每分鐘更新一次時間顯示
        setInterval(() => {
            this.updateStats(this.systemStatus);
        }, 60000);
    }

    /**
     * 儲存設定
     */
    private async saveSettings(): Promise<void> {
        try {
            const form = document.getElementById('settingsForm') as HTMLFormElement;
            if (!form) return;

            // 驗證表單
            if (!this.validateSettingsForm()) {
                this.showNotification('驗證失敗', '請檢查表單中的錯誤', 'error');
                return;
            }

            this.showLoading(true);

            // 收集表單資料
            const formData = new FormData(form);
            const config = {
                monitorInterval: parseInt(formData.get('monitorInterval') as string) * 60000, // 轉換為毫秒
                autoStart: formData.has('autoStart'),
                downloadPath: formData.get('downloadPath') as string,
                maxRetries: parseInt(formData.get('maxRetries') as string),
                lineAccessToken: formData.get('lineAccessToken') as string,
                lineUserId: formData.get('lineUserId') as string,
                logLevel: formData.get('logLevel') as string
            };

            if (window.electronAPI) {
                const success = await window.electronAPI.updateConfig(config);
                if (success) {
                    this.showNotification('成功', '設定已儲存', 'success');
                } else {
                    this.showNotification('錯誤', '儲存設定失敗', 'error');
                }
            }
        } catch (error) {
            console.error('儲存設定失敗:', error);
            this.showNotification('錯誤', '儲存設定失敗', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 重設設定為預設值
     */
    private resetSettings(): void {
        if (confirm('確定要重設所有設定為預設值嗎？此操作無法復原。')) {
            const defaultConfig = {
                monitorInterval: 30, // 分鐘
                autoStart: false,
                downloadPath: '',
                maxRetries: 3,
                lineAccessToken: '',
                lineUserId: '',
                logLevel: 'info'
            };

            this.updateSettingsForm(defaultConfig);
            this.showNotification('成功', '設定已重設為預設值', 'info');
        }
    }

    /**
     * 選擇下載路徑
     */
    private async selectDownloadPath(): Promise<void> {
        try {
            if (window.electronAPI) {
                const selectedPath = await window.electronAPI.selectDownloadPath();
                if (selectedPath) {
                    const downloadPath = document.getElementById('downloadPath') as HTMLInputElement;
                    if (downloadPath) {
                        downloadPath.value = selectedPath;
                        this.validateFormField(downloadPath);
                    }
                }
            }
        } catch (error) {
            console.error('選擇下載路徑失敗:', error);
            this.showNotification('錯誤', '選擇下載路徑失敗', 'error');
        }
    }

    /**
     * 測試 LINE 連接
     */
    private async testLineConnection(): Promise<void> {
        try {
            const lineAccessToken = document.getElementById('lineAccessToken') as HTMLInputElement;
            const lineUserId = document.getElementById('lineUserId') as HTMLInputElement;

            if (!lineAccessToken.value.trim()) {
                this.showNotification('錯誤', '請先輸入 LINE Access Token', 'error');
                return;
            }

            if (!lineUserId.value.trim()) {
                this.showNotification('錯誤', '請先輸入 LINE 使用者 ID', 'error');
                return;
            }

            this.showLoading(true);

            // 這裡應該呼叫後端 API 測試 LINE 連接
            // 暫時模擬測試結果
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            this.showNotification('成功', 'LINE 連接測試成功', 'success');
        } catch (error) {
            console.error('測試 LINE 連接失敗:', error);
            this.showNotification('錯誤', 'LINE 連接測試失敗', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 顯示 LINE Token 說明對話框
     */
    private showLineTokenModal(): void {
        const modal = document.getElementById('lineTokenModal');
        if (modal) {
            modal.classList.add('show');
        }
    }

    /**
     * 隱藏 LINE Token 說明對話框
     */
    private hideLineTokenModal(): void {
        const modal = document.getElementById('lineTokenModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    /**
     * 驗證設定表單
     */
    private validateSettingsForm(): boolean {
        const form = document.getElementById('settingsForm') as HTMLFormElement;
        if (!form) return false;

        let isValid = true;

        // 驗證監控間隔
        const monitorInterval = document.getElementById('monitorInterval') as HTMLInputElement;
        if (monitorInterval) {
            const value = parseInt(monitorInterval.value);
            if (isNaN(value) || value < 5 || value > 1440) {
                this.setFieldError(monitorInterval, '監控間隔必須在 5-1440 分鐘之間');
                isValid = false;
            } else {
                this.clearFieldError(monitorInterval);
            }
        }

        // 驗證下載路徑
        const downloadPath = document.getElementById('downloadPath') as HTMLInputElement;
        if (downloadPath && !downloadPath.value.trim()) {
            this.setFieldError(downloadPath, '請選擇下載路徑');
            isValid = false;
        } else if (downloadPath) {
            this.clearFieldError(downloadPath);
        }

        // 驗證最大重試次數
        const maxRetries = document.getElementById('maxRetries') as HTMLInputElement;
        if (maxRetries) {
            const value = parseInt(maxRetries.value);
            if (isNaN(value) || value < 1 || value > 10) {
                this.setFieldError(maxRetries, '最大重試次數必須在 1-10 之間');
                isValid = false;
            } else {
                this.clearFieldError(maxRetries);
            }
        }

        return isValid;
    }

    /**
     * 驗證單個表單欄位
     */
    private validateFormField(field: HTMLInputElement): void {
        const fieldName = field.name;

        switch (fieldName) {
            case 'monitorInterval':
                const intervalValue = parseInt(field.value);
                if (isNaN(intervalValue) || intervalValue < 5 || intervalValue > 1440) {
                    this.setFieldError(field, '監控間隔必須在 5-1440 分鐘之間');
                } else {
                    this.clearFieldError(field);
                }
                break;

            case 'downloadPath':
                if (!field.value.trim()) {
                    this.setFieldError(field, '請選擇下載路徑');
                } else {
                    this.clearFieldError(field);
                }
                break;

            case 'maxRetries':
                const retriesValue = parseInt(field.value);
                if (isNaN(retriesValue) || retriesValue < 1 || retriesValue > 10) {
                    this.setFieldError(field, '最大重試次數必須在 1-10 之間');
                } else {
                    this.clearFieldError(field);
                }
                break;

            case 'lineAccessToken':
                if (field.value.trim() && !field.value.startsWith('Bearer ') && field.value.length < 50) {
                    this.setFieldError(field, 'Access Token 格式可能不正確');
                } else {
                    this.clearFieldError(field);
                }
                break;

            default:
                this.clearFieldError(field);
                break;
        }
    }

    /**
     * 設定欄位錯誤狀態
     */
    private setFieldError(field: HTMLInputElement, message: string): void {
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            formGroup.classList.add('has-error');
            formGroup.classList.remove('has-success');

            // 移除現有的錯誤訊息
            const existingError = formGroup.querySelector('.form-validation-error');
            if (existingError) {
                existingError.remove();
            }

            // 新增錯誤訊息
            const errorDiv = document.createElement('div');
            errorDiv.className = 'form-validation-error';
            errorDiv.textContent = message;
            field.parentNode?.insertBefore(errorDiv, field.nextSibling);
        }
    }

    /**
     * 清除欄位錯誤狀態
     */
    private clearFieldError(field: HTMLInputElement): void {
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            formGroup.classList.remove('has-error');
            formGroup.classList.add('has-success');

            // 移除錯誤訊息
            const errorDiv = formGroup.querySelector('.form-validation-error');
            if (errorDiv) {
                errorDiv.remove();
            }
        }
    }

    /**
     * HTML 轉義
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化應用程式
let bookMonitorUI: BookMonitorUI;

document.addEventListener('DOMContentLoaded', () => {
    bookMonitorUI = new BookMonitorUI();
});

// 將實例暴露到全域範圍供 HTML 中的 onclick 使用
document.addEventListener('DOMContentLoaded', () => {
    (window as any).bookMonitorUI = bookMonitorUI;
});