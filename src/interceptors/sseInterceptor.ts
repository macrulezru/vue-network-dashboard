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
    if (this.options.shouldLog && !this.options.shouldLog(url)) return

    const startTime = Date.now()
    const connectionId = generateId()

    const context: SSELogContext = {
      id: connectionId,
      url,
      startTime,
      eventSource: es,
      events: []
    }

    this.activeSources.set(es, context)

    // Override addEventListener to intercept named events that user code registers.
    // Built-in types are handled separately; every NEW type gets a logging listener added.
    const builtinTypes = new Set(['open', 'message', 'error', 'close'])
    const hookedTypes  = new Set<string>()
    const originalAdd  = es.addEventListener.bind(es)

    const self = this
    ;(es as any).addEventListener = function(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      if (!builtinTypes.has(type) && !hookedTypes.has(type) && listener !== null) {
        hookedTypes.add(type)
        originalAdd(type, (event: Event) => {
          if (event instanceof MessageEvent) {
            self.logMessage(es, context, event, type)
          }
        })
      }
      return originalAdd(type, listener as EventListenerOrEventListenerObject, options)
    }

    this.logConnection(es, context)
    this.attachEventListeners(es, context, originalAdd)
    this.interceptClose(es, context)
  }

  /**
   * Attach standard event listeners (open / message / error / close)
   */
  private attachEventListeners = (
    es: EventSource,
    context: SSELogContext,
    add: EventSource['addEventListener']
  ): void => {
    add('open', () => {
      this.logOpen(es, context)
    })

    add('message', (event: Event) => {
      this.logMessage(es, context, event as MessageEvent, null)
    })

    add('error', (event: Event) => {
      this.logError(es, context, event)
    })

    add('close', () => {
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
      connectionId: context.id,
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
      connectionId: context.id,
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
      connectionId: context.id,
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
      connectionId: context.id,
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
      connectionId: context.id,
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