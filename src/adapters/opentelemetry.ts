import type { NetworkDashboardOptions, UnifiedLogEntry } from '../core/types'

/**
 * OpenTelemetry adapter for vue-network-dashboard.
 *
 * Creates an OTel span per HTTP request and records semantic attributes
 * per the OpenTelemetry HTTP semantic conventions (semconv 1.23+).
 *
 * Usage:
 * ```ts
 * import { trace } from '@opentelemetry/api'
 * import { createOpenTelemetryAdapter } from 'vue-network-dashboard/adapters/opentelemetry'
 *
 * const tracer = trace.getTracer('vue-network-dashboard')
 *
 * app.use(NetworkDashboardPlugin, {
 *   callbacks: createOpenTelemetryAdapter(tracer)
 * })
 * ```
 */

export interface OTelTracerLike {
  startSpan(name: string, options?: {
    startTime?: number
    attributes?: Record<string, string | number | boolean | undefined>
    kind?: number
  }): OTelSpanLike
}

export interface OTelSpanLike {
  setStatus(status: { code: number; message?: string }): void
  setAttribute(key: string, value: string | number | boolean): void
  end(endTime?: number): void
}

export interface OpenTelemetryAdapterOptions {
  /** Only trace HTTP entries (skip websocket/sse). Default: true */
  httpOnly?: boolean
  /** Include response body size as an attribute. Default: true */
  includeBodySize?: boolean
}

/** OTel SpanStatusCode values */
const StatusCode = { OK: 1, ERROR: 2 } as const

/** OTel SpanKind.CLIENT */
const CLIENT = 2

export const createOpenTelemetryAdapter = (
  tracer: OTelTracerLike,
  adapterOptions: OpenTelemetryAdapterOptions = {}
): Pick<NetworkDashboardOptions['callbacks'] & object, 'onLog'> => {
  const { httpOnly = true, includeBodySize = true } = adapterOptions

  return {
    onLog(entry: UnifiedLogEntry) {
      if (httpOnly && entry.type !== 'http') return

      const spanName = `${entry.method} ${stripQuery(entry.url)}`

      const attributes: Record<string, string | number | boolean | undefined> = {
        'http.request.method': entry.method,
        'url.full': entry.url,
        'network.protocol.name': 'http',
        'http.client': entry.metadata.clientType
      }

      if (entry.type === 'http') {
        if (entry.http?.status)        attributes['http.response.status_code'] = entry.http.status
        if (entry.http?.protocol)      attributes['network.protocol.version']  = entry.http.protocol
        if (entry.metadata.redirected) attributes['http.redirected'] = true
        if (entry.metadata.mocked)     attributes['http.mocked']     = true
      }

      if (includeBodySize) {
        if (entry.request.bodySize)  attributes['http.request.body.size']  = entry.request.bodySize
        if (entry.response.bodySize) attributes['http.response.body.size'] = entry.response.bodySize
      }

      const span = tracer.startSpan(spanName, {
        startTime: entry.startTime,
        attributes,
        kind: CLIENT
      })

      if (entry.error.occurred) {
        span.setStatus({ code: StatusCode.ERROR, message: entry.error.message ?? 'Network error' })
      } else if ((entry.http?.status ?? 0) >= 400) {
        span.setStatus({ code: StatusCode.ERROR, message: `HTTP ${entry.http?.status}` })
      } else {
        span.setStatus({ code: StatusCode.OK })
      }

      span.end(entry.endTime ?? Date.now())
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripQuery(url: string): string {
  try { return new URL(url).pathname } catch { return url.split('?')[0] }
}
