import type { UnifiedLogEntry } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { generateId } from '../utils/helpers'

export interface SSEInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  formatter: LogFormatter
  shouldLog?: (url: string) => boolean
}

interface SSELogContext {
  id: string
  url: string
  startTime: number
  eventSource: EventSource
  events: Array<{
    type: string
    data: any
    timestamp: number
    lastEventId: string | null
  }>
}

/**
 * Interceptor for Server-Sent Events (EventSource)
 * Wraps EventSource constructor to log all SSE connections and events
 */
export class SSEInterceptor {
  private originalEventSource: typeof EventSource
  private options: SSEInterceptorOptions
  private isIntercepted: boolean = false
  private activeSources: Map<EventSource, SSELogContext> = new Map()

  constructor(options: SSEInterceptorOptions) {
    this.originalEventSource = window.EventSource
    this.options = options
  }

  /**
   * Enable SSE interception
   */
  public intercept = (): void => {
    if (this.isIntercepted) return

    // Store reference to methods that need to be called with correct context
    const originalEventSource = this.originalEventSource
    const wrapEventSource = this.wrapEventSource.bind(this)

    // Create a new constructor function
    const InterceptedEventSource = function(
      url: string | URL,
      eventSourceInitDict?: EventSourceInit
    ): EventSource {
      const es = new originalEventSource(url, eventSourceInitDict)
      wrapEventSource(es, url.toString())
      return es
    } as unknown as typeof EventSource

    // Copy static properties from original
    Object.defineProperty(InterceptedEventSource, 'CONNECTING', {
      value: this.originalEventSource.CONNECTING,
      writable: false,
      enumerable: true
    })
    Object.defineProperty(InterceptedEventSource, 'OPEN', {
      value: this.originalEventSource.OPEN,
      writable: false,
      enumerable: true
    })
    Object.defineProperty(InterceptedEventSource, 'CLOSED', {
      value: this.originalEventSource.CLOSED,
      writable: false,
      enumerable: true
    })

    // Set prototype
    InterceptedEventSource.prototype = this.originalEventSource.prototype

    window.EventSource = InterceptedEventSource

    this.isIntercepted = true
  }

  /**
   * Disable SSE interception and restore original
   */
  public restore = (): void => {
    if (!this.isIntercepted) return
    window.EventSource = this.originalEventSource
    this.isIntercepted = false
  }

  /**
   * Wrap EventSource instance with logging
   */
  private wrapEventSource = (es: EventSource, url: string): void => {
    // Check if should log this connection
    if (this.options.shouldLog && !this.options.shouldLog(url)) {
      return
    }

    const startTime = Date.now()
    const connectionId = generateId()

    // Create context for this EventSource
    const context: SSELogContext = {
      id: connectionId,
      url,
      startTime,
      eventSource: es,
      events: []
    }

    this.activeSources.set(es, context)

    // Log connection attempt
    this.logConnection(es, context)

    // Attach event listeners
    this.attachEventListeners(es, context)

    // Intercept close method for manual close
    this.interceptClose(es, context)
  }

  /**
   * Attach event listeners to EventSource
   */
  private attachEventListeners = (es: EventSource, context: SSELogContext): void => {
    // Open event
    es.addEventListener('open', () => {
      this.logOpen(es, context)
    })

    // Message event (default event)
    es.addEventListener('message', (event: MessageEvent) => {
      this.logMessage(es, context, event, null)
    })

    // Error event
    es.addEventListener('error', (event: Event) => {
      this.logError(es, context, event)
    })

    // Close event (when connection is closed by server)
    es.addEventListener('close', () => {
      this.logClose(es, context)
    })
  }

  /**
   * Intercept the close method to log manual closure
   */
  private interceptClose = (es: EventSource, context: SSELogContext): void => {
    const originalClose = es.close.bind(es)
    
    es.close = () => {
      this.logClose(es, context)
      originalClose()
    }
  }

  /**
   * Log SSE connection attempt
   */
  private logConnection = (es: EventSource, context: SSELogContext): void => {
    const logEntry = this.options.formatter.sse.format({
      id: context.id,
      url: context.url,
      startTime: context.startTime,
      eventType: null,
      eventData: null,
      lastEventId: null,
      readyState: es.readyState,
      error: undefined
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log SSE open event
   */
  private logOpen = (es: EventSource, context: SSELogContext): void => {
    const endTime = Date.now()
    const duration = endTime - context.startTime

    const logEntry = this.options.formatter.sse.format({
      id: context.id,
      url: context.url,
      startTime: context.startTime,
      endTime,
      duration,
      eventType: 'open',
      eventData: null,
      lastEventId: null,
      readyState: es.readyState,
      error: undefined
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log SSE message event
   */
  private logMessage = (
    es: EventSource,
    context: SSELogContext,
    event: MessageEvent,
    eventType: string | null
  ): void => {
    const rawData = event.data
    let parsedData = rawData

    // Try to parse JSON data
    if (typeof rawData === 'string') {
      try {
        parsedData = JSON.parse(rawData)
      } catch {
        // Keep as string
      }
    }

    const logEntry = this.options.formatter.sse.format({
      id: context.id,
      url: context.url,
      startTime: Date.now(),
      eventType: eventType || 'message',
      eventData: parsedData,
      lastEventId: event.lastEventId || null,
      readyState: es.readyState,
      error: undefined
    })

    this.options.onLog(logEntry)

    // Store event in context
    context.events.push({
      type: eventType || 'message',
      data: parsedData,
      timestamp: Date.now(),
      lastEventId: event.lastEventId || null
    })
  }

  /**
   * Log SSE error event
   */
  private logError = (
    es: EventSource,
    context: SSELogContext,
    event: Event
  ): void => {
    const endTime = Date.now()
    const duration = endTime - context.startTime

    const logEntry = this.options.formatter.sse.format({
      id: context.id,
      url: context.url,
      startTime: context.startTime,
      endTime,
      duration,
      eventType: 'error',
      eventData: null,
      lastEventId: null,
      readyState: es.readyState,
      error: {
        occurred: true,
        message: event.type,
        name: 'EventSourceError',
        stack: null
      }
    })

    this.options.onLog(logEntry)

    // Connection is closed on error
    this.activeSources.delete(es)
  }

  /**
   * Log SSE close event (when connection is closed)
   */
  private logClose = (es: EventSource, context: SSELogContext): void => {
    const endTime = Date.now()
    const duration = endTime - context.startTime

    const logEntry = this.options.formatter.sse.format({
      id: context.id,
      url: context.url,
      startTime: context.startTime,
      endTime,
      duration,
      eventType: 'close',
      eventData: null,
      lastEventId: null,
      readyState: es.readyState,
      error: undefined
    })

    this.options.onLog(logEntry)

    // Remove from active sources
    this.activeSources.delete(es)
  }
}