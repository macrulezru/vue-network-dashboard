import type { UnifiedLogEntry, MockRule, BreakpointEdits } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { getContentType } from '../utils/helpers'

export interface FetchInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  onUpdateLog?: (id: string, updates: Partial<UnifiedLogEntry>) => void
  getMock?: (url: string, method: string, body?: unknown, headers?: Record<string, string>) => MockRule | null
  pauseRequest?: (url: string, method: string, body: unknown, headers: Record<string, string>) => Promise<BreakpointEdits | null> | null
  getThrottleDelay?: () => number
  formatter: LogFormatter
  shouldLog?: (url: string, method: string) => boolean
}

/**
 * Interceptor for Fetch API
 */
export class FetchInterceptor {
  private originalFetch: typeof fetch
  private options: FetchInterceptorOptions
  private isIntercepted: boolean = false

  constructor(options: FetchInterceptorOptions) {
    this.originalFetch = window.fetch.bind(window)
    this.options = options
  }

  public intercept = (): void => {
    if (this.isIntercepted) return
    const wrappedFetch = this.wrappedFetch.bind(this)
    window.fetch = async function(...args: Parameters<typeof fetch>) {
      return wrappedFetch(...args)
    }
    this.isIntercepted = true
  }

  public restore = (): void => {
    if (!this.isIntercepted) return
    window.fetch = this.originalFetch
    this.isIntercepted = false
  }

  private getUrl = (resource: RequestInfo | URL): string => {
    if (typeof resource === 'string') return resource
    if (resource instanceof URL) return resource.toString()
    return resource.url
  }

  private wrappedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [resource, config = {}] = args
    const url = this.getUrl(resource)
    const method = (config.method || 'GET').toUpperCase()

    if (this.options.shouldLog && !this.options.shouldLog(url, method)) {
      return this.originalFetch(...args)
    }

    const startTime = Date.now()
    const requestHeaders = this.extractRequestHeaders(config)
    const requestBody = this.extractRequestBody(config)

    const logEntry = this.options.formatter.http.formatRequest({
      url, method, startTime, requestHeaders, requestBody, clientType: 'fetch'
    })

    const mockRule = this.options.getMock?.(url, method, requestBody, requestHeaders) ?? null
    if (mockRule) {
      if (mockRule.mode === 'transform') {
        return this.handleTransform(args, logEntry, mockRule, startTime)
      }
      return this.handleMock(logEntry, mockRule, startTime)
    }

    this.options.onLog({ ...logEntry, metadata: { ...logEntry.metadata, pending: true } })

    // Breakpoint: pause and wait for user to release/cancel
    const bpPromise = this.options.pauseRequest?.(url, method, requestBody, requestHeaders)
    if (bpPromise) {
      const edits = await bpPromise
      if (edits === null) {
        // User cancelled — abort the request
        const abortEntry = this.options.formatter.http.formatError(
          { url, method, startTime, requestHeaders, requestBody, clientType: 'fetch' },
          new DOMException('Cancelled by breakpoint', 'AbortError'),
          Date.now()
        )
        this.options.onUpdateLog?.(logEntry.id, { ...abortEntry, metadata: { ...abortEntry.metadata, pending: false } })
        throw new DOMException('Cancelled by breakpoint', 'AbortError')
      }
      // Rebuild args with edited values
      args = [edits.url, {
        ...(typeof args[0] === 'object' && !(args[0] instanceof URL) && !(args[0] instanceof Request) ? args[0] : {}),
        ...(args[1] ?? {}),
        method: edits.method,
        headers: edits.headers,
        ...(edits.body !== null ? { body: edits.body } : {})
      }]
    }

    const throttle = this.options.getThrottleDelay?.() ?? 0
    if (throttle > 0) await new Promise(resolve => setTimeout(resolve, throttle))

