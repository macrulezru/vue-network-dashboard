<script setup lang="ts">
import './styles/demo.scss';

import { ref, computed, onUnmounted } from 'vue'
import { useNetworkDashboard, NetworkDebugger } from '../src'
import RequestButtons from './components/RequestButtons.vue'

// Get logger instance
const dashboard = useNetworkDashboard()

// WebSocket state
const wsConnected = ref(false)
const wsConnecting = ref(false)
let ws: WebSocket | null = null
const wsMessage = ref('')
const wsMessages = ref<Array<{ id: number; data: string; direction: 'incoming' | 'outgoing'; timestamp: number }>>([])
let wsMessageId = 0

// SSE state
const sseConnected = ref(false)
const sseConnecting = ref(false)
let eventSource: EventSource | null = null
const sseEvents = ref<Array<{ id: number; type: string; data: any; timestamp: number }>>([])
let sseEventId = 0

// Statistics
const stats = computed(() => dashboard.getStats())

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString()
}

const formatJSON = (data: any): string => {
  if (typeof data === 'object') {
    return JSON.stringify(data).slice(0, 100) + (JSON.stringify(data).length > 100 ? '...' : '')
  }
  return String(data)
}

const clearStats = () => {
  dashboard.clear()
}

// WebSocket handlers
const toggleWebSocket = () => {
  if (wsConnected.value) {
    ws?.close()
  } else {
    connectWebSocket()
  }
}

const connectWebSocket = () => {
  wsConnecting.value = true
  ws = new WebSocket('wss://echo.websocket.org')
  
  ws.onopen = () => {
    wsConnected.value = true
    wsConnecting.value = false
    wsMessages.value.push({
      id: wsMessageId++,
      data: 'Connected to WebSocket server',
      direction: 'incoming',
      timestamp: Date.now()
    })
  }
  
  ws.onmessage = (event) => {
    wsMessages.value.push({
      id: wsMessageId++,
      data: event.data,
      direction: 'incoming',
      timestamp: Date.now()
    })
  }
  
  ws.onerror = () => {
    wsMessages.value.push({
      id: wsMessageId++,
      data: 'WebSocket error',
      direction: 'incoming',
      timestamp: Date.now()
    })
  }
  
  ws.onclose = () => {
    wsConnected.value = false
    wsMessages.value.push({
      id: wsMessageId++,
      data: 'Disconnected from WebSocket server',
      direction: 'incoming',
      timestamp: Date.now()
    })
    ws = null
  }
}

const sendWsMessage = () => {
  if (ws && wsConnected.value && wsMessage.value.trim()) {
    const message = wsMessage.value.trim()
    ws.send(message)
    wsMessages.value.push({
      id: wsMessageId++,
      data: message,
      direction: 'outgoing',
      timestamp: Date.now()
    })
    wsMessage.value = ''
  }
}

// SSE handlers
const toggleSSE = () => {
  if (sseConnected.value) {
    eventSource?.close()
    sseConnected.value = false
    eventSource = null
  } else {
    connectSSE()
  }
}

const connectSSE = () => {
  sseConnecting.value = true
  
  // Use a public SSE test server
  eventSource = new EventSource('https://sse.dev/test')
  
  eventSource.onopen = () => {
    sseConnected.value = true
    sseConnecting.value = false
    sseEvents.value.push({
      id: sseEventId++,
      type: 'open',
      data: 'Connection established',
      timestamp: Date.now()
    })
  }
  
  eventSource.onmessage = (event) => {
    let data = event.data
    try {
      data = JSON.parse(data)
    } catch {
      // Keep as string
    }
    sseEvents.value.push({
      id: sseEventId++,
      type: 'message',
      data,
      timestamp: Date.now()
    })
  }
  
  eventSource.onerror = () => {
    sseEvents.value.push({
      id: sseEventId++,
      type: 'error',
      data: 'Connection error',
      timestamp: Date.now()
    })
    if (eventSource?.readyState === EventSource.CLOSED) {
      sseConnected.value = false
      sseConnecting.value = false
    }
  }
}

// Cleanup
onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (eventSource) {
    eventSource.close()
  }
})
</script>

