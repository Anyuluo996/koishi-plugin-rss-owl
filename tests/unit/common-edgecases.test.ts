/**
 * common.ts 边界情况测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { parsePubDate, ensureUrlProtocol } from '../../src/utils/common'
import { Config } from '../../src/types'

describe('common.ts - 边界情况', () => {
  describe('parsePubDate error handling (lines 19-20)', () => {
    let mockConfig: Config

    beforeEach(() => {
      mockConfig = {
        debug: 'disable',
        basic: {
          authority: 1,
          advancedAuthority: 2,
        },
        net: {
          userAgent: 'TestAgent',
          proxyAgent: {
            enabled: false,
            protocol: '',
            host: '',
            port: 0,
          },
        },
      } as any
    })

    it('应该处理无效日期字符串', () => {
      const result = parsePubDate(mockConfig, 'invalid date')
      expect(result).toEqual(new Date(0))
    })

    it('应该处理空字符串日期', () => {
      const result = parsePubDate(mockConfig, '')
      expect(result).toEqual(new Date(0))
    })

    it('应该处理 null 输入', () => {
      const result = parsePubDate(mockConfig, null)
      expect(result).toEqual(new Date(0))
    })

    it('应该处理 undefined 输入', () => {
      const result = parsePubDate(mockConfig, undefined)
      expect(result).toEqual(new Date(0))
    })

    it('应该处理包含特殊字符的无效日期', () => {
      const result = parsePubDate(mockConfig, 'not-a-date!!!')
      expect(result).toEqual(new Date(0))
    })

    it('应该处理格式错误的日期字符串', () => {
      const result = parsePubDate(mockConfig, '2024-13-45') // 无效的月份和日期
      expect(result).toEqual(new Date(0))
    })
  })

  describe('ensureUrlProtocol edge cases', () => {
    it('应该处理包含多个空格的 URL', () => {
      const result = ensureUrlProtocol('example.com/path   with   spaces')
      expect(result).toBe('https://example.com/path')
    })

    it('应该处理只有空格的输入', () => {
      const result = ensureUrlProtocol('   ')
      expect(result).toBe('https://')
    })

    it('应该处理空字符串', () => {
      const result = ensureUrlProtocol('')
      expect(result).toBe('')
    })

    it('应该处理已有 HTTPS 协议的 URL', () => {
      const result = ensureUrlProtocol('https://example.com')
      expect(result).toBe('https://example.com')
    })

    it('应该处理已有 HTTP 协议的 URL', () => {
      const result = ensureUrlProtocol('http://example.com')
      expect(result).toBe('http://example.com')
    })

    it('应该处理混合大小写的 HTTP 协议', () => {
      const result = ensureUrlProtocol('HTTP://example.com')
      expect(result).toBe('HTTP://example.com')
    })

    it('应该处理混合大小写的 HTTPS 协议', () => {
      const result = ensureUrlProtocol('HTTPS://example.com')
      expect(result).toBe('HTTPS://example.com')
    })

    it('应该处理带路径的 URL', () => {
      const result = ensureUrlProtocol('example.com/path/to/resource')
      expect(result).toBe('https://example.com/path/to/resource')
    })

    it('应该处理带查询参数的 URL', () => {
      const result = ensureUrlProtocol('example.com?query=value')
      expect(result).toBe('https://example.com?query=value')
    })

    it('应该处理带片段的 URL', () => {
      const result = ensureUrlProtocol('example.com#section')
      expect(result).toBe('https://example.com#section')
    })

    it('应该处理带端口号的 URL', () => {
      const result = ensureUrlProtocol('example.com:8080')
      expect(result).toBe('https://example.com:8080')
    })

    it('应该处理包含换行符的 URL', () => {
      const result = ensureUrlProtocol('example.com\nextra')
      expect(result).toBe('https://example.com')
    })

    it('应该处理包含制表符的 URL', () => {
      const result = ensureUrlProtocol('example.com\tpath')
      expect(result).toBe('https://example.com')
    })
  })

  describe('parsePubDate with valid dates', () => {
    let mockConfig: Config

    beforeEach(() => {
      mockConfig = {
        debug: 'disable',
        basic: {
          authority: 1,
          advancedAuthority: 2,
        },
        net: {
          userAgent: 'TestAgent',
          proxyAgent: {
            enabled: false,
            protocol: '',
            host: '',
            port: 0,
          },
        },
      } as any
    })

    it('应该解析 ISO 8601 格式日期', () => {
      const dateStr = '2024-01-15T10:30:00Z'
      const result = parsePubDate(mockConfig, dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).not.toBeNaN()
    })

    it('应该解析 RFC 2822 格式日期', () => {
      const dateStr = 'Wed, 15 Jan 2024 10:30:00 GMT'
      const result = parsePubDate(mockConfig, dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).not.toBeNaN()
    })

    it('应该解析简单日期格式', () => {
      const dateStr = '2024-01-15'
      const result = parsePubDate(mockConfig, dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).not.toBeNaN()
    })

    it('应该解析时间戳', () => {
      const timestamp = 1705317000000
      const result = parsePubDate(mockConfig, timestamp)
      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(timestamp)
    })
  })
})
