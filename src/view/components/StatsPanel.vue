<script setup lang="ts">
import '../styles/debugger.scss';

import { computed } from 'vue'
import type { NetworkStats } from '../../core/types'

const props = defineProps<{
  stats: NetworkStats
}>()

const errorRate = computed(() => {
  if (props.stats.totalRequests === 0) return 0
  return ((props.stats.totalErrors / props.stats.totalRequests) * 100).toFixed(1)
})

const getPercentage = (count: number, total: number): number => {
  if (total === 0) return 0
  return parseFloat(((count / total) * 100).toFixed(1))
}

const getMethodClass = (method: string): string => {
  const lowerMethod = method.toLowerCase()
  if (lowerMethod.includes('get')) return 'get'
  if (lowerMethod.includes('post')) return 'post'
  if (lowerMethod.includes('put')) return 'put'
  if (lowerMethod.includes('delete')) return 'delete'
  if (lowerMethod.includes('ws')) return 'websocket'
  if (lowerMethod.includes('sse')) return 'sse'
  return 'default'
}

const getStatusGroupClass = (status: string): string => {
  if (status.startsWith('2')) return 'success'
  if (status.startsWith('4')) return 'client-error'
  if (status.startsWith('5')) return 'server-error'
  return 'info'
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const truncateUrl = (url: string, maxLength: number): string => {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}
</script>

<template>
  <div class="stats-panel">
    <!-- Overview Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalRequests }}</div>
        <div class="stat-label">Total Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalErrors }}</div>
        <div class="stat-label">Errors</div>
        <div class="stat-sub">{{ errorRate }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.averageDuration.toFixed(0) }}ms</div>
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
    
    <!-- Methods Distribution -->
    <div class="stats-section">
      <h4>Requests by Method</h4>
      <div class="method-list">
        <div v-for="(count, method) in stats.requestsByMethod" :key="method" class="method-item">
          <span :class="['method-badge', getMethodClass(method)]">{{ method }}</span>
          <span class="method-count">{{ count }}</span>
          <div class="method-bar">
            <div
              class="method-bar-fill"
              :style="{ width: getPercentage(count, stats.totalRequests) + '%' }"
            ></div>
          </div>
          <span class="method-percent">{{ getPercentage(count, stats.totalRequests) }}%</span>
        </div>
        <div v-if="Object.keys(stats.requestsByMethod).length === 0" class="empty-message">
          No data yet
        </div>
      </div>
    </div>
    
    <!-- Status Distribution -->
    <div class="stats-section">
      <h4>Requests by Status</h4>
      <div class="status-list">
        <div v-for="(count, status) in stats.requestsByStatus" :key="status" class="status-item">
          <span :class="['status-badge', getStatusGroupClass(status)]">{{ status }}</span>
          <span class="status-count">{{ count }}</span>
          <div class="status-bar">
            <div
              class="status-bar-fill"
              :class="getStatusGroupClass(status)"
              :style="{ width: getPercentage(count, stats.totalRequests) + '%' }"
            ></div>
          </div>
          <span class="status-percent">{{ getPercentage(count, stats.totalRequests) }}%</span>
        </div>
        <div v-if="Object.keys(stats.requestsByStatus).length === 0" class="empty-message">
          No data yet
        </div>
      </div>
    </div>
    
    <!-- Slowest Requests -->
    <div class="stats-section" v-if="stats.slowestRequests.length">
      <h4>Slowest Requests</h4>
      <div class="slow-list">
        <div v-for="req in stats.slowestRequests.slice(0, 5)" :key="req.id" class="slow-item">
          <span class="method-badge" :class="getMethodClass(req.method)">{{ req.method }}</span>
          <span class="url">{{ truncateUrl(req.url, 50) }}</span>
          <span class="duration">{{ req.duration }}ms</span>
        </div>
      </div>
    </div>
    
    <!-- Largest Requests -->
    <div class="stats-section" v-if="stats.largestRequests.length">
      <h4>Largest Requests</h4>
      <div class="large-list">
        <div v-for="req in stats.largestRequests.slice(0, 5)" :key="req.id" class="large-item">
          <span class="method-badge" :class="getMethodClass(req.method)">{{ req.method }}</span>
          <span class="url">{{ truncateUrl(req.url, 50) }}</span>
          <span class="size">{{ formatBytes((req.request.bodySize || 0) + (req.response.bodySize || 0)) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-message {
  padding: 16px;
  text-align: center;
  color: #71717a;
  font-size: 12px;
}
</style>