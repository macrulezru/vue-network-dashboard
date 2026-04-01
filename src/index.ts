// Core exports
export { NetworkDashboard } from './core/NetworkDashboard'
export { LogFormatter, HTTPFormatter, WebSocketFormatter } from './core/formatters'
export type {
  UnifiedLogEntry,
  NetworkDashboardOptions,
  NetworkStats,
  LogStore as ILogStore,
  SanitizationRules
} from './core/types'

// Store exports
export { LogStore } from './store/logStore'

// Interceptor exports (for advanced usage)
export {
  FetchInterceptor,
  XHRInterceptor,
  WebSocketInterceptor,
  type FetchInterceptorOptions,
  type XHRInterceptorOptions,
  type WebSocketInterceptorOptions
} from './interceptors'

// Utils exports (for custom sanitization)
export {
  sanitizeHeaders,
  sanitizeBody,
  maskSensitiveData,
  maskString,
  getSanitizationRules
} from './utils/sanitizer'

export {
  calculateSize,
  getDataType,
  safeStringify,
  getContentLength
} from './utils/sizeCalculator'

export {
  generateId,
  safeClone,
  truncate,
  isObject,
  formatBytes,
  getContentType,
  parseHeaders
} from './utils/helpers'

// Vue plugin exports
export {
  default,
  NetworkDashboardPlugin,
  useNetworkDashboard,
  createNetworkDashboard,
  type VueNetworkDashboardInstance
} from './plugins/vuePlugin'