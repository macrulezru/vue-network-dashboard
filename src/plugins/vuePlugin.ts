import type { App, Ref, Plugin } from 'vue'
import { computed, inject } from 'vue'
import { NetworkDashboard } from '../core/NetworkDashboard'
import type { NetworkDashboardOptions, UnifiedLogEntry, NetworkStats } from '../core/types'

export interface VueNetworkDashboardInstance {
  logs: Ref<UnifiedLogEntry[]>
  totalRequests: Ref<number>
  totalErrors: Ref<number>
  averageDuration: Ref<number>
  totalDataSent: Ref<number>
  totalDataReceived: Ref<number>
  clear: () => void
  enable: () => void
  disable: () => void
  isEnabled: () => boolean
  getStats: () => NetworkStats
  getStatsSummary: () => string
  export: (format?: 'json' | 'csv') => string
  getLogsByType: (type: 'http' | 'websocket' | 'sse') => UnifiedLogEntry[]
  getLogsByUrl: (urlPattern: string | RegExp) => UnifiedLogEntry[]
  getLogsByStatus: (statusRange: [number, number]) => UnifiedLogEntry[]
  getLogsByMethod: (method: string) => UnifiedLogEntry[]
  getErrorLogs: () => UnifiedLogEntry[]
  queryLogs: (filters: any) => UnifiedLogEntry[]
  subscribe: (callback: (entry: UnifiedLogEntry) => void) => () => void
  _logger: NetworkDashboard
}

const createReactiveLogger = (logger: NetworkDashboard): VueNetworkDashboardInstance => {
  const logs = logger.getLogsRef()
  const stats = computed(() => logger.getStats())
  
  return {
    logs,
    totalRequests: computed(() => stats.value.totalRequests),
    totalErrors: computed(() => stats.value.totalErrors),
    averageDuration: computed(() => stats.value.averageDuration),
    totalDataSent: computed(() => stats.value.totalDataSent),
    totalDataReceived: computed(() => stats.value.totalDataReceived),
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
    _logger: logger
  }
}

export const NetworkDashboardPlugin: Plugin = {
  install(app: App, options: NetworkDashboardOptions = {}) {
    const logger = new NetworkDashboard(options)
    const reactiveLogger = createReactiveLogger(logger)
    
    // Provide to entire app
    app.provide('networkDashboard', reactiveLogger)
    
    // Add to global properties
    app.config.globalProperties.$networkDashboard = reactiveLogger
    
    // Cleanup on app unmount
    const originalUnmount = app.unmount
    app.unmount = function() {
      logger.destroy()
      originalUnmount.call(this)
    }
  }
}

export const useNetworkDashboard = (): VueNetworkDashboardInstance => {
  const instance = inject<VueNetworkDashboardInstance>('networkDashboard')
  if (!instance) {
    throw new Error(
      'useNetworkDashboard must be used within a Vue component that has the NetworkDashboardPlugin installed.\n' +
      'Make sure to install the plugin: app.use(NetworkDashboardPlugin)'
    )
  }
  return instance
}

export const createNetworkDashboard = (options?: NetworkDashboardOptions): VueNetworkDashboardInstance => {
  const logger = new NetworkDashboard(options)
  return createReactiveLogger(logger)
}

export default NetworkDashboardPlugin