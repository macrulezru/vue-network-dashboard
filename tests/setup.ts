import { vi, beforeEach } from 'vitest'
import '@vitest/web-worker'

// Mock crypto.randomUUID
if (!globalThis.crypto) {
  (globalThis as any).crypto = {}
}

if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
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
  }
}

// Mock Blob
if (typeof Blob === 'undefined') {
  (globalThis as any).Blob = class Blob {
    size: number
    type: string
    
    constructor(parts: any[], options?: { type?: string }) {
      this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0)
      this.type = options?.type || ''
    }
  }
}

// Mock fetch
globalThis.fetch = vi.fn()

// Clean up between tests
beforeEach(() => {
  vi.clearAllMocks()
})