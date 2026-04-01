import type { App, Ref, Plugin } from 'vue'
import { computed } from 'vue'
import { NetworkLogger } from '../core/NetworkLogger'
import type { NetworkLoggerOptions, UnifiedLogEntry, NetworkStats } from '../core/types'

/**
 * Vue plugin instance with reactive state
 */
export interface VueNetworkLoggerInstance {
  // Reactive state
  logs: Ref<UnifiedLogEntry[]>
  
  // Computed properties
  totalRequests: Ref<number>
  totalErrors: Ref<number>
  averageDuration: Ref<number>
  totalDataSent: Ref<number>
  totalDataReceived: Ref<number>
  
  // Methods
  clear: () => void
  enable: () => void
  disable: () => void
  isEnabled: () => boolean
  getStats: () => NetworkStats
  getStatsSummary: () => string
  export: (format?: 'json' | 'csv') => string
  getLogsByType: (type: 'http' | 'websocket') => UnifiedLogEntry[]
  getLogsByUrl: (urlPattern: string | RegExp) => UnifiedLogEntry[]
  getLogsByStatus: (statusRange: [number, number]) => UnifiedLogEntry[]
  getLogsByMethod: (method: string) => UnifiedLogEntry[]
  getErrorLogs: () => UnifiedLogEntry[]
  queryLogs: (filters: {
    type?: 'http' | 'websocket'
    url?: string | RegExp
    method?: string
    minDuration?: number
    maxDuration?: number
    startTime?: number
    endTime?: number
    hasError?: boolean
    statusCode?: number | number[]
  }) => UnifiedLogEntry[]
  subscribe: (callback: (entry: UnifiedLogEntry) => void) => () => void
  
  // Internal
  _logger: NetworkLogger
}

/**
 * Create reactive wrapper around NetworkLogger
 */
const createReactiveLogger = (logger: NetworkLogger): VueNetworkLoggerInstance => {
  const logs = logger.getLogsRef()
  
  // Computed reactive stats
  const stats = computed(() => logger.getStats())
  
  const totalRequests = computed(() => stats.value.totalRequests)
  const totalErrors = computed(() => stats.value.totalErrors)
  const averageDuration = computed(() => stats.value.averageDuration)
  const totalDataSent = computed(() => stats.value.totalDataSent)
  const totalDataReceived = computed(() => stats.value.totalDataReceived)
  
  return {
    // Reactive state
    logs,
    
    // Computed properties
    totalRequests,
    totalErrors,
    averageDuration,
    totalDataSent,
    totalDataReceived,
    
    // Methods
    clear: () => logger.clear(),
    enable: () => logger.enable(),
    disable: () => logger.disable(),
    isEnabled: () => logger.getEnabled(),
    getStats: () => logger.getStats(),
    getStatsSummary: () => logger.getStatsSummary(),
    export: (format = 'json') => logger.export(format),
    getLogsByType: (type) => logger.getLogsByType(type),
    getLogsByUrl: (urlPattern) => logger.getLogsByUrl(urlPattern),
    getLogsByStatus: (statusRange) => logger.getLogsByStatus(statusRange),
    getLogsByMethod: (method) => logger.getLogsByMethod(method),
    getErrorLogs: () => logger.getErrorLogs(),
    queryLogs: (filters) => logger.queryLogs(filters),
    subscribe: (callback) => logger.subscribe(callback),
    
    // Internal
    _logger: logger
  }
}

/**
 * Vue plugin for Network Logger
 * Provides global network logging functionality to Vue app
 */
export const NetworkLoggerPlugin: Plugin = {
  install(app: App, options: NetworkLoggerOptions = {}) {
    // Create logger instance
    const logger = new NetworkLogger(options)
    const reactiveLogger = createReactiveLogger(logger)
    
    // Provide to entire app (Composition API)
    app.provide('networkLogger', reactiveLogger)
    
    // Add to global properties (Options API)
    app.config.globalProperties.$networkLogger = reactiveLogger
    
    // Add devtools integration
    if (typeof window !== 'undefined' && (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__) {
      const devtools = (window as any).__VUE_DEVTOOLS_GLOBAL_HOOK__
      
      // Register custom inspector
      if (devtools.addInspector) {
        devtools.addInspector({
          id: 'vue-network-logger',
          label: 'Network Logger',
          icon: '🌐',
          treeFilterPlaceholder: 'Search requests...'
        })
      }
      
      // Send logs to devtools
      logger.subscribe(() => {
        if (devtools.sendInspectorTree) {
          devtools.sendInspectorTree('vue-network-logger', {
            rootNodes: []
          })
        }
      })
    }
    
    // Cleanup on app unmount
    const originalUnmount = app.unmount
    app.unmount = function() {
      logger.destroy()
      originalUnmount.call(this)
    }
  }
}

/**
 * Composition API hook for using network logger
 * @returns VueNetworkLoggerInstance
 */
export const useNetworkLogger = (): VueNetworkLoggerInstance => {
  // This will be replaced by the injected value when used in Vue component
  // The actual implementation is provided by the plugin
  throw new Error(
    'useNetworkLogger must be used within a Vue component that has the NetworkLoggerPlugin installed.\n' +
    'Make sure to install the plugin: app.use(NetworkLoggerPlugin)'
  )
}

/**
 * Create a standalone network logger instance (without Vue)
 * Useful for non-Vue environments or testing
 */
export const createNetworkLogger = (options?: NetworkLoggerOptions): VueNetworkLoggerInstance => {
  const logger = new NetworkLogger(options)
  return createReactiveLogger(logger)
}

export default NetworkLoggerPlugin