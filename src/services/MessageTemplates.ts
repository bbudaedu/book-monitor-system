import { BookInfo, ErrorInfo, LineMessage, DailySummary } from '../types';

/**
 * LINE 訊息模板服務
 * 提供各種類型的通知訊息模板，包括文字訊息和 Flex Message
 */
export class MessageTemplates {
  
  /**
   * 建立新書通知的 Flex Message
   */
  static createBookNotificationFlexMessage(bookInfo: BookInfo): LineMessage {
    const statusColor = this.getStatusColor(bookInfo.status);
    const statusText = this.getStatusText(bookInfo.status);
    const statusIcon = this.getStatusIcon(bookInfo.status);

    return {
      type: 'flex',
      altText: `📚 發現新書：${bookInfo.title}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📚 新書通知',
              weight: 'bold',
              color: '#1DB446',
              size: 'sm'
            }
          ],
          backgroundColor: '#F0F8F0',
          paddingTop: 'lg',
          paddingBottom: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: bookInfo.title,
              weight: 'bold',
              size: 'lg',
              wrap: true,
              color: '#333333'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '作者',
                      color: '#666666',
                      size: 'sm',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: bookInfo.author || '未知',
                      wrap: true,
                      color: '#333333',
                      size: 'sm',
                      flex: 3
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '狀態',
                      color: '#666666',
                      size: 'sm',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: `${statusIcon} ${statusText}`,
                      wrap: true,
                      color: statusColor,
                      size: 'sm',
                      flex: 3,
                      weight: 'bold'
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: '查看原始連結',
                uri: bookInfo.pdfUrl
              }
            },
            {
              type: 'text',
              text: `通知時間：${new Date().toLocaleString('zh-TW')}`,
              color: '#999999',
              size: 'xs',
              align: 'center'
            }
          ]
        }
      }
    };
  }

  /**
   * 建立新書通知的文字訊息
   */
  static createBookNotificationTextMessage(bookInfo: BookInfo): LineMessage {
    const statusText = this.getStatusText(bookInfo.status);
    const downloadInfo = bookInfo.filePath ? 
      `\n📁 檔案位置: ${bookInfo.filePath}` : '';
    
    const text = `📚 發現新書！

📖 書名: ${bookInfo.title}
✍️ 作者: ${bookInfo.author || '未知'}
📊 狀態: ${statusText}${downloadInfo}

🔗 原始連結: ${bookInfo.pdfUrl}

⏰ 通知時間: ${new Date().toLocaleString('zh-TW')}`;

    return {
      type: 'text',
      text
    };
  }

  /**
   * 建立錯誤通知的 Flex Message
   */
  static createErrorNotificationFlexMessage(errorInfo: ErrorInfo): LineMessage {
    const severityColor = this.getErrorSeverityColor(errorInfo.code);
    const severityIcon = this.getErrorSeverityIcon(errorInfo.code);

    return {
      type: 'flex',
      altText: `⚠️ 系統錯誤：${errorInfo.code}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${severityIcon} 系統錯誤通知`,
              weight: 'bold',
              color: '#FFFFFF',
              size: 'sm'
            }
          ],
          backgroundColor: severityColor,
          paddingTop: 'lg',
          paddingBottom: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: errorInfo.code,
              weight: 'bold',
              size: 'lg',
              color: severityColor
            },
            {
              type: 'text',
              text: errorInfo.message,
              wrap: true,
              color: '#333333',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '發生時間',
                      color: '#666666',
                      size: 'sm',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: errorInfo.timestamp.toLocaleString('zh-TW'),
                      wrap: true,
                      color: '#333333',
                      size: 'sm',
                      flex: 2
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: errorInfo.retryCount !== undefined ? {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `🔄 重試次數: ${errorInfo.retryCount}`,
              color: '#666666',
              size: 'sm',
              align: 'center'
            }
          ]
        } : undefined
      }
    };
  }

  /**
   * 建立錯誤通知的文字訊息
   */
  static createErrorNotificationTextMessage(errorInfo: ErrorInfo): LineMessage {
    const retryInfo = errorInfo.retryCount !== undefined ? 
      `\n🔄 重試次數: ${errorInfo.retryCount}` : '';

    const text = `⚠️ 系統錯誤通知

🚨 錯誤代碼: ${errorInfo.code}
📝 錯誤訊息: ${errorInfo.message}${retryInfo}

⏰ 發生時間: ${errorInfo.timestamp.toLocaleString('zh-TW')}

請檢查系統狀態或聯繫管理員。`;

    return {
      type: 'text',
      text
    };
  }

  /**
   * 建立系統狀態通知的 Flex Message
   */
  static createStatusNotificationFlexMessage(status: string, details?: any): LineMessage {
    const statusColor = this.getSystemStatusColor(status);
    const statusIcon = this.getSystemStatusIcon(status);

    const detailsContents = [];
    if (details) {
      if (details.booksFound !== undefined) {
        detailsContents.push({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '發現書籍',
              color: '#666666',
              size: 'sm',
              flex: 1
            },
            {
              type: 'text',
              text: `${details.booksFound} 本`,
              color: '#333333',
              size: 'sm',
              flex: 1,
              align: 'end'
            }
          ]
        });
      }
      if (details.downloaded !== undefined) {
        detailsContents.push({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '已下載',
              color: '#666666',
              size: 'sm',
              flex: 1
            },
            {
              type: 'text',
              text: `${details.downloaded} 本`,
              color: '#1DB446',
              size: 'sm',
              flex: 1,
              align: 'end',
              weight: 'bold'
            }
          ]
        });
      }
      if (details.errors !== undefined) {
        detailsContents.push({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '錯誤數',
              color: '#666666',
              size: 'sm',
              flex: 1
            },
            {
              type: 'text',
              text: `${details.errors} 個`,
              color: details.errors > 0 ? '#FF5551' : '#333333',
              size: 'sm',
              flex: 1,
              align: 'end',
              weight: details.errors > 0 ? 'bold' : 'regular'
            }
          ]
        });
      }
    }

    return {
      type: 'flex',
      altText: `ℹ️ 系統狀態：${status}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${statusIcon} 系統狀態通知`,
              weight: 'bold',
              color: '#FFFFFF',
              size: 'sm'
            }
          ],
          backgroundColor: statusColor,
          paddingTop: 'lg',
          paddingBottom: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: status,
              weight: 'bold',
              size: 'lg',
              color: statusColor
            },
            ...(detailsContents.length > 0 ? [
              {
                type: 'box',
                layout: 'vertical',
                margin: 'lg',
                spacing: 'sm',
                contents: detailsContents
              }
            ] : [])
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `⏰ 通知時間：${new Date().toLocaleString('zh-TW')}`,
              color: '#999999',
              size: 'xs',
              align: 'center'
            }
          ]
        }
      }
    };
  }

  /**
   * 建立系統狀態通知的文字訊息
   */
  static createStatusNotificationTextMessage(status: string, details?: any): LineMessage {
    let text = `ℹ️ 系統狀態通知

📊 狀態: ${status}`;

    if (details) {
      if (details.booksFound !== undefined) {
        text += `\n📚 發現書籍數: ${details.booksFound}`;
      }
      if (details.downloaded !== undefined) {
        text += `\n⬇️ 已下載: ${details.downloaded}`;
      }
      if (details.errors !== undefined) {
        text += `\n❌ 錯誤數: ${details.errors}`;
      }
    }

    text += `\n\n⏰ 通知時間: ${new Date().toLocaleString('zh-TW')}`;

    return {
      type: 'text',
      text
    };
  }

  /**
   * 建立每日摘要通知的 Flex Message
   */
  static createDailySummaryFlexMessage(summary: DailySummary): LineMessage {
    return {
      type: 'flex',
      altText: `📊 每日摘要 - ${summary.date.toLocaleDateString('zh-TW')}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📊 每日摘要報告',
              weight: 'bold',
              color: '#FFFFFF',
              size: 'md'
            },
            {
              type: 'text',
              text: summary.date.toLocaleDateString('zh-TW'),
              color: '#FFFFFF',
              size: 'sm'
            }
          ],
          backgroundColor: '#1DB446',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '📚 總書籍數',
                      color: '#666666',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${summary.totalBooks} 本`,
                      color: '#333333',
                      size: 'sm',
                      flex: 1,
                      align: 'end',
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '🆕 新增書籍',
                      color: '#666666',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${summary.newBooks} 本`,
                      color: '#1DB446',
                      size: 'sm',
                      flex: 1,
                      align: 'end',
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '✅ 下載成功',
                      color: '#666666',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${summary.downloaded} 本`,
                      color: '#1DB446',
                      size: 'sm',
                      flex: 1,
                      align: 'end',
                      weight: 'bold'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  contents: [
                    {
                      type: 'text',
                      text: '❌ 下載失敗',
                      color: '#666666',
                      size: 'sm',
                      flex: 2
                    },
                    {
                      type: 'text',
                      text: `${summary.failed} 本`,
                      color: summary.failed > 0 ? '#FF5551' : '#333333',
                      size: 'sm',
                      flex: 1,
                      align: 'end',
                      weight: summary.failed > 0 ? 'bold' : 'regular'
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    };
  }

  /**
   * 取得狀態文字描述
   */
  private static getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': '等待下載',
      'downloading': '下載中',
      'completed': '下載完成',
      'failed': '下載失敗'
    };
    
    return statusMap[status] || status;
  }

  /**
   * 取得狀態圖示
   */
  private static getStatusIcon(status: string): string {
    const iconMap: { [key: string]: string } = {
      'pending': '⏳',
      'downloading': '⬇️',
      'completed': '✅',
      'failed': '❌'
    };
    
    return iconMap[status] || '📄';
  }

  /**
   * 取得狀態顏色
   */
  private static getStatusColor(status: string): string {
    const colorMap: { [key: string]: string } = {
      'pending': '#FFA500',
      'downloading': '#1E90FF',
      'completed': '#1DB446',
      'failed': '#FF5551'
    };
    
    return colorMap[status] || '#333333';
  }

  /**
   * 取得錯誤嚴重程度顏色
   */
  private static getErrorSeverityColor(errorCode: string): string {
    if (errorCode.includes('CRITICAL') || errorCode.includes('FATAL')) {
      return '#FF0000';
    } else if (errorCode.includes('ERROR')) {
      return '#FF5551';
    } else if (errorCode.includes('WARNING') || errorCode.includes('WARN')) {
      return '#FFA500';
    }
    return '#FF5551';
  }

  /**
   * 取得錯誤嚴重程度圖示
   */
  private static getErrorSeverityIcon(errorCode: string): string {
    if (errorCode.includes('CRITICAL') || errorCode.includes('FATAL')) {
      return '🚨';
    } else if (errorCode.includes('ERROR')) {
      return '⚠️';
    } else if (errorCode.includes('WARNING') || errorCode.includes('WARN')) {
      return '⚠️';
    }
    return '⚠️';
  }

  /**
   * 取得系統狀態顏色
   */
  private static getSystemStatusColor(status: string): string {
    if (status.includes('啟動') || status.includes('完成') || status.includes('成功')) {
      return '#1DB446';
    } else if (status.includes('停止') || status.includes('暫停')) {
      return '#FFA500';
    } else if (status.includes('錯誤') || status.includes('失敗')) {
      return '#FF5551';
    }
    return '#1E90FF';
  }

  /**
   * 取得系統狀態圖示
   */
  private static getSystemStatusIcon(status: string): string {
    if (status.includes('啟動')) {
      return '🚀';
    } else if (status.includes('完成')) {
      return '✅';
    } else if (status.includes('停止')) {
      return '⏹️';
    } else if (status.includes('暫停')) {
      return '⏸️';
    } else if (status.includes('錯誤') || status.includes('失敗')) {
      return '❌';
    }
    return 'ℹ️';
  }
}