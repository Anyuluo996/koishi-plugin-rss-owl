/**
 * common 工具函数单元测试
 */

import { describe, it, expect } from '@jest/globals'
import { parsePubDate, ensureUrlProtocol } from '../../src/utils/common'

// Mock config
const mockConfig = {} as any

describe('common utilities', () => {
  describe('parsePubDate', () => {
    it('should parse valid ISO date string', () => {
      const dateStr = '2024-01-15T10:30:00Z'
      const result = parsePubDate(mockConfig, dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBeGreaterThan(0)
      expect(result.toISOString()).toContain('2024-01-15')
    })

    it('should parse RFC 2822 date string', () => {
      const dateStr = 'Mon, 15 Jan 2024 10:30:00 GMT'
      const result = parsePubDate(mockConfig, dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getFullYear()).toBe(2024)
    })

    it('should return epoch date for empty input', () => {
      const result = parsePubDate(mockConfig, '')
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(0)
    })

    it('should return epoch date for null input', () => {
      const result = parsePubDate(mockConfig, null)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(0)
    })

    it('should return epoch date for undefined input', () => {
      const result = parsePubDate(mockConfig, undefined)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(0)
    })

    it('should return epoch date for invalid date string', () => {
      const result = parsePubDate(mockConfig, 'invalid-date')
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(0)
    })

    it('should parse timestamp number', () => {
      const timestamp = 1705309200000 // 2024-01-15 10:30:00 GMT
      const result = parsePubDate(mockConfig, timestamp)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(timestamp)
    })
  })

  describe('ensureUrlProtocol', () => {
    it('should add https:// to URL without protocol', () => {
      expect(ensureUrlProtocol('example.com')).toBe('https://example.com')
      expect(ensureUrlProtocol('www.example.com')).toBe('https://www.example.com')
    })

    it('should preserve existing http:// protocol', () => {
      expect(ensureUrlProtocol('http://example.com')).toBe('http://example.com')
    })

    it('should preserve existing https:// protocol', () => {
      expect(ensureUrlProtocol('https://example.com')).toBe('https://example.com')
    })

    it('should handle case-insensitive protocol', () => {
      expect(ensureUrlProtocol('HTTP://example.com')).toBe('HTTP://example.com')
      expect(ensureUrlProtocol('HTTPS://example.com')).toBe('HTTPS://example.com')
    })

    it('should trim whitespace', () => {
      expect(ensureUrlProtocol('  example.com  ')).toBe('https://example.com')
    })

    it('should handle URL with path', () => {
      expect(ensureUrlProtocol('example.com/path/to/resource')).toBe('https://example.com/path/to/resource')
    })

    it('should handle URL with query parameters', () => {
      expect(ensureUrlProtocol('example.com?query=value')).toBe('https://example.com?query=value')
    })

    it('should handle URL with port', () => {
      expect(ensureUrlProtocol('example.com:8080')).toBe('https://example.com:8080')
    })

    it('should return empty string for empty input', () => {
      expect(ensureUrlProtocol('')).toBe('')
    })

    it('should return empty string for null input', () => {
      expect(ensureUrlProtocol(null as any)).toBe('')
    })

    it('should take only first part if multiple space-separated values', () => {
      expect(ensureUrlProtocol('example.com another.com')).toBe('https://example.com')
    })

    it('should preserve full URL with protocol', () => {
      const url = 'https://example.com/path?query=value#fragment'
      expect(ensureUrlProtocol(url)).toBe(url)
    })
  })
})
