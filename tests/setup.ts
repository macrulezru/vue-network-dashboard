import { vi, beforeEach } from 'vitest'
import '@vitest/web-worker'

// Mock crypto.randomUUID
if (!globalThis.crypto) {
  (globalThis as any).crypto = {}
}

if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
    return uuid as `${string}-${string}-${string}-${string}-${string}`
  }
}

// Mock FormData
if (typeof FormData === 'undefined') {
  (globalThis as any).FormData = class FormData {
    private data: Map<string, any> = new Map()
    
    append(key: string, value: any) {
      this.data.set(key, value)
    }
    
    get(key: string) {
      return this.data.get(key)
    }
    
    entries() {
      return this.data.entries()
    }
    
    forEach(callback: (value: any, key: string) => void) {
      this.data.forEach((value, key) => callback(value, key))
    }
  }
}

// Mock Blob
if (typeof Blob === 'undefined') {
  (globalThis as any).Blob = class Blob {
    size: number
    type: string
    private parts: any[]
    
    constructor(parts: any[], options?: { type?: string }) {
      this.parts = parts
      this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0)
      this.type = options?.type || ''
    }
    
    text() {
      return Promise.resolve(this.parts.join(''))
    }
    
    arrayBuffer() {
      const encoder = new TextEncoder()
      return Promise.resolve(encoder.encode(this.parts.join('')).buffer)
    }
  }
}

// Mock Headers
if (typeof Headers === 'undefined') {
  (globalThis as any).Headers = class Headers {
    private headers: Map<string, string> = new Map()
    
    constructor(init?: Record<string, string> | Headers) {
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => {
            this.headers.set(key.toLowerCase(), value)
          })
        } else {
          Object.entries(init).forEach(([key, value]) => {
            this.headers.set(key.toLowerCase(), value)
          })
        }
      }
    }
    
    get(key: string) {
      return this.headers.get(key.toLowerCase()) || null
    }
    
    set(key: string, value: string) {
      this.headers.set(key.toLowerCase(), value)
    }
    
    has(key: string) {
      return this.headers.has(key.toLowerCase())
    }
    
    forEach(callback: (value: string, key: string) => void) {
      this.headers.forEach((value, key) => callback(value, key))
    }
    
    entries() {
      return this.headers.entries()
    }
  }
}

// Mock Response
if (typeof Response === 'undefined') {
  (globalThis as any).Response = class Response {
    status: number
    statusText: string
    headers: Headers
    bodyUsed: boolean = false
    private bodyData: any
    
    constructor(body?: any, init?: { status?: number; statusText?: string; headers?: HeadersInit }) {
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Headers(init?.headers)
      this.bodyData = body
    }
    
    async json() {
      this.bodyUsed = true
      return JSON.parse(this.bodyData)
    }
    
    async text() {
      this.bodyUsed = true
      return this.bodyData
    }
    
    async blob() {
      this.bodyUsed = true
      return new Blob([this.bodyData])
    }
    
    clone() {
      return new (globalThis as any).Response(this.bodyData, {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers
      })
    }
  }
}

// Mock fetch
globalThis.fetch = vi.fn()

// Clean up between tests
beforeEach(() => {
  vi.clearAllMocks()
})