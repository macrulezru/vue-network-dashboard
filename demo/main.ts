import { createApp } from 'vue'
import App from './App.vue'
import NetworkDashboardPlugin from '../src/index'

const app = createApp(App)

app.use(NetworkDashboardPlugin, {
  enabled: true,
  maxLogs: 500,
  devOnly: false,
  interceptors: {
    fetch: true,
    xhr: true,
    websocket: true,
    sse: true
  },
  filters: {
    excludeUrlPattern: /\/health|\/metrics/
  },
  sanitization: {
    sensitiveHeaders: ['authorization', 'cookie', 'x-api-key'],
    sensitiveFields: ['password', 'token', 'secret'],
    maskFields: ['email', 'phone']
  }
})

app.mount('#app')