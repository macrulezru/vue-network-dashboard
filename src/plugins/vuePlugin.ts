import type { App, Ref, Plugin } from 'vue'
import { computed, inject, ref, readonly } from 'vue'
import { NetworkDashboard } from '../core/NetworkDashboard'
import type { NetworkDashboardOptions, UnifiedLogEntry, NetworkStats, MockRule, MockRulesGroup } from '../core/types'

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
  export: (format?: 'json' | 'csv' | 'har', customLogs?: UnifiedLogEntry[]) => string
  getLogsByType: (type: 'http' | 'websocket' | 'sse') => UnifiedLogEntry[]
  getLogsByUrl: (urlPattern: string | RegExp) => UnifiedLogEntry[]
  getLogsByStatus: (statusRange: [number, number]) => UnifiedLogEntry[]
  getLogsByMethod: (method: string) => UnifiedLogEntry[]
  getErrorLogs: () => UnifiedLogEntry[]
  queryLogs: (filters: any) => UnifiedLogEntry[]
  subscribe: (callback: (entry: UnifiedLogEntry) => void) => () => void
  
  // Mock groups API
  mockGroups: Ref<readonly MockRulesGroup[]>
  addMockGroup: (name: string) => MockRulesGroup
  removeMockGroup: (groupId: string) => void
  toggleMockGroup: (groupId: string, enabled: boolean) => void
  expandMockGroup: (groupId: string, isOpened: boolean) => void
  renameMockGroup: (groupId: string, name: string) => void
  replaceMockGroups: (groups: MockRulesGroup[]) => void
  addMockToGroup: (groupId: string, rule: Omit<MockRule, 'id'>) => MockRule
  removeMockFromGroup: (groupId: string, ruleId: string) => void
  updateMockInGroup: (groupId: string, ruleId: string, updates: Partial<Omit<MockRule, 'id'>>) => void
  
  // Legacy mock API (for backward compatibility)
  mocks: Ref<readonly MockRule[]>
  addMock: (rule: Omit<MockRule, 'id'>) => MockRule
  updateMock: (id: string, updates: Partial<Omit<MockRule, 'id'>>) => void
  removeMock: (id: string) => void
  clearMocks: () => void
  getMocks: () => MockRule[]
  
  _logger: NetworkDashboard
}

const createReactiveLogger = (logger: NetworkDashboard): VueNetworkDashboardInstance => {
  const logs = logger.getLogsRef()
  const stats = computed(() => logger.getStats())
  
  // Mock groups reactive state
  const mockGroups = ref<readonly MockRulesGroup[]>(logger.getMockGroups())
  const unsubscribeGroups = logger.onMockGroupsChange((groups) => {
    mockGroups.value = groups
  })
  
  // Legacy mocks computed from groups
  const mocks = computed(() => logger.getMocks())
  
  const originalDestroy = logger.destroy.bind(logger)
  logger.destroy = () => {
    unsubscribeGroups()
    originalDestroy()
  }
  
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
    export: (format: 'json' | 'csv' | 'har' = 'json', customLogs?: UnifiedLogEntry[]) => logger.export(format, customLogs),
    getLogsByType: (type) => logger.getLogsByType(type),
    getLogsByUrl: (urlPattern) => logger.getLogsByUrl(urlPattern),
    getLogsByStatus: (statusRange) => logger.getLogsByStatus(statusRange),
    getLogsByMethod: (method) => logger.getLogsByMethod(method),
    getErrorLogs: () => logger.getErrorLogs(),
    queryLogs: (filters) => logger.queryLogs(filters),
    subscribe: (callback) => logger.subscribe(callback),
    
    // Mock groups API
    mockGroups: readonly(mockGroups) as Ref<readonly MockRulesGroup[]>,
    addMockGroup: (name) => logger.addMockGroup(name),
    removeMockGroup: (groupId) => logger.removeMockGroup(groupId),
    toggleMockGroup: (groupId, enabled) => logger.toggleMockGroup(groupId, enabled),
    expandMockGroup: (groupId, isOpened) => logger.expandMockGroup(groupId, isOpened),
    renameMockGroup: (groupId, name) => logger.renameMockGroup(groupId, name),
    replaceMockGroups: (groups) => logger.replaceMockGroups(groups),
    addMockToGroup: (groupId, rule) => logger.addMockToGroup(groupId, rule),
    removeMockFromGroup: (groupId, ruleId) => logger.removeMockFromGroup(groupId, ruleId),
    updateMockInGroup: (groupId, ruleId, updates) => logger.updateMockInGroup(groupId, ruleId, updates),
    
    // Legacy mock API
    mocks: readonly(mocks) as Ref<readonly MockRule[]>,
    addMock: (rule) => logger.addMock(rule),
    updateMock: (id, updates) => logger.updateMock(id, updates),
    removeMock: (id) => logger.removeMock(id),
    clearMocks: () => logger.clearMocks(),
    getMocks: () => logger.getMocks(),
    
    _logger: logger
  }
}

export const NetworkDashboardPlugin: Plugin = {
  install(app: App, options: NetworkDashboardOptions = {}) {
    const logger = new NetworkDashboard(options)
    const reactiveLogger = createReactiveLogger(logger)

    app.provide('networkDashboard', reactiveLogger)
    app.provide('networkDashboardUi', options.ui ?? {})

    app.config.globalProperties.$networkDashboard = reactiveLogger

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