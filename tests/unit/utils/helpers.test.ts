import { describe, it, expect } from 'vitest'
import {
  generateId,
  safeClone,
  truncate,
  isObject,
  isFormData,
  isBlob,
  isArrayBuffer,
  isTypedArray,
  formatBytes,
  getContentType,
  parseHeaders,
  delay
} from '../../../src/utils/helpers'

describe('helpers', () => {
  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId()
      const id2 = generateId()
      
      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
    })
    
    it('should generate UUID format', () => {
      const id = generateId()
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      
      expect(id).toMatch(uuidRegex)
    })
  })
  
  describe('safeClone', () => {
    it('should clone primitive values', () => {
      expect(safeClone(42)).toBe(42)
      expect(safeClone('test')).toBe('test')
      expect(safeClone(true)).toBe(true)
      expect(safeClone(null)).toBe(null)
    })
    
    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } }
      const clone = safeClone(obj)
      
      expect(clone).toEqual(obj)
      expect(clone).not.toBe(obj)
      expect(clone.b).not.toBe(obj.b)
    })
    
    it('should clone arrays', () => {
      const arr = [1, 2, { a: 3 }]
      const clone = safeClone(arr)
      
      expect(clone).toEqual(arr)
      expect(clone).not.toBe(arr)
      expect(clone[2]).not.toBe(arr[2])
    })
    
    it('should handle circular references', () => {
      const obj: any = { a: 1 }
      obj.self = obj
      
      const clone = safeClone(obj)
      expect(clone).toEqual({ a: 1, self: '[Circular]' })
    })
  })
  
  describe('truncate', () => {
    it('should not truncate short strings', () => {
      const str = 'short'
      expect(truncate(str, 10)).toBe(str)
    })
    
    it('should truncate long strings', () => {
      const str = 'this is a very long string that should be truncated'
      const result = truncate(str, 20)
      
      expect(result).toBe('this is a very long... [truncated]')
      expect(result.length).toBeLessThan(str.length)
    })
    
    it('should handle empty string', () => {
      expect(truncate('')).toBe('')
    })
    
    it('should handle null/undefined', () => {
      expect(truncate(null as any)).toBe(null)
      expect(truncate(undefined as any)).toBe(undefined)
    })
  })
  
  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true)
      expect(isObject({ a: 1 })).toBe(true)
    })
    
    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false)
      expect(isObject([1, 2])).toBe(false)
    })
    
    it('should return false for null', () => {
      expect(isObject(null)).toBe(false)
    })
    
    it('should return false for primitives', () => {
      expect(isObject(42)).toBe(false)
      expect(isObject('string')).toBe(false)
      expect(isObject(true)).toBe(false)
    })
  })
  
  describe('isFormData', () => {
    it('should return true for FormData instances', () => {
      const formData = new FormData()
      expect(isFormData(formData)).toBe(true)
    })
    
    it('should return false for non-FormData', () => {
      expect(isFormData({})).toBe(false)
      expect(isFormData(null)).toBe(false)
      expect(isFormData('string')).toBe(false)
    })
  })
  
  describe('isBlob', () => {
    it('should return true for Blob instances', () => {
      const blob = new Blob(['test'])
      expect(isBlob(blob)).toBe(true)
    })
    
    it('should return false for non-Blob', () => {
      expect(isBlob({})).toBe(false)
      expect(isBlob('string')).toBe(false)
    })
  })
  
  describe('isArrayBuffer', () => {
    it('should return true for ArrayBuffer instances', () => {
      const buffer = new ArrayBuffer(8)
      expect(isArrayBuffer(buffer)).toBe(true)
    })
    
    it('should return false for non-ArrayBuffer', () => {
      expect(isArrayBuffer({})).toBe(false)
      expect(isArrayBuffer(new Uint8Array(8))).toBe(false)
    })
  })
  
  describe('isTypedArray', () => {
    it('should return true for TypedArray instances', () => {
      expect(isTypedArray(new Uint8Array(8))).toBe(true)
      expect(isTypedArray(new Int16Array(8))).toBe(true)
      expect(isTypedArray(new Float32Array(8))).toBe(true)
    })
    
    it('should return false for non-TypedArray', () => {
      expect(isTypedArray(new ArrayBuffer(8))).toBe(false)
      expect(isTypedArray({})).toBe(false)
    })
  })
  
  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1073741824)).toBe('1 GB')
    })
  })
  
  describe('getContentType', () => {
    it('should extract content-type from Headers object', () => {
      const headers = new Headers()
      headers.set('content-type', 'application/json')
      expect(getContentType(headers)).toBe('application/json')
    })
    
    it('should extract content-type from plain object', () => {
      const headers = { 'content-type': 'application/json' }
      expect(getContentType(headers)).toBe('application/json')
    })
    
    it('should handle Content-Type with capital letters', () => {
      const headers = { 'Content-Type': 'application/json' }
      expect(getContentType(headers)).toBe('application/json')
    })
    
    it('should return null when content-type not present', () => {
      const headers = {}
      expect(getContentType(headers)).toBe(null)
    })
  })
  
  describe('parseHeaders', () => {
    it('should parse headers string into object', () => {
      const headersStr = 'Content-Type: application/json\nContent-Length: 123\nX-Custom: test'
      const result = parseHeaders(headersStr)
      
      expect(result).toEqual({
        'Content-Type': 'application/json',
        'Content-Length': '123',
        'X-Custom': 'test'
      })
    })
    
    it('should handle empty string', () => {
      expect(parseHeaders('')).toEqual({})
    })
    
    it('should handle malformed headers', () => {
      const headersStr = 'Malformed Header\nContent-Type: application/json'
      const result = parseHeaders(headersStr)
      
      expect(result).toEqual({
        'Content-Type': 'application/json'
      })
    })
  })
  
  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now()
      await delay(100)
      const end = Date.now()
      
      expect(end - start).toBeGreaterThanOrEqual(90)
    })
  })
})