    try {
      const response = await this.originalFetch(...args)
      const endTime = Date.now()

      const responseBody = await this.extractResponseBody(response)
      const responseHeaders = this.extractResponseHeaders(response)

      const enrichedEntry = this.options.formatter.http.formatResponse(logEntry, {
        status: response.status,
        statusText: response.statusText,
        responseHeaders,
        responseBody,
        endTime,
        redirected: response.redirected
      })

      if (this.options.onUpdateLog) {
        this.options.onUpdateLog(logEntry.id, { ...enrichedEntry, metadata: { ...enrichedEntry.metadata, pending: false } })
      } else {
        this.options.onLog(enrichedEntry)
      }

      return response
    } catch (error) {
      const endTime = Date.now()

      const errorEntry = this.options.formatter.http.formatError(
        { url, method, startTime, requestHeaders, requestBody, clientType: 'fetch' },
        error, endTime
      )

      if (this.options.onUpdateLog) {
        this.options.onUpdateLog(logEntry.id, { ...errorEntry, metadata: { ...errorEntry.metadata, pending: false } })
      } else {
        this.options.onLog(errorEntry)
      }

      throw error
    }
  }

  private handleTransform = async (
    args: Parameters<typeof fetch>,
    logEntry: UnifiedLogEntry,
    rule: MockRule,
    _startTime: number
  ): Promise<Response> => {
    this.options.onLog({ ...logEntry, metadata: { ...logEntry.metadata, pending: true } })

    const throttle = this.options.getThrottleDelay?.() ?? 0
    if (throttle > 0) await new Promise(resolve => setTimeout(resolve, throttle))

    const response = await this.originalFetch(...args)
    const endTime = Date.now()

    const responseHeaders = this.extractResponseHeaders(response)
    let responseBody = await this.extractResponseBody(response)

    const t = rule.transform ?? {}

    if (t.bodyMerge && responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
      responseBody = { ...(responseBody as Record<string, unknown>), ...t.bodyMerge }
    }
    if (t.bodyDelete && responseBody && typeof responseBody === 'object') {
      const copy = { ...(responseBody as Record<string, unknown>) }
      for (const key of t.bodyDelete) delete copy[key]
      responseBody = copy
    }

    const status = t.status ?? response.status
    const finalHeaders = { ...responseHeaders, ...t.headers }

    const enrichedEntry = this.options.formatter.http.formatResponse(logEntry, {
      status,
      statusText: response.statusText,
      responseHeaders: finalHeaders,
      responseBody,
      endTime,
      redirected: response.redirected
    })

    const update = { ...enrichedEntry, metadata: { ...enrichedEntry.metadata, pending: false, mocked: true } }
    if (this.options.onUpdateLog) {
      this.options.onUpdateLog(logEntry.id, update)
    } else {
      this.options.onLog(update)
    }

    const bodyString = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
    return new Response(bodyString, {
      status,
      statusText: response.statusText,
      headers: new Headers(finalHeaders)
    })
  }

  private handleMock = async (
    logEntry: UnifiedLogEntry,
    rule: MockRule,
    _startTime: number
  ): Promise<Response> => {
    if (rule.response.delay) {
      await new Promise(resolve => setTimeout(resolve, rule.response.delay))
    }

    const endTime = Date.now()
    const mockHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...rule.response.headers
    }
    const mockBody = rule.response.body !== undefined
      ? (typeof rule.response.body === 'string' ? rule.response.body : JSON.stringify(rule.response.body))
      : ''

    const enrichedEntry = this.options.formatter.http.formatResponse(logEntry, {
      status: rule.response.status,
      statusText: rule.response.statusText || 'OK (Mock)',
      responseHeaders: mockHeaders,
      responseBody: rule.response.body ?? null,
      endTime,
      redirected: false
    })

    this.options.onLog({
      ...enrichedEntry,
      metadata: { ...enrichedEntry.metadata, pending: false, mocked: true }
    })

    return new Response(mockBody, {
      status: rule.response.status,
      statusText: rule.response.statusText || 'OK',
      headers: new Headers(mockHeaders)
    })
  }

  private extractRequestHeaders = (config: RequestInit): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (!config.headers) return headers
    if (config.headers instanceof Headers) {
      config.headers.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(config.headers)) {
      config.headers.forEach(([key, value]) => { headers[key] = value })
    } else {
      Object.assign(headers, config.headers)
    }
    return headers
  }

  private extractRequestBody = (config: RequestInit): any => {
    const body = config.body
    if (!body) return null
    if (typeof body === 'string') {
      try { return JSON.parse(body) } catch { return body }
    }
    return body
  }

  private extractResponseHeaders = (response: Response): Record<string, string> => {
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    return headers
  }

  private extractResponseBody = async (response: Response): Promise<any> => {
    const clone = response.clone()
    const contentType = getContentType(response.headers)
    try {
      if (contentType?.includes('application/json')) return await clone.json()
      if (contentType?.includes('text/')) return await clone.text()
      const blob = await clone.blob()
      return `[Binary: ${blob.size} bytes, type: ${blob.type || 'unknown'}]`
    } catch (error) {
      return `[Failed to parse response: ${error}]`
    }
  }
}