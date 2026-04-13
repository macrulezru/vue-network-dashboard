<script setup lang="ts">
import '../styles/debugger.scss'

import { ref, computed, inject, onMounted, onUnmounted, type CSSProperties } from 'vue'
import { useNetworkDashboard } from '../../plugins/vuePlugin'
import type { NetworkDashboardOptions, UnifiedLogEntry } from '../../core/types'
import LogEntry from './LogEntry.vue'
import FilterBar from './FilterBar.vue'
import StatsPanel from './StatsPanel.vue'
import MockPanel from './MockPanel.vue'
import NetworkTimeline from './NetworkTimeline.vue'
import DiffPanel from './DiffPanel.vue'
import ExportModal from './ExportModal.vue'

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

const pluginUi = inject<NetworkDashboardOptions['ui']>('networkDashboardUi', {})

const props = withDefaults(defineProps<NetworkDebuggerProps>(), {
  defaultVisible: false,
  defaultPinned: false,
  hotkey: 'd',
  hotkeyModifiers: () => ({ ctrl: true, shift: true })
})

const resolvedHotkey = computed(() =>
  props.hotkey !== 'd' ? props.hotkey : (pluginUi?.hotkey ?? 'd')
)
const resolvedModifiers = computed(() => ({
  ctrl: true, shift: true,
  ...pluginUi?.hotkeyModifiers,
  ...props.hotkeyModifiers
}))

const dashboard = useNetworkDashboard()
const logs = dashboard.logs

const mocks = dashboard.mocks

const activeMocksCount = computed(() => 
  mocks.value.filter(m => m.enabled).length
)

// ── Filters ────────────────────────────────────────────────────────────────────
const filters = ref({
  type: 'all' as 'all' | 'http' | 'websocket' | 'sse',
  method: '',
  url: '',
  body: '',
  route: '',
  status: '',
  minDuration: null as number | null,
  hasError: false
})

// ── Regex search helper ────────────────────────────────────────────────────────
const parseRegexFilter = (pattern: string): RegExp | null => {
  try { return new RegExp(pattern, 'i') } catch { return null }
}

const matchText = (text: string, filter: string): boolean => {
  if (filter.startsWith('regex:')) {
    const rx = parseRegexFilter(filter.slice(6))
    return rx ? rx.test(text) : false
  }
  return text.toLowerCase().includes(filter.toLowerCase())
}

const filteredLogs = computed(() => {
  let result = [...logs.value]

  if (filters.value.type !== 'all')
    result = result.filter(log => log.type === filters.value.type)

  if (filters.value.method)
    result = result.filter(log => log.method.toUpperCase() === filters.value.method.toUpperCase())

  if (filters.value.url)
    result = result.filter(log => matchText(log.url, filters.value.url))

  if (filters.value.body) {
    result = result.filter(log => {
      const req = typeof log.request.body === 'string' ? log.request.body : JSON.stringify(log.request.body ?? '')
      const res = typeof log.response.body === 'string' ? log.response.body : JSON.stringify(log.response.body ?? '')
      return matchText(req, filters.value.body) || matchText(res, filters.value.body)
    })
  }

  if (filters.value.route)
    result = result.filter(log => log.route !== undefined && matchText(log.route, filters.value.route))

  if (filters.value.status)
    result = result.filter(log => {
      if (log.type !== 'http') return false
      return log.http?.status?.toString() === filters.value.status
    })

  if (filters.value.minDuration !== null)
    result = result.filter(log => log.duration !== null && log.duration >= filters.value.minDuration!)

  if (filters.value.hasError)
    result = result.filter(log => log.error.occurred)

  return result
})

// ── Grouping ───────────────────────────────────────────────────────────────────
const grouped = ref(false)

type LogGroup = { key: string; method: string; url: string; count: number; logs: UnifiedLogEntry[]; expanded: boolean }

const groupedLogs = computed((): LogGroup[] => {
  const map = new Map<string, LogGroup>()
  for (const log of filteredLogs.value) {
    const key = `${log.method}::${log.url}`
    if (!map.has(key)) {
      map.set(key, { key, method: log.method, url: log.url, count: 0, logs: [], expanded: false })
    }
    const g = map.get(key)!
    g.count++
    g.logs.push(log)
  }
  return Array.from(map.values())
})

