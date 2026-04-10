<script setup lang="ts">
import '../styles/debugger.scss'

import { computed } from 'vue'
import type { NetworkStats } from '../../core/types'

const props = defineProps<{ stats: NetworkStats }>()

const errorRate = computed(() => {
  if (props.stats.totalRequests === 0) return '0'
  return ((props.stats.totalErrors / props.stats.totalRequests) * 100).toFixed(1)
})

const getPercentage = (count: number, total: number): number => {
  if (total === 0) return 0
  return parseFloat(((count / total) * 100).toFixed(1))
}

const getMethodClass = (method: string): string => {
  const m = method.toUpperCase()
  if (m === 'GET')    return 'get'
  if (m === 'POST')   return 'post'
  if (m === 'PUT')    return 'put'
  if (m === 'DELETE') return 'delete'
  if (m === 'PATCH')  return 'patch'
  if (m.includes('WS') || m === 'WEBSOCKET') return 'websocket'
  return 'default'
}

const getStatusGroupClass = (status: string): string => {
  if (status.startsWith('2')) return 'success'
  if (status.startsWith('4')) return 'client-error'
  if (status.startsWith('5')) return 'server-error'
  return 'default'
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const truncateUrl = (url: string, maxLength: number): string =>
  url.length <= maxLength ? url : url.substring(0, maxLength) + '…'
</script>

<template>
  <div class="stats-panel">

    <!-- Overview cards (3 × 2) -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalRequests }}</div>
        <div class="stat-label">Total Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" :style="stats.totalErrors ? 'color:#f85149' : ''">{{ stats.totalErrors }}</div>
        <div class="stat-label">Errors</div>
        <div class="stat-sub">{{ errorRate }}% error rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.averageDuration.toFixed(0) }}<small style="font-size:12px;font-weight:500;color:#8b949e">ms</small></div>
        <div class="stat-label">Avg Duration</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatBytes(stats.totalDataSent) }}</div>
        <div class="stat-label">Data Sent</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatBytes(stats.totalDataReceived) }}</div>
        <div class="stat-label">Data Received</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.sseEventCount }}</div>
        <div class="stat-label">SSE Events</div>
      </div>
    </div>

    <!-- Method distribution -->
    <div class="stats-section">
      <h4>By Method</h4>
      <div class="dist-list">
        <div v-for="(count, method) in stats.requestsByMethod" :key="method" class="dist-item">
          <span :class="['dist-badge', getMethodClass(String(method))]">{{ method }}</span>
          <span class="dist-count">{{ count }}</span>
          <div class="dist-bar-track">
            <div class="dist-bar-fill" :style="{ width: getPercentage(count, stats.totalRequests) + '%' }" />
          </div>
          <span class="dist-pct">{{ getPercentage(count, stats.totalRequests) }}%</span>
        </div>
        <div v-if="!Object.keys(stats.requestsByMethod).length" class="empty-message">No data yet</div>
      </div>
    </div>

    <!-- Status distribution -->
    <div class="stats-section">
      <h4>By Status</h4>
      <div class="dist-list">
        <div v-for="(count, status) in stats.requestsByStatus" :key="status" class="dist-item">
          <span :class="['dist-badge', getStatusGroupClass(String(status))]">{{ status }}</span>
          <span class="dist-count">{{ count }}</span>
          <div class="dist-bar-track">
            <div
              :class="['dist-bar-fill', getStatusGroupClass(String(status))]"
              :style="{ width: getPercentage(count, stats.totalRequests) + '%' }"
            />
          </div>
          <span class="dist-pct">{{ getPercentage(count, stats.totalRequests) }}%</span>
        </div>
        <div v-if="!Object.keys(stats.requestsByStatus).length" class="empty-message">No data yet</div>
      </div>
    </div>

    <!-- Slowest requests -->
    <div v-if="stats.slowestRequests.length" class="stats-section">
      <h4>Slowest Requests</h4>
      <div class="perf-list">
        <div v-for="req in stats.slowestRequests.slice(0, 5)" :key="req.id" class="perf-item">
          <span :class="['dist-badge', getMethodClass(req.method)]">{{ req.method }}</span>
          <span class="perf-url" :title="req.url">{{ truncateUrl(req.url, 60) }}</span>
          <span class="perf-value">{{ req.duration }}ms</span>
        </div>
      </div>
    </div>

    <!-- Largest requests -->
    <div v-if="stats.largestRequests.length" class="stats-section">
      <h4>Largest Responses</h4>
      <div class="perf-list">
        <div v-for="req in stats.largestRequests.slice(0, 5)" :key="req.id" class="perf-item">
          <span :class="['dist-badge', getMethodClass(req.method)]">{{ req.method }}</span>
          <span class="perf-url" :title="req.url">{{ truncateUrl(req.url, 60) }}</span>
          <span class="perf-value">
            {{ formatBytes((req.request.bodySize || 0) + (req.response.bodySize || 0)) }}
          </span>
        </div>
      </div>
    </div>

  </div>
</template>
