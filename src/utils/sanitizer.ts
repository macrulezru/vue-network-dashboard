import type { SanitizationRules } from '../core/types'
import { isObject } from './helpers'

// Default sensitive headers to redact
const DEFAULT_SENSITIVE_HEADERS: string[] = [
  'authorization',
  'cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'bearer',
  'token',
  'password',
  'secret',
  'x-secret',
  'x-token'
]

// Default sensitive fields to remove
const DEFAULT_SENSITIVE_FIELDS: string[] = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'creditCard',
  'credit_card',
  'cvv',
  'ssn',
  'socialSecurity'
]

// Default fields to mask (show partially)
const DEFAULT_MASK_FIELDS: string[] = [
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'address',
  'firstName',
  'first_name',
  'lastName',
  'last_name'
]

/**
 * Mask a string value based on type
 */
export const maskString = (
  value: string,
  type: 'email' | 'phone' | 'default' = 'default'
): string => {
  if (!value || value.length < 4) return '***'
  
  // Email masking: user***@domain.com
  if (type === 'email') {
    const [local, domain] = value.split('@')
    if (!domain) return value.substring(0, 2) + '***' + value.slice(-2)
    const maskedLocal = local.length > 2 
      ? local.substring(0, 2) + '***' 
      : '***'
    return `${maskedLocal}@${domain}`
  }
  
  // Phone masking: keep first and last 3 digits
  if (type === 'phone') {
    const visible = Math.min(3, Math.floor(value.length / 3))
    if (visible === 0) return '***'
    return value.substring(0, visible) + '***' + value.slice(-visible)
  }
  
  // Default masking: keep first 2 and last 2 chars
  const visible = Math.min(2, Math.floor(value.length / 3))
  if (visible === 0) return '***'
  return value.substring(0, visible) + '***' + value.slice(-visible)
}

/**
 * Recursively mask sensitive fields in data
 */
export const maskSensitiveData = (
  data: any,
  maskFields: string[] = DEFAULT_MASK_FIELDS
): any => {
  if (!data || typeof data !== 'object') {
    return data
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, maskFields))
  }
  
  const masked: Record<string, any> = {}
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()
    const isMaskField = maskFields.some(field => lowerKey.includes(field.toLowerCase()))
    
    if (isMaskField && typeof value === 'string') {
      // Detect field type by content
      if (value.includes('@')) {
        masked[key] = maskString(value, 'email')
      } else if (/^[\d\s\+\(\)-]{8,}$/.test(value.replace(/\s/g, ''))) {
        masked[key] = maskString(value, 'phone')
      } else {
        masked[key] = maskString(value, 'default')
      }
    } else if (isMaskField && typeof value === 'object' && value !== null) {
      masked[key] = '[MASKED]'
    } else if (isObject(value) || Array.isArray(value)) {
      masked[key] = maskSensitiveData(value, maskFields)
    } else {
      masked[key] = value
    }
  }
  
  return masked
}

/**
 * Sanitize headers by redacting sensitive values
 */
export const sanitizeHeaders = (
  headers: Record<string, string>,
  sensitiveHeaders: string[] = DEFAULT_SENSITIVE_HEADERS
): Record<string, string> => {
  const sanitized: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    const isSensitive = sensitiveHeaders.some(header => 
      lowerKey.includes(header.toLowerCase())
    )
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

/**
 * Sanitize request/response body by removing and masking sensitive fields
 */
export const sanitizeBody = (
  body: any,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS,
  maskFields: string[] = DEFAULT_MASK_FIELDS
): any => {
  if (!body || typeof body !== 'object') {
    return body
  }
  
  // First remove sensitive fields completely
  let sanitized = removeSensitiveFields(body, sensitiveFields)
  
  // Then mask remaining sensitive fields
  sanitized = maskSensitiveData(sanitized, maskFields)
  
  return sanitized
}

/**
 * Remove sensitive fields from data recursively
 */
export const removeSensitiveFields = (
  data: any,
  sensitiveFields: string[]
): any => {
  if (!data || typeof data !== 'object') {
    return data
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => removeSensitiveFields(item, sensitiveFields))
  }
  
  const cleaned: Record<string, any> = {}
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()
    const isSensitive = sensitiveFields.some(field => 
      lowerKey.includes(field.toLowerCase())
    )
    
    if (isSensitive) {
      cleaned[key] = '[REMOVED]'
    } else if (isObject(value) || Array.isArray(value)) {
      cleaned[key] = removeSensitiveFields(value, sensitiveFields)
    } else {
      cleaned[key] = value
    }
  }
  
  return cleaned
}

/**
 * Get sanitization rules merging defaults with custom rules
 */
export const getSanitizationRules = (
  customRules?: Partial<SanitizationRules>
): SanitizationRules => {
  return {
    sensitiveHeaders: customRules?.sensitiveHeaders || DEFAULT_SENSITIVE_HEADERS,
    sensitiveFields: customRules?.sensitiveFields || DEFAULT_SENSITIVE_FIELDS,
    maskFields: customRules?.maskFields || DEFAULT_MASK_FIELDS,
    maskPattern: customRules?.maskPattern
  }
}