import { describe, it, expect } from 'vitest'
import {
  maskString,
  maskSensitiveData,
  sanitizeHeaders,
  sanitizeBody,
  removeSensitiveFields,
  getSanitizationRules
} from '../../../src/utils/sanitizer'

describe('sanitizer', () => {
  describe('maskString', () => {
    it('should mask email', () => {
      expect(maskString('user@example.com', 'email')).toBe('us***@example.com')
      expect(maskString('a@b.com', 'email')).toBe('***@b.com')
    })
    
    it('should mask phone number', () => {
      expect(maskString('+1234567890', 'phone')).toBe('+12***890')
      expect(maskString('12345', 'phone')).toBe('12***45')
    })
    
    it('should mask default string', () => {
      expect(maskString('secretvalue', 'default')).toBe('se***ue')
      expect(maskString('ab', 'default')).toBe('***')
    })
    
    it('should handle short strings', () => {
      expect(maskString('a', 'default')).toBe('***')
      expect(maskString('ab', 'default')).toBe('***')
    })
  })
  
  describe('maskSensitiveData', () => {
    it('should mask email fields', () => {
      const data = {
        email: 'user@example.com',
        name: 'John Doe'
      }
      
      const result = maskSensitiveData(data, ['email'])
      expect(result.email).toBe('us***@example.com')
      expect(result.name).toBe('John Doe')
    })
    
    it('should mask nested fields', () => {
      const data = {
        user: {
          email: 'user@example.com',
          phone: '+1234567890'
        }
      }
      
      const result = maskSensitiveData(data, ['email', 'phone'])
      expect(result.user.email).toBe('us***@example.com')
      expect(result.user.phone).toBe('+12***890')
    })
    
    it('should mask array items', () => {
      const data = [
        { email: 'user1@example.com' },
        { email: 'user2@example.com' }
      ]
      
      const result = maskSensitiveData(data, ['email'])
      expect(result[0].email).toBe('us***@example.com')
      expect(result[1].email).toBe('us***@example.com')
    })
    
    it('should handle non-string values', () => {
      const data = {
        email: null,
        phone: 12345
      }
      
      const result = maskSensitiveData(data, ['email', 'phone'])
      expect(result.email).toBe('[MASKED]')
      expect(result.phone).toBe('[MASKED]')
    })
  })
  
  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'authorization': 'Bearer token123',
        'content-type': 'application/json',
        'cookie': 'session=abc123'
      }
      
      const result = sanitizeHeaders(headers, ['authorization', 'cookie'])
      expect(result.authorization).toBe('[REDACTED]')
      expect(result.cookie).toBe('[REDACTED]')
      expect(result['content-type']).toBe('application/json')
    })
    
    it('should handle case-insensitive matching', () => {
      const headers = {
        'Authorization': 'Bearer token',
        'X-API-Key': 'secret-key'
      }
      
      const result = sanitizeHeaders(headers, ['authorization', 'x-api-key'])
      expect(result.Authorization).toBe('[REDACTED]')
      expect(result['X-API-Key']).toBe('[REDACTED]')
    })
  })
  
  describe('sanitizeBody', () => {
    it('should remove sensitive fields', () => {
      const body = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com'
      }
      
      const result = sanitizeBody(body, ['password'], ['email'])
      expect(result.password).toBe('[REMOVED]')
      expect(result.email).toBe('jo***@example.com')
      expect(result.username).toBe('john')
    })
    
    it('should handle nested objects', () => {
      const body = {
        user: {
          username: 'john',
          password: 'secret'
        }
      }
      
      const result = sanitizeBody(body, ['password'])
      expect(result.user.password).toBe('[REMOVED]')
      expect(result.user.username).toBe('john')
    })
    
    it('should handle arrays', () => {
      const body = {
        users: [
          { username: 'john', password: 'secret1' },
          { username: 'jane', password: 'secret2' }
        ]
      }
      
      const result = sanitizeBody(body, ['password'])
      expect(result.users[0].password).toBe('[REMOVED]')
      expect(result.users[1].password).toBe('[REMOVED]')
      expect(result.users[0].username).toBe('john')
    })
  })
  
  describe('removeSensitiveFields', () => {
    it('should remove sensitive fields', () => {
      const data = {
        name: 'John',
        password: 'secret',
        token: 'abc123'
      }
      
      const result = removeSensitiveFields(data, ['password', 'token'])
      expect(result.password).toBe('[REMOVED]')
      expect(result.token).toBe('[REMOVED]')
      expect(result.name).toBe('John')
    })
    
    it('should handle nested fields', () => {
      const data = {
        user: {
          name: 'John',
          password: 'secret'
        }
      }
      
      const result = removeSensitiveFields(data, ['password'])
      expect(result.user.password).toBe('[REMOVED]')
      expect(result.user.name).toBe('John')
    })
  })
  
  describe('getSanitizationRules', () => {
    it('should return default rules when no custom rules provided', () => {
      const rules = getSanitizationRules()
      
      expect(rules.sensitiveHeaders).toContain('authorization')
      expect(rules.sensitiveFields).toContain('password')
      expect(rules.maskFields).toContain('email')
    })
    
    it('should merge custom rules with defaults', () => {
      const rules = getSanitizationRules({
        sensitiveHeaders: ['custom-header'],
        sensitiveFields: ['custom-field']
      })
      
      expect(rules.sensitiveHeaders).toContain('custom-header')
      expect(rules.sensitiveHeaders).toContain('authorization')
      expect(rules.sensitiveFields).toContain('custom-field')
      expect(rules.sensitiveFields).toContain('password')
      expect(rules.maskFields).toContain('email')
    })
    
    it('should override defaults with custom rules', () => {
      const rules = getSanitizationRules({
        maskFields: ['custom-field']
      })
      
      expect(rules.maskFields).toEqual(['custom-field'])
    })
  })
})