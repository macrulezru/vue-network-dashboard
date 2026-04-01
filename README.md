# Vue Network Dashboard

Universal network monitoring plugin for Vue 3. Intercepts all HTTP (Fetch / XHR), WebSocket, and Server-Sent Events (SSE) traffic, logs them in a unified format, automatically sanitizes sensitive data, and exposes reactive storage with rich statistics.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Vue Plugin Registration](#vue-plugin-registration)
- [Usage](#usage)
  - [Composition API](#composition-api)
  - [Options API](#options-api)
  - [Without Vue (standalone)](#without-vue-standalone)
- [Built-in UI Component](#built-in-ui-component)
- [Configuration Reference](#configuration-reference)
- [Log Entry Structure](#log-entry-structure)
- [Instance API](#instance-api)
- [Advanced Usage](#advanced-usage)
  - [Filtering Logs](#filtering-logs)
  - [Subscribing to New Logs](#subscribing-to-new-logs)
  - [Exporting Logs](#exporting-logs)
  - [Callbacks](#callbacks)
- [Security & Sanitization](#security--sanitization)
- [Statistics](#statistics)
- [Architecture](#architecture)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **Full Coverage** | Intercepts Fetch API, XMLHttpRequest (XHR), WebSocket, and Server-Sent Events |
| **Unified Format** | All network events share one consistent log structure regardless of transport type |
| **Security First** | Auto-redacts sensitive headers, removes sensitive body fields, masks PII |
| **Rich Metrics** | Tracks request/response sizes, duration, TTFB, data transfer volumes, per-method and per-status breakdowns |
| **Vue 3 Native** | Uses Vue `ref` for reactive storage — no Pinia or Vuex required |
| **Zero Configuration** | Works immediately after `app.use()` with sensible defaults |
| **Highly Configurable** | Extensive options for interceptor selection, URL filtering, sanitization, and callbacks |
| **Built-in Debugger UI** | Drop-in `<NetworkDebugger>` component with filters, search, and live stats panel |
| **TypeScript** | Full type definitions included |
| **Tested** | 90%+ test coverage |

---

## How It Works

The plugin replaces global browser APIs at the JavaScript layer before any application code runs. When a network call is made anywhere in your app (including third-party libraries), the plugin captures the event, formats it into a `UnifiedLogEntry`, and stores it reactively.

```
Your App Code
      │
      ▼
 Patched Globals
  ┌────────────────────────────────────┐
  │ window.fetch     (FetchInterceptor)│
  │ XMLHttpRequest   (XHRInterceptor)  │
  │ window.WebSocket (WSInterceptor)   │
  │ window.EventSource (SSEInterceptor)│
  └────────────────────────────────────┘
      │
      ▼
 Formatter (HTTP / WebSocket / SSE)
      │
      ▼
 LogStore  ──►  Vue Reactive Refs  ──►  Your Components
```

**Interception strategies:**

| Transport | Strategy |
|---|---|
| **Fetch** | Wraps `window.fetch` globally; captures request/response including body, headers, timing |
| **XHR** | Overrides `XMLHttpRequest.prototype.open`, `send`, `setRequestHeader`; intercepts via `onreadystatechange` |
| **WebSocket** | Replaces `window.WebSocket` constructor; wraps all event listeners (`onopen`, `onmessage`, `onclose`, `onerror`) and the `send` method to capture both directions |
| **SSE** | Replaces `window.EventSource` constructor; wraps event listeners to capture `open`, `message`, `error`, and named custom events |

The original native implementations are preserved internally and called through normally, so interception is completely transparent to the rest of the application.

---

## Installation

```bash
npm install vue-network-dashboard
```

---

## Quick Start

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboard from 'vue-network-dashboard'

const app = createApp(App)

app.use(NetworkDashboard, {
  devOnly: true,       // only active in development builds
  maxLogs: 500,
})

app.mount('#app')
```

That's it. All Fetch, XHR, WebSocket, and SSE calls are now captured.

---

## Vue Plugin Registration

Pass an options object as the second argument to `app.use()`:

```typescript
app.use(NetworkDashboard, {
  enabled: true,
  maxLogs: 1000,
  devOnly: false,
  persistToStorage: false,

  interceptors: {
    fetch: true,
    xhr: true,
    websocket: true,
    sse: true,
  },

  filters: {
    excludeUrlPattern: /\/(health|metrics|favicon)/,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },

  sanitization: {
    sensitiveHeaders: ['authorization', 'x-api-key'],
    sensitiveFields: ['password', 'token', 'secret'],
    maskFields: ['email', 'phone'],
  },

  callbacks: {
    onLog: (entry) => console.log('[net]', entry.url),
    onError: (err) => console.error('[net error]', err),
  },
})
```

---

## Usage

### Composition API

```vue
<script setup lang="ts">
import { useNetworkDashboard } from 'vue-network-dashboard'

const {
  logs,               // Ref<UnifiedLogEntry[]> — reactive log array
  totalRequests,      // Ref<number>
  totalErrors,        // Ref<number>
  averageDuration,    // Ref<number> — milliseconds
  totalDataSent,      // Ref<number> — bytes
  totalDataReceived,  // Ref<number> — bytes

  clear,              // () => void
  enable,             // () => void
  disable,            // () => void
  isEnabled,          // () => boolean

  getStats,           // () => NetworkStats
  getStatsSummary,    // () => string (human-readable)

  getLogsByType,      // (type: 'http'|'websocket'|'sse') => UnifiedLogEntry[]
  getLogsByUrl,       // (pattern: string | RegExp) => UnifiedLogEntry[]
  getLogsByStatus,    // ([min, max]: [number, number]) => UnifiedLogEntry[]
  getLogsByMethod,    // (method: string) => UnifiedLogEntry[]
  getErrorLogs,       // () => UnifiedLogEntry[]
  queryLogs,          // (filters: QueryFilters) => UnifiedLogEntry[]

  subscribe,          // (cb: (entry) => void) => () => void  (returns unsubscribe)
  exportLogs,         // (format?: 'json' | 'csv') => string
} = useNetworkDashboard()
</script>

<template>
  <div>
    <p>Requests: {{ totalRequests }} | Errors: {{ totalErrors }} | Avg: {{ averageDuration }}ms</p>
    <button @click="clear()">Clear</button>
    <ul>
      <li v-for="log in logs" :key="log.id">
        {{ log.method }} {{ log.url }} — {{ log.http?.status }} ({{ log.duration }}ms)
      </li>
    </ul>
  </div>
</template>
```

### Options API

```vue
<template>
  <div>
    <p>Total Requests: {{ $NetworkDashboard.totalRequests }}</p>
    <p>Errors: {{ $NetworkDashboard.totalErrors }}</p>
    <button @click="$NetworkDashboard.clear()">Clear Logs</button>
  </div>
</template>

<script>
export default {
  mounted() {
    // Print a formatted stats summary to the console
    console.log(this.$NetworkDashboard.getStatsSummary())

    // Subscribe to live log events
    this._unsubscribe = this.$NetworkDashboard.subscribe((entry) => {
      if (entry.error.occurred) {
        console.warn('Request failed:', entry.url)
      }
    })
  },
  beforeUnmount() {
    this._unsubscribe?.()
  }
}
</script>
```

### Without Vue (standalone)

You can use the core logger independently of Vue, for example in a Node.js-like testing environment or a non-Vue web app:

```typescript
import { createNetworkDashboard } from 'vue-network-dashboard'

const logger = createNetworkDashboard({
  maxLogs: 200,
  interceptors: { fetch: true, xhr: false, websocket: false, sse: false },
})

logger.enable()

// later...
const stats = logger.getStats()
console.log(stats.totalRequests)

logger.disable()
```

---

## Built-in UI Component

The plugin ships a ready-made debugger panel. Add it once to your root layout and it appears as a floating overlay:

```vue
<!-- App.vue -->
<script setup>
import { NetworkDebugger } from 'vue-network-dashboard'
</script>

<template>
  <RouterView />

  <!-- Only renders in development; toggle with Alt+Shift+D by default -->
  <NetworkDebugger />
</template>
```

The panel includes:

- **Filter bar** — filter by log type (HTTP / WebSocket / SSE), HTTP method, URL substring, status code range, minimum duration, and errors-only toggle
- **Log list** — scrollable list of all captured entries with colour-coded status codes and request/response body preview
- **Stats panel** — live counters for total requests, errors, average response time, and total data transferred
- **Keyboard shortcut** — default hotkey `Alt + Shift + D` to show/hide the panel (configurable)

---

## Configuration Reference

### Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master on/off switch |
| `maxLogs` | `number` | `1000` | Maximum entries kept in memory. Oldest are evicted when the limit is reached |
| `devOnly` | `boolean` | `false` | When `true`, the plugin is a no-op in production (`import.meta.env.PROD`) |
| `persistToStorage` | `boolean` | `false` | Persist logs to `localStorage` and restore them on page reload |

### `interceptors`

| Option | Type | Default | Description |
|---|---|---|---|
| `interceptors.fetch` | `boolean` | `true` | Intercept `window.fetch` |
| `interceptors.xhr` | `boolean` | `true` | Intercept `XMLHttpRequest` |
| `interceptors.websocket` | `boolean` | `true` | Intercept `WebSocket` |
| `interceptors.sse` | `boolean` | `true` | Intercept `EventSource` (SSE) |

### `filters`

Pre-filter events before they are stored. Entries that do not match are discarded.

| Option | Type | Description |
|---|---|---|
| `filters.urlPattern` | `RegExp` | Only store entries whose URL matches |
| `filters.excludeUrlPattern` | `RegExp` | Discard entries whose URL matches |
| `filters.methods` | `string[]` | Only store entries with these HTTP methods (e.g. `['GET','POST']`) |
| `filters.statusCodes` | `number[]` | Only store entries with these exact status codes |
| `filters.bodySizeThreshold` | `number` | Only store entries whose body is at least this many bytes |

### `sanitization`

| Option | Type | Default | Description |
|---|---|---|---|
| `sanitization.sensitiveHeaders` | `string[]` | See [Security](#security--sanitization) | Header names to redact entirely (`[REDACTED]`) |
| `sanitization.sensitiveFields` | `string[]` | See [Security](#security--sanitization) | Body field names to remove entirely |
| `sanitization.maskFields` | `string[]` | See [Security](#security--sanitization) | Body field names to partially mask (e.g. `us***@example.com`) |

### `metrics`

| Option | Type | Default | Description |
|---|---|---|---|
| `metrics.calculateTTFB` | `boolean` | `true` | Track Time To First Byte for HTTP requests |
| `metrics.trackRetries` | `boolean` | `true` | Increment `metadata.retryCount` on repeated requests to the same URL |

### `callbacks`

| Option | Type | Description |
|---|---|---|
| `callbacks.onLog` | `(entry: UnifiedLogEntry) => void` | Called after every log entry is stored |
| `callbacks.onError` | `(error: Error) => void` | Called when an internal plugin error occurs |
| `callbacks.onFlush` | `(logs: UnifiedLogEntry[]) => void` | Called after `clear()` with the entries that were discarded |

---

## Log Entry Structure

Every captured event, regardless of transport type, is stored as a `UnifiedLogEntry`:

```typescript
interface UnifiedLogEntry {
  id: string                        // Unique UUID-like identifier
  type: 'http' | 'websocket' | 'sse'

  // --- Timing ---
  startTime: number                 // performance.now() at request start
  endTime: number | null            // performance.now() at completion
  duration: number | null           // endTime - startTime, milliseconds

  // --- Request identity ---
  url: string                       // Full URL string
  method: string                    // HTTP verb, WebSocket event type, or SSE event type

  // --- HTTP-specific (null for WebSocket / SSE) ---
  http: {
    status: number | null           // e.g. 200, 404, 500
    statusText: string | null       // e.g. "OK", "Not Found"
    protocol: string | null         // e.g. "HTTP/1.1", "HTTP/2"
  } | null

  // --- WebSocket-specific (null for HTTP / SSE) ---
  websocket: {
    readyState: number              // 0 CONNECTING | 1 OPEN | 2 CLOSING | 3 CLOSED
    eventType: 'connection' | 'open' | 'message' | 'error' | 'close'
    direction: 'incoming' | 'outgoing' | null
    code: number | null             // Close code (e.g. 1000 = normal, 1001 = going away)
    reason: string | null           // Human-readable close reason
    wasClean: boolean | null        // Whether the connection closed cleanly
  } | null

  // --- SSE-specific (null for HTTP / WebSocket) ---
  sse: {
    readyState: number              // 0 CONNECTING | 1 OPEN | 2 CLOSED
    eventType: string | null        // Named event type, or null for default "message"
    lastEventId: string | null      // Last-Event-ID value from the server
  } | null

  // --- Headers ---
  requestHeaders: Record<string, string>   // Sanitized request headers
  responseHeaders: Record<string, string>  // Sanitized response headers

  // --- Bodies ---
  request: {
    body: any | null                // Parsed body (object, string, FormData, etc.)
    bodyRaw: string | null          // Raw serialized body string
    bodySize: number | null         // Size in bytes
    bodyType: string | null         // MIME type derived from Content-Type header
  }

  response: {
    body: any | null                // Parsed body
    bodyRaw: string | null          // Raw response string
    bodySize: number | null         // Size in bytes
    bodyType: string | null         // MIME type from Content-Type header
  }

  // --- Errors ---
  error: {
    occurred: boolean
    message: string | null
    name: string | null             // e.g. "TypeError", "NetworkError"
    stack: string | null            // Stack trace when available
  }

  // --- Metadata ---
  metadata: {
    clientType: 'fetch' | 'xhr' | 'websocket' | 'eventsource'
    redirected: boolean             // true if the HTTP request was redirected
    retryCount: number              // Number of times this URL was retried
    timestamp: string               // ISO 8601 timestamp at log creation
  }
}
```

---

## Instance API

All methods below are available on the object returned by `useNetworkDashboard()`, on `this.$NetworkDashboard` in the Options API, or on the instance returned by `createNetworkDashboard()`.

### Reactive state (read-only)

| Property | Type | Description |
|---|---|---|
| `logs` | `Ref<UnifiedLogEntry[]>` | All stored log entries |
| `totalRequests` | `Ref<number>` | Total number of entries |
| `totalErrors` | `Ref<number>` | Entries where `error.occurred === true` or `http.status >= 400` |
| `averageDuration` | `Ref<number>` | Mean duration in milliseconds |
| `totalDataSent` | `Ref<number>` | Sum of `request.bodySize` across all entries |
| `totalDataReceived` | `Ref<number>` | Sum of `response.bodySize` across all entries |

### Control methods

```typescript
enable()          // Start capturing
disable()         // Stop capturing (existing logs are preserved)
isEnabled()       // Returns boolean
clear()           // Remove all stored logs (triggers onFlush callback)
```

### Query methods

```typescript
// Filter by transport type
getLogsByType('http' | 'websocket' | 'sse'): UnifiedLogEntry[]

// Filter by URL string or regex
getLogsByUrl('/api/users'): UnifiedLogEntry[]
getLogsByUrl(/^https:\/\/api\./): UnifiedLogEntry[]

// Filter by HTTP status range
getLogsByStatus([400, 599]): UnifiedLogEntry[]  // all 4xx and 5xx

// Filter by HTTP method
getLogsByMethod('POST'): UnifiedLogEntry[]

// Only failed entries
getErrorLogs(): UnifiedLogEntry[]

// Composable query with multiple filters at once
queryLogs({
  type: 'http',
  method: 'GET',
  statusRange: [200, 299],
  urlPattern: /\/api\//,
  minDuration: 500,          // at least 500ms
  errorsOnly: false,
}): UnifiedLogEntry[]
```

### Export

```typescript
exportLogs()           // JSON string (default)
exportLogs('json')     // JSON string
exportLogs('csv')      // CSV string with header row
```

### Statistics

```typescript
getStats(): NetworkStats          // Full statistics object (see Statistics section)
getStatsSummary(): string         // Multi-line human-readable text
```

### Subscription

```typescript
const unsubscribe = subscribe((entry: UnifiedLogEntry) => {
  // called synchronously after each log entry is stored
})

// Call unsubscribe() to stop receiving events
unsubscribe()
```

---

## Advanced Usage

### Filtering Logs

Use `queryLogs` for complex, multi-criteria filtering:

```typescript
const { queryLogs } = useNetworkDashboard()

// Find slow POST requests to the API that succeeded
const slowPosts = queryLogs({
  type: 'http',
  method: 'POST',
  urlPattern: /\/api\//,
  statusRange: [200, 299],
  minDuration: 1000,
})
```

For in-component filtering with debounce and computed results, use the bundled `useLogFilter` composable (used internally by `<NetworkDebugger>`):

```typescript
import { useLogFilter } from 'vue-network-dashboard'

const { filters, filteredLogs, resetFilters } = useLogFilter()

// Two-way bind filters to inputs
filters.value.urlSearch = 'api/users'
filters.value.type = 'http'
filters.value.errorsOnly = true

// filteredLogs is a computed ref that reacts to filters and the live log store
```

### Subscribing to New Logs

```typescript
const { subscribe } = useNetworkDashboard()

// Send errors to an external monitoring service
const stop = subscribe((entry) => {
  if (entry.error.occurred || (entry.http?.status ?? 0) >= 500) {
    myMonitoring.capture(entry)
  }
})

onUnmounted(stop)
```

### Exporting Logs

```typescript
const { exportLogs } = useNetworkDashboard()

function downloadJson() {
  const json = exportLogs('json')
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: 'network-logs.json' }).click()
}

function downloadCsv() {
  const csv = exportLogs('csv')
  const blob = new Blob([csv], { type: 'text/csv' })
  // ...
}
```

### Callbacks

React to logs outside of Vue components — useful for integrating with error tracking (e.g. Sentry) or analytics:

```typescript
app.use(NetworkDashboard, {
  callbacks: {
    onLog(entry) {
      // Track every API call in analytics
      analytics.trackEvent('network_request', {
        url: entry.url,
        method: entry.method,
        status: entry.http?.status,
        duration: entry.duration,
      })
    },

    onError(err) {
      // Report internal plugin errors
      Sentry.captureException(err)
    },

    onFlush(cleared) {
      console.log(`Flushed ${cleared.length} log entries`)
    },
  },
})
```

---

## Security & Sanitization

Sanitization runs automatically before each entry is written to the store. You can extend or replace the default lists via plugin options.

### Header redaction

The following request and response headers are replaced with `[REDACTED]` by default:

`authorization`, `cookie`, `x-api-key`, `api-key`, `x-auth-token`, `bearer`, `token`, `password`, `secret`, `x-secret`, `x-token`

### Body field removal

The following fields are deleted from JSON request/response bodies:

`password`, `token`, `secret`, `apiKey`, `api_key`, `accessToken`, `access_token`, `refreshToken`, `refresh_token`, `authorization`, `creditCard`, `credit_card`, `cvv`, `ssn`, `socialSecurity`

### Field masking (PII)

The following fields are partially masked rather than removed:

`email`, `phone`, `phoneNumber`, `phone_number`, `address`, `firstName`, `first_name`, `lastName`, `last_name`

Examples:
- `user@example.com` → `us***@example.com`
- `1234567890` → `12***890`
- `John` → `Jo***n`

### Customising sanitization

```typescript
app.use(NetworkDashboard, {
  sanitization: {
    // Extend defaults by spreading them if needed, or replace entirely
    sensitiveHeaders: ['authorization', 'x-api-key', 'x-custom-token'],
    sensitiveFields: ['password', 'pin', 'securityQuestion'],
    maskFields: ['email', 'nationalId'],
  },
})
```

---

## Statistics

`getStats()` returns a `NetworkStats` object:

```typescript
interface NetworkStats {
  totalRequests: number                       // All entries
  totalErrors: number                         // error.occurred === true or status >= 400
  averageDuration: number                     // Mean response time in ms
  totalDataSent: number                       // Total request body bytes
  totalDataReceived: number                   // Total response body bytes

  requestsByMethod: Record<string, number>    // e.g. { GET: 42, POST: 17 }
  requestsByStatus: Record<string, number>    // e.g. { '2xx': 55, '4xx': 3, '5xx': 1 }

  slowestRequests: UnifiedLogEntry[]          // Top 10 by duration (descending)
  largestRequests: UnifiedLogEntry[]          // Top 10 by response body size (descending)
}
```

`getStatsSummary()` returns the same data as a formatted multi-line string, useful for logging to the console.

---

## Architecture

```
vue-network-dashboard/
├── src/
│   ├── core/
│   │   ├── NetworkDashboard.ts      # Orchestrator — initialises interceptors, manages lifecycle
│   │   ├── formatters.ts            # HTTPFormatter, WebSocketFormatter, SSEFormatter
│   │   └── types.ts                 # UnifiedLogEntry, NetworkDashboardOptions, NetworkStats
│   ├── interceptors/
│   │   ├── fetchInterceptor.ts      # Patches window.fetch
│   │   ├── xhrInterceptor.ts        # Patches XMLHttpRequest prototype
│   │   ├── websocketInterceptor.ts  # Replaces window.WebSocket
│   │   └── sseInterceptor.ts        # Replaces window.EventSource
│   ├── store/
│   │   └── logStore.ts              # Vue reactive log storage (ref, computed)
│   ├── plugins/
│   │   └── vuePlugin.ts             # Vue 3 plugin + useNetworkDashboard composable
│   ├── utils/
│   │   ├── sanitizer.ts             # Header redaction, field removal, PII masking
│   │   ├── helpers.ts               # generateId, formatBytes, getContentType
│   │   └── sizeCalculator.ts        # calculateSize, getDataType, safeStringify
│   └── view/
│       ├── components/
│       │   ├── NetworkDebugger.vue  # Main overlay panel
│       │   ├── LogEntry.vue         # Single log item with expand/collapse
│       │   ├── FilterBar.vue        # Filter controls
│       │   └── StatsPanel.vue       # Live statistics display
│       └── composables/
│           ├── useLogFilter.ts      # Reactive filter state + computed filtered logs
│           └── useHotkey.ts         # Keyboard shortcut binding helper
└── demo/                            # Demo app (Vite + Vue 3)
```

The plugin has **no runtime dependencies** besides Vue 3. It relies only on standard browser APIs (`window.fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`).

---

## License

MIT
