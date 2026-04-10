import type { Ref } from 'vue'
import type {
  UnifiedLogEntry,
  NetworkDashboardOptions,
  NetworkStats,
  MockRule
} from './types'
import { LogStore as LogStoreImpl } from '../store/logStore'
import { LogFormatter } from './formatters'
import {
  FetchInterceptor,
  XHRInterceptor,
  WebSocketInterceptor,
  SSEInterceptor,
  type FetchInterceptorOptions,
  type XHRInterceptorOptions,
  type WebSocketInterceptorOptions,
  type SSEInterceptorOptions
} from '../interceptors'
import {
  sanitizeHeaders,
  sanitizeBody,
  getSanitizationRules
} from '../utils/sanitizer'

/**
 * Main Network Logger class
 * Manages all interceptors and provides unified logging interface
 */
export class NetworkDashboard {
  private store: LogStoreImpl
  private formatter: LogFormatter
  private options: NetworkDashboardOptions
  private fetchInterceptor: FetchInterceptor | null = null
  private xhrInterceptor: XHRInterceptor | null = null
  private websocketInterceptor: WebSocketInterceptor | null = null
  private sseInterceptor: SSEInterceptor | null = null
  private isEnabled: boolean = false
  private isDev: boolean = false
  private saveStorageTimer: ReturnType<typeof setTimeout> | null = null
  private mockRules: Map<string, MockRule> = new Map()

  /**
   * Create a new NetworkDashboard instance
   * @param options - Configuration options
   */
  constructor(options: NetworkDashboardOptions = {}) {
    this.options = {
      enabled: true,
      maxLogs: 1000,
      devOnly: false,
      persistToStorage: false,
      ...options,
      interceptors: {
        fetch: true,
        xhr: true,
        websocket: true,
        sse: true,
        ...options.interceptors
      },
      filters: {
        ...options.filters
      },
      sanitization: {
        ...options.sanitization
      },
      metrics: {
        ...options.metrics
      },
      callbacks: {
        ...options.callbacks
      }
    }

    // Check if in development mode
    this.isDev = import.meta.env.DEV

    // Initialize store
    this.store = new LogStoreImpl(this.options.maxLogs)

    // Initialize formatter with sanitization
    const sanitizationRules = getSanitizationRules(this.options.sanitization)
    this.formatter = new LogFormatter({
      sanitizeHeaders: (headers: Record<string, string>) => {
        return sanitizeHeaders(headers, sanitizationRules.sensitiveHeaders)
      },
      sanitizeBody: (body: any) => {
        return sanitizeBody(body, sanitizationRules.sensitiveFields, sanitizationRules.maskFields)
      }
    })

    // Load persisted logs if enabled
    if (this.options.persistToStorage) {
      this.loadFromStorage()
    }

    // Auto-enable if conditions met
    if (this.shouldAutoEnable()) {
      this.enable()
    }
  }

  /**
   * Check if logger should auto-enable
   */
  private shouldAutoEnable = (): boolean => {
    if (!this.options.enabled) return false
    if (this.options.devOnly && !this.isDev) return false
    return true
  }

  /**
   * Enable network logging
   */
  public enable = (): void => {
    if (this.isEnabled) return

    const shouldLog = this.createShouldLogFilter()
    const onLog = this.handleLog.bind(this)
    const onUpdateLog = this.handleUpdateLog.bind(this)
    const getMock = this.getMockForRequest.bind(this)

    // Initialize interceptors with formatter
    if (this.options.interceptors?.fetch) {
      const fetchOptions: FetchInterceptorOptions = {
        onLog,
        onUpdateLog,
        getMock,
        formatter: this.formatter,
        shouldLog
      }
      this.fetchInterceptor = new FetchInterceptor(fetchOptions)
      this.fetchInterceptor.intercept()
    }

    if (this.options.interceptors?.xhr) {
      const xhrOptions: XHRInterceptorOptions = {
        onLog,
        onUpdateLog,
        getMock,
        formatter: this.formatter,
        shouldLog
      }
      this.xhrInterceptor = new XHRInterceptor(xhrOptions)
      this.xhrInterceptor.intercept()
    }

    if (this.options.interceptors?.websocket) {
      const websocketOptions: WebSocketInterceptorOptions = {
        onLog,
        formatter: this.formatter,
        shouldLog: (url: string) => shouldLog(url, 'WEBSOCKET')
      }
      this.websocketInterceptor = new WebSocketInterceptor(websocketOptions)
      this.websocketInterceptor.intercept()
    }

    if (this.options.interceptors?.sse) {
      const sseOptions: SSEInterceptorOptions = {
        onLog,
        formatter: this.formatter,
        shouldLog: (url: string) => shouldLog(url, 'EVENTSOURCE')
      }
      this.sseInterceptor = new SSEInterceptor(sseOptions)
      this.sseInterceptor.intercept()
    }

    this.isEnabled = true
  }

