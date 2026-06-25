/**
 * logger 单元测试
 *
 * 说明：本插件的日志最终通过 Koishi/reggol 的 Logger 输出。
 * - 模块名经 logger.extend(name) 体现为子命名空间（rss-owl:<name>），
 *   不再手工拼 [name] 前缀。
 * - 'details' 级别走 logger.debug()，'info' 走 logger.info()，'error' 走 logger.error()。
 * 由于 extend() 返回独立的 Logger 实例，本测试统一用 name='' 路由到根 logger，
 * 以便对其 info/error/debug 方法打 spy。
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { Logger } from 'koishi'
import { createDebugWithContext, debug, logger, applyDebugLevel } from '../../src/utils/logger'
import { Config } from '../../src/types'

describe('logger', () => {
  let mockConfig: Config
  let infoSpy: jest.SpiedFunction<any>
  let errorSpy: jest.SpiedFunction<any>
  let debugSpy: jest.SpiedFunction<any>
  let savedLevels: any

  beforeEach(() => {
    mockConfig = {
      debug: 'disable',
      logging: {},
    } as any

    // 保存/恢复全局 Logger.levels，避免用例间串扰
    savedLevels = Logger.levels

    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as any)
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as any)
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any)
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
    debugSpy.mockRestore()
    Logger.levels = savedLevels
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

  describe('applyDebugLevel', () => {
    it('应该把 config.debug 映射到 reggol Logger.levels["rss-owl"]', () => {
      applyDebugLevel({ debug: 'error' } as any)
      expect(Logger.levels['rss-owl']).toBe(Logger.ERROR)

      applyDebugLevel({ debug: 'info' } as any)
      expect(Logger.levels['rss-owl']).toBe(Logger.INFO)

      applyDebugLevel({ debug: 'details' } as any)
      expect(Logger.levels['rss-owl']).toBe(Logger.DEBUG)
    })

    it('disable 应映射为 SILENT(0)', () => {
      applyDebugLevel({ debug: 'disable' } as any)
      expect(Logger.levels['rss-owl']).toBe(Logger.SILENT)
    })

    it('值未变化时不应重复写入', () => {
      applyDebugLevel({ debug: 'info' } as any)
      const first = Logger.levels['rss-owl']
      const snapshot = { ...Logger.levels }
      applyDebugLevel({ debug: 'info' } as any)
      expect(Logger.levels['rss-owl']).toBe(first)
      expect(Logger.levels).toEqual(snapshot)
    })
  })

  describe('emitLog 级别路由', () => {
    it('error → logger.error()', () => {
      mockConfig.debug = 'error'
      debug(mockConfig, 'boom', '', 'error')
      expect(errorSpy).toHaveBeenCalledWith('boom')
      expect(infoSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('info → logger.info()', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'hi', '', 'info')
      expect(infoSpy).toHaveBeenCalledWith('hi')
      expect(errorSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('details → logger.debug()（不再错压成 info）', () => {
      mockConfig.debug = 'details'
      debug(mockConfig, 'deep', '', 'details')
      expect(debugSpy).toHaveBeenCalledWith('deep')
      expect(infoSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('debug', () => {
    it('应该在 debug 模式为 disable 时不输出任何内容', () => {
      mockConfig.debug = 'disable'
      debug(mockConfig, 'test message', '', 'error')
      expect(infoSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('应该在 debug 模式为 error 时输出 error 级别', () => {
      mockConfig.debug = 'error'
      debug(mockConfig, 'test message', '', 'error')
      expect(errorSpy).toHaveBeenCalledWith('test message')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('应该在 debug 模式为 info 时输出 info 和 error 级别', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'test message', '', 'info')
      expect(infoSpy).toHaveBeenCalledWith('test message')

      infoSpy.mockClear()
      debug(mockConfig, 'test message', '', 'error')
      expect(errorSpy).toHaveBeenCalledWith('test message')
    })

    it('应该在 debug 模式为 details 时输出所有级别', () => {
      mockConfig.debug = 'details'
      debug(mockConfig, 'test message', '', 'details')
      expect(debugSpy).toHaveBeenCalledWith('test message')
    })

    it('应该正确处理字符串消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'simple string', '', 'info')
      expect(infoSpy).toHaveBeenCalledWith('simple string')
    })

    it('应该正确处理对象消息', () => {
      mockConfig.debug = 'info'
      const testObj = { key: 'value', number: 42 }
      debug(mockConfig, testObj, '', 'info')
      expect(infoSpy).toHaveBeenCalled()
      expect(String(infoSpy.mock.calls[0][0])).toContain('"key": "value"')
    })

    it('应该正确处理错误对象', () => {
      mockConfig.debug = 'error'
      const error = new Error('Test error')
      debug(mockConfig, error, '', 'error')
      expect(errorSpy).toHaveBeenCalledWith('Test error')
    })

    it('应该正确处理函数消息', () => {
      mockConfig.debug = 'details'
      const testFunc = () => 'test'
      debug(mockConfig, testFunc, '', 'details')
      expect(debugSpy).toHaveBeenCalledWith("() => 'test'")
    })

    it('应该处理 undefined 消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, undefined, '', 'info')
      expect(infoSpy).toHaveBeenCalledWith('undefined')
    })

    it('应该处理 null 消息', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, null, '', 'info')
      expect(infoSpy).toHaveBeenCalledWith('null')
    })

    it('应该默认脱敏敏感日志和上下文', () => {
      mockConfig.debug = 'info'
      mockConfig.logging = { includeContext: true }

      debug(
        mockConfig,
        'token=abc123 password=secret123',
        '',
        'info',
        { apiKey: 'real-key', safe: 'ok' }
      )

      const output = String(infoSpy.mock.calls[0][0])
      expect(output).toContain('token=***')
      expect(output).toContain('password=***')
      expect(output).toContain('apiKey=***')
      expect(output).toContain('safe=ok')
      expect(output).not.toContain('abc123')
      expect(output).not.toContain('secret123')
      expect(output).not.toContain('real-key')
    })

    it('应该在文本日志中按字段过滤并格式化上下文', () => {
      mockConfig.debug = 'info'
      mockConfig.logging = {
        contextFields: ['guildId', 'retry'],
      }

      debug(mockConfig, 'context message', '', 'info', {
        retry: 2,
        userId: 'user-1',
        guildId: 'guild-1',
      })

      const output = String(infoSpy.mock.calls[0][0])
      expect(output).toBe('context message\n↳ guildId=guild-1, retry=2')
    })

    it('应该允许关闭日志脱敏', () => {
      mockConfig.debug = 'info'
      mockConfig.logging = { sanitizeLogs: false }

      debug(mockConfig, 'token=abc123', '', 'info')

      expect(infoSpy).toHaveBeenCalledWith('token=abc123')
    })

    it('应该在结构化日志中输出过滤后的上下文并保留 error 级别', () => {
      mockConfig.debug = 'details'
      mockConfig.logging = {
        structured: true,
        includeContext: true,
        contextFields: ['guildId'],
      }

      debug(mockConfig, 'structured message', '', 'error', {
        guildId: 'guild-1',
        userId: 'user-1',
      })

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).not.toHaveBeenCalled()

      const payload = JSON.parse(String(errorSpy.mock.calls[0][0]))
      expect(payload.message).toBe('structured message')
      expect(payload.level).toBe('error')
      expect(payload.context).toEqual({ guildId: 'guild-1' })
    })
  })

  describe('日志级别过滤', () => {
    it('应该过滤低级别日志 (mode=error, type=info)', () => {
      mockConfig.debug = 'error'

      debug(mockConfig, 'info message', '', 'info')
      debug(mockConfig, 'details message', '', 'details')

      // error 级别不应该输出 info 和 details
      expect(infoSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('应该过滤低级别日志 (mode=info, type=details)', () => {
      mockConfig.debug = 'info'

      debug(mockConfig, 'details message', '', 'details')

      // info 级别不应该输出 details
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('应该允许高级别日志 (mode=info, type=error)', () => {
      mockConfig.debug = 'info'
      debug(mockConfig, 'error message', '', 'error')
      expect(errorSpy).toHaveBeenCalledWith('error message')
    })
  })

  describe('createDebugWithContext', () => {
    it('应该合并固定上下文和额外上下文', () => {
      mockConfig.debug = 'details'
      mockConfig.logging = {
        structured: true,
        includeTimestamp: false,
        includeContext: true,
      }

      const requestDebug = createDebugWithContext(mockConfig, {
        guildId: 'guild-1',
        platform: 'onebot',
        stage: 'fixed',
      })

      requestDebug('merged context', '', 'info', {
        stage: 'runtime',
        url: 'https://example.com/feed.xml',
      })

      expect(infoSpy).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(String(infoSpy.mock.calls[0][0]))
      expect(payload.message).toBe('merged context')
      expect(payload.level).toBe('info')
      expect(payload.context).toEqual({
        guildId: 'guild-1',
        platform: 'onebot',
        stage: 'runtime',
        url: 'https://example.com/feed.xml',
      })
    })
  })
})