const expandedGroups = ref<Set<string>>(new Set())
const toggleGroup = (key: string) => {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key)
  else expandedGroups.value.add(key)
}

// ── Stats + UI state ───────────────────────────────────────────────────────────
const stats = computed(() => dashboard.getStats())
const isVisible = ref(props.defaultVisible)
const isPinned = ref(props.defaultPinned)
const activeTab = ref<'logs' | 'stats' | 'timeline' | 'mocks'>('logs')
const expandedLogs = ref<Set<string>>(new Set())
const showExportModal = ref(false)

const hasErrors = computed(() => dashboard.totalErrors.value > 0)
const pendingCount = computed(() => logs.value.filter(l => l.metadata?.pending).length)

// ── Diff selection ─────────────────────────────────────────────────────────────
const diffMode = ref(false)
const diffSet = ref<Set<string>>(new Set())

const toggleDiffMode = () => {
  diffMode.value = !diffMode.value
  if (!diffMode.value) diffSet.value.clear()
}

const toggleDiff = (id: string) => {
  if (diffSet.value.has(id)) {
    diffSet.value.delete(id)
  } else {
    if (diffSet.value.size >= 2) {
      // Replace the older selection
      const [first] = diffSet.value
      diffSet.value.delete(first)
    }
    diffSet.value.add(id)
  }
}

const diffLogs = computed((): [UnifiedLogEntry, UnifiedLogEntry] | null => {
  if (diffSet.value.size !== 2) return null
  const [idA, idB] = [...diffSet.value]
  const a = logs.value.find(l => l.id === idA)
  const b = logs.value.find(l => l.id === idB)
  return a && b ? [a, b] : null
})

const closeDiff = () => {
  diffSet.value.clear()
  diffMode.value = false
}

// ── Drag to move ───────────────────────────────────────────────────────────────
const containerRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragPosition = ref<{ x: number; y: number } | null>(null)
let dragOffset = { x: 0, y: 0 }

// ── Resize ─────────────────────────────────────────────────────────────────────
const MIN_W = 750
const MIN_H = 420
const panelSize = ref({ w: 960, h: 620 })
let resizeDir = ''
let resizeStart = { x: 0, y: 0, w: 0, h: 0, panelX: 0, panelY: 0 }

// ── Fullscreen ─────────────────────────────────────────────────────────────────
const isFullscreen = ref(false)
let savedSize = { w: 960, h: 620 }
let savedPos: { x: number; y: number } | null = null

const toggleFullscreen = () => {
  if (isFullscreen.value) {
    panelSize.value = { ...savedSize }
    dragPosition.value = savedPos ? { ...savedPos } : null
    isFullscreen.value = false
    document.body.style.overflow = ''
  } else {
    savedSize = { ...panelSize.value }
    savedPos = dragPosition.value ? { ...dragPosition.value } : null
    isFullscreen.value = true
    document.body.style.overflow = 'hidden'
  }
}

const panelStyle = computed((): CSSProperties => {
  if (isFullscreen.value) {
    return { width: '100dvw', height: '100dvh', left: '0', top: '0', bottom: 'auto', right: 'auto' }
  }
  const style: CSSProperties = {
    width:  `${panelSize.value.w}px`,
    height: `${panelSize.value.h}px`,
  }
  if (dragPosition.value) {
    style.left   = `${dragPosition.value.x}px`
    style.top    = `${dragPosition.value.y}px`
    style.bottom = 'auto'
    style.right  = 'auto'
  }
  return style
})

const ensureDragPosition = () => {
  if (!dragPosition.value) {
    const rect = containerRef.value?.getBoundingClientRect()
    if (rect) dragPosition.value = { x: rect.left, y: rect.top }
  }
}

const onDragMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  dragPosition.value = {
    x: Math.max(0, Math.min(window.innerWidth  - panelSize.value.w, e.clientX - dragOffset.x)),
    y: Math.max(0, Math.min(window.innerHeight - panelSize.value.h, e.clientY - dragOffset.y)),
  }
}

const onDragEnd = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup',   onDragEnd)
}

