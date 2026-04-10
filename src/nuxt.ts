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

import { defineNuxtModule, addPlugin, addImports, addComponent, createResolver } from '@nuxt/kit'
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
    const resolver = createResolver(import.meta.url)

    // Expose plugin options through runtimeConfig so the client plugin can read them
    nuxt.options.runtimeConfig.public.networkDashboard = options as any

    // Register the plugin — client-side only (network interception only makes sense in a browser)
    addPlugin({
      src: resolver.resolve('./runtime/nuxt-plugin'),
      mode: 'client'
    })

    // Auto-import composable
    addImports({
      name: 'useNetworkDashboard',
      as: 'useNetworkDashboard',
      from: resolver.resolve('./plugins/vuePlugin')
    })

    // Auto-import component
    addComponent({
      name: 'NetworkDebugger',
      filePath: resolver.resolve('./view/index')
    })
  }
})
