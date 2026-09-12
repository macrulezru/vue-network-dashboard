import { ref, computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

export interface FilterOptions {
  type: 'all' | 'http' | 'websocket' | 'sse'
  method: string
  url: string
  body: string
  route: string
  status: string
  minDuration: number | null
  hasError: boolean
  wsMessagesOnly: boolean
}

// A value prefixed with "regex:" is matched as a case-insensitive regular
// expression instead of a plain substring — same convention NetworkDebugger.vue
// itself uses, so a search string built for one works identically in the other.
function matchText(text: string, filter: string): boolean {
  if (filter.startsWith('regex:')) {
    try {
      return new RegExp(filter.slice(6), 'i').test(text)
    } catch {
      return false
    }
  }
  return text.toLowerCase().includes(filter.toLowerCase())
}

const DEFAULT_FILTERS: FilterOptions = {
  type: 'all',
  method: '',
  url: '',
  body: '',
  route: '',
  status: '',
  minDuration: null,
  hasError: false,
  wsMessagesOnly: false,
}

/**
 * Standalone filtering utility for a static log snapshot — useful if you're
 * building your own custom debugger UI on top of the raw log data instead of
 * `<NetworkDebugger>`. `<NetworkDebugger>` itself does NOT use this composable:
 * it filters its own live, reactive log stream inline (with debouncing and
 * sessionStorage persistence this composable doesn't provide), so don't expect
 * the two to stay in lockstep feature-for-feature — this one is deliberately
 * simpler, and takes a fixed `logs` array rather than a live source.
 */
export const useLogFilter = (logs: UnifiedLogEntry[]) => {
  const filters = ref<FilterOptions>({ ...DEFAULT_FILTERS })

  const filteredLogs = computed(() => {
    let result = [...logs]

    // Filter by type
    if (filters.value.type !== 'all') {
      result = result.filter((log) => log.type === filters.value.type)
    }

    // Filter by method
    if (filters.value.method) {
      result = result.filter((log) =>
        log.method.toUpperCase().includes(filters.value.method.toUpperCase())
      )
    }

    // Filter by URL
    if (filters.value.url) {
      result = result.filter((log) => matchText(log.url, filters.value.url))
    }

    // Filter by body (request or response)
    if (filters.value.body) {
      result = result.filter((log) => {
        const req =
          typeof log.request.body === 'string'
            ? log.request.body
            : JSON.stringify(log.request.body ?? '')
        const res =
          typeof log.response.body === 'string'
            ? log.response.body
            : JSON.stringify(log.response.body ?? '')
        return matchText(req, filters.value.body) || matchText(res, filters.value.body)
      })
    }

    // Filter by route
    if (filters.value.route) {
      result = result.filter(
        (log) => log.route !== undefined && matchText(log.route, filters.value.route)
      )
    }

    // Filter by status
    if (filters.value.status) {
      result = result.filter((log) => {
        if (log.type !== 'http') return false
        const status = log.http?.status?.toString() || ''
        return status.includes(filters.value.status)
      })
    }

    // Filter by min duration
    if (filters.value.minDuration !== null) {
      result = result.filter(
        (log) => log.duration !== null && log.duration >= filters.value.minDuration!
      )
    }

    // Filter by error
    if (filters.value.hasError) {
      result = result.filter((log) => log.error.occurred)
    }

    // WebSocket messages only
    if (filters.value.wsMessagesOnly && filters.value.type === 'websocket') {
      result = result.filter((log) => log.websocket?.eventType === 'message')
    }

    return result
  })

  const resetFilters = () => {
    filters.value = { ...DEFAULT_FILTERS }
  }

  return {
    filters,
    filteredLogs,
    resetFilters,
  }
}
