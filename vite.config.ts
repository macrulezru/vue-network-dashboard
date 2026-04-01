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
        fileName: (format) => `vue-network-dashboard.${format === 'es' ? 'esm' : 'umd'}.js`
      },
      rollupOptions: {
        external: ['vue'],
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
        rollupTypes: true
      })
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})