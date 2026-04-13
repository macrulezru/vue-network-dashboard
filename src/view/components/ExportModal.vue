<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{ logs: UnifiedLogEntry[] }>()

const emit = defineEmits<{
  close: []
  export: [{ format: 'json' | 'csv' | 'har'; logs: UnifiedLogEntry[] }]
}>()

// ── Format ─────────────────────────────────────────────────────────────────────
type ExportFormat = 'json' | 'csv' | 'har'
const format = ref<ExportFormat>('json')

// ── Protocols ──────────────────────────────────────────────────────────────────
const allProtocols = computed(() => {
  const s = new Set<string>()
  for (const log of props.logs) s.add(log.type)
  return [...s].sort()
})

const selectedProtocols = ref<Set<string>>(new Set())

const allProtocolsSelected = computed(() => selectedProtocols.value.size === allProtocols.value.length)

const toggleProtocol = (p: string) => {
  const next = new Set(selectedProtocols.value)
  if (next.has(p)) next.delete(p)
  else next.add(p)
  selectedProtocols.value = next
}

const toggleAllProtocols = () => {
  selectedProtocols.value = allProtocolsSelected.value ? new Set() : new Set(allProtocols.value)
}

const protocolLabel = (p: string): string =>
  p === 'http' ? 'HTTP' : p === 'websocket' ? 'WebSocket' : p === 'sse' ? 'SSE' : p.toUpperCase()

// ── Status codes ───────────────────────────────────────────────────────────────
const allStatuses = computed(() => {
  const s = new Set<string>()
  for (const log of props.logs) {
    if (log.http?.status) s.add(log.http.status.toString())
  }
  return [...s].sort((a, b) => Number(a) - Number(b))
})

const selectedStatuses = ref<Set<string>>(new Set())

onMounted(() => {
  selectedProtocols.value = new Set(allProtocols.value)
  selectedStatuses.value = new Set(allStatuses.value)
  sliderFrom.value = 0
  sliderTo.value = 100
})

const toggleStatus = (code: string) => {
  const next = new Set(selectedStatuses.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  selectedStatuses.value = next
}

const allSelected = computed(() => selectedStatuses.value.size === allStatuses.value.length)

const toggleAll = () => {
  selectedStatuses.value = allSelected.value ? new Set() : new Set(allStatuses.value)
}

const getStatusClass = (code: string): string => {
  const n = Number(code)
  if (n < 300) return 'success'
  if (n < 400) return 'info'
  if (n < 500) return 'client-error'
  return 'server-error'
}

// ── Time range slider ──────────────────────────────────────────────────────────
const sliderFrom = ref(0)
const sliderTo = ref(100)
const trackRef = ref<HTMLElement | null>(null)
let activeThumb: 'from' | 'to' | null = null

const minTime = computed(() =>
  props.logs.length ? Math.min(...props.logs.map(l => l.startTime)) : 0
)
const maxTime = computed(() =>
  props.logs.length ? Math.max(...props.logs.map(l => l.startTime)) : 0
)
const hasTimeRange = computed(() => maxTime.value > minTime.value)

const fromTime = computed(() =>
  minTime.value + (maxTime.value - minTime.value) * sliderFrom.value / 100
)
const toTime = computed(() =>
  minTime.value + (maxTime.value - minTime.value) * sliderTo.value / 100
)

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const startThumbDrag = (thumb: 'from' | 'to', e: MouseEvent) => {
  activeThumb = thumb
  document.addEventListener('mousemove', onThumbDrag)
  document.addEventListener('mouseup', stopThumbDrag)
  e.preventDefault()
  e.stopPropagation()
}

const onThumbDrag = (e: MouseEvent) => {
  if (!trackRef.value || !activeThumb) return
  const rect = trackRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))
  if (activeThumb === 'from') {
    sliderFrom.value = Math.min(pct, sliderTo.value - 2)
  } else {
    sliderTo.value = Math.max(pct, sliderFrom.value + 2)
  }
}

const stopThumbDrag = () => {
  activeThumb = null
  document.removeEventListener('mousemove', onThumbDrag)
  document.removeEventListener('mouseup', stopThumbDrag)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onThumbDrag)
  document.removeEventListener('mouseup', stopThumbDrag)
})

