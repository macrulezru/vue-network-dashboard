# Vue Network Dashboard

Universal network dashboard for Vue 3 applications. Intercepts all HTTP and WebSocket traffic with unified logging format, automatic sanitization, and reactive storage.

## Features

- **Full Coverage** - Intercepts Fetch API, XMLHttpRequest (XHR), and WebSocket connections
- **Unified Format** - All logs have consistent structure regardless of the source
- **Security First** - Automatically redacts sensitive headers and fields, masks personal data
- **Rich Metrics** - Calculates request/response sizes, duration, TTFB, and data transfer volumes
- **Vue 3 Native** - Uses Vue `ref` for reactive storage, no Pinia or Vuex required
- **Zero Configuration** - Works out of the box with sensible defaults
- **Highly Configurable** - Extensive options for filtering, sanitization, and callbacks
- **TypeScript** - Full type definitions included
- **Tested** - 90%+ test coverage

## Installation

```bash
npm install vue-network-dashboard
```

## Quick Start

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboard from 'vue-network-dashboard'

const app = createApp(App)

app.use(NetworkDashboard, {
  enabled: true,
  maxLogs: 1000,
  devOnly: true,
  interceptors: {
    fetch: true,
    xhr: true,
    websocket: true
  }
})

app.mount('#app')
```

## Usage

### Composition API

```vue
<script setup>
import { useNetworkDashboard } from 'vue-network-dashboard'

const {
  logs,           // Reactive array of all network logs
  totalRequests,  // Computed: total request count
  totalErrors,    // Computed: error count
  averageDuration,// Computed: average response time
  totalDataSent,  // Computed: total bytes sent
  totalDataReceived, // Computed: total bytes received
  clear,          // Clear all logs
  getStats,       // Get detailed statistics
  export          // Export logs as JSON or CSV
} = useNetworkDashboard()

console.log(`Total requests: ${totalRequests.value}`)
console.log(`Average duration: ${averageDuration.value}ms`)
</script>
```

### Options API

```vue
<template>
  <div>
    <p>Total Requests: {{ $NetworkDashboard.totalRequests }}</p>
    <button @click="$NetworkDashboard.clear()">Clear Logs</button>
  </div>
</template>

<script>
export default {
  mounted() {
    console.log(this.$NetworkDashboard.getStatsSummary())
  }
}
</script>
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable logging |
| `maxLogs` | `number` | `1000` | Maximum number of logs to store |
| `devOnly` | `boolean` | `false` | Enable only in development mode |
| `persistToStorage` | `boolean` | `false` | Save logs to localStorage |
| `interceptors.fetch` | `boolean` | `true` | Intercept Fetch API requests |
| `interceptors.xhr` | `boolean` | `true` | Intercept XMLHttpRequest |
| `interceptors.websocket` | `boolean` | `true` | Intercept WebSocket connections |
| `filters.urlPattern` | `RegExp` | - | Only log URLs matching pattern |
| `filters.excludeUrlPattern` | `RegExp` | - | Exclude URLs matching pattern |
| `filters.methods` | `string[]` | - | Only log specific HTTP methods |
| `filters.statusCodes` | `number[]` | - | Only log specific status codes |
| `sanitization.sensitiveHeaders` | `string[]` | Default list | Headers to redact |
| `sanitization.sensitiveFields` | `string[]` | Default list | Body fields to remove |
| `sanitization.maskFields` | `string[]` | Default list | Fields to partially mask |

## Log Entry Structure

```typescript
interface UnifiedLogEntry {
  id: string                    // Unique identifier
  type: 'http' | 'websocket'    // Request type
  
  // Timing
  startTime: number             // Timestamp when request started
  endTime: number | null        // Timestamp when request completed
  duration: number | null       // Response time in milliseconds
  
  // Request info
  url: string                   // Full URL
  method: string                // HTTP method or WebSocket event
  
  // Headers
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  
  // Body data
  request: {
    body: any                   // Parsed request body
    bodySize: number | null     // Size in bytes
    bodyType: string | null     // MIME type
  }
  
  response: {
    body: any                   // Parsed response body
    bodySize: number | null     // Size in bytes
    bodyType: string | null     // MIME type
  }
  
  // Error info
  error: {
    occurred: boolean
    message: string | null
    name: string | null
  }
  
  // Metadata
  metadata: {
    clientType: 'fetch' | 'xhr' | 'websocket'
    redirected: boolean
    timestamp: string
  }
}
```

## Security Features

- **Header Redaction**: Automatically redacts `authorization`, `cookie`, `x-api-key`, and other sensitive headers
- **Field Removal**: Removes `password`, `token`, `secret`, and other sensitive fields from request/response bodies
- **Data Masking**: Partially masks `email`, `phone`, `address` fields (e.g., `us***@example.com`)

## Statistics

The logger provides comprehensive network statistics:

```typescript
interface NetworkStats {
  totalRequests: number                     // Total number of requests
  totalErrors: number                       // Number of failed requests
  averageDuration: number                   // Average response time (ms)
  totalDataSent: number                     // Total bytes sent
  totalDataReceived: number                 // Total bytes received
  requestsByMethod: Record<string, number>  // Distribution by method
  requestsByStatus: Record<string, number>  // Distribution by status group
  slowestRequests: UnifiedLogEntry[]        // Top 10 slowest requests
  largestRequests: UnifiedLogEntry[]        // Top 10 largest requests
}
```

## License

MIT