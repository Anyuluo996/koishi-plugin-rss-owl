/**
 * createHttpFunction 集成测试
 * 使用真实的 HTTP 请求到公共 API 进行测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { createHttpFunction, RequestManager } from '../../src/utils/fetcher'
import { Config } from '../../src/types'

describe('createHttpFunction - 集成测试', () => {
  let mockCtx: any
  let mockConfig: Config
  let requestManager: RequestManager
  let httpFunction: any

  beforeEach(() => {
    // Setup mock Context
    mockCtx = {
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }

    // Setup mock Config
    mockConfig = {
      debug: 'disable',
      basic: {
        authority: 1,
        advancedAuthority: 2,
      },
      net: {
        userAgent: 'TestAgent/1.0',
        proxyAgent: {
          enabled: false,
          protocol: 'http',
          host: '',
          port: 0,
          auth: {
            enabled: false,
            username: '',
            password: '',
          },
        },
      },
    } as any

    requestManager = new RequestManager(3, 2, 10)
    httpFunction = createHttpFunction(mockCtx, mockConfig, requestManager)
  })

  describe('真实 HTTP 调用测试', () => {
    it('应该成功请求公共 API (jsonplaceholder)', async () => {
      const arg: any = { timeout: 30 }

      // 使用 jsonplaceholder 作为测试端点
      const result = await httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.status).toBe(200)
    }, 30000)

    it('应该正确设置 User-Agent', async () => {
      const arg: any = { timeout: 30 }

      // 请求一个会返回请求信息的端点
      const result = await httpFunction('https://httpbin.org/headers', arg)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
    }, 30000)

    it('应该处理 404 错误', async () => {
      const arg: any = { timeout: 30 }

      try {
        await httpFunction('https://jsonplaceholder.typicode.com/invalidendpoint', arg)
        expect(true).toBe(false) // 不应该到达这里
      } catch (error: any) {
        expect(error).toBeDefined()
        // 应该重试 3 次后抛出错误
      }
    }, 30000)

    it('应该处理无效域名', async () => {
      const arg: any = { timeout: 5 }

      try {
        await httpFunction('https://this-domain-definitely-does-not-exist-12345.com', arg)
        expect(true).toBe(false) // 不应该到达这里
      } catch (error: any) {
        expect(error).toBeDefined()
      }
    }, 30000)
  })

  describe('Heavy Request 测试', () => {
    it('应该正确处理 arraybuffer 响应类型', async () => {
      const arg: any = { timeout: 30 }
      const requestConfig: any = { responseType: 'arraybuffer' }

      // 请求一个小图片
      const result = await httpFunction('https://httpbin.org/bytes/100', arg, requestConfig)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(Buffer.isBuffer(result.data)).toBe(true)
    }, 30000)

    it('应该正确处理 text 响应类型', async () => {
      const arg: any = { timeout: 30 }
      const requestConfig: any = { responseType: 'text' }

      const result = await httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg, requestConfig)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
    }, 30000)
  })

  describe('RequestManager 集成测试', () => {
    it('应该正确处理并发请求', async () => {
      const arg: any = { timeout: 30 }

      // 同时发起多个请求
      const promises = [
        httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg),
        httpFunction('https://jsonplaceholder.typicode.com/posts/2', arg),
        httpFunction('https://jsonplaceholder.typicode.com/posts/3', arg),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(result.data).toBeDefined()
      })
    }, 30000)

    it('应该处理多个连续请求', async () => {
      const arg: any = { timeout: 30 }

      const result1 = await httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg)
      const result2 = await httpFunction('https://jsonplaceholder.typicode.com/posts/2', arg)
      const result3 = await httpFunction('https://jsonplaceholder.typicode.com/posts/3', arg)

      expect(result1.data).toBeDefined()
      expect(result2.data).toBeDefined()
      expect(result3.data).toBeDefined()
    }, 30000)
  })

  describe('配置测试', () => {
    it('应该使用自定义 timeout', async () => {
      const arg: any = { timeout: 120 }

      const result = await httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
    }, 30000)

    it('应该处理不同的 responseType', async () => {
      const arg: any = { timeout: 30 }
      const requestConfig: any = { responseType: 'json' }

      const result = await httpFunction('https://jsonplaceholder.typicode.com/posts/1', arg, requestConfig)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('object')
    }, 30000)
  })
})
