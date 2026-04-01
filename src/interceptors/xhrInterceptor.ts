import type { UnifiedLogEntry } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { getContentType, parseHeaders } from '../utils/helpers'

export interface XHRInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  formatter: LogFormatter
  shouldLog?: (url: string, method: string) => boolean
}

interface XHRLogContext {
  id: string
  startTime: number
  url: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: any
  logEntry: UnifiedLogEntry
}

/**
 * Store for tracking setRequestHeader calls
 */
interface XHRWithHeaders extends XMLHttpRequest {
  __loggerHeaders?: Record<string, string>
  __loggerMethod?: string
  __loggerUrl?: string
}

/**
 * Interceptor for XMLHttpRequest
 * Wraps XHR methods to log all HTTP requests and responses
 */
export class XHRInterceptor {
  private originalOpen: typeof XMLHttpRequest.prototype.open
  private originalSend: typeof XMLHttpRequest.prototype.send
  private originalSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader
  private options: XHRInterceptorOptions
  private isIntercepted: boolean = false
  private activeRequests: Map<XMLHttpRequest, XHRLogContext> = new Map()

  constructor(options: XHRInterceptorOptions) {
    this.originalOpen = XMLHttpRequest.prototype.open
    this.originalSend = XMLHttpRequest.prototype.send
    this.originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
    this.options = options
  }

  /**
   * Enable XHR interception
   */
  public intercept = (): void => {
    if (this.isIntercepted) return
    
    // Store references to methods that need to be called with correct context
    const originalOpen = this.originalOpen
    const originalSetRequestHeader = this.originalSetRequestHeader
    const originalSend = this.originalSend
    const handleXHR = this.handleXHR.bind(this)
    
    // Override XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ): void {
      // Store request info on the XHR object
      const xhr = this as XHRWithHeaders
      xhr.__loggerMethod = method
      xhr.__loggerUrl = url.toString()
      xhr.__loggerHeaders = {}
      
      return originalOpen.call(this, method, url, async, username, password)
    }
    
    // Override XMLHttpRequest.prototype.setRequestHeader to track headers
    XMLHttpRequest.prototype.setRequestHeader = function(
      name: string,
      value: string
    ): void {
      const xhr = this as XHRWithHeaders
      if (xhr.__loggerHeaders) {
        xhr.__loggerHeaders[name] = value
      }
      return originalSetRequestHeader.call(this, name, value)
    }
    