  /**
   * Disable network logging and restore original methods
   */
  public disable = (): void => {
    if (!this.isEnabled) return

    this.fetchInterceptor?.restore()
    this.xhrInterceptor?.restore()
    this.websocketInterceptor?.restore()
    this.sseInterceptor?.restore()

    this.fetchInterceptor = null
    this.xhrInterceptor = null
    this.websocketInterceptor = null
    this.sseInterceptor = null

    this.isEnabled = false
  }

  /**
   * Create filter function based on options
   */
  private createShouldLogFilter = (): ((url: string, method: string) => boolean) => {
    const filters = this.options.filters

    if (!filters) {
      return () => true
    }

    return (url: string, method: string): boolean => {
      // Check URL pattern
      if (filters.urlPattern && !filters.urlPattern.test(url)) {
        return false
      }

      // Check exclude URL pattern
      if (filters.excludeUrlPattern && filters.excludeUrlPattern.test(url)) {
        return false
      }

      // Check method filter
      if (filters.methods && filters.methods.length > 0) {
        if (!filters.methods.includes(method.toUpperCase())) {
          return false
        }
      }

      return true
    }
  }

  /**
   * Handle new log entry
   */
  private handleLog = (entry: UnifiedLogEntry): void => {
    // Apply status code filter if needed
    if (this.options.filters?.statusCodes && entry.http?.status) {
      if (!this.options.filters.statusCodes.includes(entry.http.status)) {
        return
      }
    }

    // Apply body size filter if needed
    if (this.options.filters?.bodySizeThreshold) {
      const totalSize = (entry.request.bodySize || 0) + (entry.response.bodySize || 0)
      if (totalSize < this.options.filters.bodySizeThreshold) {
        return
      }
    }

    // Add to store
    this.store.addLog(entry)

    // Trigger callback
    if (this.options.callbacks?.onLog) {
      try {
        this.options.callbacks.onLog(entry)
      } catch (error) {
        console.error('[NetworkDashboard] Callback error:', error)
      }
    }

    // Persist to storage if enabled
    if (this.options.persistToStorage) {
      this.saveToStorage()
    }
  }

  /**
   * Update an existing log entry in-place (pending → complete transition)
   */
  private handleUpdateLog = (id: string, updates: Partial<UnifiedLogEntry>): void => {
    this.store.updateLog(id, updates)
    if (this.options.persistToStorage) {
      this.saveToStorage()
    }
  }

  /**
   * Find the first enabled mock rule that matches a request
   */
  private getMockForRequest = (url: string, method: string): MockRule | null => {
    for (const rule of this.mockRules.values()) {
      if (!rule.enabled) continue
      if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) continue
      const pattern = rule.urlPattern instanceof RegExp
        ? rule.urlPattern
        : new RegExp(rule.urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      if (pattern.test(url)) return rule
    }
    return null
  }

  // ─── Public mock API ───────────────────────────────────────────────────────────

  public addMock = (rule: Omit<MockRule, 'id'>): MockRule => {
    const id = Math.random().toString(36).slice(2)
    const fullRule: MockRule = { ...rule, id }
    this.mockRules.set(id, fullRule)
    return fullRule
  }

  public updateMock = (id: string, updates: Partial<Omit<MockRule, 'id'>>): void => {
    const rule = this.mockRules.get(id)
    if (rule) this.mockRules.set(id, { ...rule, ...updates })
  }

  public removeMock = (id: string): void => {
    this.mockRules.delete(id)
  }

  public clearMocks = (): void => {
    this.mockRules.clear()
  }

  public getMocks = (): MockRule[] => {
    return Array.from(this.mockRules.values())
  }

  // ─── Public updateLog ──────────────────────────────────────────────────────────

  public updateLog = (id: string, updates: Partial<UnifiedLogEntry>): void => {
    this.store.updateLog(id, updates)
  }

  /**
   * Save logs to localStorage (debounced — max once per 500ms)
   */
  private saveToStorage = (): void => {
    if (this.saveStorageTimer !== null) {
      clearTimeout(this.saveStorageTimer)
    }
    this.saveStorageTimer = setTimeout(() => {
      this.saveStorageTimer = null
      try {
        const logs = this.store.getLogs()
        // Only save last 100 logs to avoid storage limits
        const toSave = logs.slice(0, 100)
        localStorage.setItem('vue-network-dashboard', JSON.stringify(toSave))
      } catch (error) {
        console.error('[NetworkDashboard] Failed to save to storage:', error)
      }
    }, 500)
  }

