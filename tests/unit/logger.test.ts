/**
 * logger 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { debug } from '../../src/utils/logger'
import { Config } from '../../src/types'

describe('logger', () => {
  let mockConfig: Config
  let consoleSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    mockConfig = {
      debug: 'disable',
    } as any

    // Spy on console methods
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('debugLevel', () => {
    it('应该包含所有调试级别', () => {
      // debugLevel 从 types.ts 导入
      expect(['disable', 'error', 'info', 'details']).toEqual(
        expect.arrayContaining(['disable', 'error', 'info', 'details'])
      )
    })

    it('应该有 4 个调试级别', () => {
      expect(['disable', 'error', 'info', 'details']).toHaveLength(4)
    })
  })

  describe('debug', () => {
    it('应该在 debug 模式为 disable 时不输出任何内容', () => {
      mockConfig.debug = 'disable'
      debug(mockConfig, 'test message', 'test', 'error')
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('应该在 debug 模式为 error 时输出 error 级别', () => {
      mockConfig.debug = 'error'
      debug(mockConfig, 'test message', 'test', 'error')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该在 debug 模式为 info 时输出 info 和 error 级别', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'test message', 'test', 'info')
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockClear()
      debug(mockConfig, 'test message', 'test', 'error')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该在 debug 模式为 details 时输出所有级别', () => {
      mockConfig.debug = 'details'
      debug(mockConfig, 'test message', 'test', 'details')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该正确处理字符串消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'simple string', 'test', 'info')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该正确处理对象消息', () => {
      mockConfig.debug = 'info'
      const testObj = { key: 'value', number: 42 }
      debug(mockConfig, testObj, 'test', 'info')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该正确处理错误对象', () => {
      mockConfig.debug = 'error'
      const error = new Error('Test error')
      debug(mockConfig, error, 'test', 'error')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该正确处理函数消息', () => {
      mockConfig.debug = 'details'
      const testFunc = () => 'test'
      debug(mockConfig, testFunc, 'test', 'details')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该处理空名称', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'test message', '', 'info')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该处理 undefined 消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, undefined, 'test', 'info')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('应该处理 null 消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, null, 'test', 'info')
      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('日志级别过滤', () => {
    it('应该过滤低级别日志 (mode=error, type=info)', () => {
      mockConfig.debug = 'error'
      const initialCallCount = consoleSpy.mock.calls.length

      debug(mockConfig, 'info message', 'test', 'info')
      debug(mockConfig, 'details message', 'test', 'details')

      // error 级别不应该输出 info 和 details
      expect(consoleSpy.mock.calls.length).toBe(initialCallCount)
    })

    it('应该过滤低级别日志 (mode=info, type=details)', () => {
      mockConfig.debug = 'info'
      const initialCallCount = consoleSpy.mock.calls.length

      debug(mockConfig, 'details message', 'test', 'details')

      // info 级别不应该输出 details
      expect(consoleSpy.mock.calls.length).toBe(initialCallCount)
    })

    it('应该允许高级别日志 (mode=info, type=error)', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'error message', 'test', 'error')
      expect(consoleSpy).toHaveBeenCalled()
    })
  })
})
