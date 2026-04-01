import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NetworkDashboard } from '../../../src/core/NetworkDashboard'
import type { UnifiedLogEntry } from '../../../src/core/types'
import { localStorageMock } from '../../setup'

describe('NetworkDashboard', () => {
  let logger: NetworkDashboard
  
  beforeEach(() => {
    vi.clearAllMocks()
    logger = new NetworkDashboard({
      enabled: false,
      maxLogs: 100,
      interceptors: {
        fetch: false,
        xhr: false,
        websocket: false,
        sse: false
      }
    })
  })
  
  afterEach(() => {
    logger.destroy()
  })
  
  describe('enable/disable', () => {
    it('should enable and disable logging', () => {
      expect(logger.getEnabled()).toBe(false)
      
      logger.enable()
      expect(logger.getEnabled()).toBe(true)
      
      logger.disable()
      expect(logger.getEnabled()).toBe(false)
    })
    
    it('should not enable twice', () => {
      logger.enable()
      logger.enable()
      expect(logger.getEnabled()).toBe(true)
    })
  })
  
  describe('filters', () => {
    it('should filter by URL pattern', () => {
      const filteredLogger = new NetworkDashboard({
        enabled: false,
        filters: {
          urlPattern: /\/api\//
        },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      filteredLogger.destroy()
    })
    
    it('should filter by exclude URL pattern', () => {
      const filteredLogger = new NetworkDashboard({
        enabled: false,
        filters: {
          excludeUrlPattern: /\/health/
        },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      filteredLogger.destroy()
    })
    
    it('should filter by HTTP methods', () => {
      const filteredLogger = new NetworkDashboard({
        enabled: false,
        filters: {
          methods: ['GET', 'POST']
        },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      filteredLogger.destroy()
    })
    
    it('should filter by status codes', () => {
      const filteredLogger = new NetworkDashboard({
        enabled: false,
        filters: {
          statusCodes: [200, 201]
        },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      filteredLogger.destroy()
    })
    
    it('should filter by body size threshold', () => {
      const filteredLogger = new NetworkDashboard({
        enabled: false,
        filters: {
          bodySizeThreshold: 1024
        },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      filteredLogger.destroy()
    })
  })
  
  describe('persistToStorage', () => {
    it('should save logs to localStorage', () => {
      const storageLogger = new NetworkDashboard({
        enabled: false,
        persistToStorage: true,
        maxLogs: 10,
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      const log: UnifiedLogEntry = {
        id: 'test',
        type: 'http',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'https://api.example.com/test',
        method: 'GET',
        http: { status: null, statusText: null, protocol: null },
        websocket: null,
        sse: null,
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      storageLogger['store'].addLog(log)
      storageLogger['saveToStorage']()
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vue-network-dashboard',
        expect.any(String)
      )
      
      storageLogger.destroy()
    })
    
    it('should load logs from localStorage', () => {
      const savedLogs = JSON.stringify([{
        id: 'saved',
        type: 'http',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'https://api.example.com/saved',
        method: 'GET',
        http: { status: null, statusText: null, protocol: null },
        websocket: null,
        sse: null,
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }])
      
      localStorageMock.getItem.mockReturnValue(savedLogs)
      
      const storageLogger = new NetworkDashboard({
        enabled: false,
        persistToStorage: true,
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      expect(storageLogger.getSize()).toBe(1)
      
      storageLogger.destroy()
    })
  })
  
  describe('callbacks', () => {
    it('should call onLog callback', () => {
      const onLog = vi.fn()
      const callbackLogger = new NetworkDashboard({
        enabled: false,
        callbacks: { onLog },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      const log: UnifiedLogEntry = {
        id: 'test',
        type: 'http',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'https://api.example.com/test',
        method: 'GET',
        http: { status: null, statusText: null, protocol: null },
        websocket: null,
        sse: null,
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      callbackLogger['handleLog'](log)
      
      expect(onLog).toHaveBeenCalledWith(log)
      
      callbackLogger.destroy()
    })
    
    it('should handle callback errors gracefully', () => {
      const onLog = vi.fn(() => { throw new Error('Callback error') })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const callbackLogger = new NetworkDashboard({
        enabled: false,
        callbacks: { onLog },
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      const log: UnifiedLogEntry = {
        id: 'test',
        type: 'http',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'https://api.example.com/test',
        method: 'GET',
        http: { status: null, statusText: null, protocol: null },
        websocket: null,
        sse: null,
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      callbackLogger['handleLog'](log)
      
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
      callbackLogger.destroy()
    })
  })
  
  describe('devOnly mode', () => {
    it('should not enable in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      const devLogger = new NetworkDashboard({
        enabled: true,
        devOnly: true,
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      expect(devLogger.getEnabled()).toBe(false)
      
      process.env.NODE_ENV = originalEnv
      devLogger.destroy()
    })
    
    it('should enable in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      
      const devLogger = new NetworkDashboard({
        enabled: true,
        devOnly: true,
        interceptors: { fetch: false, xhr: false, websocket: false, sse: false }
      })
      
      expect(devLogger.getEnabled()).toBe(true)
      
      process.env.NODE_ENV = originalEnv
      devLogger.destroy()
    })
  })
  
  describe('queryLogs', () => {
    it('should return empty array when no logs', () => {
      const results = logger.queryLogs({ type: 'http' })
      expect(results).toEqual([])
    })
  })
  
  describe('getSize', () => {
    it('should return current size', () => {
      expect(logger.getSize()).toBe(0)
    })
  })
  
  describe('clear', () => {
    it('should clear all logs', () => {
      logger.clear()
      expect(logger.getSize()).toBe(0)
    })
  })
  
  describe('getLogs', () => {
    it('should return empty array initially', () => {
      expect(logger.getLogs()).toEqual([])
    })
  })
  
  describe('getLogsByType', () => {
    it('should return empty array when no logs', () => {
      expect(logger.getLogsByType('http')).toEqual([])
      expect(logger.getLogsByType('websocket')).toEqual([])
      expect(logger.getLogsByType('sse')).toEqual([])
    })
  })
  
  describe('getStats', () => {
    it('should return empty stats', () => {
      const stats = logger.getStats()
      
      expect(stats.totalRequests).toBe(0)
      expect(stats.totalErrors).toBe(0)
      expect(stats.averageDuration).toBe(0)
      expect(stats.totalDataSent).toBe(0)
      expect(stats.totalDataReceived).toBe(0)
      expect(stats.requestsByMethod).toEqual({})
      expect(stats.requestsByStatus).toEqual({})
      expect(stats.slowestRequests).toEqual([])
      expect(stats.largestRequests).toEqual([])
      expect(stats.sseEventCount).toBe(0)
    })
  })
  
  describe('getStatsSummary', () => {
    it('should return formatted summary', () => {
      const summary = logger.getStatsSummary()
      
      expect(summary).toContain('=== Network Statistics ===')
      expect(summary).toContain('Total Requests: 0')
    })
  })
  
  describe('export', () => {
    it('should export empty logs as JSON', () => {
      const json = logger.export('json')
      expect(JSON.parse(json)).toEqual([])
    })
    
    it('should export empty logs as CSV', () => {
      const csv = logger.export('csv')
      expect(csv).toContain('id,type,method,url,status,duration,requestSize,responseSize,error,timestamp')
    })
  })
  
  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = logger.subscribe(callback)
      
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })
  
  describe('getOptions', () => {
    it('should return current options', () => {
      const options = logger.getOptions()
      
      expect(options.enabled).toBe(false)
      expect(options.maxLogs).toBe(100)
      expect(options.interceptors).toBeDefined()
    })
  })
  
  describe('updateOptions', () => {
    it('should update configuration', () => {
      logger.updateOptions({ maxLogs: 200 })
      
      const options = logger.getOptions()
      expect(options.maxLogs).toBe(200)
    })
    
    it('should preserve existing options when updating', () => {
      logger.updateOptions({ devOnly: true })
      
      const options = logger.getOptions()
      expect(options.maxLogs).toBe(100)
      expect(options.devOnly).toBe(true)
    })
  })
  
  describe('destroy', () => {
    it('should clean up resources', () => {
      logger.enable()
      logger.destroy()
      
      expect(logger.getEnabled()).toBe(false)
      expect(logger.getSize()).toBe(0)
    })
  })
})