<script setup lang="ts">
import '../styles/debugger.scss'

import { ref, computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{
  log: UnifiedLogEntry
  expanded?: boolean
  diffSelected?: boolean
  diffMode?: boolean
}>()

const emit = defineEmits<{
  toggleDetails: [id: string]
  toggleDiff: [id: string]
}>()

const detailTab = ref<'request' | 'response' | 'meta'>('request')

const isExpanded = computed(() => props.expanded)

const totalSize = computed(() =>
  (props.log.request.bodySize || 0) + (props.log.response.bodySize || 0)
)

const getMethodClass = (): string => {
  const m = props.log.method.toUpperCase()
  if (m === 'GET')    return 'get'
  if (m === 'POST')   return 'post'
  if (m === 'PUT')    return 'put'
  if (m === 'DELETE') return 'delete'
  if (m === 'PATCH')  return 'patch'
  if (props.log.type === 'websocket') return 'websocket'
  if (props.log.type === 'sse')       return 'sse'
  return 'default'
}

const getStatusClass = (): string => {
  if (props.log.error.occurred) return 'error'
  if (props.log.type === 'http') {
    const s = props.log.http?.status
    if (!s)         return 'pending'
    if (s < 300)    return 'success'
    if (s < 400)    return 'info'
    if (s < 500)    return 'client-error'
    return 'server-error'
  }
  return 'info'
}

const getStatusText = (): string => {
  if (props.log.type === 'http')
    return props.log.http?.status?.toString() || '—'
  if (props.log.error.occurred) return 'error'
  if (props.log.type === 'websocket')
    return props.log.websocket?.eventType?.toUpperCase() || 'WS'
  if (props.log.type === 'sse')
    return props.log.sse?.eventType?.toUpperCase() || 'SSE'
  return '—'
}

const getDurationClass = (): string => {
  if (!props.log.duration) return ''
  if (props.log.duration < 200)  return 'fast'
  if (props.log.duration < 1000) return 'medium'
  return 'slow'
}

const getInlineBadgeClass = (): string => {
  const s = getStatusClass()
  return s === 'success' ? 'success' : s === 'info' ? 'info' : s === 'client-error' ? 'client-error' : 'server-error'
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const formatJSON = (data: unknown): string => {
  if (data === null || data === undefined) return '—'
  if (typeof data === 'string') return data
  try { return JSON.stringify(data, null, 2) } catch { return String(data) }
}

const hasBody = (body: unknown): boolean =>
  body !== null && body !== undefined && body !== ''

const headerEntries = (h: Record<string, string>) => Object.entries(h)

const copyToClipboard = async (data: unknown) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  await navigator.clipboard.writeText(text)
}

const isPending = computed(() => props.log.metadata?.pending === true)
const isMocked  = computed(() => props.log.metadata?.mocked === true)

const toggleExpand = () => {
  if (!isPending.value) emit('toggleDetails', props.log.id)
}
const toggleDiff = (e: MouseEvent) => {
  e.stopPropagation()
  emit('toggleDiff', props.log.id)
}
</script>

<template>
  <div :class="['log-entry', log.type, { 'has-error': log.error.occurred, expanded: isExpanded, 'is-pending': isPending, 'is-mocked': isMocked, 'diff-selected': diffSelected }]">

    <!-- Summary row -->
    <div :class="['log-summary', { 'diff-mode': diffMode }]" @click="toggleExpand">
      <!-- Chevron / pending spinner -->
      <span class="log-chevron">
        <svg v-if="!isPending" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <svg v-else class="pending-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </span>

      <!-- Method -->
      <span :class="['method', getMethodClass()]">{{ log.method }}</span>

      <!-- URL -->
      <span class="log-url" :title="log.url">
        {{ log.url }}
        <span v-if="isMocked" class="mocked-badge">mock</span>
      </span>

      <!-- Status -->
      <span :class="['status', isPending ? 'pending' : getStatusClass()]">
        {{ isPending ? '…' : getStatusText() }}
      </span>

      <!-- Duration -->
      <span v-if="log.duration !== null && !isPending" :class="['duration', getDurationClass()]">
        {{ log.duration }}ms
      </span>
      <span v-else class="duration">{{ isPending ? '' : '—' }}</span>

      <!-- Size -->
      <span class="size">{{ isPending ? '' : formatBytes(totalSize) }}</span>

      <!-- Time -->
      <span class="log-time">{{ formatTime(log.startTime) }}</span>

      <!-- Diff select button — отдельная колонка грида в режиме diff -->
      <button
        v-if="diffMode && !isPending"
        :class="['diff-select-btn', { active: diffSelected }]"
        :title="diffSelected ? 'Remove from diff' : 'Select for diff'"
        @click.stop="toggleDiff"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
        </svg>
      </button>
    </div>

    <!-- Expanded details -->
    <div v-if="isExpanded" class="log-details">

      <!-- Error banner -->
      <div v-if="log.error.occurred" class="error-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="error-content">
          <span class="error-message">{{ log.error.message }}</span>
          <pre v-if="log.error.stack" class="error-stack">{{ log.error.stack }}</pre>
        </div>
      </div>

      <!-- Detail tabs -->
      <div class="details-tabs">
        <button :class="{ active: detailTab === 'request' }"  @click.stop="detailTab = 'request'">Request</button>
        <button :class="{ active: detailTab === 'response' }" @click.stop="detailTab = 'response'">Response</button>
        <button :class="{ active: detailTab === 'meta' }"     @click.stop="detailTab = 'meta'">Meta</button>
      </div>

      <!-- ── REQUEST tab ── -->
      <div v-if="detailTab === 'request'" class="details-pane">

        <!-- Request headers -->
        <div class="details-section">
          <div class="section-header">
            <span>Headers</span>
            <button class="copy-btn" @click.stop="copyToClipboard(log.requestHeaders)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="kv-table">
            <div
              v-for="[k, v] in headerEntries(log.requestHeaders)"
              :key="k"
              class="kv-row"
            >
              <span class="kv-key">{{ k }}</span>
              <span class="kv-val">{{ v }}</span>
            </div>
            <div v-if="!Object.keys(log.requestHeaders).length" class="empty-message">No headers</div>
          </div>
        </div>

        <!-- Request body -->
        <div v-if="hasBody(log.request.body)" class="details-section">
          <div class="section-header">
            <span>Body <small style="font-weight:400;text-transform:none;letter-spacing:0">({{ formatBytes(log.request.bodySize || 0) }})</small></span>
            <button class="copy-btn" @click.stop="copyToClipboard(log.request.body)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
          <pre class="code-block">{{ formatJSON(log.request.body) }}</pre>
        </div>
      </div>

      <!-- ── RESPONSE tab ── -->
      <div v-else-if="detailTab === 'response'" class="details-pane">

        <!-- Status line (HTTP) -->
        <div v-if="log.type === 'http'" class="details-section">
          <div class="section-header"><span>Status</span></div>
          <div>
            <span :class="['inline-badge', getInlineBadgeClass()]">
              {{ log.http?.status }} {{ log.http?.statusText }}
            </span>
          </div>
        </div>

        <!-- WS/SSE info -->
        <div v-if="log.type === 'websocket'" class="details-section">
          <div class="section-header"><span>WebSocket</span></div>
          <div class="kv-table">
            <div class="kv-row"><span class="kv-key">Event</span><span class="kv-val">{{ log.websocket?.eventType }}</span></div>
            <div v-if="log.websocket?.direction" class="kv-row">
              <span class="kv-key">Direction</span>
              <span class="kv-val">{{ log.websocket.direction }}</span>
            </div>
            <div v-if="log.websocket?.code !== null && log.websocket?.code !== undefined" class="kv-row">
              <span class="kv-key">Close code</span>
              <span class="kv-val">{{ log.websocket.code }}</span>
            </div>
            <div v-if="log.websocket?.reason" class="kv-row">
              <span class="kv-key">Reason</span>
              <span class="kv-val">{{ log.websocket.reason }}</span>
            </div>
          </div>
        </div>

        <div v-if="log.type === 'sse'" class="details-section">
          <div class="section-header"><span>Server-Sent Event</span></div>
          <div class="kv-table">
            <div class="kv-row"><span class="kv-key">Event type</span><span class="kv-val">{{ log.sse?.eventType || 'message' }}</span></div>
            <div class="kv-row"><span class="kv-key">Last-Event-ID</span><span class="kv-val">{{ log.sse?.lastEventId || '—' }}</span></div>
            <div class="kv-row"><span class="kv-key">Ready state</span><span class="kv-val">{{ log.sse?.readyState }}</span></div>
          </div>
        </div>

        <!-- Response headers -->
        <div v-if="log.type === 'http'" class="details-section">
          <div class="section-header">
            <span>Headers</span>
            <button class="copy-btn" @click.stop="copyToClipboard(log.responseHeaders)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="kv-table">
            <div
              v-for="[k, v] in headerEntries(log.responseHeaders)"
              :key="k"
              class="kv-row"
            >
              <span class="kv-key">{{ k }}</span>
              <span class="kv-val">{{ v }}</span>
            </div>
            <div v-if="!Object.keys(log.responseHeaders).length" class="empty-message">No headers</div>
          </div>
        </div>

        <!-- Response body -->
        <div v-if="hasBody(log.response.body)" class="details-section">
          <div class="section-header">
            <span>Body <small style="font-weight:400;text-transform:none;letter-spacing:0">({{ formatBytes(log.response.bodySize || 0) }})</small></span>
            <button class="copy-btn" @click.stop="copyToClipboard(log.response.body)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
          <pre class="code-block">{{ formatJSON(log.response.body) }}</pre>
        </div>

        <!-- WS / SSE data -->
        <div v-if="(log.type === 'websocket' || log.type === 'sse') && hasBody(log.response.body)" class="details-section">
          <div class="section-header"><span>Data</span></div>
          <pre class="code-block">{{ formatJSON(log.response.body) }}</pre>
        </div>
      </div>

      <!-- ── META tab ── -->
      <div v-else class="details-pane">
        <div class="details-section">
          <div class="section-header"><span>Timing</span></div>
          <div class="meta-chips">
            <span class="meta-chip"><strong>Started</strong> {{ new Date(log.startTime).toLocaleString() }}</span>
            <span v-if="log.endTime" class="meta-chip"><strong>Ended</strong> {{ new Date(log.endTime).toLocaleString() }}</span>
            <span v-if="log.duration !== null" class="meta-chip"><strong>Duration</strong> {{ log.duration }}ms</span>
          </div>
        </div>
        <div v-if="log.route" class="details-section">
          <div class="section-header"><span>Route</span></div>
          <div class="meta-chips">
            <span class="meta-chip meta-chip-route">{{ log.route }}</span>
          </div>
        </div>
        <div class="details-section">
          <div class="section-header"><span>Transport</span></div>
          <div class="meta-chips">
            <span class="meta-chip"><strong>Client</strong> {{ log.metadata.clientType }}</span>
            <span class="meta-chip"><strong>Type</strong> {{ log.type }}</span>
            <span v-if="log.metadata.redirected" class="meta-chip"><strong>Redirected</strong></span>
            <span v-if="log.metadata.retryCount" class="meta-chip"><strong>Retries</strong> {{ log.metadata.retryCount }}</span>
            <span class="meta-chip" style="font-family:monospace;font-size:10px">{{ log.id }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
