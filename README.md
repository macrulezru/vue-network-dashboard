# **Network Dashboard**

![Network Dashboard](https://github.com/macrulezru/assets/blob/master/packages-images/vue-network-dashboard.png?raw=true)

Universal network monitoring plugin for Vue 3. Intercepts all HTTP (Fetch / XHR), WebSocket, and Server-Sent Events (SSE) traffic, logs them in a unified format, automatically sanitizes sensitive data, and exposes reactive storage with rich statistics.

---

## Features

- **Full Coverage** — intercepts Fetch API, XMLHttpRequest (XHR), WebSocket, and Server-Sent Events
- **Unified Format** — all network events share one consistent log structure regardless of transport type
- **Security First** — auto-redacts sensitive headers, removes sensitive body fields, masks PII
- **Rich Metrics** — tracks request/response sizes, duration, data transfer volumes, per-method and per-status breakdowns
- **Vue 3 Native** — uses Vue `ref` for reactive storage — no Pinia or Vuex required
- **Zero Configuration** — works immediately after `app.use()` with sensible defaults
- **Pending Requests** — in-flight requests appear as live entries and update in place on completion — just like browser DevTools
- **Mock Groups** — organise mock rules into named groups — enable/disable a whole group at once, collapse/expand, rename inline, import/export as JSON
- **Session Compare** — load two HAR files side by side and see an instant diff — added, removed, and changed requests with per-field deltas
- **Mock Mode** — define URL/method rules to intercept requests and return custom responses without touching the backend
- **HAR Export / Import** — export a session as an HTTP Archive file, or load a recorded `.har` file to inspect it
- **Waterfall Timeline** — visual bar chart of all requests on a shared time axis
- **Diff View** — select any two log entries to see a side-by-side diff of headers and body
- **Copy as cURL** — one-click copy of any HTTP request as a ready-to-run `curl` command (with headers and body)
- **Replay with Editing** — edit URL, method, headers, and body before re-sending any request — JSON body is validated inline
- **Response Transform** — modify real responses on the fly without a full mock — override status, merge/delete JSON body fields, add headers
- **Network Throttling** — simulate slow connections with built-in presets (Fast 3G / Slow 3G / Offline-ish)
- **GraphQL Detection** — automatically detects GraphQL operations in POST requests; shows operation type, name, and variables
- **N+1 Detection** — highlights duplicate requests to the same URL+method within a 5-second window with an orange ×N badge
- **Breakpoints** — pause any outgoing request before it is sent — inspect and edit URL, method, headers, and body — then release or cancel
- **OpenAPI Import** — load an OpenAPI 3.x or Swagger 2.x JSON spec to auto-generate a full set of mock rules from all `paths`
- **Built-in Debugger UI** — draggable, resizable panel with filters, 3-tab detail view, stats, timeline, mock editor, and export
- **Nuxt 3 Module** — first-class Nuxt integration with auto-registration and `useNetworkDashboard()` auto-import
- **Vue DevTools** — optional inspector tab and timeline layer in Vue DevTools (browser extension + vite-plugin-vue-devtools)
- **Sentry / OpenTelemetry** — ready-made adapters for error tracking and distributed tracing
- **TypeScript** — full type definitions included

---

## Installation

| Environment | Minimum version |
| ----------- | --------------- |
| Vue         | `3.0+`          |
| Node.js     | `18+`           |

`@vue/devtools-api` (`≥ 6.5`) is needed only if you call `setupDevtools()` — it is not a formal peer dependency. The Nuxt module additionally requires Nuxt `3+`.

```bash
npm install vue-network-dashboard
```

### Quick start

```typescript
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboard from 'vue-network-dashboard'

const app = createApp(App)

app.use(NetworkDashboard, {
  devOnly: true, // only active in development builds
  maxLogs: 500,
})

app.mount('#app')
```

That's it. All Fetch, XHR, WebSocket, and SSE calls are now captured.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/vue-network-dashboard](https://npm.vuecraft.ru/en/packages/vue-network-dashboard/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/vue-network-dashboard](https://github.com/macrulezru/vue-network-dashboard)
- 📦 **NPM:** [vue-network-dashboard](https://www.npmjs.com/package/vue-network-dashboard)
- 🐛 **Issues:** [github.com/macrulezru/vue-network-dashboard/issues](https://github.com/macrulezru/vue-network-dashboard/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
