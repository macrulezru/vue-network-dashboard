/**
 * Generate unique ID using crypto.randomUUID or fallback
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * Safely clone an object using JSON methods
 */
export const safeClone = <T>(obj: T): T => {
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (error) {
    // Handle circular references by returning a simplified version
    if (error instanceof TypeError && error.message.includes('circular')) {
      const seen = new WeakSet()
      const replacer = (key: string, value: any): any => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]'
          }
          seen.add(value)
        }
        return value
      }
      return JSON.parse(JSON.stringify(obj, replacer))
    }
    return obj
  }
}

/**
 * Truncate string to maximum length
 */
export const truncate = (str: string, maxLength: number = 1000): string => {
  if (!str || str.length <= maxLength) return str
  return str.substring(0, maxLength) + '... [truncated]'
}

/**
 * Check if value is a plain object (not array, not null)
 */
export const isObject = (value: any): boolean => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Check if value is FormData instance
 */
export const isFormData = (value: any): boolean => {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

/**
 * Check if value is Blob instance
 */
export const isBlob = (value: any): boolean => {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

/**
 * Check if value is ArrayBuffer instance
 */
export const isArrayBuffer = (value: any): boolean => {
  return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer
}

/**
 * Check if value is a typed array (ArrayBufferView)
 */
export const isTypedArray = (value: any): boolean => {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

/**
 * Safely get content-type from headers
 */
export const getContentType = (
  headers: Headers | Record<string, string>
): string | null => {
  if (headers instanceof Headers) {
    return headers.get('content-type')
  }
  return headers['content-type'] || headers['Content-Type'] || null
}

/**
 * Parse raw header string into object
 */
export const parseHeaders = (headers: string): Record<string, string> => {
  const result: Record<string, string> = {}
  
  if (!headers) return result
  
  const lines = headers.trim().split(/[\r\n]+/)
  
  for (const line of lines) {
    const parts = line.split(': ')
    if (parts.length === 2) {
      result[parts[0]] = parts[1]
    }
  }
  
  return result
}

/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Create delay promise (useful for testing)
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}