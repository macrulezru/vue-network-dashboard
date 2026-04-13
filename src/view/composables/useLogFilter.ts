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
}

export const useLogFilter = (logs: UnifiedLogEntry[]) => {
  const filters = ref<FilterOptions>({
    type: 'all',
    method: '',
    url: '',
    body: '',
    route: '',
    status: '',
    minDuration: null,
    hasError: false
  })
  
  const filteredLogs = computed(() => {
    let result = [...logs]
    
    // Filter by type
    if (filters.value.type !== 'all') {
      result = result.filter(log => log.type === filters.value.type)
    }
    
    // Filter by method
    if (filters.value.method) {
      result = result.filter(log => 
        log.method.toUpperCase().includes(filters.value.method.toUpperCase())
      )
    }
    
    // Filter by URL
    if (filters.value.url) {
      result = result.filter(log =>
        log.url.toLowerCase().includes(filters.value.url.toLowerCase())
      )
    }

    // Filter by body (request or response)
    if (filters.value.body) {
      const term = filters.value.body.toLowerCase()
      result = result.filter(log => {
        const req = typeof log.request.body === 'string'
          ? log.request.body
          : JSON.stringify(log.request.body ?? '')
        const res = typeof log.response.body === 'string'
          ? log.response.body
          : JSON.stringify(log.response.body ?? '')
        return req.toLowerCase().includes(term) || res.toLowerCase().includes(term)
      })
    }

    // Filter by status
    if (filters.value.status) {
      result = result.filter(log => {
        if (log.type !== 'http') return false
        const status = log.http?.status?.toString() || ''
        return status.includes(filters.value.status)
      })
    }
    
    // Filter by min duration
    if (filters.value.minDuration !== null) {
      result = result.filter(log => 
        log.duration !== null && log.duration >= filters.value.minDuration!
      )
    }
    
    // Filter by error
    if (filters.value.hasError) {
      result = result.filter(log => log.error.occurred)
    }
    
    return result
  })
  
  const resetFilters = () => {
    filters.value = {
      type: 'all',
      method: '',
      url: '',
      body: '',
      route: '',
      status: '',
      minDuration: null,
      hasError: false
    }
  }
  
  return {
    filters,
    filteredLogs,
    resetFilters
  }
}