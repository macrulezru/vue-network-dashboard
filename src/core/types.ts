export interface UnifiedLogEntry {
  id: string
  type: 'http' | 'websocket'
  
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
    clientType: 'fetch' | 'xhr' | 'websocket'
    redirected: boolean
    retryCount: number
    timestamp: string
  }
}

export interface NetworkDashboardOptions {
  enabled?: boolean
  maxLogs?: number
  interceptors?: {
    fetch?: boolean
    xhr?: boolean
    websocket?: boolean
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
}

export interface LogStore {
  logs: UnifiedLogEntry[]
  addLog(entry: UnifiedLogEntry): void
  clear(): void
  getLogs(): UnifiedLogEntry[]
  getLogsByType(type: 'http' | 'websocket'): UnifiedLogEntry[]
  getLogsByUrl(urlPattern: string | RegExp): UnifiedLogEntry[]
  getLogsByStatus(statusRange: [number, number]): UnifiedLogEntry[]
  getLogsByMethod(method: string): UnifiedLogEntry[]
  getErrorLogs(): UnifiedLogEntry[]
  queryLogs(filters: {
    type?: 'http' | 'websocket'
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
  export(format: 'json' | 'csv'): string
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