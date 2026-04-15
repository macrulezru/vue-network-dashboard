export interface UnifiedLogEntry {
  id: string
  type: 'http' | 'websocket' | 'sse'
  
  startTime: number
  endTime: number | null
  duration: number | null
  
  url: string
  method: string
  
  http: {
    status: number | null
    statusText: string | null
    protocol: string | null
  } | null
  
  websocket: {
    readyState: number
    eventType: 'connection' | 'open' | 'message' | 'error' | 'close'
    direction: 'incoming' | 'outgoing' | null
    code: number | null
    reason: string | null
    wasClean: boolean | null
  } | null
  
  sse: {
    readyState: number
    eventType: string | null
    lastEventId: string | null
  } | null
  
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  
  request: {
    body: any | null
    bodyRaw: string | null
    bodySize: number | null
    bodyType: string | null
  }
  
  response: {
    body: any | null
    bodyRaw: string | null
    bodySize: number | null
    bodyType: string | null
  }
  
  error: {
    occurred: boolean
    message: string | null
    name: string | null
    stack: string | null
  }
  
  metadata: {
    clientType: 'fetch' | 'xhr' | 'websocket' | 'eventsource'
    redirected: boolean
    retryCount: number
    timestamp: string
    pending?: boolean      // true while request is in-flight
    mocked?: boolean       // true if the response was returned by a mock rule
    connectionId?: string  // WebSocket: shared ID for all events of one connection
  }

  /** Vue Router route path at the moment the request was initiated */
  route?: string
}

// ─── Mock rules ───────────────────────────────────────────────────────────────

export interface MockRule {
  id: string
  name?: string
  enabled: boolean
  /** String substring or RegExp tested against the full URL */
  urlPattern: string | RegExp
  /** If omitted, matches any HTTP method */
  method?: string
  response: {
    status: number
    statusText?: string
    headers?: Record<string, string>
    body?: unknown
    /** Artificial delay in milliseconds before responding */
    delay?: number
  }
}

/**
 * Minimal interface for Vue Router — avoids a hard dependency on vue-router.
 * Any Router instance (vue-router v4) satisfies this shape.
 */
export interface RouterInstance {
  currentRoute: { value: { fullPath: string; name?: string | symbol | null } }
  afterEach(guard: (to: { fullPath: string; name?: string | symbol | null }) => void): () => void
}

export interface NetworkDashboardOptions {
  enabled?: boolean
  maxLogs?: number
  /**
   * Vue Router instance. When provided together with `enrichWithRoute: true`,
   * each log entry will carry the current route path at the time of the request.
   */
  router?: RouterInstance
  /** Attach the current Vue Router route to every log entry. Requires `router`. */
  enrichWithRoute?: boolean
  interceptors?: {
    fetch?: boolean
    xhr?: boolean
    websocket?: boolean
    sse?: boolean
  }
  filters?: {
    urlPattern?: RegExp
    excludeUrlPattern?: RegExp
    methods?: string[]
    statusCodes?: number[]
    bodySizeThreshold?: number
  }
  sanitization?: {
    sensitiveHeaders?: string[]
    sensitiveFields?: string[]
    maskFields?: string[]
  }
  metrics?: {
    calculateTTFB?: boolean
    trackRetries?: boolean
  }
  callbacks?: {
    onLog?: (entry: UnifiedLogEntry) => void
    onError?: (error: Error) => void
    onFlush?: (logs: UnifiedLogEntry[]) => void
  }
  devOnly?: boolean
  persistToStorage?: boolean
  ui?: {
    hotkey?: string
    hotkeyModifiers?: {
      ctrl?: boolean
      alt?: boolean
      shift?: boolean
      meta?: boolean
    }
    /** Panel color scheme. 'auto' follows the OS prefers-color-scheme. Default: 'dark'. */
    theme?: 'dark' | 'light' | 'auto'
  }
}

export interface NetworkStats {
  totalRequests: number
  totalErrors: number
  averageDuration: number
  totalDataSent: number
  totalDataReceived: number
  requestsByMethod: Record<string, number>
  requestsByStatus: Record<string, number>
  slowestRequests: UnifiedLogEntry[]
  largestRequests: UnifiedLogEntry[]
  sseEventCount: number
}

export interface LogStore {
  logs: UnifiedLogEntry[]
  addLog(entry: UnifiedLogEntry): void
  clear(): void
  getLogs(): UnifiedLogEntry[]
  getLogsByType(type: 'http' | 'websocket' | 'sse'): UnifiedLogEntry[]
  getLogsByUrl(urlPattern: string | RegExp): UnifiedLogEntry[]
  getLogsByStatus(statusRange: [number, number]): UnifiedLogEntry[]
  getLogsByMethod(method: string): UnifiedLogEntry[]
  getErrorLogs(): UnifiedLogEntry[]
  queryLogs(filters: {
    type?: 'http' | 'websocket' | 'sse'
    url?: string | RegExp
    method?: string
    minDuration?: number
    maxDuration?: number
    startTime?: number
    endTime?: number
    hasError?: boolean
    statusCode?: number | number[]
  }): UnifiedLogEntry[]
  getStats(): NetworkStats
  export(format: 'json' | 'csv' | 'har', customLogs?: UnifiedLogEntry[]): string
  subscribe(callback: (entry: UnifiedLogEntry) => void): () => void
  getSize(): number
  isEmpty(): boolean
  prune(keepCount: number): void
  pruneOlderThan(timestamp: number): void
}

export interface SanitizationRules {
  sensitiveHeaders: string[]
  sensitiveFields: string[]
  maskFields: string[]
  maskPattern?: (value: string) => string
}