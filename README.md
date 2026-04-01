# vue-network-dashboard# vue-network-logger

Universal network logger for Vue 3 applications. Intercepts all HTTP and WebSocket traffic with unified logging format.

## Features

- **Full Coverage** - Intercepts Fetch API, XMLHttpRequest, and WebSocket
- **Unified Format** - All logs have consistent structure
- **Security** - Automatically sanitizes sensitive data
- **Metrics** - Calculates request/response sizes, duration, TTFB
- **Vue 3 Native** - Uses Vue `ref` for reactive storage, no Pinia/Vuex required
- **Performance** - Minimal overhead, async processing
- **Configurable** - Extensive configuration options
- **TypeScript** - Full type definitions included

## Installation

```bash
npm install vue-network-logger
```

## Quick Start

```ts
import { createApp } from 'vue'
import App from './App.vue'
import NetworkLogger from 'vue-network-logger'

const app = createApp(App)

app.use(NetworkLogger, {
  enabled: true,
  maxLogs: 1000,
  devOnly: true
})

app.mount('#app')
```

## Usage

```ts
<script setup>
import { useNetworkLogger } from 'vue-network-logger'

const { logs, clear, getStats } = useNetworkLogger()

// All network requests are automatically logged!
console.log(logs.value)

// Clear logs
clear()

// Get statistics
const stats = getStats()
console.log(`Total requests: ${stats.totalRequests}`)
</script>
```

## Configuration

```ts
interface NetworkLoggerOptions {
  enabled?: boolean                    // Enable/disable logging
  maxLogs?: number                     // Maximum logs to store
  interceptors?: {
    fetch?: boolean                    // Intercept fetch (default: true)
    xhr?: boolean                      // Intercept XHR (default: true)
    websocket?: boolean                // Intercept WebSocket (default: true)
  }
  filters?: {
    urlPattern?: RegExp                // Only log matching URLs
    excludeUrlPattern?: RegExp         // Exclude URLs
    methods?: string[]                 // Only specific HTTP methods
    statusCodes?: number[]             // Only specific status codes
  }
  sanitization?: {
    sensitiveHeaders?: string[]        // Headers to redact
    sensitiveFields?: string[]         // Body fields to redact
    maskFields?: string[]              // Fields to partially mask
  }
  devOnly?: boolean                    // Only enable in development
}
```

## API Reference

### useNetworkLogger()

Returns reactive logger instance:

- logs: Ref<UnifiedLogEntry[]> - Reactive array of all logs
- clear(): () => void - Clear all logs
- getStats(): () => NetworkStats - Get network statistics
- export(format: 'json' | 'csv'): string - Export logs
- enable(): () => void - Enable logging
- disable(): () => void - Disable logging

## UnifiedLogEntry Structure

```ts
interface UnifiedLogEntry {
  id: string
  type: 'http' | 'websocket'
  startTime: number
  endTime: number | null
  duration: number | null
  url: string
  method: string
  
  http: {
    status: number | null
    statusText: string | null
    protocol: string | null
  } | null
  
  websocket: {
    readyState: number
    eventType: string
    direction: 'incoming' | 'outgoing' | null
  } | null
  
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  
  request: {
    body: any
    bodyRaw: string | null
    bodySize: number | null
    bodyType: string | null
  }
  
  response: {
    body: any
    bodyRaw: string | null
    bodySize: number | null
    bodyType: string | null
  }
  
  error: {
    occurred: boolean
    message: string | null
    name: string | null
    stack: string | null
  }
  
  metadata: {
    clientType: 'fetch' | 'xhr' | 'websocket'
    redirected: boolean
    retryCount: number
    timestamp: string
  }
}
```

## License

MIT