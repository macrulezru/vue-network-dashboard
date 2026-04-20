import type { UnifiedLogEntry, MockRule } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { getContentType, parseHeaders } from '../utils/helpers'

export interface XHRInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  onUpdateLog?: (id: string, updates: Partial<UnifiedLogEntry>) => void
  getMock?: (url: string, method: string, body?: unknown, headers?: Record<string, string>) => MockRule | null
  getThrottleDelay?: () => number
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

interface XHROpenData {
  method: string
  url: string
  headers: Record<string, string>
}

/**
 * Interceptor for XMLHttpRequest
 */
export class XHRInterceptor {
  private originalOpen: typeof XMLHttpRequest.prototype.open
  private originalSend: typeof XMLHttpRequest.prototype.send
  private originalSetRequestHeader: typeof XMLHttpRequest.prototype.setRequestHeader
  private options: XHRInterceptorOptions
  private isIntercepted: boolean = false
  private activeRequests: Map<XMLHttpRequest, XHRLogContext> = new Map()
  private readonly openData: WeakMap<XMLHttpRequest, XHROpenData> = new WeakMap()

  constructor(options: XHRInterceptorOptions) {
    this.originalOpen = XMLHttpRequest.prototype.open
    this.originalSend = XMLHttpRequest.prototype.send
    this.originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
    this.options = options
  }

  public intercept = (): void => {
    if (this.isIntercepted) return

    const originalOpen = this.originalOpen
    const originalSetRequestHeader = this.originalSetRequestHeader
    const originalSend = this.originalSend
    const openData = this.openData
    const handleXHR = this.handleXHR.bind(this)

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

    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
      handleXHR(this, body)
      return originalSend.call(this, body)
    }

    this.isIntercepted = true
  }

  public restore = (): void => {
    if (!this.isIntercepted) return
    XMLHttpRequest.prototype.open = this.originalOpen
    XMLHttpRequest.prototype.setRequestHeader = this.originalSetRequestHeader
    XMLHttpRequest.prototype.send = this.originalSend
    this.isIntercepted = false
  }

  private handleXHR = (xhr: XMLHttpRequest, body?: any): void => {
    const data = this.openData.get(xhr)
    const method = data?.method ?? 'GET'
    const url = data?.url ?? ''
    const requestHeaders = data?.headers ?? {}

    if (this.options.shouldLog && !this.options.shouldLog(url, method)) {
      return
    }

    const startTime = Date.now()
    const requestBody = this.processRequestBody(body)

    const logEntry = this.options.formatter.http.formatRequest({
      url,
      method,
      startTime,
      requestHeaders,
      requestBody,
      clientType: 'xhr'
    })

    const mockRule = this.options.getMock?.(url, method, requestBody, requestHeaders) ?? null
    if (mockRule) {
      this.handleMock(logEntry, mockRule, startTime)
      return
    }

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
    this.options.onLog({ ...logEntry, metadata: { ...logEntry.metadata, pending: true } })
    const throttle = this.options.getThrottleDelay?.() ?? 0
    if (throttle > 0) {
      setTimeout(() => this.attachEventListeners(xhr, context), throttle)
    } else {
      this.attachEventListeners(xhr, context)
    }
  }

  private handleMock = (
    logEntry: UnifiedLogEntry,
    rule: MockRule,
    startTime: number
  ): void => {
    const delay = rule.response.delay ?? 0
    setTimeout(() => {
      const endTime = Date.now()
      const mockHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...rule.response.headers
      }
      const enrichedEntry = this.options.formatter.http.formatResponse(logEntry, {
        status: rule.response.status,
        statusText: rule.response.statusText || 'OK (Mock)',
        responseHeaders: mockHeaders,
        responseBody: rule.response.body ?? null,
        endTime
      })
      this.options.onLog({
        ...enrichedEntry,
        metadata: { ...enrichedEntry.metadata, pending: false, mocked: true }
      })
    }, delay)
  }

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

  private attachEventListeners = (xhr: XMLHttpRequest, context: XHRLogContext): void => {
    const cleanup = () => {
      this.activeRequests.delete(xhr)
      this.openData.delete(xhr)
    }

    const complete = (entry: UnifiedLogEntry) => {
      const updates = { ...entry, metadata: { ...entry.metadata, pending: false } }
      if (this.options.onUpdateLog) {
        this.options.onUpdateLog(context.id, updates)
      } else {
        this.options.onLog(updates)
      }
    }

    xhr.addEventListener('load', () => {
      complete(this.processResponse(context, xhr, Date.now()))
      cleanup()
    })

    xhr.addEventListener('error', () => {
      complete(this.processError(context, xhr, Date.now()))
      cleanup()
    })

    xhr.addEventListener('abort', () => {
      complete(this.processAbort(context, Date.now()))
      cleanup()
    })

    xhr.addEventListener('timeout', () => {
      complete(this.processTimeout(context, Date.now()))
      cleanup()
    })
  }

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