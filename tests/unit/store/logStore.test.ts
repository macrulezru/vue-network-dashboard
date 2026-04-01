import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  
  describe('addLog', () => {
    it('should add log to store', () => {
      const log = createMockLog()
      store.addLog(log)
      
      expect(store.getSize()).toBe(1)
      expect(store.getLogs()[0]).toEqual(log)
    })
    
    it('should add new logs to the beginning', () => {
      const log1 = createMockLog({ id: '1' })
      const log2 = createMockLog({ id: '2' })
      
      store.addLog(log1)
      store.addLog(log2)
      
      expect(store.getLogs()[0].id).toBe('2')
      expect(store.getLogs()[1].id).toBe('1')
    })
    
    it('should respect maxLogs limit', () => {
      const smallStore = new LogStore(2)
      
      smallStore.addLog(createMockLog({ id: '1' }))
      smallStore.addLog(createMockLog({ id: '2' }))
      smallStore.addLog(createMockLog({ id: '3' }))
      
      expect(smallStore.getSize()).toBe(2)
      expect(smallStore.getLogs()[0].id).toBe('3')
      expect(smallStore.getLogs()[1].id).toBe('2')
    })
    
    it('should notify subscribers', () => {
      const callback = vi.fn()
      store.subscribe(callback)
      
      const log = createMockLog()
      store.addLog(log)
      
      expect(callback).toHaveBeenCalledWith(log)
    })
  })
  
  describe('clear', () => {
    it('should clear all logs', () => {
      store.addLog(createMockLog())
      store.addLog(createMockLog())
      
      expect(store.getSize()).toBe(2)
      
      store.clear()
      expect(store.getSize()).toBe(0)
      expect(store.getLogs()).toEqual([])
    })
  })
  
  describe('getLogsByType', () => {
    it('should filter logs by type', () => {
      const httpLog = createMockLog({ type: 'http' })
      const wsLog = createMockLog({ type: 'websocket', url: 'ws://example.com' })
      
      store.addLog(httpLog)
      store.addLog(wsLog)
      
      const httpLogs = store.getLogsByType('http')
      const wsLogs = store.getLogsByType('websocket')
      
      expect(httpLogs).toHaveLength(1)
      expect(httpLogs[0].type).toBe('http')
      expect(wsLogs).toHaveLength(1)
      expect(wsLogs[0].type).toBe('websocket')
    })
  })
  
  describe('getLogsByUrl', () => {
    it('should filter logs by URL pattern (string)', () => {
      store.addLog(createMockLog({ url: 'https://api.example.com/users' }))
      store.addLog(createMockLog({ url: 'https://api.example.com/posts' }))
      store.addLog(createMockLog({ url: 'https://other.com/data' }))
      
      const results = store.getLogsByUrl('/api')
      
      expect(results).toHaveLength(2)
      expect(results[0].url).toContain('api.example.com')
    })
    
    it('should filter logs by URL pattern (RegExp)', () => {
      store.addLog(createMockLog({ url: 'https://api.example.com/users' }))
      store.addLog(createMockLog({ url: 'https://api.example.com/posts' }))
      
      const results = store.getLogsByUrl(/users$/)
      
      expect(results).toHaveLength(1)
      expect(results[0].url).toContain('users')
    })
  })
  
  describe('getLogsByStatus', () => {
    it('should filter logs by status code range', () => {
      store.addLog(createMockLog({ 
        type: 'http', 
        http: { status: 200, statusText: 'OK', protocol: null }
      }))
      store.addLog(createMockLog({ 
        type: 'http', 
        http: { status: 404, statusText: 'Not Found', protocol: null }
      }))
      store.addLog(createMockLog({ 
        type: 'http', 
        http: { status: 500, statusText: 'Error', protocol: null }
      }))
      
      const successLogs = store.getLogsByStatus([200, 299])
      const clientErrors = store.getLogsByStatus([400, 499])
      const serverErrors = store.getLogsByStatus([500, 599])
      
      expect(successLogs).toHaveLength(1)
      expect(clientErrors).toHaveLength(1)
      expect(serverErrors).toHaveLength(1)
    })
  })
  
  describe('getStats', () => {
    it('should calculate correct statistics', () => {
      const startTime = Date.now()
      
      store.addLog(createMockLog({
        method: 'GET',
        duration: 100,
        request: { bodySize: 100, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 1000, bodyRaw: null, bodyType: null, body: null },
        error: { occurred: false, message: null, name: null, stack: null }
      }))
      
      store.addLog(createMockLog({
        method: 'POST',
        duration: 200,
        request: { bodySize: 200, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 2000, bodyRaw: null, bodyType: null, body: null },
        error: { occurred: false, message: null, name: null, stack: null }
      }))
      
      store.addLog(createMockLog({
        method: 'GET',
        duration: 150,
        request: { bodySize: 150, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 1500, bodyRaw: null, bodyType: null, body: null },
        error: { occurred: true, message: 'Error', name: 'Error', stack: null }
      }))
      
      const stats = store.getStats()
      
      expect(stats.totalRequests).toBe(3)
      expect(stats.totalErrors).toBe(1)
      expect(stats.totalDataSent).toBe(450)
      expect(stats.totalDataReceived).toBe(4500)
      expect(stats.averageDuration).toBe(150)
      expect(stats.requestsByMethod).toEqual({ GET: 2, POST: 1 })
      expect(stats.requestsByStatus).toEqual({})
    })
  })
  
  describe('export', () => {
    it('should export logs as JSON', () => {
      store.addLog(createMockLog({ id: '1', url: '/test' }))
      
      const json = store.export('json')
      const parsed = JSON.parse(json)
      
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].id).toBe('1')
    })
    
    it('should export logs as CSV', () => {
      store.addLog(createMockLog({ 
        id: '1', 
        method: 'GET', 
        url: '/test',
        http: { status: 200, statusText: 'OK', protocol: null },
        duration: 100,
        request: { bodySize: 50, bodyRaw: null, bodyType: null, body: null },
        response: { bodySize: 500, bodyRaw: null, bodyType: null, body: null },
        error: { occurred: false, message: null, name: null, stack: null }
      }))
      
      const csv = store.export('csv')
      const lines = csv.split('\n')
      
      expect(lines[0]).toContain('id,type,method,url,status,duration,requestSize,responseSize,error,timestamp')
      expect(lines[1]).toContain('1,http,GET,/test,200,100,50,500,false')
    })
  })
  
  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = store.subscribe(callback)
      
      store.addLog(createMockLog())
      expect(callback).toHaveBeenCalledTimes(1)
      
      unsubscribe()
      store.addLog(createMockLog())
      expect(callback).toHaveBeenCalledTimes(1)
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
  })
  
  describe('pruneOlderThan', () => {
    it('should remove logs older than timestamp', () => {
      const now = Date.now()
      
      store.addLog(createMockLog({ startTime: now - 10000 }))
      store.addLog(createMockLog({ startTime: now - 5000 }))
      store.addLog(createMockLog({ startTime: now }))
      
      store.pruneOlderThan(now - 6000)
      
      expect(store.getSize()).toBe(2)
      expect(store.getLogs()[0].startTime).toBe(now)
      expect(store.getLogs()[1].startTime).toBe(now - 5000)
    })
  })
})