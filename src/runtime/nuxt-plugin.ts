/**
 * Nuxt runtime plugin — registered automatically by src/nuxt.ts.
 * Do not import this file directly in non-Nuxt projects.
 *
 * The #app import is a Nuxt virtual module available only inside a Nuxt app.
 * TypeScript errors about missing '#app' are expected when building the
 * library itself; at runtime inside a Nuxt project the module resolves correctly.
 */

// @ts-ignore — #app is a Nuxt virtual module, not resolvable outside Nuxt
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import NetworkDashboardPlugin from '../plugins/vuePlugin'

// @ts-ignore — nuxtApp type comes from Nuxt
export default defineNuxtPlugin((nuxtApp: any) => {
  const config = useRuntimeConfig()
  const options = (config.public.networkDashboard ?? {}) as Record<string, unknown>
  nuxtApp.vueApp.use(NetworkDashboardPlugin, options)
})
