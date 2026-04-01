# TODO — Feature Roadmap

## High Priority

### Pending request tracking (in-flight state)
Show requests that are still in-flight as `pending` entries in the log list, updating them in place when the response arrives.
Currently each request produces one complete entry only after it finishes. A Map keyed by request ID would hold the pending entry and update it reactively on completion, matching how browser DevTools work.

### HAR export
Add `export('har')` to produce a standard HTTP Archive (HAR 1.2) JSON file.
HAR can be opened directly in Chrome DevTools, Postman, Charles Proxy, and other tools, making it far more useful for sharing or replaying sessions than the current CSV/JSON formats.

### Configurable localStorage key
The storage key `'vue-network-dashboard'` is currently hard-coded in `NetworkDashboard.ts`.
Add a `storageKey?: string` option so multiple plugin instances (e.g. in micro-frontend setups) do not collide.

---

## Medium Priority

### Incremental statistics
`getStats()` iterates the full log array on every call, and the Vue `computed` in the plugin re-runs it on every log insertion.
Maintain running counters (`totalErrors`, `totalDuration`, `totalDataSent`, `totalDataReceived`) as separate `ref`s updated inside `addLog()` / `clear()`. `getStats()` would then just read the counters — O(1) instead of O(n).

### Throttle / aggregate SSE and WebSocket events
High-frequency SSE streams or chatty WebSocket connections can flood the store with hundreds of events per second.
Add a `throttle?: { websocket?: number; sse?: number }` option (in milliseconds) that aggregates events of the same type on the same connection into a single entry with a count field.

### GraphQL operation name extraction
All GraphQL requests go to the same endpoint (e.g. `/graphql`) with `POST`, making them indistinguishable in the log list.
When `Content-Type: application/json` and the request body contains `operationName` or `query`, extract the operation name and store it in `metadata` so it can be displayed and filtered.

### Time-range filter in the UI
Add a time filter to `FilterBar.vue` — options like "Last 30 seconds", "Last 5 minutes", "Since page load".
`pruneOlderThan()` already exists on `LogStore`; this is purely a UI addition on top of `useLogFilter`.

---

## Low Priority

### Request replay
Add a `replay(entry: UnifiedLogEntry): Promise<UnifiedLogEntry>` method that re-issues an HTTP request from a stored log entry using the original URL, method, headers, and body.
Useful for debugging flaky endpoints without having to reproduce the UI flow.

### `devOnly` tree-shaking via build-time flag
Currently `devOnly` is a runtime check (`import.meta.env.DEV`). Wrap the plugin registration in a build-time `if (import.meta.env.DEV)` guard so bundlers can eliminate the entire plugin from production bundles via tree-shaking, reducing bundle size to zero in prod.

### Network timeline visualization
Add a `<NetworkTimeline>` component that renders a waterfall chart of requests over time (similar to the DevTools Network tab).
Each row shows a request bar positioned by `startTime` and sized by `duration`, colour-coded by status group.

### Multiple sanitization strategies
Currently the plugin supports one global sanitization config.
Allow per-URL-pattern overrides: e.g. apply stricter masking to `/api/auth/*` while logging `/api/public/*` verbatim.
```typescript
sanitization?: {
  rules?: Array<{ urlPattern: RegExp } & SanitizationRules>
  // ... existing global fields
}
```
