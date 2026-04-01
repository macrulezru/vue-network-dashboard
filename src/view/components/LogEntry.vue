<script setup lang="ts">
import '../styles/debugger.scss';

import { computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{
  log: UnifiedLogEntry
  expanded?: boolean
}>()

const emit = defineEmits<{
  toggleDetails: [id: string]
}>()

const isExpanded = computed(() => props.expanded)

const totalSize = computed(() => {
  return (props.log.request.bodySize || 0) + (props.log.response.bodySize || 0)
})

const getMethodClass = (): string => {
  const method = props.log.method.toLowerCase()
  if (method.includes('get')) return 'get'
  if (method.includes('post')) return 'post'
  if (method.includes('put')) return 'put'
  if (method.includes('delete')) return 'delete'
  if (method.includes('ws')) return 'websocket'
  if (method.includes('sse')) return 'sse'
  return 'default'
}

const getStatusClass = (): string => {
  if (props.log.type === 'http') {
    const status = props.log.http?.status
    if (!status) return 'pending'
    if (status >= 200 && status < 300) return 'success'
    if (status >= 400 && status < 500) return 'client-error'
    if (status >= 500) return 'server-error'
  }
  if (props.log.error.occurred) return 'error'
  if (props.log.type === 'websocket') return 'info'
  if (props.log.type === 'sse') return 'info'
  return 'info'
}

const getStatusText = (): string => {
  if (props.log.type === 'http') {
    return props.log.http?.status?.toString() || 'pending'
  }
  if (props.log.error.occurred) return 'error'
  if (props.log.type === 'websocket') {
    return props.log.websocket?.eventType || 'connected'
  }
  if (props.log.type === 'sse') {
    return props.log.sse?.eventType || 'connected'
  }
  return 'connected'
}

const getReadyStateText = (state: number | undefined): string => {
  switch (state) {
    case 0: return 'CONNECTING'
    case 1: return 'OPEN'
    case 2: return 'CLOSED'
    default: return 'UNKNOWN'
  }
}

const truncateUrl = (url: string, maxLength: number): string => {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatJSON = (data: any): string => {
  if (data === null || data === undefined) return '—'
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

const copyToClipboard = async (data: any) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  await navigator.clipboard.writeText(text)
}

const toggleExpand = () => {
  emit('toggleDetails', props.log.id)
}
</script>

<template>
  <div :class="['log-entry', log.type, { error: log.error.occurred, expanded: isExpanded }]">
    <div class="log-summary" @click="toggleExpand">
      <span :class="['method', getMethodClass()]">
        {{ log.method }}
      </span>
      <span class="url">{{ truncateUrl(log.url, 60) }}</span>
      <span :class="['status', getStatusClass()]">
        {{ getStatusText() }}
      </span>
      <span class="duration" v-if="log.duration">
        {{ log.duration }}ms
      </span>
      <span class="size" v-if="totalSize">
        {{ formatBytes(totalSize) }}
      </span>
      <span class="time">{{ formatTime(log.startTime) }}</span>
    </div>
    
    <div v-if="isExpanded" class="log-details">
      <!-- Request Section -->
      <div class="details-section">
        <div class="section-header">
          <strong>Request</strong>
          <button class="copy-btn" @click.stop="copyToClipboard(log.request)">
            Copy
          </button>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">URL:</span>
            <span class="value">{{ log.url }}</span>
          </div>
          <div class="info-row">
            <span class="label">Headers:</span>
            <pre class="code">{{ formatJSON(log.requestHeaders) }}</pre>
          </div>
          <div v-if="log.request.body" class="info-row">
            <span class="label">Body:</span>
            <pre class="code">{{ formatJSON(log.request.body) }}</pre>
          </div>
          <div class="info-row">
            <span class="label">Size:</span>
            <span class="value">{{ formatBytes(log.request.bodySize || 0) }}</span>
          </div>
        </div>
      </div>
      
      <!-- Response Section for HTTP -->
      <div v-if="log.type === 'http'" class="details-section">
        <div class="section-header">
          <strong>Response</strong>
          <button class="copy-btn" @click.stop="copyToClipboard(log.response)">
            Copy
          </button>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">Status:</span>
            <span :class="['status-badge', getStatusClass()]">
              {{ log.http?.status }} {{ log.http?.statusText }}
            </span>
          </div>
          <div class="info-row">
            <span class="label">Headers:</span>
            <pre class="code">{{ formatJSON(log.responseHeaders) }}</pre>
          </div>
          <div v-if="log.response.body" class="info-row">
            <span class="label">Body:</span>
            <pre class="code">{{ formatJSON(log.response.body) }}</pre>
          </div>
          <div class="info-row">
            <span class="label">Size:</span>
            <span class="value">{{ formatBytes(log.response.bodySize || 0) }}</span>
          </div>
        </div>
      </div>
      
      <!-- Response Section for WebSocket -->
      <div v-if="log.type === 'websocket'" class="details-section">
        <div class="section-header">
          <strong>WebSocket</strong>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">Event:</span>
            <span class="value">{{ log.websocket?.eventType }}</span>
          </div>
          <div v-if="log.websocket?.direction" class="info-row">
            <span class="label">Direction:</span>
            <span class="value">{{ log.websocket?.direction }}</span>
          </div>
          <div v-if="log.response.body" class="info-row">
            <span class="label">Data:</span>
            <pre class="code">{{ formatJSON(log.response.body) }}</pre>
          </div>
          <div v-if="log.websocket?.code !== null" class="info-row">
            <span class="label">Close Code:</span>
            <span class="value">{{ log.websocket?.code }}</span>
          </div>
        </div>
      </div>
      
      <!-- Response Section for SSE -->
      <div v-if="log.type === 'sse'" class="details-section">
        <div class="section-header">
          <strong>Server-Sent Event</strong>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">Event Type:</span>
            <span class="value">{{ log.sse?.eventType || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Last Event ID:</span>
            <span class="value">{{ log.sse?.lastEventId || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="label">Ready State:</span>
            <span class="value">{{ getReadyStateText(log.sse?.readyState) }}</span>
          </div>
          <div v-if="log.response.body?.data" class="info-row">
            <span class="label">Data:</span>
            <pre class="code">{{ formatJSON(log.response.body.data) }}</pre>
          </div>
        </div>
      </div>
      
      <!-- Error Section -->
      <div v-if="log.error.occurred" class="details-section error-section">
        <div class="section-header">
          <strong>Error</strong>
        </div>
        <div class="section-content">
          <div class="info-row">
            <span class="label">Message:</span>
            <span class="value error">{{ log.error.message }}</span>
          </div>
          <div v-if="log.error.stack" class="info-row">
            <span class="label">Stack:</span>
            <pre class="code error">{{ log.error.stack }}</pre>
          </div>
        </div>
      </div>
      
      <!-- Meta Section -->
      <div class="details-section meta-section">
        <div class="section-content meta-info">
          <span>Started: {{ new Date(log.startTime).toLocaleString() }}</span>
          <span v-if="log.endTime">Ended: {{ new Date(log.endTime).toLocaleString() }}</span>
          <span>Duration: {{ log.duration }}ms</span>
          <span>Client: {{ log.metadata.clientType }}</span>
        </div>
      </div>
    </div>
  </div>
</template>