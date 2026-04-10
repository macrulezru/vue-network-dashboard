/**
 * Nuxt 3 module for vue-network-dashboard.
 *
 * Auto-registers the plugin (client-only) and exports the composable.
 *
 * nuxt.config.ts:
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['vue-network-dashboard/nuxt'],
 *   networkDashboard: {
 *     devOnly: true,
 *     maxLogs: 500,
 *     ui: { hotkey: 'd', hotkeyModifiers: { ctrl: true, shift: true } }
 *   }
 * })
 * ```
 *
 * Then in any page/layout:
 * ```vue
 * <template>
 *   <NuxtPage />
 *   <NetworkDebugger />   <!-- auto-imported -->
 * </template>
 * ```
 */

import { defineNuxtModule, addPluginTemplate, addImports, addComponent } from '@nuxt/kit'
import type { NetworkDashboardOptions } from './core/types'

export interface ModuleOptions extends NetworkDashboardOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vue-network-dashboard',
    configKey: 'networkDashboard',
    compatibility: { nuxt: '>=3.0.0' }
  },

  defaults: {
    enabled: true,
    devOnly: true,
    maxLogs: 500
  },

  setup(options, nuxt: any) {
    if (options.devOnly && !nuxt.options.dev) return

    // Expose plugin options through runtimeConfig so the client plugin can read them
    nuxt.options.runtimeConfig.public.networkDashboard = options as any

    // Register the plugin client-side only — network interception only makes sense in a browser
    addPluginTemplate({
      filename: 'vue-network-dashboard.client.ts',
      mode: 'client',
      getContents: (): string => `
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { NetworkDashboardPlugin } from 'vue-network-dashboard'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const options = (config.public.networkDashboard ?? {}) as Record<string, unknown>
  nuxtApp.vueApp.use(NetworkDashboardPlugin, options)
})
`.trim()
    })

    // Auto-import composable
    addImports({
      name: 'useNetworkDashboard',
      as: 'useNetworkDashboard',
      from: 'vue-network-dashboard'
    })

    // Auto-import component
    addComponent({
      name: 'NetworkDebugger',
      export: 'NetworkDebugger',
      filePath: 'vue-network-dashboard'
    })
  }
})
