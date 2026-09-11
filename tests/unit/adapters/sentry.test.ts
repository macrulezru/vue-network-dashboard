import { describe, it, expect, vi } from 'vitest'
import { createSentryAdapter } from '../../../src/adapters/sentry'
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

describe('createSentryAdapter', () => {
  it('ignores the pending snapshot and only breadcrumbs the completed entry', () => {
    const sentry = { addBreadcrumb: vi.fn() }
    const adapter = createSentryAdapter(sentry)

    adapter.onLog?.(makeEntry({ metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: '', pending: true } }))
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled()

    adapter.onLog?.(makeEntry({
      http: { status: 200, statusText: 'OK', protocol: 'http/1.1' },
      duration: 42,
      metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: '', pending: false }
    }))
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1)
  })

  it('sends a Sentry event for a response at or above errorStatusThreshold', () => {
    const sentry = { addBreadcrumb: vi.fn(), captureMessage: vi.fn() }
    const adapter = createSentryAdapter(sentry)

    adapter.onLog?.(makeEntry({ http: { status: 500, statusText: 'Internal Server Error', protocol: 'http/1.1' } }))

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
  })
})
