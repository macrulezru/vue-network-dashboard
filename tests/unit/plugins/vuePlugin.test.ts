import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import NetworkLoggerPlugin, { useNetworkLogger, createNetworkLogger } from '../../../src/plugins/vuePlugin'
import type { UnifiedLogEntry } from '../../../src/core/types'

describe('Vue Plugin', () => {
  describe('NetworkLoggerPlugin', () => {
    it('should install plugin', () => {
      const app = createApp({})
      
      app.use(NetworkLoggerPlugin, { enabled: false })
      
      expect(app.config.globalProperties.$networkLogger).toBeDefined()
    })
    
    it('should provide logger to components', () => {
      const app = createApp({})
      
      app.use(NetworkLoggerPlugin, { enabled: false })
      
      expect(app._context.provides).toHaveProperty('networkLogger')
    })
    
    it('should cleanup on app unmount', () => {
      const app = createApp({})
      app.use(NetworkLoggerPlugin, { enabled: false })
      
      const destroySpy = vi.spyOn(app.config.globalProperties.$networkLogger._logger, 'destroy')
      
      app.unmount()
      
      expect(destroySpy).toHaveBeenCalled()
    })
  })
  
  describe('useNetworkLogger', () => {
    it('should be available as a function', () => {
      expect(typeof useNetworkLogger).toBe('function')
    })
    
    it('should throw error when not in Vue context', () => {
      expect(() => useNetworkLogger()).toThrow()
    })
  })
  
  describe('createNetworkLogger', () => {
    it('should create standalone logger', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      expect(logger).toBeDefined()
      expect(logger.logs).toBeDefined()
      expect(typeof logger.clear).toBe('function')
      expect(typeof logger.enable).toBe('function')
      expect(typeof logger.disable).toBe('function')
    })
    
    it('should have reactive logs', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      expect(logger.logs.value).toEqual([])
    })
    
    it('should provide computed stats', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      expect(logger.totalRequests.value).toBe(0)
      expect(logger.totalErrors.value).toBe(0)
      expect(logger.averageDuration.value).toBe(0)
      expect(logger.totalDataSent.value).toBe(0)
      expect(logger.totalDataReceived.value).toBe(0)
    })
    
    it('should provide all methods', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      expect(typeof logger.getStats).toBe('function')
      expect(typeof logger.getStatsSummary).toBe('function')
      expect(typeof logger.export).toBe('function')
      expect(typeof logger.getLogsByType).toBe('function')
      expect(typeof logger.getLogsByUrl).toBe('function')
      expect(typeof logger.getLogsByStatus).toBe('function')
      expect(typeof logger.getLogsByMethod).toBe('function')
      expect(typeof logger.getErrorLogs).toBe('function')
      expect(typeof logger.queryLogs).toBe('function')
      expect(typeof logger.subscribe).toBe('function')
      expect(typeof logger.enable).toBe('function')
      expect(typeof logger.disable).toBe('function')
      expect(typeof logger.clear).toBe('function')
      expect(typeof logger.isEnabled).toBe('function')
    })
    
    it('should update stats when logs are added', async () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      // Manually add a log through the internal logger
      const internalLogger = logger._logger
      
      // Create a mock log with correct types
      const log: UnifiedLogEntry = {
        id: 'test',
        type: 'http',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        duration: 100,
        url: 'https://api.example.com/test',
        method: 'GET',
        http: {
          status: 200,
          statusText: 'OK',
          protocol: 'HTTP/1.1'
        },
        websocket: null,
        requestHeaders: {},
        responseHeaders: {},
        request: {
          body: null,
          bodyRaw: null,
          bodySize: 100,
          bodyType: null
        },
        response: {
          body: null,
          bodyRaw: null,
          bodySize: 500,
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
        }
      }
      
      internalLogger['store'].addLog(log)
      
      // Wait for reactivity
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(logger.totalRequests.value).toBe(1)
      expect(logger.totalDataSent.value).toBe(100)
      expect(logger.totalDataReceived.value).toBe(500)
    })
    
    it('should clear logs', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      const internalLogger = logger._logger
      
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
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      internalLogger['store'].addLog(log)
      expect(logger.totalRequests.value).toBe(1)
      
      logger.clear()
      expect(logger.totalRequests.value).toBe(0)
    })
    
    it('should enable and disable logging', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      expect(logger.isEnabled()).toBe(false)
      
      logger.enable()
      expect(logger.isEnabled()).toBe(true)
      
      logger.disable()
      expect(logger.isEnabled()).toBe(false)
    })
    
    it('should export logs', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      const json = logger.export('json')
      expect(JSON.parse(json)).toEqual([])
      
      const csv = logger.export('csv')
      expect(csv).toContain('id,type,method,url,status,duration,requestSize,responseSize,error,timestamp')
    })
    
    it('should get logs by type', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      const internalLogger = logger._logger
      
      const httpLog: UnifiedLogEntry = {
        id: 'http-1',
        type: 'http',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'https://api.example.com/http',
        method: 'GET',
        http: { status: null, statusText: null, protocol: null },
        websocket: null,
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      const wsLog: UnifiedLogEntry = {
        id: 'ws-1',
        type: 'websocket',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        url: 'ws://example.com/ws',
        method: 'WEBSOCKET',
        http: null,
        websocket: { readyState: 1, eventType: 'connection', direction: null, code: null, reason: null, wasClean: null },
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'websocket', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      internalLogger['store'].addLog(httpLog)
      internalLogger['store'].addLog(wsLog)
      
      const httpLogs = logger.getLogsByType('http')
      const wsLogs = logger.getLogsByType('websocket')
      
      expect(httpLogs).toHaveLength(1)
      expect(httpLogs[0].id).toBe('http-1')
      expect(wsLogs).toHaveLength(1)
      expect(wsLogs[0].id).toBe('ws-1')
    })
    
    it('should subscribe to new logs', () => {
      const logger = createNetworkLogger({ 
        enabled: false,
        interceptors: { fetch: false, xhr: false, websocket: false }
      })
      
      const callback = vi.fn()
      const unsubscribe = logger.subscribe(callback)
      
      const internalLogger = logger._logger
      
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
        requestHeaders: {},
        responseHeaders: {},
        request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
        error: { occurred: false, message: null, name: null, stack: null },
        metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() }
      }
      
      internalLogger['store'].addLog(log)
      
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(log)
      
      unsubscribe()
      internalLogger['store'].addLog(log)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })
})