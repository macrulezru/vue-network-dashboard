import { describe, it, expect } from 'vitest'
import { useLogFilter } from '../../../../src/view/composables/useLogFilter'
import type { UnifiedLogEntry } from '../../../../src/core/types'

function makeLog(overrides: Partial<UnifiedLogEntry> = {}): UnifiedLogEntry {
  return {
    id: overrides.id ?? 'log-1',
    type: 'http',
    startTime: Date.now(),
    endTime: null,
    duration: null,
    url: 'https://api.example.com/users',
    method: 'GET',
    http: { status: 200, statusText: 'OK', protocol: 'http/1.1' },
    websocket: null,
    sse: null,
    requestHeaders: {},
    responseHeaders: {},
    request: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
    response: { body: null, bodyRaw: null, bodySize: null, bodyType: null },
    error: { occurred: false, message: null, name: null, stack: null },
    metadata: {
      clientType: 'fetch',
      redirected: false,
      retryCount: 0,
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  }
}

describe('useLogFilter', () => {
  it('filters by route', () => {
    // Regression: `route` was a declared FilterOptions field, set by
    // resetFilters()/the default state, but the filtering logic never
    // actually read it — every route filter was silently a no-op.
    const logs = [
      makeLog({ id: 'a', route: '/users/:id' }),
      makeLog({ id: 'b', route: '/posts/:id' }),
      makeLog({ id: 'c' }), // no route attached
    ]
    const { filters, filteredLogs } = useLogFilter(logs)

    filters.value.route = 'users'

    expect(filteredLogs.value.map((l) => l.id)).toEqual(['a'])
  })

  it('filters WebSocket message events when wsMessagesOnly is set', () => {
    // Regression: `wsMessagesOnly` was declared and defaulted, but never
    // applied — every websocket log passed through regardless of eventType.
    const logs = [
      makeLog({
        id: 'open',
        type: 'websocket',
        http: null,
        websocket: {
          readyState: 1,
          eventType: 'open',
          direction: null,
          code: null,
          reason: null,
          wasClean: null,
        },
      }),
      makeLog({
        id: 'message',
        type: 'websocket',
        http: null,
        websocket: {
          readyState: 1,
          eventType: 'message',
          direction: 'incoming',
          code: null,
          reason: null,
          wasClean: null,
        },
      }),
    ]
    const { filters, filteredLogs } = useLogFilter(logs)

    filters.value.type = 'websocket'
    filters.value.wsMessagesOnly = true

    expect(filteredLogs.value.map((l) => l.id)).toEqual(['message'])
  })

  it('does not apply wsMessagesOnly when type filter is not "websocket"', () => {
    const logs = [
      makeLog({ id: 'http-log' }),
      makeLog({
        id: 'ws-open',
        type: 'websocket',
        http: null,
        websocket: {
          readyState: 1,
          eventType: 'open',
          direction: null,
          code: null,
          reason: null,
          wasClean: null,
        },
      }),
    ]
    const { filters, filteredLogs } = useLogFilter(logs)

    filters.value.wsMessagesOnly = true

    expect(filteredLogs.value.map((l) => l.id)).toEqual(['http-log', 'ws-open'])
  })

  it('supports "regex:" prefixed patterns on url, matching the same convention NetworkDebugger.vue uses', () => {
    const logs = [
      makeLog({ id: 'v1', url: 'https://api.example.com/v1/users' }),
      makeLog({ id: 'v2', url: 'https://api.example.com/v2/users' }),
    ]
    const { filters, filteredLogs } = useLogFilter(logs)

    filters.value.url = 'regex:/v1/'

    expect(filteredLogs.value.map((l) => l.id)).toEqual(['v1'])
  })

  it('falls back to plain substring matching for a non-regex url filter', () => {
    const logs = [
      makeLog({ id: 'match', url: 'https://api.example.com/users' }),
      makeLog({ id: 'no-match', url: 'https://api.example.com/posts' }),
    ]
    const { filters, filteredLogs } = useLogFilter(logs)

    filters.value.url = 'users'

    expect(filteredLogs.value.map((l) => l.id)).toEqual(['match'])
  })

  it('resetFilters() restores every field, including route and wsMessagesOnly', () => {
    const { filters, resetFilters } = useLogFilter([])
    filters.value.route = 'x'
    filters.value.wsMessagesOnly = true

    resetFilters()

    expect(filters.value.route).toBe('')
    expect(filters.value.wsMessagesOnly).toBe(false)
  })
})
