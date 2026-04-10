import type { NetworkDashboardOptions, UnifiedLogEntry } from '../core/types'

/**
 * Sentry adapter for vue-network-dashboard.
 *
 * Forwards every captured network event as a Sentry breadcrumb.
 * HTTP 5xx and network errors are also sent as Sentry events.
 *
 * Usage:
 * ```ts
 * import * as Sentry from '@sentry/vue'
 * import { createSentryAdapter } from 'vue-network-dashboard/adapters/sentry'
 *
 * app.use(NetworkDashboardPlugin, {
 *   callbacks: createSentryAdapter(Sentry)
 * })
 * ```
 */

export interface SentryLike {
  addBreadcrumb(breadcrumb: {
    type?: string
    category?: string
    message?: string
    data?: Record<string, unknown>
    level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
    timestamp?: number
  }): void
  captureMessage?(message: string, level?: string): void
  captureException?(error: unknown): void
}

export interface SentryAdapterOptions {
  /**
   * Only capture breadcrumbs for requests that match this predicate.
   * Default: capture everything.
   */
  filter?: (entry: UnifiedLogEntry) => boolean
  /**
   * Minimum HTTP status code to send as a Sentry event (not just a breadcrumb).
   * Default: 500
   */
  errorStatusThreshold?: number
  /**
   * Whether to include request/response body in breadcrumb data.
   * Default: false (bodies may contain sensitive data)
   */
  includeBodies?: boolean
}

export const createSentryAdapter = (
  sentry: SentryLike,
  adapterOptions: SentryAdapterOptions = {}
): Pick<NetworkDashboardOptions['callbacks'] & object, 'onLog' | 'onError'> => {
  const {
    filter,
    errorStatusThreshold = 500,
    includeBodies = false
  } = adapterOptions

  return {
    onLog(entry: UnifiedLogEntry) {
      if (filter && !filter(entry)) return

      const isError = entry.error.occurred || (entry.http?.status ?? 0) >= errorStatusThreshold
      const level: 'info' | 'warning' | 'error' = isError
        ? 'error'
        : (entry.http?.status ?? 0) >= 400 ? 'warning' : 'info'

      const data: Record<string, unknown> = {
        url: entry.url,
        method: entry.method,
        type: entry.type,
        duration_ms: entry.duration,
        client: entry.metadata.clientType
      }

      if (entry.type === 'http') {
        data.status_code = entry.http?.status
        data.status_text = entry.http?.statusText
        data.request_size = entry.request.bodySize
        data.response_size = entry.response.bodySize
        if (entry.metadata.mocked) data.mocked = true
      }

      if (includeBodies) {
        if (entry.request.body != null) data.request_body = entry.request.body
        if (entry.response.body != null) data.response_body = entry.response.body
      }

      if (entry.error.occurred) {
        data.error_message = entry.error.message
        data.error_name = entry.error.name
      }

      sentry.addBreadcrumb({
        type: 'http',
        category: `network.${entry.type}`,
        message: `${entry.method} ${entry.url}`,
        data,
        level,
        timestamp: entry.startTime / 1000
      })

      // Also send a Sentry event for severe failures
      if (isError && sentry.captureMessage) {
        const status = entry.http?.status
        const msg = entry.error.occurred
          ? `Network error: ${entry.method} ${entry.url} — ${entry.error.message}`
          : `HTTP ${status}: ${entry.method} ${entry.url}`
        sentry.captureMessage(msg, 'error')
      }
    },

    onError(err: Error) {
      if (sentry.captureException) {
        sentry.captureException(err)
      }
    }
  }
}
