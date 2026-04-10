/**
 * Vue DevTools integration for vue-network-dashboard.
 *
 * Adds a "Network" inspector tab to the Vue DevTools panel (both the
 * browser extension and vite-plugin-vue-devtools ≥ 7.x).
 *
 * Call this once after installing the plugin:
 *
 * ```ts
 * import { setupDevtools } from 'vue-network-dashboard/devtools'
 * import { useNetworkDashboard } from 'vue-network-dashboard'
 *
 * const app = createApp(App)
 * app.use(NetworkDashboardPlugin)
 *
 * if (import.meta.env.DEV) {
 *   const dashboard = useNetworkDashboard()  // must be called inside app context
 *   setupDevtools(app, dashboard)
 * }
 * ```
 *
 * Requires `@vue/devtools-api` ≥ 6.5 (peer dependency of vite-plugin-vue-devtools).
 * The function silently does nothing when DevTools are not available.
 */

import type { App } from 'vue'
import type { VueNetworkDashboardInstance } from './plugins/vuePlugin'

const INSPECTOR_ID = 'vue-network-dashboard'

export async function setupDevtools(
  app: App,
  instance: VueNetworkDashboardInstance
): Promise<void> {
  // Bail out if not in a browser context
  if (typeof window === 'undefined') return

  let setupDevtoolsPlugin: Function | undefined

  try {
    // Dynamic import keeps @vue/devtools-api as an optional peer dep.
    // The cast via Function prevents Rollup from statically analysing the import.
    const load = new Function('m', 'return import(m)') as (m: string) => Promise<any>
    const api = await load('@vue/devtools-api')
    setupDevtoolsPlugin = api.setupDevtoolsPlugin
  } catch {
    // @vue/devtools-api not installed — silently skip
    return
  }

  setupDevtoolsPlugin!(
    {
      id: INSPECTOR_ID,
      label: 'Network Dashboard',
      packageName: 'vue-network-dashboard',
      homepage: 'https://github.com/macrulezru/vue-network-dashboard',
      logo: 'https://vitejs.dev/logo.svg',
      componentStateTypes: [],
      app
    },
    (api: any) => {
      // ── Custom inspector ──────────────────────────────────────────────────

      api.addInspector({
        id: INSPECTOR_ID,
        label: 'Network',
        icon: 'cable',
        treeFilterPlaceholder: 'Filter by URL…'
      })

      // Build the tree of log entries
      api.on.getInspectorTree((payload: any) => {
        if (payload.inspectorId !== INSPECTOR_ID) return

        const filter = (payload.filter as string | undefined)?.toLowerCase() ?? ''
        const logs = instance.logs.value

        payload.rootNodes = logs
          .filter(log => !filter || log.url.toLowerCase().includes(filter))
          .slice(0, 200)
          .map(log => {
            const status = log.http?.status
            const isError = log.error.occurred || (status != null && status >= 400)

            const tags: any[] = []
            if (status != null) {
              tags.push({
                label: String(status),
                textColor:        0xffffff,
                backgroundColor:  status < 400 ? 0x3fb950 : status < 500 ? 0xd29922 : 0xf85149
              })
            }
            if (log.duration != null) {
              tags.push({
                label: `${log.duration}ms`,
                textColor:       0x8b949e,
                backgroundColor: 0x21262d
              })
            }
            if (log.metadata?.pending) {
              tags.push({ label: 'pending', textColor: 0x58a6ff, backgroundColor: 0x1f3a5f })
            }
            if (log.metadata?.mocked) {
              tags.push({ label: 'mock', textColor: 0xd2a679, backgroundColor: 0x3d2b1f })
            }

            return {
              id: log.id,
              label: `${log.method}  ${log.url}`,
              tags
            }
          })
      })

      // State panel for the selected entry
      api.on.getInspectorState((payload: any) => {
        if (payload.inspectorId !== INSPECTOR_ID) return

        const log = instance.logs.value.find(l => l.id === payload.nodeId)
        if (!log) return

        const reqHeaders = Object.entries(log.requestHeaders).map(([k, v]) => ({ key: k, value: v }))
        const resHeaders = Object.entries(log.responseHeaders).map(([k, v]) => ({ key: k, value: v }))

        payload.state = {
          'Request': [
            { key: 'url',      value: log.url },
            { key: 'method',   value: log.method },
            { key: 'type',     value: log.type },
            { key: 'headers',  value: reqHeaders },
            ...(log.request.body != null ? [{ key: 'body', value: log.request.body }] : [])
          ],
          'Response': [
            { key: 'status',     value: log.http?.status     ?? '—' },
            { key: 'statusText', value: log.http?.statusText ?? '—' },
            { key: 'headers',    value: resHeaders },
            ...(log.response.body != null ? [{ key: 'body', value: log.response.body }] : [])
          ],
          'Timing': [
            { key: 'startTime', value: new Date(log.startTime).toISOString() },
            { key: 'endTime',   value: log.endTime ? new Date(log.endTime).toISOString() : '—' },
            { key: 'duration',  value: log.duration != null ? `${log.duration}ms` : '—' }
          ],
          'Metadata': [
            { key: 'client',    value: log.metadata.clientType },
            { key: 'redirected', value: log.metadata.redirected },
            { key: 'retries',   value: log.metadata.retryCount },
            { key: 'mocked',    value: log.metadata.mocked ?? false },
            { key: 'pending',   value: log.metadata.pending ?? false }
          ],
          ...(log.error.occurred ? {
            'Error': [
              { key: 'name',    value: log.error.name    ?? '—' },
              { key: 'message', value: log.error.message ?? '—' },
              { key: 'stack',   value: log.error.stack   ?? '—' }
            ]
          } : {})
        }
      })

      // Refresh the inspector tree whenever a new log is added
      instance.subscribe(() => {
        api.sendInspectorTree(INSPECTOR_ID)
      })

      // ── Custom timeline layer ─────────────────────────────────────────────

      api.addTimelineLayer({
        id: INSPECTOR_ID,
        label: 'Network requests',
        color: 0x58a6ff
      })

      instance.subscribe((log) => {
        if (log.type !== 'http' || log.metadata?.pending) return
        api.addTimelineEvent({
          layerId: INSPECTOR_ID,
          event: {
            time: api.now(),
            data: {
              method: log.method,
              url:    log.url,
              status: log.http?.status,
              duration: log.duration
            },
            title:    `${log.method} ${log.url}`,
            subtitle: log.http?.status ? String(log.http.status) : 'error',
            meta: {}
          }
        })
      })
    }
  )
}
