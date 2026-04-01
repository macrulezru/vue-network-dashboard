import { isFormData, isBlob, isArrayBuffer, isTypedArray } from './helpers'

/**
 * Calculate data size in bytes
 * Supports strings, FormData, Blob, ArrayBuffer, TypedArrays, objects
 */
export const calculateSize = (data: any): number => {
  if (data === null || data === undefined) {
    return 0
  }
  
  // String
  if (typeof data === 'string') {
    return new Blob([data]).size
  }
  
  // FormData
  if (isFormData(data)) {
    let size = 0
    for (const [, value] of data.entries()) {
      if (typeof value === 'string') {
        size += new Blob([value]).size
      } else if (isBlob(value)) {
        size += value.size
      }
    }
    return size
  }
  
  // Blob
  if (isBlob(data)) {
    return data.size
  }
  
  // ArrayBuffer
  if (isArrayBuffer(data)) {
    return data.byteLength
  }
  
  // TypedArray (Uint8Array, etc)
  if (isTypedArray(data)) {
    return data.byteLength
  }
  
  // URLSearchParams
  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
    return new Blob([data.toString()]).size
  }
  
  // Number or boolean
  if (typeof data === 'number' || typeof data === 'boolean') {
    return new Blob([String(data)]).size
  }
  
  // Object or array
  if (typeof data === 'object') {
    try {
      return new Blob([JSON.stringify(data)]).size
    } catch {
      return 0
    }
  }
  
  return 0
}

/**
 * Get MIME type of data
 */
export const getDataType = (data: any): string | null => {
  if (data === null || data === undefined) {
    return null
  }
  
  if (typeof data === 'string') {
    return 'text/plain'
  }
  
  if (isFormData(data)) {
    return 'multipart/form-data'
  }
  
  if (isBlob(data)) {
    return data.type || 'application/octet-stream'
  }
  
  if (isArrayBuffer(data) || isTypedArray(data)) {
    return 'application/octet-stream'
  }
  
  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
    return 'application/x-www-form-urlencoded'
  }
  
  if (typeof data === 'object') {
    return 'application/json'
  }
  
  return null
}

/**
 * Safely convert data to string representation
 * Handles circular references and binary data gracefully
 */
export const safeStringify = (data: any): string | null => {
  if (data === null || data === undefined) {
    return null
  }
  
  // String
  if (typeof data === 'string') {
    return data
  }
  
  // FormData
  if (isFormData(data)) {
    const obj: Record<string, any> = {}
    for (const [key, value] of data.entries()) {
      if (isBlob(value)) {
        obj[key] = `[Blob: ${value.size} bytes, type: ${value.type || 'unknown'}]`
      } else {
        obj[key] = value
      }
    }
    return JSON.stringify(obj)
  }
  
  // Blob
  if (isBlob(data)) {
    return `[Blob: ${data.size} bytes, type: ${data.type || 'unknown'}]`
  }
  
  // ArrayBuffer
  if (isArrayBuffer(data)) {
    return `[ArrayBuffer: ${data.byteLength} bytes]`
  }
  
  // TypedArray
  if (isTypedArray(data)) {
    return `[TypedArray: ${data.byteLength} bytes]`
  }
  
  // URLSearchParams
  if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
    return data.toString()
  }
  
  // Object or array
  if (typeof data === 'object') {
    try {
      return JSON.stringify(data)
    } catch {
      return '[Unserializable object]'
    }
  }
  
  // Primitive types
  return String(data)
}

/**
 * Calculate Content-Length from headers or data
 */
export const getContentLength = (
  headers: Record<string, string>,
  data: any
): number | null => {
  // Try to get from headers first
  const contentLength = headers['content-length'] || headers['Content-Length']
  if (contentLength) {
    const length = parseInt(contentLength, 10)
    if (!isNaN(length)) return length
  }
  
  // Calculate from data
  const size = calculateSize(data)
  return size > 0 ? size : null
}