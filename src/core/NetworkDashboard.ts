import type { Ref } from 'vue'
import type {
  UnifiedLogEntry,
  NetworkDashboardOptions,
  NetworkStats,
  MockRule,
  MockRulesGroup,
  BreakpointRule,
  ActiveBreakpoint,
  BreakpointEdits
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
import { generateId } from '../utils/helpers'

const DEFAULT_STORAGE_KEY = 'vue-network-dashboard'
const DEFAULT_MOCK_GROUPS_KEY = 'vue-network-dashboard:mockGroups'

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
  private mockGroups: MockRulesGroup[] = []
  private mockChangeCallbacks: Set<() => void> = new Set()
  private mockGroupsChangeCallbacks: Set<(groups: MockRulesGroup[]) => void> = new Set()
  private currentRoute: string | undefined = undefined
  private routerUnsubscribe: (() => void) | null = null
  private throttleDelay: number = 0
  private breakpointRules: BreakpointRule[] = []
  private pendingBreakpoints: Map<string, { data: ActiveBreakpoint; resolve: (edits: BreakpointEdits | null) => void }> = new Map()
  private activeBreakpointCallbacks: Set<(bps: ActiveBreakpoint[]) => void> = new Set()

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

    // Check if in development mode.
    this.isDev = (typeof process !== 'undefined' ? process.env['NODE_ENV'] : 'production') !== 'production'

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

    // Load mock groups (with migration from old format)
    this.loadMockGroups()

    // Load persisted logs if enabled
    if (this.options.persistToStorage) {
      this.loadFromStorage()
    }

    // Subscribe to Vue Router if provided
    if (options.enrichWithRoute && options.router) {
      this.currentRoute = options.router.currentRoute.value.fullPath
      this.routerUnsubscribe = options.router.afterEach((to) => {
        this.currentRoute = to.fullPath
      })
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
    const getMock = (url: string, method: string, body?: unknown, headers?: Record<string, string>) =>
      this.getMockForRequest(url, method, body, headers)
    const getThrottleDelay = () => this.throttleDelay
    const pauseRequest = (url: string, method: string, body: unknown, headers: Record<string, string>) =>
      this.checkBreakpoint(url, method, body, headers)

    // Initialize interceptors with formatter
    if (this.options.interceptors?.fetch) {
      const fetchOptions: FetchInterceptorOptions = {
        onLog,
        onUpdateLog,
        getMock,
        getThrottleDelay,
        pauseRequest,
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
        getThrottleDelay,
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

    // Attach current route if enrichment is enabled
    if (this.currentRoute !== undefined) {
      entry.route = this.currentRoute
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
   * Find the first enabled mock rule from enabled groups that matches a request
   */
  private getMockForRequest = (url: string, method: string, requestBody?: unknown, requestHeaders?: Record<string, string>): MockRule | null => {
    for (const group of this.mockGroups) {
      if (!group.enabled) continue
      if (!group.rules) continue
      for (const rule of group.rules) {
        if (!rule.enabled) continue
        if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) continue
        const pattern = rule.urlPattern instanceof RegExp
          ? rule.urlPattern
          : new RegExp(rule.urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        if (!pattern.test(url)) continue
        if (rule.conditions && !this.matchConditions(rule.conditions, url, requestBody, requestHeaders)) continue
        return rule
      }
    }
    return null
  }

  private matchConditions = (
    conditions: NonNullable<import('./types').MockRule['conditions']>,
    url: string,
    requestBody?: unknown,
    requestHeaders?: Record<string, string>
  ): boolean => {
    if (conditions.queryParams) {
      const searchParams = new URL(url, 'http://x').searchParams
      for (const [k, v] of Object.entries(conditions.queryParams)) {
        if (searchParams.get(k) !== v) return false
      }
    }
    if (conditions.headers && requestHeaders) {
      for (const [k, v] of Object.entries(conditions.headers)) {
        if ((requestHeaders[k.toLowerCase()] ?? '').toLowerCase() !== v.toLowerCase()) return false
      }
    }
    if (conditions.bodyFields && requestBody && typeof requestBody === 'object' && requestBody !== null) {
      const body = requestBody as Record<string, unknown>
      for (const [k, v] of Object.entries(conditions.bodyFields)) {
        if (body[k] !== v) return false
      }
    }
    return true
  }

  // ─── Throttling ────────────────────────────────────────────────────────────────

  public setThrottle = (delayMs: number): void => {
    this.throttleDelay = Math.max(0, delayMs)
  }

  public getThrottle = (): number => this.throttleDelay

  // ─── Breakpoints ───────────────────────────────────────────────────────────────

  public addBreakpointRule = (rule: Omit<BreakpointRule, 'id'>): BreakpointRule => {
    const full: BreakpointRule = { ...rule, id: generateId() }
    this.breakpointRules.push(full)
    return full
  }

  public removeBreakpointRule = (id: string): void => {
    this.breakpointRules = this.breakpointRules.filter(r => r.id !== id)
  }

  public updateBreakpointRule = (id: string, updates: Partial<Omit<BreakpointRule, 'id'>>): void => {
    const rule = this.breakpointRules.find(r => r.id === id)
    if (rule) Object.assign(rule, updates)
  }

  public getBreakpointRules = (): BreakpointRule[] => [...this.breakpointRules]

  public getActiveBreakpoints = (): ActiveBreakpoint[] =>
    [...this.pendingBreakpoints.values()].map(p => p.data)

  public onActiveBreakpointsChange = (cb: (bps: ActiveBreakpoint[]) => void): (() => void) => {
    this.activeBreakpointCallbacks.add(cb)
    return () => this.activeBreakpointCallbacks.delete(cb)
  }

  public releaseBreakpoint = (id: string, edits: BreakpointEdits): void => {
    const pending = this.pendingBreakpoints.get(id)
    if (!pending) return
    this.pendingBreakpoints.delete(id)
    this.notifyActiveBreakpoints()
    pending.resolve(edits)
  }

  public cancelBreakpoint = (id: string): void => {
    const pending = this.pendingBreakpoints.get(id)
    if (!pending) return
    this.pendingBreakpoints.delete(id)
    this.notifyActiveBreakpoints()
    pending.resolve(null)
  }

  public checkBreakpoint = (
    url: string,
    method: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<BreakpointEdits | null> | null => {
    const rule = this.breakpointRules.find(r => {
      if (!r.enabled) return false
      if (r.method && r.method.toUpperCase() !== method.toUpperCase()) return false
      const pattern = r.urlPattern instanceof RegExp
        ? r.urlPattern
        : new RegExp(r.urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      return pattern.test(url)
    })
    if (!rule) return null

    const id = generateId()
    const data: ActiveBreakpoint = { id, url, method, requestHeaders: headers, requestBody: body, timestamp: Date.now() }

    return new Promise<BreakpointEdits | null>(resolve => {
      this.pendingBreakpoints.set(id, { data, resolve })
      this.notifyActiveBreakpoints()
    })
  }

  private notifyActiveBreakpoints = (): void => {
    const bps = this.getActiveBreakpoints()
    for (const cb of this.activeBreakpointCallbacks) cb(bps)
  }

  // ─── Mock groups API ───────────────────────────────────────────────────────────

  /**
   * Get all mock groups
   */
  public getMockGroups = (): MockRulesGroup[] => {
    return [...this.mockGroups]
  }

  /**
   * Add a new mock group
   */
  public addMockGroup = (name: string): MockRulesGroup => {
    const group: MockRulesGroup = {
      id: generateId(),
      name,
      enabled: true,
      isOpened: true,
      rules: []
    }
    this.mockGroups.push(group)
    this.saveMockGroups()
    this.notifyMockGroupsChange()
    return group
  }

  /**
   * Remove a mock group by id
   */
  public removeMockGroup = (groupId: string): void => {
    const index = this.mockGroups.findIndex(g => g.id === groupId)
    if (index !== -1) {
      this.mockGroups.splice(index, 1)
      this.saveMockGroups()
      this.notifyMockGroupsChange()
    }
  }

  /**
   * Toggle a mock group on/off
   */
  public toggleMockGroup = (groupId: string, enabled: boolean): void => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (group) {
      group.enabled = enabled
      this.saveMockGroups()
      this.notifyMockGroupsChange()
    }
  }

  /**
   * Expand/collapse a mock group
   */
  public expandMockGroup = (groupId: string, isOpened: boolean): void => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (group) {
      group.isOpened = isOpened
      this.saveMockGroups()
      this.notifyMockGroupsChange()
    }
  }

  /**
   * Rename a mock group
   */
  public renameMockGroup = (groupId: string, name: string): void => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (group) {
      group.name = name
      this.saveMockGroups()
      this.notifyMockGroupsChange()
    }
  }

  /**
   * Replace all mock groups (used for import)
   */
  public replaceMockGroups = (groups: MockRulesGroup[]): void => {
    this.mockGroups = groups.map(g => ({
      ...g,
      rules: g.rules ?? []
    }))
    this.saveMockGroups()
    this.notifyMockGroupsChange()
  }
  
  /**
   * Add a mock rule to a specific group
   */
  public addMockToGroup = (groupId: string, rule: Omit<MockRule, 'id'>): MockRule => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (!group) {
      throw new Error(`Group "${groupId}" not found`)
    }
    const id = Math.random().toString(36).slice(2)
    const fullRule: MockRule = { ...rule, id }
    if (!group.rules) group.rules = []
    group.rules.push(fullRule)
    this.saveMockGroups()
    this.notifyMockGroupsChange()
    return fullRule
  }

  /**
   * Remove a mock rule from its group
   */
  public removeMockFromGroup = (groupId: string, ruleId: string): void => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (group && group.rules) {
      const index = group.rules.findIndex(r => r.id === ruleId)
      if (index !== -1) {
        group.rules.splice(index, 1)
        this.saveMockGroups()
        this.notifyMockGroupsChange()
      }
    }
  }

  /**
   * Update a mock rule in its group
   */
  public updateMockInGroup = (
    groupId: string,
    ruleId: string,
    updates: Partial<Omit<MockRule, 'id'>>
  ): void => {
    const group = this.mockGroups.find(g => g.id === groupId)
    if (group && group.rules) {
      const rule = group.rules.find(r => r.id === ruleId)
      if (rule) {
        Object.assign(rule, updates)
        this.saveMockGroups()
        this.notifyMockGroupsChange()
      }
    }
  }

  // ─── Legacy mock API (for backward compatibility) ──────────────────────────────

  public addMock = (rule: Omit<MockRule, 'id'>): MockRule => {
    const group = this.mockGroups.find(g => g.name === 'default') ?? this.mockGroups[0]
    if (!group) throw new Error('No mock groups available')
    return this.addMockToGroup(group.id, rule)
  }

  public updateMock = (id: string, updates: Partial<Omit<MockRule, 'id'>>): void => {
    for (const group of this.mockGroups) {
      const rule = group.rules?.find(r => r.id === id)
      if (rule) {
        Object.assign(rule, updates)
        this.saveMockGroups()
        this.notifyMockGroupsChange()
        return
      }
    }
  }

  public removeMock = (id: string): void => {
    for (const group of this.mockGroups) {
      const index = group.rules?.findIndex(r => r.id === id) ?? -1
      if (index !== -1 && group.rules) {
        group.rules.splice(index, 1)
        this.saveMockGroups()
        this.notifyMockGroupsChange()
        return
      }
    }
  }

  public clearMocks = (): void => {
    for (const group of this.mockGroups) {
      if (group.rules) group.rules = []
    }
    this.saveMockGroups()
    this.notifyMockGroupsChange()
  }

  public getMocks = (): MockRule[] => {
    return this.mockGroups.flatMap(g => g.rules || [])
  }

  // ─── Mock events ───────────────────────────────────────────────────────────────

  private notifyMocksChange = (): void => {
    this.mockChangeCallbacks.forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error('[NetworkDashboard] Mock change callback error:', error)
      }
    })
  }

  private notifyMockGroupsChange = (): void => {
    this.mockGroupsChangeCallbacks.forEach(callback => {
      try {
        callback(this.getMockGroups())
      } catch (error) {
        console.error('[NetworkDashboard] Mock groups change callback error:', error)
      }
    })
    // Also notify legacy mock change subscribers
    this.notifyMocksChange()
  }

  public onMocksChange = (callback: () => void): () => void => {
    this.mockChangeCallbacks.add(callback)
    return () => {
      this.mockChangeCallbacks.delete(callback)
    }
  }

  public onMockGroupsChange = (callback: (groups: MockRulesGroup[]) => void): () => void => {
    this.mockGroupsChangeCallbacks.add(callback)
    return () => {
      this.mockGroupsChangeCallbacks.delete(callback)
    }
  }

  // ─── Persistence ───────────────────────────────────────────────────────────────

  private saveMockGroups = (): void => {
    if (this.options.persistToStorage) {
      try {
        localStorage.setItem(DEFAULT_MOCK_GROUPS_KEY, JSON.stringify(this.mockGroups))
      } catch (error) {
        console.error('[NetworkDashboard] Failed to save mock groups:', error)
      }
    }
  }

  private loadMockGroups = (): void => {
    // Try to load from localStorage
    if (this.options.persistToStorage) {
      try {
        const saved = localStorage.getItem(DEFAULT_MOCK_GROUPS_KEY)
        if (saved) {
          this.mockGroups = JSON.parse(saved)
          // Ensure each group has rules array
          for (const group of this.mockGroups) {
            if (!group.rules) group.rules = []
          }
          return
        }
      } catch (error) {
        console.error('[NetworkDashboard] Failed to load mock groups:', error)
      }
    }

    // Migration from old mock format (single list)
    const oldMocksKey = `${DEFAULT_STORAGE_KEY}:mocks`
    try {
      const oldMocks = localStorage.getItem(oldMocksKey)
      if (oldMocks) {
        const mocks = JSON.parse(oldMocks) as MockRule[]
        if (mocks.length) {
          this.mockGroups = [{
            id: generateId(),
            name: 'default',
            enabled: true,
            isOpened: true,
            rules: mocks
          }]
          this.saveMockGroups()
          localStorage.removeItem(oldMocksKey)
          return
        }
      }
    } catch (error) {
      console.error('[NetworkDashboard] Failed to migrate old mocks:', error)
    }

    // Default: create a 'default' group
    this.mockGroups = [{
      id: generateId(),
      name: 'default',
      enabled: true,
      isOpened: true,
      rules: []
    }]
  }

  private saveToStorage = (): void => {
    if (this.saveStorageTimer !== null) {
      clearTimeout(this.saveStorageTimer)
    }
    this.saveStorageTimer = setTimeout(() => {
      this.saveStorageTimer = null
      try {
        const logs = this.store.getLogs()
        const toSave = logs.slice(0, 100)
        localStorage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(toSave))
      } catch (error) {
        console.error('[NetworkDashboard] Failed to save to storage:', error)
      }
    }, 500)
  }

  private loadFromStorage = (): void => {
    try {
      const saved = localStorage.getItem(DEFAULT_STORAGE_KEY)
      if (saved) {
        const logs = JSON.parse(saved) as UnifiedLogEntry[]
        logs.reverse().forEach(log => {
          this.store.addLog(log)
        })
      }
    } catch (error) {
      console.error('[NetworkDashboard] Failed to load from storage:', error)
    }
  }

  // ─── Public updateLog ──────────────────────────────────────────────────────────

  public updateLog = (id: string, updates: Partial<UnifiedLogEntry>): void => {
    this.store.updateLog(id, updates)
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
      localStorage.removeItem(DEFAULT_STORAGE_KEY)
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
  public export = (format: 'json' | 'csv' | 'har' = 'json', customLogs?: UnifiedLogEntry[]): string => {
    return this.store.export(format, customLogs)
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
    
    if (wasEnabled) {
      this.disable()
    }
    
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
    
    const sanitizationRules = getSanitizationRules(this.options.sanitization)
    this.formatter.updateOptions({
      sanitizeHeaders: (headers: Record<string, string>) => {
        return sanitizeHeaders(headers, sanitizationRules.sensitiveHeaders)
      },
      sanitizeBody: (body: any) => {
        return sanitizeBody(body, sanitizationRules.sensitiveFields, sanitizationRules.maskFields)
      }
    })
    
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
    this.mockChangeCallbacks.clear()
    this.mockGroupsChangeCallbacks.clear()
    this.routerUnsubscribe?.()
    this.routerUnsubscribe = null
    
    if (this.options.persistToStorage) {
      localStorage.removeItem(DEFAULT_STORAGE_KEY)
    }
  }
}