  /**
   * Load logs from localStorage
   */
  private loadFromStorage = (): void => {
    try {
      const saved = localStorage.getItem('vue-network-dashboard')
      if (saved) {
        const logs = JSON.parse(saved) as UnifiedLogEntry[]
        // Restore logs in reverse order to maintain chronology
        logs.reverse().forEach(log => {
          this.store.addLog(log)
        })
      }
    } catch (error) {
      console.error('[NetworkDashboard] Failed to load from storage:', error)
    }
  }

  /**
   * Clear all logs
   */
  public clear = (): void => {
    const flushed = this.store.getLogs()
    this.store.clear()
    if (this.options.persistToStorage) {
      if (this.saveStorageTimer !== null) {
        clearTimeout(this.saveStorageTimer)
        this.saveStorageTimer = null
      }
      localStorage.removeItem('vue-network-dashboard')
    }
    if (this.options.callbacks?.onFlush) {
      try {
        this.options.callbacks.onFlush(flushed)
      } catch (error) {
        console.error('[NetworkDashboard] onFlush callback error:', error)
      }
    }
  }

  /**
   * Get reactive logs reference
   */
  public getLogsRef = (): Ref<UnifiedLogEntry[]> => {
    return this.store.getLogsRef()
  }

  /**
   * Get all logs as array
   */
  public getLogs = (): UnifiedLogEntry[] => {
    return this.store.getLogs()
  }

  /**
   * Get logs by type
   */
  public getLogsByType = (type: 'http' | 'websocket' | 'sse'): UnifiedLogEntry[] => {
    return this.store.getLogsByType(type)
  }

  /**
   * Get logs by URL pattern
   */
  public getLogsByUrl = (urlPattern: string | RegExp): UnifiedLogEntry[] => {
    return this.store.getLogsByUrl(urlPattern)
  }

  /**
   * Get logs by status code range
   */
  public getLogsByStatus = (statusRange: [number, number]): UnifiedLogEntry[] => {
    return this.store.getLogsByStatus(statusRange)
  }

  /**
   * Get logs by HTTP method
   */
  public getLogsByMethod = (method: string): UnifiedLogEntry[] => {
    return this.store.getLogsByMethod(method)
  }

  /**
   * Get error logs
   */
  public getErrorLogs = (): UnifiedLogEntry[] => {
    return this.store.getErrorLogs()
  }

  /**
   * Query logs with filters
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
    return this.store.queryLogs(filters)
  }

  /**
   * Get network statistics
   */
  public getStats = (): NetworkStats => {
    return this.store.getStats()
  }

  /**
   * Export logs in specified format
   */
  public export = (format: 'json' | 'csv' | 'har' = 'json'): string => {
    return this.store.export(format)
  }

  /**
   * Subscribe to new log entries
   */
  public subscribe = (callback: (entry: UnifiedLogEntry) => void): () => void => {
    return this.store.subscribe(callback)
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
      `Total Data Sent: ${this.formatBytes(stats.totalDataSent)}`,
      `Total Data Received: ${this.formatBytes(stats.totalDataReceived)}`,
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
   * Format bytes to human readable string
   */
  private formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Get current store size
   */
  public getSize = (): number => {
    return this.store.getSize()
  }

  /**
   * Check if logger is enabled
   */
  public getEnabled = (): boolean => {
    return this.isEnabled
  }

  /**
   * Update configuration
   */
  public updateOptions = (options: Partial<NetworkDashboardOptions>): void => {
    const wasEnabled = this.isEnabled
    
    // Disable if currently enabled
    if (wasEnabled) {
      this.disable()
    }
    
    // Merge options
    this.options = {
      ...this.options,
      ...options,
      interceptors: {
        ...this.options.interceptors,
        ...options.interceptors
      },
      filters: {
        ...this.options.filters,
        ...options.filters
      },
      sanitization: {
        ...this.options.sanitization,
        ...options.sanitization
      },
      metrics: {
        ...this.options.metrics,
        ...options.metrics
      },
      callbacks: {
        ...this.options.callbacks,
        ...options.callbacks
      }
    }
    
    // Update formatter with new sanitization rules
    const sanitizationRules = getSanitizationRules(this.options.sanitization)
    this.formatter.updateOptions({
      sanitizeHeaders: (headers: Record<string, string>) => {
        return sanitizeHeaders(headers, sanitizationRules.sensitiveHeaders)
      },
      sanitizeBody: (body: any) => {
        return sanitizeBody(body, sanitizationRules.sensitiveFields, sanitizationRules.maskFields)
      }
    })
    
    // Re-enable if it was enabled
    if (wasEnabled) {
      this.enable()
    }
  }

  /**
   * Get current configuration
   */
  public getOptions = (): NetworkDashboardOptions => {
    return { ...this.options }
  }

  /**
   * Destroy logger instance and clean up
   */
  public destroy = (): void => {
    this.disable()
    this.clear()
    
    if (this.options.persistToStorage) {
      localStorage.removeItem('vue-network-dashboard')
    }
  }
}