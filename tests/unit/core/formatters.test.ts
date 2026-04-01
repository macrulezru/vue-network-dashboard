import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HTTPFormatter, WebSocketFormatter, LogFormatter } from '../../../src/core/formatters'

describe('HTTPFormatter', () => {
  let formatter: HTTPFormatter
  
  beforeEach(() => {
    formatter = new HTTPFormatter()
  })
  
  describe('formatRequest', () => {
    it('should create base log entry from request', () => {
      const params = {
        url: 'https://api.example.com/users',
        method: 'POST',
        startTime: Date.now(),
        requestHeaders: { 'content-type': 'application/json' },
        requestBody: { name: 'John' },
        clientType: 'fetch' as const
      }
      
      const entry = formatter.formatRequest(params)
      
      expect(entry.id).toBeDefined()
      expect(entry.type).toBe('http')
      expect(entry.url).toBe(params.url)
      expect(entry.method).toBe(params.method)
      expect(entry.startTime).toBe(params.startTime)
      expect(entry.requestHeaders).toEqual(params.requestHeaders)
      expect(entry.request.body).toEqual(params.requestBody)
      expect(entry.http?.status).toBeNull()
      expect(entry.error.occurred).toBe(false)
    })
    
    it('should handle empty request body', () => {
      const params = {
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'xhr' as const
      }
      
      const entry = formatter.formatRequest(params)
      
      expect(entry.request.body).toBeNull()
      expect(entry.request.bodyRaw).toBeNull()
      expect(entry.request.bodySize).toBe(0)
    })
    
    it('should use provided id', () => {
      const customId = 'custom-id-123'
      const params = {
        id: customId,
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'fetch' as const
      }
      
      const entry = formatter.formatRequest(params)
      expect(entry.id).toBe(customId)
    })
  })
  
  describe('formatResponse', () => {
    it('should enrich log entry with response data', () => {
      const requestParams = {
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'fetch' as const
      }
      
      const requestEntry = formatter.formatRequest(requestParams)
      
      const responseParams = {
        status: 200,
        statusText: 'OK',
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { id: 1, name: 'John' },
        endTime: requestParams.startTime + 100
      }
      
      const enrichedEntry = formatter.formatResponse(requestEntry, responseParams)
      
      expect(enrichedEntry.endTime).toBe(responseParams.endTime)
      expect(enrichedEntry.duration).toBe(100)
      expect(enrichedEntry.http?.status).toBe(200)
      expect(enrichedEntry.http?.statusText).toBe('OK')
      expect(enrichedEntry.response.body).toEqual(responseParams.responseBody)
      expect(enrichedEntry.responseHeaders).toEqual(responseParams.responseHeaders)
    })
    
    it('should handle empty response', () => {
      const requestParams = {
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'fetch' as const
      }
      
      const requestEntry = formatter.formatRequest(requestParams)
      
      const responseParams = {
        status: 204,
        statusText: 'No Content',
        responseHeaders: {},
        responseBody: null,
        endTime: requestParams.startTime + 50
      }
      
      const enrichedEntry = formatter.formatResponse(requestEntry, responseParams)
      
      expect(enrichedEntry.response.body).toBeNull()
      expect(enrichedEntry.response.bodySize).toBe(0)
    })
  })
  
  describe('formatError', () => {
    it('should create error log entry', () => {
      const requestParams = {
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'fetch' as const
      }
      
      const error = new Error('Network error')
      const endTime = requestParams.startTime + 100
      
      const errorEntry = formatter.formatError(requestParams, error, endTime)
      
      expect(errorEntry.error.occurred).toBe(true)
      expect(errorEntry.error.message).toBe('Network error')
      expect(errorEntry.error.name).toBe('Error')
      expect(errorEntry.endTime).toBe(endTime)
      expect(errorEntry.duration).toBe(100)
    })
    
    it('should handle unknown error', () => {
      const requestParams = {
        url: 'https://api.example.com/users',
        method: 'GET',
        startTime: Date.now(),
        requestHeaders: {},
        requestBody: null,
        clientType: 'fetch' as const
      }
      
      const errorEntry = formatter.formatError(requestParams, null, Date.now())
      
      expect(errorEntry.error.occurred).toBe(true)
      expect(errorEntry.error.message).toBe('Unknown error')
    })
  })
})

