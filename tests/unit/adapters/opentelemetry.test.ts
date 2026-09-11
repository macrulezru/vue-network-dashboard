import { describe, it, expect, vi } from 'vitest'
import { createOpenTelemetryAdapter } from '../../../src/adapters/opentelemetry'
import type { UnifiedLogEntry } from '../../../src/core/types'

function makeEntry(overrides: Partial<UnifiedLogEntry> = {}): UnifiedLogEntry {
  return {
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
    metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: new Date().toISOString() },
    ...overrides
  }
}

describe('createOpenTelemetryAdapter', () => {
  it('ignores the pending snapshot and only creates one span for the completed entry', () => {
    const span = { setStatus: vi.fn(), setAttribute: vi.fn(), end: vi.fn() }
    const tracer = { startSpan: vi.fn(() => span) }
    const adapter = createOpenTelemetryAdapter(tracer)

    adapter.onLog?.(makeEntry({ metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: '', pending: true } }))
    expect(tracer.startSpan).not.toHaveBeenCalled()

    adapter.onLog?.(makeEntry({
      http: { status: 200, statusText: 'OK', protocol: 'http/1.1' },
      duration: 42,
      endTime: Date.now(),
      metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: '', pending: false }
    }))

    expect(tracer.startSpan).toHaveBeenCalledTimes(1)
    expect(span.end).toHaveBeenCalledTimes(1)
  })
})