const startDrag = (e: MouseEvent) => {
  if (isFullscreen.value) return
  if ((e.target as HTMLElement).closest('button, .export-dropdown')) return

  ensureDragPosition()
  if (!dragPosition.value) return

  dragOffset = { x: e.clientX - dragPosition.value.x, y: e.clientY - dragPosition.value.y }
  isDragging.value = true

  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup',   onDragEnd)
  e.preventDefault()
}

const onResizeMove = (e: MouseEvent) => {
  const dx = e.clientX - resizeStart.x
  const dy = e.clientY - resizeStart.y

  let newW = resizeStart.w
  let newH = resizeStart.h
  let newX = resizeStart.panelX
  let newY = resizeStart.panelY

  if (resizeDir.includes('e')) {
    newW = Math.max(MIN_W, Math.min(window.innerWidth - resizeStart.panelX, resizeStart.w + dx))
  }
  if (resizeDir.includes('w')) {
    newW = Math.max(MIN_W, resizeStart.w - dx)
    newX = resizeStart.panelX + (resizeStart.w - newW)
  }
  if (resizeDir.includes('s')) {
    newH = Math.max(MIN_H, Math.min(window.innerHeight - resizeStart.panelY, resizeStart.h + dy))
  }
  if (resizeDir.includes('n')) {
    newH = Math.max(MIN_H, resizeStart.h - dy)
    newY = resizeStart.panelY + (resizeStart.h - newH)
  }

  panelSize.value = { w: newW, h: newH }
  if (resizeDir.includes('w') || resizeDir.includes('n')) {
    dragPosition.value = { x: newX, y: newY }
  }
}

const onResizeEnd = () => {
  resizeDir = ''
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup',   onResizeEnd)
}

const startResize = (dir: string, e: MouseEvent) => {
  ensureDragPosition()
  if (!dragPosition.value) return

  resizeDir = dir
  resizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: panelSize.value.w,
    h: panelSize.value.h,
    panelX: dragPosition.value.x,
    panelY: dragPosition.value.y,
  }

  const cursorMap: Record<string, string> = {
    n: 'ns-resize', s: 'ns-resize',
    e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    nw: 'nwse-resize', se: 'nwse-resize',
  }
  document.body.style.cursor = cursorMap[dir] ?? 'default'
  document.body.style.userSelect = 'none'

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup',   onResizeEnd)
  e.preventDefault()
  e.stopPropagation()
}

// ── Actions ────────────────────────────────────────────────────────────────────
const resetFilters = () => {
  filters.value = { type: 'all', method: '', url: '', body: '', route: '', status: '', minDuration: null, hasError: false }
}

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

const handleExport = ({ format, logs: exportLogs }: { format: 'json' | 'csv' | 'har'; logs: UnifiedLogEntry[] }) => {
  const data = dashboard.export(format, exportLogs)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const mimeTypes = { json: 'application/json', csv: 'text/csv', har: 'application/json' }
  downloadFile(data, `network-logs-${timestamp}.${format}`, mimeTypes[format])
  showExportModal.value = false
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isFullscreen.value) {
    toggleFullscreen()
    return
  }
  const { ctrl, alt, shift, meta } = resolvedModifiers.value
  if (
    (ctrl === undefined || event.ctrlKey === ctrl) &&
    (alt === undefined || event.altKey === alt) &&
    (shift === undefined || event.shiftKey === shift) &&
    (meta === undefined || event.metaKey === meta) &&
    event.key.toLowerCase() === resolvedHotkey.value.toLowerCase()
  ) {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    event.preventDefault()
    if (!isPinned.value) isVisible.value = !isVisible.value
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (isPinned.value || !isVisible.value || isFullscreen.value) return
  if (!(event.target as HTMLElement).closest('.network-debugger') &&
      !(event.target as HTMLElement).closest('.debugger-toggle'))
    isVisible.value = false
}

const handleClearLogs = () => {
  dashboard.clear()
  resetFilters()
  expandedLogs.value.clear()
  diffSet.value.clear()
}