// ── Result count ───────────────────────────────────────────────────────────────
const exportableLogs = computed(() => {
  let result = [...props.logs]

  if (allProtocols.value.length > 0 && selectedProtocols.value.size < allProtocols.value.length) {
    result = result.filter(log => selectedProtocols.value.has(log.type))
  }

  if (allStatuses.value.length > 0 && selectedStatuses.value.size < allStatuses.value.length) {
    result = result.filter(log => {
      if (!log.http?.status) return true
      return selectedStatuses.value.has(log.http.status.toString())
    })
  }

  if (hasTimeRange.value && (sliderFrom.value > 0 || sliderTo.value < 100)) {
    result = result.filter(log => log.startTime >= fromTime.value && log.startTime <= toTime.value)
  }

  return result
})

const handleExport = () => {
  emit('export', { format: format.value, logs: exportableLogs.value })
}
</script>

<template>
  <div class="export-modal-overlay" @click.stop.self="emit('close')">
    <div class="export-modal">

      <!-- Header -->
      <div class="export-modal-header">
        <span class="export-modal-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export logs
        </span>
        <button class="export-modal-close" @click="emit('close')">&times;</button>
      </div>

      <div class="export-modal-body">

        <!-- Format -->
        <div class="export-section">
          <div class="export-section-label">Format</div>
          <div class="export-format-tabs">
            <button :class="{ active: format === 'json' }" @click="format = 'json'">JSON</button>
            <button :class="{ active: format === 'csv' }"  @click="format = 'csv'">CSV</button>
            <button :class="{ active: format === 'har' }"  @click="format = 'har'">HAR</button>
          </div>
        </div>

        <!-- Protocols -->
        <div v-if="allProtocols.length > 1" class="export-section">
          <div class="export-section-label">
            Protocols
            <button class="export-toggle-all" @click="toggleAllProtocols">
              {{ allProtocolsSelected ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <div class="export-protocol-list">
            <label
              v-for="p in allProtocols"
              :key="p"
              class="export-protocol-item"
            >
              <input
                type="checkbox"
                :checked="selectedProtocols.has(p)"
                @change="toggleProtocol(p)"
              />
              <span :class="['export-protocol-badge', p]">{{ protocolLabel(p) }}</span>
            </label>
          </div>
        </div>

        <!-- Status codes -->
        <div v-if="allStatuses.length > 0" class="export-section">
          <div class="export-section-label">
            Status codes
            <button class="export-toggle-all" @click="toggleAll">
              {{ allSelected ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <div class="export-status-list">
            <label
              v-for="code in allStatuses"
              :key="code"
              class="export-status-item"
            >
              <input
                type="checkbox"
                :checked="selectedStatuses.has(code)"
                @change="toggleStatus(code)"
              />
              <span :class="['export-status-badge', getStatusClass(code)]">{{ code }}</span>
            </label>
          </div>
        </div>

        <!-- Time range -->
        <div v-if="hasTimeRange" class="export-section">
          <div class="export-section-label">Time range</div>
          <div class="export-slider">
            <div ref="trackRef" class="export-slider-track">
              <div
                class="export-slider-fill"
                :style="{ left: `${sliderFrom}%`, width: `${sliderTo - sliderFrom}%` }"
              />
              <div
                class="export-slider-thumb"
                :style="{ left: `${sliderFrom}%` }"
                @mousedown="startThumbDrag('from', $event)"
              />
              <div
                class="export-slider-thumb"
                :style="{ left: `${sliderTo}%` }"
                @mousedown="startThumbDrag('to', $event)"
              />
            </div>
            <div class="export-slider-labels">
              <span>{{ formatTime(fromTime) }}</span>
              <span>{{ formatTime(toTime) }}</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="export-modal-footer">
        <span class="export-count">{{ exportableLogs.length }} / {{ logs.length }} logs</span>
        <button
          class="export-btn"
          :disabled="exportableLogs.length === 0"
          @click="handleExport"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>

    </div>
  </div>
</template>
