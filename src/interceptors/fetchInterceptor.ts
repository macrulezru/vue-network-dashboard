import type { UnifiedLogEntry } from '../core/types'
import type { MockRule } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { getContentType } from '../utils/helpers'

export interface FetchInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  onUpdateLog?: (id: string, updates: Partial<UnifiedLogEntry>) => void
  getMock?: (url: string, method: string) => MockRule | null
  formatter: LogFormatter
  shouldLog?: (url: string, method: string) => boolean
}

/**
 * Interceptor for Fetch API
 * Wraps global fetch to log all HTTP requests and responses.
 * Supports pending state (logs immediately, updates on completion) and mock rules.
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

    // Create the log entry that will live in the store for the lifetime of the request
    const logEntry = this.options.formatter.http.formatRequest({
      url, method, startTime, requestHeaders, requestBody, clientType: 'fetch'
    })

    // Check for a matching mock rule before making the real request
    const mockRule = this.options.getMock?.(url, method) ?? null
    if (mockRule) {
      return this.handleMock(logEntry, mockRule, startTime)
    }

    // Log as pending immediately so the UI shows it in-flight
    this.options.onLog({ ...logEntry, metadata: { ...logEntry.metadata, pending: true } })

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

      // Update the pending entry in place
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

  private handleMock = async (
    logEntry: UnifiedLogEntry,
    rule: MockRule,
    startTime: number
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

  private extractRequestBody = (config: RequestInit): any => config.body || null

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
