import type { Ref } from 'vue'
import { ref } from 'vue'
import type { UnifiedLogEntry, LogStore as ILogStore, NetworkStats } from '../core/types'
import { formatBytes } from '../utils/helpers'

/**
 * Log store for managing network logs with reactive state
 * Uses Vue ref for reactivity without external state management
 */
export class LogStore implements ILogStore {
  private logsRef: Ref<UnifiedLogEntry[]>
  private maxLogs: number
  private listeners: Set<(entry: UnifiedLogEntry) => void>

  /**
   * Create a new log store instance
   * @param maxLogs - Maximum number of logs to keep (FIFO)
   */
  constructor(maxLogs: number = 1000) {
    this.logsRef = ref<UnifiedLogEntry[]>([])
    this.maxLogs = maxLogs
    this.listeners = new Set()
  }

  /**
   * Get reactive logs reference
   */
  public getLogsRef = (): Ref<UnifiedLogEntry[]> => {
    return this.logsRef
  }

  /**
   * Get all logs as array
   */
  public getLogs = (): UnifiedLogEntry[] => {
    return [...this.logsRef.value]
  }

  /**
   * Get logs property for interface compatibility
   */
  public get logs(): UnifiedLogEntry[] {
    return this.logsRef.value
  }

  /**
   * Add a new log entry
   * Automatically maintains maxLogs limit (FIFO)
   */
  public addLog = (entry: UnifiedLogEntry): void => {
    // Add to beginning (newest first)
    this.logsRef.value = [entry, ...this.logsRef.value]
    
    // Trim if exceeds max size
    if (this.logsRef.value.length > this.maxLogs) {
      this.logsRef.value = this.logsRef.value.slice(0, this.maxLogs)
    }
    
    // Notify listeners
    this.notifyListeners(entry)
  }

  /**
   * Clear all logs
   */
  public clear = (): void => {
    this.logsRef.value = []
  }

  /**
   * Get logs by type (http, websocket, or sse)
   */
  public getLogsByType = (type: 'http' | 'websocket' | 'sse'): UnifiedLogEntry[] => {
    return this.logsRef.value.filter(log => log.type === type)
  }

  /**
   * Get logs by URL pattern
   */
  public getLogsByUrl = (urlPattern: string | RegExp): UnifiedLogEntry[] => {
    const pattern = typeof urlPattern === 'string' 
      ? new RegExp(urlPattern, 'i') 
      : urlPattern
    
    return this.logsRef.value.filter(log => pattern.test(log.url))
  }

  /**
   * Get logs by HTTP status code range
   */
  public getLogsByStatus = (statusRange: [number, number]): UnifiedLogEntry[] => {
    const [min, max] = statusRange
    return this.logsRef.value.filter(log => {
      if (log.type !== 'http') return false
      const status = log.http?.status
      return status !== null && status !== undefined && status >= min && status <= max
    })
  }

  /**
   * Get logs by HTTP method
   */
  public getLogsByMethod = (method: string): UnifiedLogEntry[] => {
    return this.logsRef.value.filter(log => 
      log.method.toUpperCase() === method.toUpperCase()
    )
  }

  /**
   * Get logs with errors
   */
  public getErrorLogs = (): UnifiedLogEntry[] => {
    return this.logsRef.value.filter(log => log.error.occurred)
  }

  /**
   * Get logs within time range
   */
  public getLogsByTimeRange = (start: number, end: number): UnifiedLogEntry[] => {
    return this.logsRef.value.filter(log => 
      log.startTime >= start && log.startTime <= end
    )
  }

  /**
   * Query logs with multiple filters
   */
  public queryLogs = (filters: {
    type?: 'http' | 'websocket' | 'sse'
    url?: string | RegExp
    method?: string
    minDuration?: number
    maxDuration?: number
    startTime?: number
    endTime?: number
    hasError?: boolean
    statusCode?: number | number[]
  }): UnifiedLogEntry[] => {
    let results = [...this.logsRef.value]
    
    // Filter by type
    if (filters.type) {
      results = results.filter(log => log.type === filters.type)
    }
    
    // Filter by URL
    if (filters.url) {
      const pattern = typeof filters.url === 'string' 
        ? new RegExp(filters.url, 'i') 
        : filters.url
      results = results.filter(log => pattern.test(log.url))
    }
    
    // Filter by method
    if (filters.method) {
      results = results.filter(log => 
        log.method.toUpperCase() === filters.method!.toUpperCase()
      )
    }
    
    // Filter by duration
    if (filters.minDuration !== undefined) {
      results = results.filter(log => 
        log.duration !== null && log.duration >= filters.minDuration!
      )
    }
    if (filters.maxDuration !== undefined) {
      results = results.filter(log => 
        log.duration !== null && log.duration <= filters.maxDuration!
      )
    }
    
    // Filter by time
    if (filters.startTime) {
      results = results.filter(log => log.startTime >= filters.startTime!)
    }
    if (filters.endTime) {
      results = results.filter(log => log.startTime <= filters.endTime!)
    }
    
    // Filter by error
    if (filters.hasError !== undefined) {
      results = results.filter(log => log.error.occurred === filters.hasError)
    }
    
    // Filter by status code
    if (filters.statusCode) {
      const codes = Array.isArray(filters.statusCode) ? filters.statusCode : [filters.statusCode]
      results = results.filter(log => {
        if (log.type !== 'http') return false
        const status = log.http?.status
        return status !== null && status !== undefined && codes.includes(status)
      })
    }
    
    return results
  }

