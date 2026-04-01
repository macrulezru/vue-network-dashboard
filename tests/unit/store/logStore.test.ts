import { describe, it, expect, beforeEach } from 'vitest'
import { LogStore } from '../../../src/store/logStore'
import type { UnifiedLogEntry } from '../../../src/core/types'

describe('LogStore', () => {
  let store: LogStore
  
  beforeEach(() => {
    store = new LogStore(100)
  })
  
  const createMockLog = (overrides: Partial<UnifiedLogEntry> = {}): UnifiedLogEntry => ({
    id: 'test-id',
    type: 'http',
    startTime: Date.now(),
    endTime: null,
    duration: null,
    url: 'https://api.example.com/test',
    method: 'GET',
    http: {
      status: null,
      statusText: null,
      protocol: null
    },
    websocket: null,
    requestHeaders: {},
    responseHeaders: {},
    request: {
      body: null,
      bodyRaw: null,
      bodySize: null,
      bodyType: null
    },
    response: {
      body: null,
      bodyRaw: null,
      bodySize: null,
      bodyType: null
    },
    error: {
      occurred: false,
      message: null,
      name: null,
      stack: null
    },
    metadata: {
      clientType: 'fetch',
      redirected: false,
      retryCount: 0,
      timestamp: new Date().toISOString()
    },
    ...overrides
  })
  
  // ... existing tests ...
  
  describe('getLogsByTimeRange', () => {
    it('should filter logs by time range', () => {
      const now = Date.now()
      
      store.addLog(createMockLog({ startTime: now - 10000, id: '1' }))
      store.addLog(createMockLog({ startTime: now - 5000, id: '2' }))
      store.addLog(createMockLog({ startTime: now, id: '3' }))
      
      const results = store.getLogsByTimeRange(now - 6000, now - 1000)
      
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('2')
    })
  })
  
  describe('queryLogs', () => {
    beforeEach(() => {
      const now = Date.now()
      
      store.addLog(createMockLog({
        id: '1',
        type: 'http',
        url: 'https://api.example.com/users',
        method: 'GET',
        duration: 100,
        startTime: now,
        http: { status: 200, statusText: 'OK', protocol: 'HTTP/1.1' },
        error: { occurred: false, message: null, name: null, stack: null }
      }))
      
      store.addLog(createMockLog({
        id: '2',
        type: 'http',
        url: 'https://api.example.com/posts',
        method: 'POST',
        duration: 200,
        startTime: now - 1000,
        http: { status: 201, statusText: 'Created', protocol: 'HTTP/1.1' },
        error: { occurred: false, message: null, name: null, stack: null }
      }))
      
      store.addLog(createMockLog({
        id: '3',
        type: 'http',
        url: 'https://api.example.com/users/1',
        method: 'GET',
        duration: 150,
        startTime: now - 2000,
        http: { status: 404, statusText: 'Not Found', protocol: 'HTTP/1.1' },
        error: { occurred: true, message: 'Not found', name: 'Error', stack: null }
      }))
      
      store.addLog(createMockLog({
        id: '4',
        type: 'websocket',
        url: 'ws://example.com/socket',
        method: 'WS →',
        startTime: now - 3000,
        duration: 5000
      }))
    })
    
    it('should filter by type', () => {
      const httpLogs = store.queryLogs({ type: 'http' })
      expect(httpLogs).toHaveLength(3)
      
      const wsLogs = store.queryLogs({ type: 'websocket' })
      expect(wsLogs).toHaveLength(1)
    })
    
    it('should filter by URL pattern (string)', () => {
      const results = store.queryLogs({ url: '/users' })
      expect(results).toHaveLength(2)
      expect(results[0].url).toContain('users')
    })
    
    it('should filter by URL pattern (RegExp)', () => {
      const results = store.queryLogs({ url: /posts/ })
      expect(results).toHaveLength(1)
      expect(results[0].url).toContain('posts')
    })
    
    it('should filter by method', () => {
      const results = store.queryLogs({ method: 'GET' })
      expect(results).toHaveLength(2)
      expect(results.every(r => r.method === 'GET')).toBe(true)
    })
    
    it('should filter by min duration', () => {
      const results = store.queryLogs({ minDuration: 150 })
      expect(results).toHaveLength(3)
      expect(results.every(r => r.duration! >= 150)).toBe(true)
    })
    
    it('should filter by max duration', () => {
      const results = store.queryLogs({ maxDuration: 150 })
      expect(results).toHaveLength(2)
      expect(results[0].duration).toBeLessThanOrEqual(150)
    })
    
    it('should filter by time range', () => {
      const now = Date.now()
      const results = store.queryLogs({
        startTime: now - 1500,
        endTime: now - 500
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('2')
    })
    
    it('should filter by hasError', () => {
      const errorLogs = store.queryLogs({ hasError: true })
      expect(errorLogs).toHaveLength(1)
      expect(errorLogs[0].error.occurred).toBe(true)
      
      const successLogs = store.queryLogs({ hasError: false })
      expect(successLogs).toHaveLength(3)
    })
    
    it('should filter by status code (single)', () => {
      const results = store.queryLogs({ statusCode: 200 })
      expect(results).toHaveLength(1)
      expect(results[0].http?.status).toBe(200)
    })
    
    it('should filter by status code (array)', () => {
      const results = store.queryLogs({ statusCode: [200, 201] })
      expect(results).toHaveLength(2)
    })
    
    it('should combine multiple filters', () => {
      const results = store.queryLogs({
        type: 'http',
        method: 'GET',
        hasError: false,
        minDuration: 100
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('1')
    })
  })
  
  describe('prune', () => {
    it('should remove oldest logs', () => {
      for (let i = 0; i < 10; i++) {
        store.addLog(createMockLog({ id: String(i) }))
      }
      
      store.prune(5)
      
      expect(store.getSize()).toBe(5)
      expect(store.getLogs()[0].id).toBe('9')
      expect(store.getLogs()[4].id).toBe('5')
    })
    
    it('should not prune if keepCount is larger than size', () => {
      for (let i = 0; i < 5; i++) {
        store.addLog(createMockLog({ id: String(i) }))
      }
      
      store.prune(10)
      expect(store.getSize()).toBe(5)
    })
  })
  
  describe('pruneOlderThan', () => {
    it('should remove logs older than timestamp', () => {
      const now = Date.now()
      
      store.addLog(createMockLog({ startTime: now - 10000, id: 'old' }))
      store.addLog(createMockLog({ startTime: now - 5000, id: 'middle' }))
      store.addLog(createMockLog({ startTime: now, id: 'new' }))
      
      store.pruneOlderThan(now - 6000)
      
      expect(store.getSize()).toBe(2)
      expect(store.getLogs()[0].id).toBe('new')
      expect(store.getLogs()[1].id).toBe('middle')
    })
    
    it('should remove nothing if all logs are newer', () => {
      const now = Date.now()
      
      store.addLog(createMockLog({ startTime: now, id: 'new' }))
      
      store.pruneOlderThan(now - 1000)
      expect(store.getSize()).toBe(1)
    })
  })
  
  describe('getLogsRef', () => {
    it('should return reactive reference', () => {
      const ref = store.getLogsRef()
      expect(ref.value).toEqual([])
      
      store.addLog(createMockLog())
      expect(ref.value).toHaveLength(1)
    })
  })
  
  describe('getSize', () => {
    it('should return correct size', () => {
      expect(store.getSize()).toBe(0)
      
      store.addLog(createMockLog())
      expect(store.getSize()).toBe(1)
      
      store.addLog(createMockLog())
      expect(store.getSize()).toBe(2)
    })
  })
  
  describe('isEmpty', () => {
    it('should return true when empty', () => {
      expect(store.isEmpty()).toBe(true)
    })
    
    it('should return false when not empty', () => {
      store.addLog(createMockLog())
      expect(store.isEmpty()).toBe(false)
    })
  })
  
  describe('getStats with real data', () => {
    it('should calculate correct statistics from logs', () => {
      
      store.addLog(createMockLog({
        method: 'GET',
        duration: 100,
        request: { bodySize: 100, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 1000, bodyRaw: null, bodyType: null, body: null },
        http: { status: 200, statusText: 'OK', protocol: 'HTTP/1.1' }
      }))
      
      store.addLog(createMockLog({
        method: 'POST',
        duration: 200,
        request: { bodySize: 200, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 2000, bodyRaw: null, bodyType: null, body: null },
        http: { status: 201, statusText: 'Created', protocol: 'HTTP/1.1' }
      }))
      
      store.addLog(createMockLog({
        method: 'GET',
        duration: 150,
        request: { bodySize: 150, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 1500, bodyRaw: null, bodyType: null, body: null },
        http: { status: 404, statusText: 'Not Found', protocol: 'HTTP/1.1' },
        error: { occurred: true, message: 'Error', name: 'Error', stack: null }
      }))
      
      const stats = store.getStats()
      
      expect(stats.totalRequests).toBe(3)
      expect(stats.totalErrors).toBe(1)
      expect(stats.totalDataSent).toBe(450)
      expect(stats.totalDataReceived).toBe(4500)
      expect(stats.averageDuration).toBe(150)
      expect(stats.requestsByMethod).toEqual({ GET: 2, POST: 1 })
      expect(stats.requestsByStatus).toEqual({ '2xx': 2, '4xx': 1 })
      expect(stats.slowestRequests).toHaveLength(3)
      expect(stats.largestRequests).toHaveLength(3)
    })
  })
})