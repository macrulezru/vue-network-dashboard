import { describe, it, expect } from 'vitest'
import {
  calculateSize,
  getDataType,
  safeStringify,
  getContentLength
} from '../../../src/utils/sizeCalculator'

describe('sizeCalculator', () => {
  describe('calculateSize', () => {
    it('should calculate size of string', () => {
      expect(calculateSize('hello')).toBe(5)
      expect(calculateSize('')).toBe(0)
      expect(calculateSize('🚀')).toBe(4) // Emoji is 4 bytes
    })
    
    it('should calculate size of number', () => {
      expect(calculateSize(123)).toBe(3)
      expect(calculateSize(0)).toBe(1)
    })
    
    it('should calculate size of boolean', () => {
      expect(calculateSize(true)).toBe(4)
      expect(calculateSize(false)).toBe(5)
    })
    
    it('should calculate size of object', () => {
      const obj = { a: 1, b: 'test' }
      const size = calculateSize(obj)
      expect(size).toBe(JSON.stringify(obj).length)
    })
    
    it('should calculate size of array', () => {
      const arr = [1, 2, 3]
      const size = calculateSize(arr)
      expect(size).toBe(JSON.stringify(arr).length)
    })
    
    it('should calculate size of FormData', () => {
      const formData = new FormData()
      formData.append('key1', 'value1')
      formData.append('key2', 'value2')
      
      const size = calculateSize(formData)
      expect(size).toBeGreaterThan(0)
    })
    
    it('should calculate size of Blob', () => {
      const blob = new Blob(['test data'])
      expect(calculateSize(blob)).toBe(9)
    })
    
    it('should calculate size of ArrayBuffer', () => {
      const buffer = new ArrayBuffer(100)
      expect(calculateSize(buffer)).toBe(100)
    })
    
    it('should calculate size of TypedArray', () => {
      const typedArray = new Uint8Array(50)
      expect(calculateSize(typedArray)).toBe(50)
    })
    
    it('should return 0 for null/undefined', () => {
      expect(calculateSize(null)).toBe(0)
      expect(calculateSize(undefined)).toBe(0)
    })
  })
  
  describe('getDataType', () => {
    it('should detect string type', () => {
      expect(getDataType('hello')).toBe('text/plain')
    })
    
    it('should detect FormData type', () => {
      const formData = new FormData()
      expect(getDataType(formData)).toBe('multipart/form-data')
    })
    
    it('should detect Blob type', () => {
      const blob = new Blob(['test'], { type: 'image/png' })
      expect(getDataType(blob)).toBe('image/png')
    })
    
    it('should detect ArrayBuffer type', () => {
      const buffer = new ArrayBuffer(8)
      expect(getDataType(buffer)).toBe('application/octet-stream')
    })
    
    it('should detect TypedArray type', () => {
      const typedArray = new Uint8Array(8)
      expect(getDataType(typedArray)).toBe('application/octet-stream')
    })
    
    it('should detect URLSearchParams type', () => {
      const params = new URLSearchParams({ a: '1', b: '2' })
      expect(getDataType(params)).toBe('application/x-www-form-urlencoded')
    })
    
    it('should detect object type', () => {
      expect(getDataType({ a: 1 })).toBe('application/json')
    })
    
    it('should return null for null/undefined', () => {
      expect(getDataType(null)).toBe(null)
      expect(getDataType(undefined)).toBe(null)
    })
  })
  
  describe('safeStringify', () => {
    it('should stringify string', () => {
      expect(safeStringify('hello')).toBe('hello')
    })
    
    it('should stringify object', () => {
      const obj = { a: 1, b: 'test' }
      expect(safeStringify(obj)).toBe(JSON.stringify(obj))
    })
    
    it('should stringify FormData', () => {
      const formData = new FormData()
      formData.append('key', 'value')
      
      const result = safeStringify(formData)
      expect(result).toContain('"key":"value"')
    })
    
    it('should stringify Blob', () => {
      const blob = new Blob(['test'])
      const result = safeStringify(blob)
      expect(result).toContain('[Blob:')
      expect(result).toContain('bytes')
    })
    
    it('should stringify ArrayBuffer', () => {
      const buffer = new ArrayBuffer(100)
      const result = safeStringify(buffer)
      expect(result).toBe('[ArrayBuffer: 100 bytes]')
    })
    
    it('should stringify TypedArray', () => {
      const typedArray = new Uint8Array(50)
      const result = safeStringify(typedArray)
      expect(result).toBe('[TypedArray: 50 bytes]')
    })
    
    it('should return null for null/undefined', () => {
      expect(safeStringify(null)).toBe(null)
      expect(safeStringify(undefined)).toBe(null)
    })
  })
  
  describe('getContentLength', () => {
    it('should get content-length from headers', () => {
      const headers = { 'content-length': '1024' }
      expect(getContentLength(headers, null)).toBe(1024)
    })
    
    it('should calculate from data when no content-length', () => {
      const headers = {}
      const data = 'test data'
      expect(getContentLength(headers, data)).toBe(9)
    })
    
    it('should return null when no data and no headers', () => {
      const headers = {}
      expect(getContentLength(headers, null)).toBe(null)
    })
    
    it('should prefer content-length over calculation', () => {
      const headers = { 'content-length': '500' }
      const data = 'this is a much longer string that should not be used'
      expect(getContentLength(headers, data)).toBe(500)
    })
  })
})