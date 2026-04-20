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

// Add GraphQL demo mocks so the GraphQL detection feature is visible without a real server
const dashboard = app.config.globalProperties.$networkDashboard
if (dashboard) {
  dashboard.addMock({
    urlPattern: '/api/graphql',
    method: 'POST',
    status: 200,
    enabled: true,
    conditions: { bodyFields: { operationName: 'GetUser' } },
    response: {
      data: {
        user: { id: '1', name: 'Alice Wonderland', email: 'alice@example.com', role: 'ADMIN' }
      }
    }
  })
  dashboard.addMock({
    urlPattern: '/api/graphql',
    method: 'POST',
    status: 200,
    enabled: true,
    conditions: { bodyFields: { operationName: 'GetPosts' } },
    response: {
      data: {
        posts: [
          { id: '1', title: 'Hello GraphQL', body: 'First post', author: { name: 'Alice' } },
          { id: '2', title: 'Vue 3 Tips',    body: 'Second post', author: { name: 'Bob' } },
        ]
      }
    }
  })
  dashboard.addMock({
    urlPattern: '/api/graphql',
    method: 'POST',
    status: 200,
    enabled: true,
    conditions: { bodyFields: { operationName: 'CreatePost' } },
    response: {
      data: {
        createPost: { id: '42', title: 'Hello GraphQL' }
      }
    }
  })
}
