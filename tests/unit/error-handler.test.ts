/**
 * error-handler 单元测试
 */

import { describe, it, expect } from '@jest/globals'
import {
  getErrorType,
  getFriendlyErrorMessage,
  createError,
  isNetworkError,
  isParseError,
  isPermissionError,
  isRetryable,
  ErrorType,
} from '../../src/utils/error-handler'

describe('error-handler', () => {
  describe('getErrorType', () => {
    it('should identify DNS not found error', () => {
      const error = { code: 'ENOTFOUND' }
      expect(getErrorType(error)).toBe(ErrorType.DNS_NOT_FOUND)
    })

    it('should identify timeout error', () => {
      const error = { code: 'ETIMEDOUT' }
      expect(getErrorType(error)).toBe(ErrorType.TIMEOUT)
    })

    it('should identify connection refused error', () => {
      const error = { code: 'ECONNREFUSED' }
      expect(getErrorType(error)).toBe(ErrorType.CONNECTION_REFUSED)
    })

    it('should identify permission denied error', () => {
      const error = { code: 'EACCES' }
      expect(getErrorType(error)).toBe(ErrorType.PERMISSION_DENIED)
    })

    it('should identify HTTP 404 error', () => {
      const error = { response: { status: 404 } }
      expect(getErrorType(error)).toBe(ErrorType.RESOURCE_NOT_FOUND)
    })

    it('should identify HTTP 401 error', () => {
      const error = { response: { status: 401 } }
      expect(getErrorType(error)).toBe(ErrorType.AUTH_FAILED)
    })

    it('should identify HTTP 403 error', () => {
      const error = { response: { status: 403 } }
      expect(getErrorType(error)).toBe(ErrorType.PERMISSION_DENIED)
    })

    it('should identify timeout from error message', () => {
      const error = { message: 'Request timeout' }
      expect(getErrorType(error)).toBe(ErrorType.TIMEOUT)
    })

    it('should identify parse error from message', () => {
      const error = { message: 'Failed to parse RSS' }
      expect(getErrorType(error)).toBe(ErrorType.PARSE_ERROR)
    })

    it('should return unknown error for unrecognized errors', () => {
      const error = { message: 'Something went wrong' }
      expect(getErrorType(error)).toBe(ErrorType.UNKNOWN_ERROR)
    })

    it('should use custom error type if provided', () => {
      const error = { errorType: ErrorType.AI_ERROR }
      expect(getErrorType(error)).toBe(ErrorType.AI_ERROR)
    })
  })

  describe('getFriendlyErrorMessage', () => {
    it('should return friendly message for DNS error', () => {
      const error = { code: 'ENOTFOUND' }
      const message = getFriendlyErrorMessage(error)
      expect(message).toContain('无法解析域名')
    })

    it('should return friendly message for timeout', () => {
      const error = { code: 'ETIMEDOUT' }
      const message = getFriendlyErrorMessage(error)
      expect(message).toContain('请求超时')
    })

    it('should add context to error message', () => {
      const error = { code: 'ENOTFOUND' }
      const message = getFriendlyErrorMessage(error, '获取RSS数据')
      expect(message).toContain('获取RSS数据')
    })

    it('should include original error in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const error = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND example.com' }
      const message = getFriendlyErrorMessage(error)
      expect(message).toContain('getaddrinfo ENOTFOUND example.com')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('createError', () => {
    it('should create error with custom type', () => {
      const error = createError('Custom error message', ErrorType.AI_ERROR)
      expect(error.message).toBe('Custom error message')
      expect((error as any).errorType).toBe(ErrorType.AI_ERROR)
    })
  })

  describe('isNetworkError', () => {
    it('should return true for network errors', () => {
      expect(isNetworkError({ code: 'ENOTFOUND' })).toBe(true)
      expect(isNetworkError({ code: 'ETIMEDOUT' })).toBe(true)
      expect(isNetworkError({ code: 'ECONNREFUSED' })).toBe(true)
    })

    it('should return false for non-network errors', () => {
      expect(isNetworkError({ code: 'EACCES' })).toBe(false)
      expect(isNetworkError({ message: 'Parse error' })).toBe(false)
    })
  })

  describe('isParseError', () => {
    it('should return true for parse errors', () => {
      const error1 = { message: 'Failed to parse RSS' }
      expect(isParseError(error1)).toBe(true)

      const error2 = { message: 'HTML parse failed' }
      expect(isParseError(error2)).toBe(true)
    })

    it('should return false for non-parse errors', () => {
      const error = { code: 'ENOTFOUND' }
      expect(isParseError(error)).toBe(false)
    })
  })

  describe('isPermissionError', () => {
    it('should return true for permission errors', () => {
      expect(isPermissionError({ code: 'EACCES' })).toBe(true)
      expect(isPermissionError({ response: { status: 403 } })).toBe(true)
      expect(isPermissionError({ response: { status: 401 } })).toBe(true)
    })

    it('should return false for non-permission errors', () => {
      expect(isPermissionError({ code: 'ENOTFOUND' })).toBe(false)
    })
  })

  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      expect(isRetryable({ code: 'ENOTFOUND' })).toBe(true)
      expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true)
    })

    it('should return true for resource timeout', () => {
      const error = { response: { status: 429 } }
      expect(isRetryable(error)).toBe(true)
    })

    it('should return false for parse errors', () => {
      const error = { message: 'Parse error' }
      expect(isRetryable(error)).toBe(false)
    })

    it('should return false for permission errors', () => {
      expect(isRetryable({ code: 'EACCES' })).toBe(false)
    })
  })
})
