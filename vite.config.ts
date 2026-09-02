import { defineConfig, type UserConfig } from 'vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig(({ command }): UserConfig => {
  // Development mode - run demo
  if (command === 'serve') {
    return {
      plugins: [vue()],
      root: resolve(__dirname, 'demo'),
      server: {
        port: 3000,
        open: true
      },
      resolve: {
        alias: {
          '@': resolve(__dirname, 'src'),
          'vue-network-dashboard': resolve(__dirname, 'src/index.ts')
        }
      },
      optimizeDeps: {
        exclude: ['vue-network-dashboard']
      }
    }
  }

  // Production mode - build library
  return {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'VueNetworkDashboard',
        formats: ['es', 'umd'],
        // .cjs, not .js, for the UMD build — this package has "type": "module"
        // in package.json, so Node treats every plain .js file here as ESM
        // regardless of content. The UMD build is written as a CJS/UMD IIFE
        // (require("vue") inside, no `export` statements) — under a bare
        // .js extension, require('vue-network-dashboard') resolved to this
        // file via the exports map's `require` condition, but Node's
        // require-of-ESM interop found no `export`s and silently returned an
        // empty object. .cjs is always treated as CommonJS by Node no matter
        // what "type" the package declares, which is exactly what a UMD/CJS
        // build needs.
        fileName: (format) => `vue-network-dashboard.${format === 'es' ? 'esm.js' : 'umd.cjs'}`
      },
      rollupOptions: {
        external: [
          'vue',
          '@vue/devtools-api',
          '@nuxt/kit',
          '#app',
          /^@nuxt\//
        ],
        output: {
          globals: {
            vue: 'Vue'
          },
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === 'style.css') return 'vue-network-dashboard.css'
            return assetInfo.name || 'assets/[name][extname]'
          }
        }
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler'
        }
      }
    },
    plugins: [
      vue(),
      dts({
        insertTypesEntry: true,
        rollupTypes: true,
        exclude: [
          'src/nuxt.ts',
          'src/runtime/**',
          'demo/**'
        ]
      })
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})