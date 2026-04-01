import type { UnifiedLogEntry } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { getContentType } from '../utils/helpers'

export interface FetchInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  formatter: LogFormatter
  shouldLog?: (url: string, method: string) => boolean
}

/**
 * Interceptor for Fetch API
 * Wraps global fetch to log all HTTP requests and responses
 */
export class FetchInterceptor {
  private originalFetch: typeof fetch
  private options: FetchInterceptorOptions
  private isIntercepted: boolean = false

  constructor(options: FetchInterceptorOptions) {
    this.originalFetch = window.fetch.bind(window)
    this.options = options
  }

  /**
   * Enable fetch interception
   */
  public intercept = (): void => {
    if (this.isIntercepted) return
    
    // Store reference to wrappedFetch method
    const wrappedFetch = this.wrappedFetch.bind(this)
    
    window.fetch = async function(...args: Parameters<typeof fetch>) {
      return wrappedFetch(...args)
    }
    
    this.isIntercepted = true
  }

  /**
   * Disable fetch interception and restore original
   */
  public restore = (): void => {
    if (!this.isIntercepted) return
    window.fetch = this.originalFetch
    this.isIntercepted = false
  }

  /**
   * Extract URL from fetch arguments
   */
  private getUrl = (resource: RequestInfo | URL): string => {
    if (typeof resource === 'string') {
      return resource
    }
    if (resource instanceof URL) {
      return resource.toString()
    }
    // Request object
    return resource.url
  }

  /**
   * Wrapped fetch function that logs requests and responses
   */
  private wrappedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [resource, config = {}] = args
    const url = this.getUrl(resource)
    const method = config.method || 'GET'
    
    // Check if should log this request
    if (this.options.shouldLog && !this.options.shouldLog(url, method)) {
      return this.originalFetch(...args)
    }
    
    const startTime = Date.now()
    
    // Extract request data
    const requestHeaders = this.extractRequestHeaders(config)
    const requestBody = this.extractRequestBody(config)
    
    // Create initial log entry using formatter
    const logEntry = this.options.formatter.http.formatRequest({
      url,
      method,
      startTime,
      requestHeaders,
      requestBody,
      clientType: 'fetch'
    })
    
    // Log request start
    this.options.onLog(logEntry)
    
    try {
      // Execute original fetch
      const response = await this.originalFetch(...args)
      const endTime = Date.now()
      
      // Process response
      const responseBody = await this.extractResponseBody(response)
      const responseHeaders = this.extractResponseHeaders(response)
      
      // Enrich log entry with response data
      const enrichedEntry = this.options.formatter.http.formatResponse(logEntry, {
        status: response.status,
        statusText: response.statusText,
        responseHeaders,
        responseBody,
        endTime,
        redirected: response.redirected
      })
      
      this.options.onLog(enrichedEntry)
      
      return response
    } catch (error) {
      const endTime = Date.now()
      
      // Create error log entry
      const errorEntry = this.options.formatter.http.formatError(
        {
          url,
          method,
          startTime,
          requestHeaders,
          requestBody,
          clientType: 'fetch'
        },
        error,
        endTime
      )
      
      this.options.onLog(errorEntry)
      
      throw error
    }
  }

  /**
   * Extract headers from fetch config
   */
  private extractRequestHeaders = (config: RequestInit): Record<string, string> => {
    const headers: Record<string, string> = {}
    
    if (!config.headers) return headers
    
    if (config.headers instanceof Headers) {
      config.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(config.headers)) {
      config.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, config.headers)
    }
    
    return headers
  }

  /**
   * Extract body from fetch config
   */
  private extractRequestBody = (config: RequestInit): any => {
    return config.body || null
  }

  /**
   * Extract response headers from Response object
   */
  private extractResponseHeaders = (response: Response): Record<string, string> => {
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return headers
  }

  /**
   * Extract response body from Response object
   */
  private extractResponseBody = async (response: Response): Promise<any> => {
    const clone = response.clone()
    const contentType = getContentType(response.headers)
    
    try {
      if (contentType?.includes('application/json')) {
        return await clone.json()
      } else if (contentType?.includes('text/')) {
        return await clone.text()
      } else {
        const blob = await clone.blob()
        return `[Binary: ${blob.size} bytes, type: ${blob.type || 'unknown'}]`
      }
    } catch (error) {
      return `[Failed to parse response: ${error}]`
    }
  }
}