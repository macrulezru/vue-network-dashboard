import type { UnifiedLogEntry } from './types'
import { generateId, getContentType } from '../utils/helpers'
import { calculateSize, safeStringify, getDataType } from '../utils/sizeCalculator'

export interface FormatHTTPParams {
  id?: string
  url: string
  method: string
  startTime: number
  endTime?: number | null
  duration?: number | null
  requestHeaders: Record<string, string>
  responseHeaders?: Record<string, string>
  requestBody?: any
  responseBody?: any
  status?: number | null
  statusText?: string | null
  protocol?: string | null
  error?: {
    occurred: boolean
    message: string | null
    name: string | null
    stack: string | null
  }
  clientType: 'fetch' | 'xhr'
  redirected?: boolean
}

export interface FormatWebSocketParams {
  id?: string
  connectionId?: string
  url: string
  startTime: number
  endTime?: number | null
  duration?: number | null
  eventType: 'connection' | 'open' | 'message' | 'error' | 'close'
  direction?: 'incoming' | 'outgoing' | null
  data?: any
  readyState?: number
  error?: {
    occurred: boolean
    message: string | null
    name: string | null
    stack: string | null
  }
  closeInfo?: {
    code: number
    reason: string
    wasClean: boolean
  }
}

export interface FormatSSEParams {
  id?: string
  connectionId?: string
  url: string
  startTime: number
  endTime?: number | null
  duration?: number | null
  eventType: string | null
  eventData: any
  lastEventId: string | null
  readyState: number
  error?: {
    occurred: boolean
    message: string | null
    name: string | null
    stack: string | null
  }
}

export interface FormatOptions {
  sanitizeHeaders?: (headers: Record<string, string>) => Record<string, string>
  sanitizeBody?: (body: any) => any
}

/**
 * Formatter for HTTP requests and responses
 * Creates unified log entries from HTTP data
 */
export class HTTPFormatter {
  private options: FormatOptions

  constructor(options: FormatOptions = {}) {
    this.options = options
  }

