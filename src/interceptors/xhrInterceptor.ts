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

// Interim data stored between open() and send()
interface XHROpenData {
  method: string
  url: string
  headers: Record<string, string>
}

/**
 * Interceptor for XMLHttpRequest
 * Wraps XHR methods to log all HTTP requests and responses.
 * Uses WeakMaps to store per-instance data without polluting XHR objects.
 */
export class XHRInterceptor {
  private originalOpen: typeof XMLHttpRequest.prototype.open
  private originalSend: typeof XMLHttpRequest.prototype.send
  private originalSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader
  private options: XHRInterceptorOptions
  private isIntercepted: boolean = false
  private activeRequests: Map<XMLHttpRequest, XHRLogContext> = new Map()

  // WeakMaps store per-XHR data without adding properties to the XHR instance
  private readonly openData: WeakMap<XMLHttpRequest, XHROpenData> = new WeakMap()

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

    const originalOpen = this.originalOpen
    const originalSetRequestHeader = this.originalSetRequestHeader
    const originalSend = this.originalSend
    const openData = this.openData
    const handleXHR = this.handleXHR.bind(this)

    // Override XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ): void {
      openData.set(this, { method, url: url.toString(), headers: {} })
      return originalOpen.call(this, method, url, async, username, password)
    }

    // Override XMLHttpRequest.prototype.setRequestHeader to track headers
    XMLHttpRequest.prototype.setRequestHeader = function(
      name: string,
      value: string
    ): void {
      const data = openData.get(this)
      if (data) {
        data.headers[name] = value
      }
      return originalSetRequestHeader.call(this, name, value)
    }

    // Override XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
      handleXHR(this, body)
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
  private handleXHR = (xhr: XMLHttpRequest, body?: any): void => {
    const data = this.openData.get(xhr)
    const method = data?.method ?? 'GET'
    const url = data?.url ?? ''
    const requestHeaders = data?.headers ?? {}

    // Check if should log this request
    if (this.options.shouldLog && !this.options.shouldLog(url, method)) {
      return
    }

    const startTime = Date.now()
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

    if (typeof body === 'string') {
      try {
        return JSON.parse(body)
      } catch {
        return body
      }
    }

    return body
  }

  /**
   * Attach event listeners to XHR to track response
   */
  private attachEventListeners = (xhr: XMLHttpRequest, context: XHRLogContext): void => {
    const cleanup = () => {
      this.activeRequests.delete(xhr)
      this.openData.delete(xhr)
    }

    xhr.addEventListener('load', () => {
      const endTime = Date.now()
      this.options.onLog(this.processResponse(context, xhr, endTime))
      cleanup()
    })

    xhr.addEventListener('error', () => {
      const endTime = Date.now()
      this.options.onLog(this.processError(context, xhr, endTime))
      cleanup()
    })

    xhr.addEventListener('abort', () => {
      const endTime = Date.now()
      this.options.onLog(this.processAbort(context, endTime))
      cleanup()
    })

    xhr.addEventListener('timeout', () => {
      const endTime = Date.now()
      this.options.onLog(this.processTimeout(context, endTime))
      cleanup()
    })
  }

  /**
   * Process successful response
   */
  private processResponse = (
    context: XHRLogContext,
    xhr: XMLHttpRequest,
    endTime: number
  ): UnifiedLogEntry => {
    const responseHeaders = parseHeaders(xhr.getAllResponseHeaders())
    const responseBodyType = getContentType(responseHeaders)

    let responseBody: any = null
    try {
      if (responseBodyType?.includes('application/json')) {
        responseBody = JSON.parse(xhr.responseText)
      } else if (responseBodyType?.includes('text/')) {
        responseBody = xhr.responseText
      } else {
        responseBody = xhr.responseText || `[Binary: ${xhr.response?.size || 'unknown'}]`
      }
    } catch {
      responseBody = xhr.responseText || '[Empty response]'
    }

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
