import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboardPlugin from '../src/index'

const app = createApp(App)

app.use(NetworkDashboardPlugin, {
  enabled: true,
  maxLogs: 500,
  devOnly: false,
  interceptors: {
    fetch:     true,
    xhr:       true,
    websocket: true,
    sse:       true
  },
  filters: {
    excludeUrlPattern: /\/health|\/metrics/
  },
  sanitization: {
    sensitiveHeaders: ['authorization', 'cookie', 'x-api-key'],
    sensitiveFields:  ['password', 'token', 'secret'],
    maskFields:       ['email', 'phone']
  },
  callbacks: {
    onLog:   (entry) => { /* hook for external monitoring */ },
    onError: (err)   => console.error('[NetworkDashboard]', err)
  },
  // Hotkey: Ctrl+Shift+D to toggle the panel
  ui: {
    hotkey: 'd',
    hotkeyModifiers: { ctrl: true, shift: true }
  }
})

app.mount('#app')
