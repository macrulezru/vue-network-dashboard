// Core exports
export { NetworkDashboard } from './core/NetworkDashboard'
export { LogFormatter, HTTPFormatter, WebSocketFormatter } from './core/formatters'
export type {
  UnifiedLogEntry,
  NetworkDashboardOptions,
  NetworkStats,
  MockRule,
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

// UI Component exports
export { NetworkDebugger, type NetworkDebuggerProps } from './view'

// Adapters (optional peer-dep integrations)
export { createSentryAdapter }       from './adapters/sentry'
export { createOpenTelemetryAdapter } from './adapters/opentelemetry'
export type { SentryLike, SentryAdapterOptions }         from './adapters/sentry'
export type { OTelTracerLike, OpenTelemetryAdapterOptions } from './adapters/opentelemetry'

// DevTools integration
export { setupDevtools } from './devtools'