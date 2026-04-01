<script setup lang="ts">
import '../styles/debugger.scss';

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNetworkDashboard } from '../../plugins/vuePlugin'
import LogEntry from './LogEntry.vue'
import FilterBar from './FilterBar.vue'
import StatsPanel from './StatsPanel.vue'

// Props
export interface NetworkDebuggerProps {
  defaultVisible?: boolean
  defaultPinned?: boolean
  hotkey?: string
  hotkeyModifiers?: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
  }
}

const props = withDefaults(defineProps<NetworkDebuggerProps>(), {
  defaultVisible: false,
  defaultPinned: false,
  hotkey: 'd',
  hotkeyModifiers: () => ({ ctrl: true, shift: true })
})

// Get logger instance
const dashboard = useNetworkDashboard()

// Logs from the dashboard (reactive)
const logs = dashboard.logs

// Filter state
const filters = ref({
  type: 'all' as 'all' | 'http' | 'websocket' | 'sse',
  method: '',
  url: '',
  status: '',
  minDuration: null as number | null,
  hasError: false
})

// Filtered logs - computed that depends on logs.value and filters
const filteredLogs = computed(() => {
  let result = [...logs.value]
  
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

// Statistics
const stats = computed(() => dashboard.getStats())

// State
const isVisible = ref(props.defaultVisible)
const isPinned = ref(props.defaultPinned)
const activeTab = ref<'logs' | 'stats'>('logs')
const expandedLogs = ref<Set<string>>(new Set())
const showExportMenu = ref(false)

// Reset filters
const resetFilters = () => {
  filters.value = {
    type: 'all',
    method: '',
    url: '',
    status: '',
    minDuration: null,
    hasError: false
  }
}

/**
 * Download file with logs in specified format
 */
const downloadFile = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export logs in specified format and download
 */
const handleExport = (format: 'json' | 'csv') => {
  const data = dashboard.export(format)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `network-logs-${timestamp}.${format}`
  const mimeType = format === 'json' ? 'application/json' : 'text/csv'
  
  downloadFile(data, fileName, mimeType)
  showExportMenu.value = false
}

/**
 * Toggle export menu
 */
const toggleExportMenu = () => {
  showExportMenu.value = !showExportMenu.value
}

// Hotkey to toggle debugger
const handleKeydown = (event: KeyboardEvent) => {
  const ctrlMatch = props.hotkeyModifiers.ctrl === undefined || event.ctrlKey === props.hotkeyModifiers.ctrl
  const altMatch = props.hotkeyModifiers.alt === undefined || event.altKey === props.hotkeyModifiers.alt
  const shiftMatch = props.hotkeyModifiers.shift === undefined || event.shiftKey === props.hotkeyModifiers.shift
  const metaMatch = props.hotkeyModifiers.meta === undefined || event.metaKey === props.hotkeyModifiers.meta
  const keyMatch = event.key.toLowerCase() === props.hotkey.toLowerCase()
  
  const target = event.target as HTMLElement
  const isTyping = target.tagName === 'INPUT' || 
                   target.tagName === 'TEXTAREA' || 
                   target.isContentEditable
  
  if (keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch && !isTyping) {
    event.preventDefault()
    if (!isPinned.value) {
      isVisible.value = !isVisible.value
    }
  }
}

// Auto-hide when clicking outside if not pinned
const handleClickOutside = (event: MouseEvent) => {
  // Close export menu if open
  if (showExportMenu.value) {
    const target = event.target as HTMLElement
    if (!target.closest('.export-dropdown')) {
      showExportMenu.value = false
    }
  }
  
  // Close debugger if not pinned
  if (isPinned.value) return
  if (!isVisible.value) return
  
  const target = event.target as HTMLElement
  if (!target.closest('.network-debugger') && !target.closest('.debugger-toggle')) {
    isVisible.value = false
  }
}

// Methods
const toggleVisibility = () => {
  isVisible.value = !isVisible.value
}

const handleClearLogs = () => {
  dashboard.clear()
  resetFilters()
  expandedLogs.value.clear()
}

const toggleDetails = (logId: string) => {
  if (expandedLogs.value.has(logId)) {
    expandedLogs.value.delete(logId)
  } else {
    expandedLogs.value.add(logId)
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Lifecycle
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside)
  console.log('NetworkDebugger mounted, logs:', logs.value.length)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
})

// Expose methods for parent component
defineExpose({
  show: () => { isVisible.value = true },
  hide: () => { isVisible.value = false },
  toggle: toggleVisibility,
  clear: handleClearLogs,
  export: handleExport
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="network-debugger">
      <div class="debugger-container">
        <!-- Header -->
        <div class="debugger-header">
          <div class="header-left">
            <h3>🌐 Network Dashboard</h3>
            <div class="stats-badge">
              {{ filteredLogs.length }} / {{ logs.length }}
            </div>
          </div>
          
          <div class="header-right">
            <button
              v-if="!isPinned"
              class="btn-icon"
              @click="isPinned = true"
              title="Pin"
            >
              📌
            </button>
            <button
              v-else
              class="btn-icon active"
              @click="isPinned = false"
              title="Unpin"
            >
              📌
            </button>
            <button class="btn-icon" @click="handleClearLogs" title="Clear">
              🗑️
            </button>
            
            <!-- Export Dropdown -->
            <div class="export-dropdown">
              <button class="btn-icon" @click="toggleExportMenu" title="Export">
                💾
              </button>
              <div v-if="showExportMenu" class="export-menu">
                <button @click="handleExport('json')">
                  <span class="export-icon">📄</span> Export as JSON
                </button>
                <button @click="handleExport('csv')">
                  <span class="export-icon">📊</span> Export as CSV
                </button>
              </div>
            </div>
            
            <button class="btn-icon" @click="toggleVisibility" title="Close">
              ✕
            </button>
          </div>
        </div>
        
        <!-- Filter Bar -->
        <FilterBar v-model:filters="filters" />
        
        <!-- Tabs -->
        <div class="debugger-tabs">
          <button
            :class="{ active: activeTab === 'logs' }"
            @click="activeTab = 'logs'"
          >
            Logs
          </button>
          <button
            :class="{ active: activeTab === 'stats' }"
            @click="activeTab = 'stats'"
          >
            Statistics
          </button>
        </div>
        
        <!-- Content -->
        <div class="debugger-content">
          <!-- Logs Panel -->
          <div v-if="activeTab === 'logs'" class="logs-panel">
            <div class="debug-info" style="padding: 4px 8px; background: #2a2a2e; font-size: 11px;">
              Total logs: {{ logs.length }} | Filtered: {{ filteredLogs.length }}
              <span v-if="filters.type !== 'all'"> | Type: {{ filters.type }}</span>
              <span v-if="filters.method"> | Method: {{ filters.method }}</span>
              <span v-if="filters.url"> | URL: {{ filters.url }}</span>
            </div>
            <div v-if="filteredLogs.length === 0" class="empty-state">
              No network requests logged
            </div>
            
            <div v-else class="logs-list">
              <LogEntry
                v-for="log in filteredLogs"
                :key="log.id"
                :log="log"
                :expanded="expandedLogs.has(log.id)"
                @toggle-details="toggleDetails"
              />
            </div>
          </div>
          
          <!-- Statistics Panel -->
          <StatsPanel v-else :stats="stats" />
        </div>
        
        <!-- Footer -->
        <div class="debugger-footer">
          <span class="footer-info">
            Total: {{ stats.totalRequests }} | 
            Errors: {{ stats.totalErrors }} | 
            Avg: {{ stats.averageDuration.toFixed(0) }}ms
          </span>
          <span class="footer-info">
            Data: {{ formatBytes(stats.totalDataSent) }} →
            {{ formatBytes(stats.totalDataReceived) }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- Toggle Button -->
    <button
      v-if="!isVisible && !isPinned"
      class="debugger-toggle"
      @click="toggleVisibility"
    >
      📡 {{ logs.length }}
    </button>
  </Teleport>
</template>

<style scoped lang="scss">
// Export Dropdown Styles
.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #252529;
  border: 1px solid #2a2a2e;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  min-width: 160px;
  overflow: hidden;
  
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #e4e4e7;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s ease;
    
    &:hover {
      background: #2a2a2e;
    }
    
    .export-icon {
      font-size: 14px;
      width: 20px;
    }
  }
}
</style>