  /**
   * Create base HTTP log entry from request data
   */
  public formatRequest = (params: FormatHTTPParams): UnifiedLogEntry => {
    const id = params.id || generateId()
    const requestBody = this.sanitizeBody(params.requestBody)
    const requestBodyRaw = safeStringify(requestBody)
    const requestBodySize = calculateSize(requestBody)
    const requestBodyType = getDataType(requestBody)
    
    const requestHeaders = this.sanitizeHeaders(params.requestHeaders)
    
    return {
      id,
      type: 'http',
      startTime: params.startTime,
      endTime: params.endTime || null,
      duration: params.duration || null,
      url: params.url,
      method: params.method,
      http: {
        status: params.status ?? null,
        statusText: params.statusText ?? null,
        protocol: params.protocol ?? null
      },
      websocket: null,
      sse: null,
      requestHeaders,
      responseHeaders: {},
      request: {
        body: requestBody,
        bodyRaw: requestBodyRaw,
        bodySize: requestBodySize,
        bodyType: requestBodyType
      },
      response: {
        body: null,
        bodyRaw: null,
        bodySize: null,
        bodyType: null
      },
      error: params.error || {
        occurred: false,
        message: null,
        name: null,
        stack: null
      },
      metadata: {
        clientType: params.clientType,
        redirected: params.redirected || false,
        retryCount: 0,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Enrich HTTP log entry with response data
   */
  public formatResponse = (
    logEntry: UnifiedLogEntry,
    params: {
      status: number
      statusText: string
      protocol?: string
      responseHeaders: Record<string, string>
      responseBody: any
      endTime: number
      redirected?: boolean
    }
  ): UnifiedLogEntry => {
    const duration = params.endTime - logEntry.startTime
    const responseBody = this.sanitizeBody(params.responseBody)
    const responseBodyRaw = safeStringify(responseBody)
    const responseBodySize = calculateSize(responseBody)
    const responseBodyType = getContentType(params.responseHeaders)
    
    return {
      ...logEntry,
      endTime: params.endTime,
      duration,
      http: {
        status: params.status,
        statusText: params.statusText,
        protocol: params.protocol || null
      },
      responseHeaders: this.sanitizeHeaders(params.responseHeaders),
      response: {
        body: responseBody,
        bodyRaw: responseBodyRaw,
        bodySize: responseBodySize,
        bodyType: responseBodyType
      },
      metadata: {
        ...logEntry.metadata,
        redirected: params.redirected || false,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Create error HTTP log entry
   */
  public formatError = (
    params: FormatHTTPParams,
    error: any,
    endTime: number
  ): UnifiedLogEntry => {
    const logEntry = this.formatRequest(params)
    const duration = endTime - logEntry.startTime
    
    return {
      ...logEntry,
      endTime,
      duration,
      error: {
        occurred: true,
        message: error?.message || 'Unknown error',
        name: error?.name || 'Error',
        stack: error?.stack || null
      },
      metadata: {
        ...logEntry.metadata,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Sanitize headers using configured function
   */
  private sanitizeHeaders = (headers: Record<string, string>): Record<string, string> => {
    if (this.options.sanitizeHeaders) {
      return this.options.sanitizeHeaders(headers)
    }
    return headers
  }

  /**
   * Sanitize body using configured function
   */
  private sanitizeBody = (body: any): any => {
    if (this.options.sanitizeBody) {
      return this.options.sanitizeBody(body)
    }
    return body
  }
}

/**
 * Formatter for WebSocket events
 * Creates unified log entries from WebSocket data
 */
export class WebSocketFormatter {
  private options: FormatOptions

  constructor(options: FormatOptions = {}) {
    this.options = options
  }

  /**
   * Format WebSocket event into unified log entry
   */
  public format = (params: FormatWebSocketParams): UnifiedLogEntry => {
    const id = params.id || generateId()
    const startTime = params.startTime
    const endTime = params.endTime || null
    const duration = params.duration || null
    
    // Determine method string for display - расширенный вывод
    let method = 'WEBSOCKET'
    if (params.eventType === 'open') method = 'WS OPEN'
    if (params.eventType === 'close') method = 'WS CLOSE'
    if (params.eventType === 'error') method = 'WS ERROR'
    if (params.eventType === 'message' && params.direction === 'incoming') method = 'WS ← message'
    if (params.eventType === 'message' && params.direction === 'outgoing') method = 'WS → message'
    if (params.eventType === 'connection') method = 'WS CONNECTING'
    
    // Process message data
    let data = params.data
    let dataRaw: string | null = null
    let dataSize: number | null = null
    
    if (data !== undefined && data !== null) {
      if (typeof data === 'string') {
        dataRaw = data
        dataSize = new Blob([data]).size
        // Try to parse as JSON
        try {
          data = JSON.parse(data)
        } catch {
          // Keep as string
        }
      } else if (data instanceof Blob) {
        dataRaw = `[Blob: ${data.size} bytes, type: ${data.type || 'unknown'}]`
        dataSize = data.size
        data = dataRaw
      } else if (data instanceof ArrayBuffer) {
        dataRaw = `[ArrayBuffer: ${data.byteLength} bytes]`
        dataSize = data.byteLength
        data = dataRaw
      } else {
        dataRaw = String(data)
        dataSize = new Blob([dataRaw]).size
      }
      
      // Sanitize data if needed
      if (this.options.sanitizeBody && typeof data === 'object') {
        data = this.options.sanitizeBody(data)
      }
    }
    
    return {
      id,
      type: 'websocket',
      startTime,
      endTime,
      duration,
      url: params.url,
      method,
      http: null,
      websocket: {
        readyState: params.readyState ?? 0,
        eventType: params.eventType,
        direction: params.direction ?? null,
        code: params.closeInfo?.code ?? null,
        reason: params.closeInfo?.reason ?? null,
        wasClean: params.closeInfo?.wasClean ?? null
      },
      sse: null,
      requestHeaders: {},
      responseHeaders: {},
      request: {
        body: null,
        bodyRaw: null,
        bodySize: null,
        bodyType: null
      },
      response: {
        body: data ?? null,
        bodyRaw: dataRaw,
        bodySize: dataSize,
        bodyType: params.eventType === 'message' ? 'websocket-message' : null
      },
      error: params.error || {
        occurred: false,
        message: null,
        name: null,
        stack: null
      },
      metadata: {
        clientType: 'websocket',
        redirected: false,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        ...(params.connectionId ? { connectionId: params.connectionId } : {})
      }
    }
  }
}

/**
 * Formatter for Server-Sent Events (SSE)
 * Creates unified log entries from SSE data
 */
export class SSEFormatter {
  private options: FormatOptions

  constructor(options: FormatOptions = {}) {
    this.options = options
  }

  /**
   * Format SSE event into unified log entry
   */
  public format = (params: FormatSSEParams): UnifiedLogEntry => {
    const id = params.id || generateId()
    const startTime = params.startTime
    const endTime = params.endTime || null
    const duration = params.duration || null

    // Determine method string for display
    let method = 'EVENTSOURCE'
    if (params.eventType === 'open') method = 'SSE OPEN'
    if (params.eventType === 'message') method = `SSE ← ${params.eventType}`
    if (params.eventType === 'error') method = 'SSE ERROR'
    if (params.eventType && params.eventType !== 'message' && params.eventType !== 'open' && params.eventType !== 'error') {
      method = `SSE ← ${params.eventType}`
    }

    // Sanitize event data if needed
    let eventData = params.eventData
    if (this.options.sanitizeBody && eventData) {
      eventData = this.options.sanitizeBody(eventData)
    }

    const eventDataRaw = eventData != null
      ? (typeof eventData === 'string' ? eventData : safeStringify(eventData))
      : null
    const eventDataSize = eventData != null ? calculateSize(eventData) : null

    return {
      id,
      type: 'sse',
      startTime,
      endTime,
      duration,
      url: params.url,
      method,
      http: null,
      websocket: null,
      sse: {
        readyState: params.readyState,
        eventType: params.eventType,
        lastEventId: params.lastEventId
      },
      requestHeaders: {},
      responseHeaders: {},
      request: {
        body: null,
        bodyRaw: null,
        bodySize: null,
        bodyType: null
      },
      response: {
        body: eventData,
        bodyRaw: eventDataRaw,
        bodySize: eventDataSize,
        bodyType: eventData != null ? 'text/event-stream' : null
      },
      error: params.error || {
        occurred: false,
        message: null,
        name: null,
        stack: null
      },
      metadata: {
        clientType: 'eventsource',
        redirected: false,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        ...(params.connectionId ? { connectionId: params.connectionId } : {})
      }
    }
  }
}

/**
 * Main formatter that combines HTTP, WebSocket and SSE formatters
 */
export class LogFormatter {
  public http: HTTPFormatter
  public websocket: WebSocketFormatter
  public sse: SSEFormatter

  constructor(options: FormatOptions = {}) {
    this.http = new HTTPFormatter(options)
    this.websocket = new WebSocketFormatter(options)
    this.sse = new SSEFormatter(options)
  }

  /**
   * Update formatter options
   */
  public updateOptions = (options: FormatOptions): void => {
    this.http = new HTTPFormatter(options)
    this.websocket = new WebSocketFormatter(options)
    this.sse = new SSEFormatter(options)
  }
}