<template>
  <div class="demo-app">
    <header class="demo-header">
      <div class="header-content">
        <h1>Vue Network Dashboard</h1>
        <p class="subtitle">Network traffic monitoring for Vue 3 applications</p>
        <div class="badges">
          <span class="badge">HTTP Interceptor</span>
          <span class="badge">XHR Interceptor</span>
          <span class="badge">WebSocket Interceptor</span>
          <span class="badge">SSE Interceptor</span>
        </div>
      </div>
    </header>

    <main class="demo-main">
      <div class="demo-grid">
        <!-- Left Column - Request Controls -->
        <div class="demo-controls">
          <div class="card">
            <h2>HTTP Requests</h2>
            <RequestButtons />
          </div>

          <div class="card">
            <h2>WebSocket Test</h2>
            <div class="websocket-controls">
              <button 
                :class="{ active: wsConnected }" 
                @click="toggleWebSocket"
                :disabled="wsConnecting"
              >
                {{ wsConnected ? 'Disconnect' : 'Connect' }}
                <span v-if="wsConnecting" class="spinner"></span>
              </button>
              <div v-if="wsConnected" class="ws-messages">
                <input 
                  v-model="wsMessage" 
                  placeholder="Type a message..."
                  @keyup.enter="sendWsMessage"
                />
                <button @click="sendWsMessage">Send</button>
              </div>
              <div v-if="wsMessages.length" class="ws-log">
                <div v-for="msg in wsMessages.slice(-5)" :key="msg.id" class="ws-message">
                  <span class="ws-time">{{ formatTime(msg.timestamp) }}</span>
                  <span :class="['ws-direction', msg.direction]">
                    {{ msg.direction === 'outgoing' ? '→' : '←' }}
                  </span>
                  <span class="ws-data">{{ msg.data }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>Server-Sent Events (SSE) Test</h2>
            <div class="sse-controls">
              <button 
                :class="{ active: sseConnected }" 
                @click="toggleSSE"
                :disabled="sseConnecting"
              >
                {{ sseConnected ? 'Disconnect' : 'Connect to SSE Stream' }}
                <span v-if="sseConnecting" class="spinner"></span>
              </button>
              <div v-if="sseConnected" class="sse-events">
                <div class="sse-log">
                  <div v-for="event in sseEvents.slice(-10)" :key="event.id" class="sse-event">
                    <span class="sse-time">{{ formatTime(event.timestamp) }}</span>
                    <span class="sse-type">{{ event.type }}</span>
                    <span class="sse-data">{{ formatJSON(event.data) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>Statistics</h2>
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-value">{{ stats?.totalRequests ?? 0 }}</span>
                <span class="stat-label">Total Requests</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ stats?.totalErrors ?? 0 }}</span>
                <span class="stat-label">Errors</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ stats?.averageDuration?.toFixed(0) ?? 0 }}ms</span>
                <span class="stat-label">Avg Duration</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ formatBytes(stats?.totalDataSent ?? 0) }}</span>
                <span class="stat-label">Data Sent</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ formatBytes(stats?.totalDataReceived ?? 0) }}</span>
                <span class="stat-label">Data Received</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ stats?.sseEventCount ?? 0 }}</span>
                <span class="stat-label">SSE Events</span>
              </div>
            </div>
            <button class="btn-secondary" @click="clearStats">Clear Stats</button>
          </div>
        </div>

        <!-- Right Column - Instructions -->
        <div class="demo-info">
          <div class="card">
            <h2>How to Use</h2>
            <ul class="instructions">
              <li>Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> to open Network Debugger</li>
              <li>Click any request button to generate network traffic</li>
              <li>All HTTP/HTTPS, WebSocket, and SSE requests are automatically logged</li>
              <li>View request/response details, timing, and sizes</li>
              <li>Export logs as JSON or CSV for analysis</li>
            </ul>
          </div>

          <div class="card">
            <h2>Available Endpoints</h2>
            <div class="endpoints">
              <div class="endpoint">
                <span class="method get">GET</span>
                <code>https://jsonplaceholder.typicode.com/posts</code>
                <span class="desc">Posts (JSON)</span>
              </div>
              <div class="endpoint">
                <span class="method get">GET</span>
                <code>https://jsonplaceholder.typicode.com/users/1</code>
                <span class="desc">Single User</span>
              </div>
              <div class="endpoint">
                <span class="method post">POST</span>
                <code>https://jsonplaceholder.typicode.com/posts</code>
                <span class="desc">Create Post</span>
              </div>
              <div class="endpoint">
                <span class="method put">PUT</span>
                <code>https://jsonplaceholder.typicode.com/posts/1</code>
                <span class="desc">Update Post</span>
              </div>
              <div class="endpoint">
                <span class="method delete">DELETE</span>
                <code>https://jsonplaceholder.typicode.com/posts/1</code>
                <span class="desc">Delete Post</span>
              </div>
              <div class="endpoint">
                <span class="method get">GET</span>
                <code>https://httpbin.org/delay/2</code>
                <span class="desc">Slow Response (2s)</span>
              </div>
              <div class="endpoint">
                <span class="method get">GET</span>
                <code>https://httpbin.org/status/404</code>
                <span class="desc">Error Response</span>
              </div>
              <div class="endpoint">
                <span class="method sse">SSE</span>
                <code>https://sse.dev/test</code>
                <span class="desc">Test SSE Stream</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Network Debugger Component from the package -->
    <NetworkDebugger 
      :default-visible="false"
      :default-pinned="false"
      hotkey="d"
      :hotkey-modifiers="{ ctrl: true, shift: true }"
    />
  </div>
</template>