const toggleDetails = (logId: string) => {
  if (expandedLogs.value.has(logId)) expandedLogs.value.delete(logId)
  else expandedLogs.value.add(logId)
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
  if (isFullscreen.value) document.body.style.overflow = ''
})

defineExpose({
  show: () => { isVisible.value = true },
  hide: () => { isVisible.value = false },
  toggle: () => { isVisible.value = !isVisible.value },
  clear: handleClearLogs,
  export: handleExport
})
</script>

<template>
  <Teleport to="body">
    <!-- Panel -->
    <div v-if="isVisible" :class="['network-debugger', { fullscreen: isFullscreen }]" :style="panelStyle">
      <!-- Resize handles (скрыты в fullscreen) -->
      <template v-if="!isFullscreen">
        <div class="resize-handle resize-n"  @mousedown.stop="startResize('n',  $event)" />
        <div class="resize-handle resize-e"  @mousedown.stop="startResize('e',  $event)" />
        <div class="resize-handle resize-s"  @mousedown.stop="startResize('s',  $event)" />
        <div class="resize-handle resize-w"  @mousedown.stop="startResize('w',  $event)" />
        <div class="resize-handle resize-ne" @mousedown.stop="startResize('ne', $event)" />
        <div class="resize-handle resize-se" @mousedown.stop="startResize('se', $event)" />
        <div class="resize-handle resize-sw" @mousedown.stop="startResize('sw', $event)" />
        <div class="resize-handle resize-nw" @mousedown.stop="startResize('nw', $event)" />
      </template>

      <div ref="containerRef" class="debugger-container">

        <!-- Header — drag handle -->
        <div :class="['debugger-header', { 'is-dragging': isDragging }]" @mousedown="startDrag">
          <div class="header-left">
            <div class="header-logo">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              Network
            </div>
            <div class="header-count">
              <span class="count-filtered">{{ filteredLogs.length }}</span>
              <span class="count-divider">/</span>
              <span>{{ logs.length }}</span>
              <span v-if="pendingCount > 0" class="count-pending">{{ pendingCount }} pending</span>
            </div>
          </div>

          <div class="header-right">
            <!-- Grouping toggle -->
            <button
              :class="['btn-icon-label', { active: grouped }]"
              title="Group by endpoint"
              @click="grouped = !grouped"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
                <line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
              Group
            </button>

            <!-- Diff mode toggle -->
            <button
              :class="['btn-icon-label', { active: diffMode }]"
              :title="diffMode ? `Diff mode on — ${diffSet.size}/2 selected (click to exit)` : 'Enable diff mode to compare two requests'"
              @click="toggleDiffMode"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
              </svg>
              <template v-if="diffMode">{{ diffSet.size }}/2</template>
              <template v-else>Diff</template>
            </button>

            <div class="header-divider" />

            <!-- Export -->
            <button class="btn-icon-label" title="Export logs" @click.stop="showExportModal = true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>

            <!-- Clear -->
            <button class="btn-icon danger" title="Clear logs" @click="handleClearLogs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>

            <div class="header-divider" />

            <!-- Pin -->
            <button
              :class="['btn-icon', { active: isPinned }]"
              :title="isPinned ? 'Unpin panel' : 'Pin panel'"
              @click="isPinned = !isPinned"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m12 17 1-9"/>
                <path d="M9 10.5a3 3 0 0 0 6 0"/>
                <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </button>

            <!-- Fullscreen -->
            <button
              :class="['btn-icon', { active: isFullscreen }]"
              :title="isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'"
              @click.stop="toggleFullscreen"
            >
              <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            </button>

            <!-- Close -->
            <button class="btn-icon" title="Close (Ctrl+Shift+D)" @click="isVisible = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <FilterBar v-model:filters="filters" :logs="logs" />

        <!-- Tabs -->
        <div class="debugger-tabs">
          <button :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">
            Logs
          </button>
          <button :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">
            Statistics
          </button>
          <button :class="{ active: activeTab === 'timeline' }" @click="activeTab = 'timeline'">
            Timeline
          </button>
          <button :class="{ active: activeTab === 'mocks' }" @click="activeTab = 'mocks'">
            Mocks
            <span v-if="activeMocksCount > 0" class="tab-badge">
              {{ activeMocksCount }}
            </span>
          </button>
        </div>

        <!-- Content -->
        <div class="debugger-content">

          <!-- ── Logs ── -->
          <div v-if="activeTab === 'logs'" class="logs-panel">

            <!-- Diff panel when 2 selected -->
            <div v-if="diffLogs" class="diff-overlay">
              <div class="diff-overlay-header">
                <span>Diff view</span>
                <button class="btn-icon" @click="closeDiff">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div class="diff-overlay-body">
                <DiffPanel :log-a="diffLogs[0]" :log-b="diffLogs[1]" />
              </div>
            </div>

            <div v-if="filteredLogs.length === 0" class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              <p>No network requests captured</p>
            </div>

            <!-- Grouped view -->
            <div v-else-if="grouped" class="logs-list">
              <div v-for="group in groupedLogs" :key="group.key" class="log-group">
                <div class="log-group-header" @click="toggleGroup(group.key)">
                  <span class="log-chevron">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline :points="expandedGroups.has(group.key) ? '18 15 12 9 6 15' : '9 18 15 12 9 6'"/>
                    </svg>
                  </span>
                  <span :class="['method', group.method.toLowerCase()]">{{ group.method }}</span>
                  <span class="log-url" :title="group.url">{{ group.url }}</span>
                  <span class="group-count">{{ group.count }}</span>
                </div>
                <div v-if="expandedGroups.has(group.key)">
                  <LogEntry
                    v-for="log in group.logs"
                    :key="log.id"
                    :log="log"
                    :expanded="expandedLogs.has(log.id)"
                    :diff-selected="diffSet.has(log.id)"
                    :diff-mode="diffMode"
                    @toggle-details="toggleDetails"
                    @toggle-diff="toggleDiff"
                  />
                </div>
              </div>
            </div>

            <!-- Flat view -->
            <div v-else class="logs-list">
              <LogEntry
                v-for="log in filteredLogs"
                :key="log.id"
                :log="log"
                :expanded="expandedLogs.has(log.id)"
                :diff-selected="diffSet.has(log.id)"
                :diff-mode="diffMode"
                @toggle-details="toggleDetails"
                @toggle-diff="toggleDiff"
              />
            </div>
          </div>

          <!-- ── Stats ── -->
          <StatsPanel v-else-if="activeTab === 'stats'" :stats="stats" />

          <!-- ── Timeline ── -->
          <NetworkTimeline v-else-if="activeTab === 'timeline'" :logs="filteredLogs" />

          <!-- ── Mocks ── -->
          <MockPanel v-else-if="activeTab === 'mocks'" />

        </div>

        <!-- Footer -->
        <div class="debugger-footer">
          <div class="footer-left">
            <span class="footer-stat">
              Requests <span class="footer-val">{{ stats.totalRequests }}</span>
            </span>
            <span class="footer-stat">
              Errors <span :class="['footer-val', { error: stats.totalErrors > 0 }]">{{ stats.totalErrors }}</span>
            </span>
            <span class="footer-stat">
              Avg <span class="footer-val">{{ stats.averageDuration.toFixed(0) }}ms</span>
            </span>
            <span v-if="pendingCount > 0" class="footer-stat pending-indicator">
              <span class="pending-dot" /> {{ pendingCount }} in-flight
            </span>
          </div>
          <div class="footer-right">
            <span class="footer-stat">
              ↑ {{ formatBytes(stats.totalDataSent) }}
            </span>
            <span class="footer-stat">
              ↓ {{ formatBytes(stats.totalDataReceived) }}
            </span>
          </div>
        </div>

        <!-- Export Modal -->
        <ExportModal
          v-if="showExportModal"
          :logs="logs"
          @close="showExportModal = false"
          @export="handleExport"
        />

      </div>
    </div>

    <!-- Toggle FAB -->
    <button
      v-if="!isVisible"
      class="debugger-toggle"
      title="Open Network Dashboard (Ctrl+Shift+D)"
      @click="isVisible = true"
    >
      <span class="toggle-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </span>
      <span class="toggle-count">{{ logs.length }}</span>
      <span v-if="hasErrors" class="toggle-error-dot" />
    </button>
  </Teleport>
</template>