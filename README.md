# Vue Network Dashboard

Universal network monitoring plugin for Vue 3. Intercepts all HTTP (Fetch / XHR), WebSocket, and Server-Sent Events (SSE) traffic, logs them in a unified format, automatically sanitizes sensitive data, and exposes reactive storage with rich statistics.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Vue Plugin Registration](#vue-plugin-registration)
- [Nuxt 3 Module](#nuxt-3-module)
- [Usage](#usage)
  - [Composition API](#composition-api)
  - [Options API](#options-api)
  - [Without Vue (standalone)](#without-vue-standalone)
- [Built-in UI Component](#built-in-ui-component)
  - [Component Props](#component-props)
  - [Hotkey Configuration](#hotkey-configuration)
  - [Pending Requests](#pending-requests)
  - [Mock Mode](#mock-mode)
  - [Diff View](#diff-view)
  - [Waterfall Timeline](#waterfall-timeline)
  - [Grouping](#grouping)
- [Configuration Reference](#configuration-reference)
- [Log Entry Structure](#log-entry-structure)
- [Instance API](#instance-api)
- [Advanced Usage](#advanced-usage)
  - [Filtering Logs](#filtering-logs)
  - [Subscribing to New Logs](#subscribing-to-new-logs)
  - [Exporting Logs](#exporting-logs)
  - [Callbacks](#callbacks)
  - [Sentry Integration](#sentry-integration)
  - [OpenTelemetry Integration](#opentelemetry-integration)
  - [Vue DevTools Integration](#vue-devtools-integration)
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
| **Rich Metrics** | Tracks request/response sizes, duration, data transfer volumes, per-method and per-status breakdowns |
| **Vue 3 Native** | Uses Vue `ref` for reactive storage — no Pinia or Vuex required |
| **Zero Configuration** | Works immediately after `app.use()` with sensible defaults |
| **Highly Configurable** | Extensive options for interceptor selection, URL filtering, sanitization, callbacks, and UI behaviour |
| **Pending Requests** | In-flight requests appear as live entries and update in place on completion — just like browser DevTools |
| **Mock Mode** | Define URL/method rules to intercept requests and return custom responses without touching the backend |
| **HAR Export** | Export session as an HTTP Archive file — open directly in Chrome DevTools, Postman, or Charles Proxy |
| **Waterfall Timeline** | Visual bar chart of all requests on a shared time axis |
| **Diff View** | Select any two log entries to see a side-by-side diff of headers and body |
| **Grouping** | Collapse repeated requests to the same endpoint into a single row with a count badge |
| **Body Search** | Filter log entries by content of request or response body |
| **Built-in Debugger UI** | Draggable panel with filters, 3-tab detail view, stats, timeline, mock editor, and export |
| **Nuxt 3 Module** | First-class Nuxt integration with auto-registration and `useNetworkDashboard()` auto-import |
| **Vue DevTools** | Optional inspector tab and timeline layer in Vue DevTools (browser extension + vite-plugin-vue-devtools) |
| **Sentry / OpenTelemetry** | Ready-made adapters for error tracking and distributed tracing |
| **TypeScript** | Full type definitions included |

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
| **XHR** | Overrides `XMLHttpRequest.prototype.open`, `send`, `setRequestHeader`; uses a `WeakMap` to associate per-request data without polluting instances |
| **WebSocket** | Replaces `window.WebSocket` constructor; wraps all event listeners and the `send` method to capture both directions |
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
  devOnly: true,  // only active in development builds
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

  // Configure the hotkey for showing/hiding the debugger panel
  ui: {
    hotkey: 'd',
    hotkeyModifiers: { ctrl: true, shift: true }, // Ctrl+Shift+D
  },
})
```

---

## Nuxt 3 Module

Install and add to `modules`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-network-dashboard/nuxt'],
  networkDashboard: {
    devOnly: true,
    maxLogs: 500,
    ui: { hotkey: 'd', hotkeyModifiers: { ctrl: true, shift: true } }
  }
})
```

`<NetworkDebugger>` and `useNetworkDashboard()` are auto-imported — no manual `import` required. The plugin runs client-side only, so SSR is unaffected.

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
  export: exportLogs, // (format?: 'json' | 'csv') => string
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
    <p>Total Requests: {{ $networkDashboard.totalRequests }}</p>
    <p>Errors: {{ $networkDashboard.totalErrors }}</p>
    <button @click="$networkDashboard.clear()">Clear Logs</button>
  </div>
</template>

<script>
export default {
  mounted() {
    console.log(this.$networkDashboard.getStatsSummary())

    this._unsubscribe = this.$networkDashboard.subscribe((entry) => {
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

You can use the core logger independently of Vue, for example in a testing environment or a non-Vue web app:

```typescript
import { createNetworkDashboard } from 'vue-network-dashboard'

const logger = createNetworkDashboard({
  maxLogs: 200,
  interceptors: { fetch: true, xhr: false, websocket: false, sse: false },
})

logger.enable()

const stats = logger.getStats()
console.log(stats.totalRequests)

logger.disable()
```

---

## Built-in UI Component

The plugin ships a production-grade debugger panel. Add it once to your root layout and it appears as a floating overlay:

```vue
<!-- App.vue -->
<script setup>
import { NetworkDebugger } from 'vue-network-dashboard'
</script>

<template>
  <RouterView />
  <NetworkDebugger />
</template>
```

The panel includes:

- **Filter bar** — filter by type (HTTP / WS / SSE), URL substring, HTTP method, status code, minimum duration, and errors-only toggle
- **Log list** — scrollable, colour-coded entries with expandable detail view (Request / Response / Meta tabs)
- **Statistics panel** — request counts, error rate, average duration, data transfer, method distribution, status distribution, slowest and largest requests
- **Export** — download logs as JSON or CSV directly from the panel header
- **Pin** — pin the panel so it stays open when clicking outside
- **Drag to move** — drag the panel by its header to any position on screen
- **Toggle FAB** — compact floating button with request count and error indicator when the panel is hidden
- **Keyboard shortcut** — `Ctrl+Shift+D` by default (configurable)

### Pending Requests

In-flight requests appear immediately as a live row with an animated spinner. When the response arrives the entry updates in place — no duplicate rows, exactly like the browser Network tab.

Pending entries are excluded from HAR export and the waterfall timeline.

### Mock Mode

Create rules in the UI (**Mocks** tab) or programmatically:

```ts
const { addMock, removeMock, getMocks } = useNetworkDashboard()

const rule = addMock({
  name: 'Mock /api/users',
  urlPattern: '/api/users',
  method: 'GET',
  enabled: true,
  response: {
    status: 200,
    body: [{ id: 1, name: 'Alice' }],
    delay: 200   // optional artificial latency in ms
  }
})

// Later
removeMock(rule.id)
```

Mocked responses are logged normally with a **mock** badge and `metadata.mocked = true`, so you can tell at a glance which entries were intercepted. Both Fetch and XHR are supported.

### Diff View

Click the **Group** button in the header to enter diff mode. Every log row gains a diff-select button. Select exactly two entries — the diff panel opens automatically above the log list and shows:

- Changed request and response headers
- Unified line diff of request body
- Unified line diff of response body

### Waterfall Timeline

Switch to the **Timeline** tab to see all completed requests as horizontal bars on a shared time axis. Bars are colour-coded by result (green = 2xx, yellow = 4xx, red = 5xx, purple = WebSocket, teal = SSE). Hover a bar to see the exact duration.

### Grouping

Toggle the **Group** button in the header to collapse all requests to the same URL+method into a single row showing the total count. Expand a group to see individual entries inside it.

### Component Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `defaultVisible` | `boolean` | `false` | Whether the panel is open on mount |
| `defaultPinned` | `boolean` | `false` | Whether the panel is pinned on mount |
| `hotkey` | `string` | `'d'` | Key character for the toggle shortcut |
| `hotkeyModifiers` | `object` | `{ ctrl: true, shift: true }` | Modifier keys: `ctrl`, `alt`, `shift`, `meta` |

Props take effect as component-level defaults. If you configure hotkeys via the plugin's `ui` option (see below), you do not need to set these props.

### Hotkey Configuration

The toggle hotkey can be configured at two levels. **Plugin level** (recommended) — set once at registration, applies automatically to all `<NetworkDebugger>` instances:

```typescript
app.use(NetworkDashboard, {
  ui: {
    hotkey: 'd',
    hotkeyModifiers: { ctrl: true, shift: true }, // Ctrl+Shift+D
  },
})
```

**Component level** — pass props directly to the component (overrides plugin-level config):

```vue
<NetworkDebugger
  hotkey="d"
  :hotkeyModifiers="{ ctrl: true, shift: true }"
/>
```

The panel ignores hotkeys when focus is inside an `<input>`, `<textarea>`, or a `contenteditable` element. When pinned, the hotkey is also disabled to prevent accidental closes.

### Programmatic Control

The component exposes methods via `ref`:

```vue
<script setup>
import { ref } from 'vue'
import { NetworkDebugger } from 'vue-network-dashboard'

const debugger = ref()
</script>

<template>
  <NetworkDebugger ref="debugger" />
  <button @click="debugger.show()">Open</button>
  <button @click="debugger.hide()">Close</button>
  <button @click="debugger.toggle()">Toggle</button>
  <button @click="debugger.clear()">Clear logs</button>
  <button @click="debugger.export('json')">Export JSON</button>
</template>
```

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

| Option | Type | Description |
|---|---|---|
| `sanitization.sensitiveHeaders` | `string[]` | Header names to redact entirely (`[REDACTED]`). Merged with built-in defaults |
| `sanitization.sensitiveFields` | `string[]` | Body field names to remove entirely. Merged with built-in defaults |
| `sanitization.maskFields` | `string[]` | Body field names to partially mask (e.g. `us***@example.com`). Merged with built-in defaults |

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
| `callbacks.onFlush` | `(logs: UnifiedLogEntry[]) => void` | Called after `clear()` with the entries that were removed |

### `ui`

Controls the built-in `<NetworkDebugger>` panel. These values act as defaults and can be overridden by component props.

| Option | Type | Default | Description |
|---|---|---|---|
| `ui.hotkey` | `string` | `'d'` | Key character for the toggle shortcut |
| `ui.hotkeyModifiers.ctrl` | `boolean` | `true` | Require Ctrl key |
| `ui.hotkeyModifiers.alt` | `boolean` | — | Require Alt key |
| `ui.hotkeyModifiers.shift` | `boolean` | `true` | Require Shift key |
| `ui.hotkeyModifiers.meta` | `boolean` | — | Require Meta (⌘ / Win) key |

---

## Log Entry Structure

Every captured event, regardless of transport type, is stored as a `UnifiedLogEntry`:

```typescript
interface UnifiedLogEntry {
  id: string                        // Unique UUID-like identifier
  type: 'http' | 'websocket' | 'sse'

  // Timing
  startTime: number                 // Unix timestamp at request start (ms)
  endTime: number | null            // Unix timestamp at completion
  duration: number | null           // endTime - startTime, milliseconds

  // Request identity
  url: string
  method: string                    // HTTP verb, or WebSocket/SSE event type

  // HTTP-specific (null for WebSocket / SSE)
  http: {
    status: number | null           // e.g. 200, 404, 500
    statusText: string | null       // e.g. "OK", "Not Found"
    protocol: string | null         // e.g. "HTTP/1.1", "HTTP/2"
  } | null

  // WebSocket-specific (null for HTTP / SSE)
  websocket: {
    readyState: number              // 0 CONNECTING | 1 OPEN | 2 CLOSING | 3 CLOSED
    eventType: 'connection' | 'open' | 'message' | 'error' | 'close'
    direction: 'incoming' | 'outgoing' | null
    code: number | null             // Close code (1000 = normal, 1001 = going away, …)
    reason: string | null
    wasClean: boolean | null
  } | null

  // SSE-specific (null for HTTP / WebSocket)
  sse: {
    readyState: number              // 0 CONNECTING | 1 OPEN | 2 CLOSED
    eventType: string | null        // Named event type, or null for default "message"
    lastEventId: string | null
  } | null

  // Headers
  requestHeaders: Record<string, string>   // Sanitized request headers
  responseHeaders: Record<string, string>  // Sanitized response headers

  // Bodies
  request: {
    body: any | null                // Parsed body (object, string, FormData, etc.)
    bodyRaw: string | null          // Raw serialized body string
    bodySize: number | null         // Size in bytes
    bodyType: string | null         // MIME type derived from Content-Type
  }
  response: {
    body: any | null
    bodyRaw: string | null
    bodySize: number | null
    bodyType: string | null
  }

  // Errors
  error: {
    occurred: boolean
    message: string | null
    name: string | null             // e.g. "TypeError", "NetworkError"
    stack: string | null
  }

  // Metadata
  metadata: {
    clientType: 'fetch' | 'xhr' | 'websocket' | 'eventsource'
    redirected: boolean
    retryCount: number
    timestamp: string               // ISO 8601 timestamp at log creation
  }
}
```

---

## Instance API

All methods below are available on the object returned by `useNetworkDashboard()`, on `this.$networkDashboard` in the Options API, or on the instance returned by `createNetworkDashboard()`.

### Reactive state

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
  url: /\/api\//,
  minDuration: 500,
  hasError: false,
}): UnifiedLogEntry[]
```

### Export

```typescript
export()           // JSON string (default)
export('json')     // JSON string
export('csv')      // CSV string with header row
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

unsubscribe()  // stop receiving events
```

---

## Advanced Usage

### Filtering Logs

Use `queryLogs` for complex, multi-criteria filtering:

```typescript
const { queryLogs } = useNetworkDashboard()

const slowPosts = queryLogs({
  type: 'http',
  method: 'POST',
  url: /\/api\//,
  minDuration: 1000,
})
```

For reactive in-component filtering, use the bundled `useLogFilter` composable:

```typescript
import { useLogFilter } from 'vue-network-dashboard'

const { filters, filteredLogs, resetFilters } = useLogFilter()

filters.value.url = 'api/users'
filters.value.type = 'http'
filters.value.hasError = true

// filteredLogs is a computed ref that reacts to both filters and the live log store
```

### Subscribing to New Logs

```typescript
const { subscribe } = useNetworkDashboard()

const stop = subscribe((entry) => {
  if (entry.error.occurred || (entry.http?.status ?? 0) >= 500) {
    myMonitoring.capture(entry)
  }
})

onUnmounted(stop)
```

### Exporting Logs

```typescript
const dashboard = useNetworkDashboard()

function downloadJson() {
  const json = dashboard.export('json')
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: 'network-logs.json' }).click()
}

function downloadCsv() {
  const csv = dashboard.export('csv')
  const blob = new Blob([csv], { type: 'text/csv' })
  // ...
}
```

Logs can also be exported directly from the panel UI via the **Export** button in the header.

### Sentry Integration

```ts
import * as Sentry from '@sentry/vue'
import { createSentryAdapter } from 'vue-network-dashboard'

app.use(NetworkDashboardPlugin, {
  callbacks: createSentryAdapter(Sentry, {
    errorStatusThreshold: 500,   // send Sentry event for 5xx (default)
    includeBodies: false         // omit bodies from breadcrumbs (default)
  })
})
```

Every request becomes a Sentry breadcrumb. HTTP 5xx and network errors are also sent as Sentry events via `captureMessage`.

### OpenTelemetry Integration

```ts
import { trace } from '@opentelemetry/api'
import { createOpenTelemetryAdapter } from 'vue-network-dashboard'

const tracer = trace.getTracer('my-app')

app.use(NetworkDashboardPlugin, {
  callbacks: createOpenTelemetryAdapter(tracer, {
    httpOnly: true,         // skip WebSocket/SSE (default)
    includeBodySize: true   // add body size attributes (default)
  })
})
```

Creates one OTel span per HTTP request with semantic HTTP attributes (`http.request.method`, `http.response.status_code`, `url.full`, etc.) per semconv 1.23.

### Vue DevTools Integration

Adds a **Network** inspector tab and timeline layer to Vue DevTools (browser extension ≥ 6.5 and vite-plugin-vue-devtools ≥ 7.x). Requires `@vue/devtools-api` as a peer dependency.

```ts
import { setupDevtools } from 'vue-network-dashboard'
import { useNetworkDashboard } from 'vue-network-dashboard'

if (import.meta.env.DEV) {
  app.use(NetworkDashboardPlugin)
  const dashboard = useNetworkDashboard()
  setupDevtools(app, dashboard)
}
```

The inspector shows every log entry as a tree node with full request/response state. The timeline layer records a marker for each completed HTTP request.

### Callbacks

React to logs outside of Vue components — useful for integrating with error tracking or analytics:

```typescript
app.use(NetworkDashboard, {
  callbacks: {
    onLog(entry) {
      analytics.trackEvent('network_request', {
        url: entry.url,
        method: entry.method,
        status: entry.http?.status,
        duration: entry.duration,
      })
    },

    onError(err) {
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

Sanitization runs automatically before each entry is written to the store. Custom lists are **merged with** the built-in defaults, so you never lose the baseline protection.

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
    sensitiveHeaders: ['x-custom-token'],       // added on top of defaults
    sensitiveFields: ['pin', 'securityAnswer'], // added on top of defaults
    maskFields: ['nationalId'],                 // added on top of defaults
  },
})
```

---

## Statistics

`getStats()` returns a `NetworkStats` object:

```typescript
interface NetworkStats {
  totalRequests: number
  totalErrors: number
  averageDuration: number                     // Mean response time in ms
  totalDataSent: number                       // Total request body bytes
  totalDataReceived: number                   // Total response body bytes

  requestsByMethod: Record<string, number>    // { GET: 42, POST: 17, … }
  requestsByStatus: Record<string, number>    // { '200': 55, '404': 3, '500': 1, … }

  slowestRequests: UnifiedLogEntry[]          // Top 10 by duration (descending)
  largestRequests: UnifiedLogEntry[]          // Top 10 by total body size (descending)
  sseEventCount: number                       // Total SSE events captured
}
```

`getStatsSummary()` returns the same data as a formatted multi-line string, useful for logging to the console.

---

## Architecture

```
vue-network-dashboard/
├── src/
│   ├── core/
│   │   ├── NetworkDashboard.ts      # Orchestrator — interceptors, mock registry, lifecycle
│   │   ├── formatters.ts            # HTTPFormatter, WebSocketFormatter, SSEFormatter
│   │   └── types.ts                 # UnifiedLogEntry, NetworkDashboardOptions, MockRule, NetworkStats
│   ├── interceptors/
│   │   ├── fetchInterceptor.ts      # Patches window.fetch (pending state + mock support)
│   │   ├── xhrInterceptor.ts        # Patches XMLHttpRequest prototype (WeakMap + mock support)
│   │   ├── websocketInterceptor.ts  # Replaces window.WebSocket
│   │   └── sseInterceptor.ts        # Replaces window.EventSource
│   ├── store/
│   │   └── logStore.ts              # Vue reactive storage — addLog, updateLog, HAR/JSON/CSV export
│   ├── plugins/
│   │   └── vuePlugin.ts             # Vue 3 plugin + useNetworkDashboard composable + mock API
│   ├── adapters/
│   │   ├── sentry.ts                # createSentryAdapter — breadcrumbs + Sentry events
│   │   └── opentelemetry.ts         # createOpenTelemetryAdapter — OTel spans per request
│   ├── utils/
│   │   ├── sanitizer.ts             # Header redaction, field removal, PII masking
│   │   ├── helpers.ts               # generateId, formatBytes, getContentType
│   │   └── sizeCalculator.ts        # calculateSize, getDataType, safeStringify
│   ├── view/
│   │   ├── components/
│   │   │   ├── NetworkDebugger.vue  # Main draggable panel (logs / stats / timeline / mocks tabs)
│   │   │   ├── LogEntry.vue         # Single row — pending state, mocked badge, diff select
│   │   │   ├── FilterBar.vue        # Type tabs, URL, body, method, status, duration filters
│   │   │   ├── StatsPanel.vue       # Live statistics with distribution bars
│   │   │   ├── MockPanel.vue        # Mock rule editor (add / edit / toggle / delete)
│   │   │   ├── NetworkTimeline.vue  # Waterfall bar chart
│   │   │   └── DiffPanel.vue        # LCS-based header and body diff between two log entries
│   │   ├── composables/
│   │   │   ├── useLogFilter.ts      # Reactive filter state (url, body, method, status, …)
│   │   │   └── useHotkey.ts         # Keyboard shortcut binding helper
│   │   └── styles/
│   │       ├── variables.scss       # Design tokens (colours, spacing, typography)
│   │       └── debugger.scss        # All component styles
│   ├── devtools.ts                  # setupDevtools() — Vue DevTools inspector + timeline layer
│   ├── nuxt.ts                      # Nuxt 3 module (defineNuxtModule)
│   └── runtime/
│       └── nuxt-plugin.ts           # Nuxt client plugin — registered automatically by nuxt.ts
└── demo/                            # Demo app (Vite + Vue 3)
```

The plugin has **no runtime dependencies** besides Vue 3. It relies only on standard browser APIs (`window.fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`).

---

## License

MIT