describe('WebSocketFormatter', () => {
  let formatter: WebSocketFormatter
  
  beforeEach(() => {
    formatter = new WebSocketFormatter()
  })
  
  describe('format', () => {
    it('should format connection event', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        eventType: 'connection' as const
      }
      
      const entry = formatter.format(params)
      
      expect(entry.type).toBe('websocket')
      expect(entry.url).toBe(params.url)
      expect(entry.method).toBe('WS CONNECTING')
      expect(entry.websocket?.eventType).toBe('connection')
    })
    
    it('should format open event', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        duration: 100,
        eventType: 'open' as const,
        readyState: 1
      }
      
      const entry = formatter.format(params)
      
      expect(entry.method).toBe('WS OPEN')
      expect(entry.websocket?.eventType).toBe('open')
      expect(entry.websocket?.readyState).toBe(1)
      expect(entry.endTime).toBe(params.endTime)
      expect(entry.duration).toBe(100)
    })
    
    it('should format incoming message', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        eventType: 'message' as const,
        direction: 'incoming' as const,
        data: { text: 'Hello' },
        readyState: 1
      }
      
      const entry = formatter.format(params)
      
      expect(entry.method).toBe('WS ← message')
      expect(entry.websocket?.eventType).toBe('message')
      expect(entry.websocket?.direction).toBe('incoming')
      expect(entry.response.body).toEqual({ text: 'Hello' })
    })
    
    it('should format outgoing message', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        eventType: 'message' as const,
        direction: 'outgoing' as const,
        data: { action: 'ping' },
        readyState: 1
      }
      
      const entry = formatter.format(params)
      
      expect(entry.method).toBe('WS → message')
      expect(entry.websocket?.direction).toBe('outgoing')
      expect(entry.response.body).toEqual({ action: 'ping' })
    })
    
    it('should format error event', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        eventType: 'error' as const,
        error: {
          occurred: true,
          message: 'Connection failed',
          name: 'WebSocketError',
          stack: null
        }
      }
      
      const entry = formatter.format(params)
      
      expect(entry.method).toBe('WS ERROR')
      expect(entry.error.occurred).toBe(true)
      expect(entry.error.message).toBe('Connection failed')
    })
    
    it('should format close event', () => {
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        endTime: Date.now() + 5000,
        duration: 5000,
        eventType: 'close' as const,
        closeInfo: {
          code: 1000,
          reason: 'Normal closure',
          wasClean: true
        }
      }
      
      const entry = formatter.format(params)
      
      expect(entry.method).toBe('WS CLOSE')
      expect(entry.websocket?.eventType).toBe('close')
      expect(entry.websocket?.code).toBe(1000)
      expect(entry.websocket?.reason).toBe('Normal closure')
      expect(entry.websocket?.wasClean).toBe(true)
    })
    
    it('should handle binary message data', () => {
      const blob = new Blob(['test data'])
      const params = {
        url: 'ws://example.com/socket',
        startTime: Date.now(),
        eventType: 'message' as const,
        direction: 'incoming' as const,
        data: blob
      }
      
      const entry = formatter.format(params)
      
      expect(entry.response.body).toContain('[Blob:')
      expect(entry.response.bodySize).toBe(blob.size)
    })
  })
})

describe('LogFormatter', () => {
  it('should create HTTP and WebSocket formatters', () => {
    const formatter = new LogFormatter()
    
    expect(formatter.http).toBeInstanceOf(HTTPFormatter)
    expect(formatter.websocket).toBeInstanceOf(WebSocketFormatter)
  })
  
  it('should update options', () => {
    const sanitizeHeaders = vi.fn()
    const sanitizeBody = vi.fn()
    
    const formatter = new LogFormatter()
    formatter.updateOptions({ sanitizeHeaders, sanitizeBody })
    
    expect(formatter.http).toBeInstanceOf(HTTPFormatter)
    expect(formatter.websocket).toBeInstanceOf(WebSocketFormatter)
  })
})