  /**
   * Get network statistics
   */
  public getStats = (): NetworkStats => {
    const logs = this.logsRef.value
    
    // Calculate totals
    let totalDataSent = 0
    let totalDataReceived = 0
    let totalDuration = 0
    let totalErrors = 0
    let sseEventCount = 0
    
    const requestsByMethod: Record<string, number> = {}
    const requestsByStatus: Record<string, number> = {}
    
    for (const log of logs) {
      // Data sizes
      if (log.request.bodySize) totalDataSent += log.request.bodySize
      if (log.response.bodySize) totalDataReceived += log.response.bodySize
      
      // Duration
      if (log.duration) totalDuration += log.duration
      
      // Errors
      if (log.error.occurred) totalErrors++
      
      // SSE events
      if (log.type === 'sse') sseEventCount++
      
      // Method stats
      const method = log.method
      requestsByMethod[method] = (requestsByMethod[method] || 0) + 1
      
      // Status stats (HTTP only)
      if (log.type === 'http' && log.http?.status) {
        const statusGroup = Math.floor(log.http.status / 100) + 'xx'
        requestsByStatus[statusGroup] = (requestsByStatus[statusGroup] || 0) + 1
      }
    }
    
    // Find slowest requests
    const slowestRequests = [...logs]
      .filter(l => l.duration !== null)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
    
    // Find largest requests (by total size)
    const largestRequests = [...logs]
      .filter(l => (l.request.bodySize || 0) + (l.response.bodySize || 0) > 0)
      .sort((a, b) => {
        const sizeA = (a.request.bodySize || 0) + (a.response.bodySize || 0)
        const sizeB = (b.request.bodySize || 0) + (b.response.bodySize || 0)
        return sizeB - sizeA
      })
      .slice(0, 10)
    
    return {
      totalRequests: logs.length,
      totalErrors,
      averageDuration: logs.length > 0 ? totalDuration / logs.length : 0,
      totalDataSent,
      totalDataReceived,
      requestsByMethod,
      requestsByStatus,
      slowestRequests,
      largestRequests,
      sseEventCount
    }
  }

  /**
   * Export logs in specified format
   */
  public export = (format: 'json' | 'csv' = 'json'): string => {
    if (format === 'json') {
      return JSON.stringify(this.logsRef.value, null, 2)
    }
    
    // CSV format
    if (format === 'csv') {
      const headers = [
        'id', 'type', 'method', 'url', 'status', 'duration', 
        'requestSize', 'responseSize', 'error', 'timestamp'
      ]
      
      const rows = this.logsRef.value.map(log => {
        const row = [
          log.id,
          log.type,
          log.method,
          log.url,
          log.http?.status?.toString() || log.sse?.eventType || '',
          log.duration?.toString() || '',
          log.request.bodySize?.toString() || '',
          log.response.bodySize?.toString() || '',
          log.error.occurred ? 'true' : 'false',
          log.metadata.timestamp
        ]
        // Escape CSV fields with quotes if needed
        return row.map(field => {
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`
          }
          return field
        }).join(',')
      })
      
      return [headers.join(','), ...rows].join('\n')
    }
    
    return ''
  }

  /**
   * Get formatted statistics summary
   */
  public getStatsSummary = (): string => {
    const stats = this.getStats()
    
    const lines = [
      '=== Network Statistics ===',
      `Total Requests: ${stats.totalRequests}`,
      `Total Errors: ${stats.totalErrors} (${stats.totalRequests ? ((stats.totalErrors / stats.totalRequests) * 100).toFixed(1) : 0}%)`,
      `Average Duration: ${stats.averageDuration.toFixed(2)}ms`,
      `Total Data Sent: ${formatBytes(stats.totalDataSent)}`,
      `Total Data Received: ${formatBytes(stats.totalDataReceived)}`,
      `SSE Events: ${stats.sseEventCount}`,
      '',
      'Requests by Method:',
      ...Object.entries(stats.requestsByMethod).map(([method, count]) => 
        `  ${method}: ${count}`
      ),
      '',
      'Requests by Status:',
      ...Object.entries(stats.requestsByStatus).map(([status, count]) => 
        `  ${status}: ${count}`
      )
    ]
    
    return lines.join('\n')
  }

  /**
   * Subscribe to new log entries
   * @returns Unsubscribe function
   */
  public subscribe = (callback: (entry: UnifiedLogEntry) => void): () => void => {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Notify all listeners of new log entry
   */
  private notifyListeners = (entry: UnifiedLogEntry): void => {
    this.listeners.forEach(listener => {
      try {
        listener(entry)
      } catch (error) {
        console.error('[LogStore] Listener error:', error)
      }
    })
  }

  /**
   * Get current store size
   */
  public getSize = (): number => {
    return this.logsRef.value.length
  }

  /**
   * Check if store is empty
   */
  public isEmpty = (): boolean => {
    return this.logsRef.value.length === 0
  }

  /**
   * Remove oldest logs to free up space
   */
  public prune = (keepCount: number): void => {
    if (keepCount >= this.logsRef.value.length) return
    this.logsRef.value = this.logsRef.value.slice(0, keepCount)
  }

  /**
   * Remove logs older than specified timestamp
   */
  public pruneOlderThan = (timestamp: number): void => {
    this.logsRef.value = this.logsRef.value.filter(log => log.startTime >= timestamp)
  }
}