import type { UnifiedLogEntry } from '../core/types'
import { LogFormatter } from '../core/formatters'
import { generateId } from '../utils/helpers'

export interface WebSocketInterceptorOptions {
  onLog: (entry: UnifiedLogEntry) => void
  formatter: LogFormatter
  shouldLog?: (url: string) => boolean
}

interface WebSocketLogContext {
  id: string
  url: string
  startTime: number
  readyState: number
}

/**
 * Interceptor for WebSocket
 * Wraps WebSocket constructor to log all WebSocket connections and messages
 */
export class WebSocketInterceptor {
  private originalWebSocket: typeof WebSocket
  private options: WebSocketInterceptorOptions
  private isIntercepted: boolean = false
  private activeSockets: Map<WebSocket, WebSocketLogContext> = new Map()

  constructor(options: WebSocketInterceptorOptions) {
    this.originalWebSocket = window.WebSocket
    this.options = options
  }

  /**
   * Enable WebSocket interception
   */
  public intercept = (): void => {
    if (this.isIntercepted) return
    
    // Create a new constructor function using arrow function to capture this
    const InterceptedWebSocket = ((originalWebSocket: typeof WebSocket, wrapWebSocket: (ws: WebSocket, url: string) => void) => {
      return function(url: string | URL, protocols?: string | string[]): WebSocket {
        const ws = new originalWebSocket(url, protocols)
        wrapWebSocket(ws, url.toString())
        return ws
      }
    })(this.originalWebSocket, this.wrapWebSocket.bind(this)) as unknown as typeof WebSocket
    
    // Copy static properties from original
    Object.defineProperty(InterceptedWebSocket, 'CONNECTING', {
      value: this.originalWebSocket.CONNECTING,
      writable: false,
      enumerable: true
    })
    Object.defineProperty(InterceptedWebSocket, 'OPEN', {
      value: this.originalWebSocket.OPEN,
      writable: false,
      enumerable: true
    })
    Object.defineProperty(InterceptedWebSocket, 'CLOSING', {
      value: this.originalWebSocket.CLOSING,
      writable: false,
      enumerable: true
    })
    Object.defineProperty(InterceptedWebSocket, 'CLOSED', {
      value: this.originalWebSocket.CLOSED,
      writable: false,
      enumerable: true
    })
    
    // Set prototype
    InterceptedWebSocket.prototype = this.originalWebSocket.prototype
    
    window.WebSocket = InterceptedWebSocket
    
    this.isIntercepted = true
  }

  /**
   * Disable WebSocket interception and restore original
   */
  public restore = (): void => {
    if (!this.isIntercepted) return
    window.WebSocket = this.originalWebSocket
    this.isIntercepted = false
  }

  /**
   * Wrap WebSocket instance with logging
   */
  private wrapWebSocket = (ws: WebSocket, url: string): void => {
    // Check if should log this connection
    if (this.options.shouldLog && !this.options.shouldLog(url)) {
      return
    }
    
    const startTime = Date.now()
    const connectionId = generateId()
    
    // Create context for this WebSocket
    const context: WebSocketLogContext = {
      id: connectionId,
      url,
      startTime,
      readyState: ws.readyState
    }
    
    this.activeSockets.set(ws, context)
    
    // Log connection attempt
    this.logConnection(ws, context)
    
    // Attach event listeners
    this.attachEventListeners(ws, context)
    
    // Wrap send method
    this.wrapSendMethod(ws, context)
  }

  /**
   * Attach event listeners to WebSocket
   */
  private attachEventListeners = (ws: WebSocket, context: WebSocketLogContext): void => {
    ws.addEventListener('open', () => {
      context.readyState = ws.readyState
      this.logOpen(ws, context)
    })
    
    ws.addEventListener('message', (event: MessageEvent) => {
      this.logMessage(ws, context, event, 'incoming')
    })
    
    ws.addEventListener('error', (event: Event) => {
      this.logError(ws, context, event)
    })
    
    ws.addEventListener('close', (event: CloseEvent) => {
      context.readyState = ws.readyState
      this.logClose(ws, context, event)
      this.activeSockets.delete(ws)
    })
  }

  /**
   * Wrap send method to log outgoing messages
   */
  private wrapSendMethod = (ws: WebSocket, context: WebSocketLogContext): void => {
    const originalSend = ws.send
    
    ws.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      this.logMessage(ws, context, { data } as MessageEvent, 'outgoing')
      return originalSend.call(ws, data)
    }
  }

  /**
   * Log WebSocket connection attempt
   */
  private logConnection = (ws: WebSocket, context: WebSocketLogContext): void => {
    const logEntry = this.options.formatter.websocket.format({
      url: context.url,
      startTime: context.startTime,
      eventType: 'connection',
      readyState: ws.readyState,
      connectionId: context.id
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log WebSocket open event
   */
  private logOpen = (ws: WebSocket, context: WebSocketLogContext): void => {
    const endTime = Date.now()
    const duration = endTime - context.startTime

    const logEntry = this.options.formatter.websocket.format({
      url: context.url,
      startTime: context.startTime,
      endTime,
      duration,
      eventType: 'open',
      readyState: ws.readyState,
      connectionId: context.id
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log WebSocket message
   */
  private logMessage = (
    ws: WebSocket,
    context: WebSocketLogContext,
    event: MessageEvent,
    direction: 'incoming' | 'outgoing'
  ): void => {
    const logEntry = this.options.formatter.websocket.format({
      url: context.url,
      startTime: Date.now(),
      eventType: 'message',
      direction,
      data: event.data,
      readyState: ws.readyState,
      connectionId: context.id
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log WebSocket error
   */
  private logError = (
    ws: WebSocket,
    context: WebSocketLogContext,
    event: Event
  ): void => {
    const logEntry = this.options.formatter.websocket.format({
      url: context.url,
      startTime: Date.now(),
      eventType: 'error',
      readyState: ws.readyState,
      connectionId: context.id,
      error: {
        occurred: true,
        message: event.type,
        name: 'WebSocketError',
        stack: null
      }
    })

    this.options.onLog(logEntry)
  }

  /**
   * Log WebSocket close event
   */
  private logClose = (
    ws: WebSocket,
    context: WebSocketLogContext,
    event: CloseEvent
  ): void => {
    const endTime = Date.now()
    const duration = endTime - context.startTime

    const logEntry = this.options.formatter.websocket.format({
      url: context.url,
      startTime: context.startTime,
      endTime,
      duration,
      eventType: 'close',
      readyState: ws.readyState,
      connectionId: context.id,
      closeInfo: {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      }
    })

    this.options.onLog(logEntry)
  }
}