    // Override XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
      handleXHR(this as XHRWithHeaders, body)
      return originalSend.call(this, body)
    }
    
    this.isIntercepted = true
  }

  /**
   * Disable XHR interception and restore original
   */
  public restore = (): void => {
    if (!this.isIntercepted) return
    XMLHttpRequest.prototype.open = this.originalOpen
    XMLHttpRequest.prototype.setRequestHeader = this.originalSetRequestHeader
    XMLHttpRequest.prototype.send = this.originalSend
    this.isIntercepted = false
  }

  /**
   * Handle XHR request lifecycle
   */
  private handleXHR = (xhr: XHRWithHeaders, body?: any): void => {
    const method = xhr.__loggerMethod || 'GET'
    const url = xhr.__loggerUrl || ''
    
    // Check if should log this request
    if (this.options.shouldLog && !this.options.shouldLog(url, method)) {
      return
    }
    
    const startTime = Date.now()
    
    // Extract request headers from tracked headers
    const requestHeaders = xhr.__loggerHeaders || {}
    
    // Process request body
    const requestBody = this.processRequestBody(body)
    
    // Create initial log entry using formatter
    const logEntry = this.options.formatter.http.formatRequest({
      url,
      method,
      startTime,
      requestHeaders,
      requestBody,
      clientType: 'xhr'
    })
    
    // Store context for this request
    const context: XHRLogContext = {
      id: logEntry.id,
      startTime,
      url,
      method,
      requestHeaders,
      requestBody,
      logEntry
    }
    
    this.activeRequests.set(xhr, context)
    
    // Log request start
    this.options.onLog(logEntry)
    
    // Attach event listeners
    this.attachEventListeners(xhr, context)
  }

  /**
   * Process request body
   */
  private processRequestBody = (body?: any): any => {
    if (!body) return null
    
    let processedBody = body
    
    // Try to parse if it's a string that looks like JSON
    if (typeof body === 'string') {
      try {
        processedBody = JSON.parse(body)
      } catch {
        // Keep as string
      }
    }
    
    return processedBody
  }

  /**
   * Attach event listeners to XHR to track response
   */
  private attachEventListeners = (xhr: XMLHttpRequest, context: XHRLogContext): void => {
    const handleLoad = () => {
      const endTime = Date.now()
      const processedEntry = this.processResponse(context, xhr, endTime)
      this.options.onLog(processedEntry)
      this.activeRequests.delete(xhr)
    }
    
    const handleError = () => {
      const endTime = Date.now()
      const errorEntry = this.processError(context, xhr, endTime)
      this.options.onLog(errorEntry)
      this.activeRequests.delete(xhr)
    }
    
    const handleAbort = () => {
      const endTime = Date.now()
      const abortEntry = this.processAbort(context, xhr, endTime)
      this.options.onLog(abortEntry)
      this.activeRequests.delete(xhr)
    }
    
    const handleTimeout = () => {
      const endTime = Date.now()
      const timeoutEntry = this.processTimeout(context, xhr, endTime)
      this.options.onLog(timeoutEntry)
      this.activeRequests.delete(xhr)
    }
    
    xhr.addEventListener('load', handleLoad)
    xhr.addEventListener('error', handleError)
    xhr.addEventListener('abort', handleAbort)
    xhr.addEventListener('timeout', handleTimeout)
  }

  /**
   * Process successful response
   */
  private processResponse = (
    context: XHRLogContext,
    xhr: XMLHttpRequest,
    endTime: number
  ): UnifiedLogEntry => {
    // Extract response headers
    const responseHeadersRaw = xhr.getAllResponseHeaders()
    const responseHeaders = parseHeaders(responseHeadersRaw)
    
    // Extract response body
    let responseBody: any = null
    const responseBodyType = getContentType(responseHeaders)
    
    try {
      const contentType = responseBodyType
      
      if (contentType?.includes('application/json')) {
        responseBody = JSON.parse(xhr.responseText)
      } else if (contentType?.includes('text/')) {
        responseBody = xhr.responseText
      } else {
        responseBody = xhr.responseText || `[Binary: ${xhr.response?.size || 'unknown'}]`
      }
    } catch {
      responseBody = xhr.responseText || '[Empty response]'
    }
    
    // Enrich log entry with response data
    return this.options.formatter.http.formatResponse(context.logEntry, {
      status: xhr.status,
      statusText: xhr.statusText,
      responseHeaders,
      responseBody,
      endTime
    })
  }

  /**
   * Process error
   */
  private processError = (
    context: XHRLogContext,
    xhr: XMLHttpRequest,
    endTime: number
  ): UnifiedLogEntry => {
    return this.options.formatter.http.formatError(
      {
        url: context.url,
        method: context.method,
        startTime: context.startTime,
        requestHeaders: context.requestHeaders,
        requestBody: context.requestBody,
        clientType: 'xhr'
      },
      new Error(`XHR request failed: ${xhr.status} ${xhr.statusText}`),
      endTime
    )
  }

  /**
   * Process abort
   */
  private processAbort = (
    context: XHRLogContext,
    _xhr: XMLHttpRequest,
    endTime: number
  ): UnifiedLogEntry => {
    return this.options.formatter.http.formatError(
      {
        url: context.url,
        method: context.method,
        startTime: context.startTime,
        requestHeaders: context.requestHeaders,
        requestBody: context.requestBody,
        clientType: 'xhr'
      },
      new Error('XHR request aborted'),
      endTime
    )
  }

  /**
   * Process timeout
   */
  private processTimeout = (
    context: XHRLogContext,
    _xhr: XMLHttpRequest,
    endTime: number
  ): UnifiedLogEntry => {
    return this.options.formatter.http.formatError(
      {
        url: context.url,
        method: context.method,
        startTime: context.startTime,
        requestHeaders: context.requestHeaders,
        requestBody: context.requestBody,
        clientType: 'xhr'
      },
      new Error('XHR request timeout'),
      endTime
    )
  }
}