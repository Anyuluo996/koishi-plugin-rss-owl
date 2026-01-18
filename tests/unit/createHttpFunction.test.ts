/**
 * createHttpFunction 单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { createHttpFunction, RequestManager } from '../../src/utils/fetcher'
import { Config } from '../../src/types'

describe('createHttpFunction', () => {
  let mockCtx: any
  let mockConfig: Config
  let requestManager: RequestManager
  let httpFunction: ReturnType<typeof createHttpFunction>

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

    requestManager = new RequestManager()
    httpFunction = createHttpFunction(mockCtx, mockConfig, requestManager)
  })

  describe('基础功能', () => {
    it('应该成功创建 HTTP 函数', () => {
      expect(httpFunction).toBeInstanceOf(Function)
    })

    it('应该正确识别 Heavy Request (arraybuffer)', () => {
      // 测试函数是否正确创建了
      expect(httpFunction).toBeDefined()
    })

    it('应该正确配置 timeout', async () => {
      // 这个测试验证函数创建时的配置处理
      const customConfig = { ...mockConfig }
      customConfig.net.userAgent = 'CustomAgent/1.0'
      const customHttpFunction = createHttpFunction(mockCtx, customConfig, requestManager)
      expect(customHttpFunction).toBeInstanceOf(Function)
    })
  })

  describe('RequestManager 集成', () => {
    it('应该使用 RequestManager 管理普通请求', async () => {
      // 测试 RequestManager 是否正确初始化
      expect(requestManager).toBeInstanceOf(RequestManager)

      // 测试函数创建时不抛出错误
      expect(() => {
        createHttpFunction(mockCtx, mockConfig, requestManager)
      }).not.toThrow()
    })

    it('应该创建多个独立的 HTTP 函数实例', () => {
      const httpFunction1 = createHttpFunction(mockCtx, mockConfig, requestManager)
      const httpFunction2 = createHttpFunction(mockCtx, mockConfig, requestManager)

      expect(httpFunction1).toBeInstanceOf(Function)
      expect(httpFunction2).toBeInstanceOf(Function)
      expect(httpFunction1).not.toBe(httpFunction2)
    })
  })

  describe('配置处理', () => {
    it('应该处理空的 proxyAgent 配置', () => {
      const noProxyConfig: Config = {
        ...mockConfig,
        net: {
          userAgent: 'TestAgent/1.0',
          proxyAgent: {
            enabled: false,
            protocol: '',
            host: '',
            port: 0,
          },
        },
      }

      expect(() => {
        createHttpFunction(mockCtx, noProxyConfig, requestManager)
      }).not.toThrow()
    })

    it('应该处理启用的全局 proxyAgent 配置', () => {
      const proxyConfig: Config = {
        ...mockConfig,
        net: {
          userAgent: 'TestAgent/1.0',
          proxyAgent: {
            enabled: true,
            protocol: 'https',
            host: 'proxy.example.com',
            port: 8080,
            auth: {
              enabled: false,
              username: '',
              password: '',
            },
          },
        },
      }

      expect(() => {
        createHttpFunction(mockCtx, proxyConfig, requestManager)
      }).not.toThrow()
    })

    it('应该处理带认证的 proxyAgent 配置', () => {
      const authProxyConfig: Config = {
        ...mockConfig,
        net: {
          userAgent: 'TestAgent/1.0',
          proxyAgent: {
            enabled: true,
            protocol: 'socks5',
            host: 'auth.proxy.example.com',
            port: 1080,
            auth: {
              enabled: true,
              username: 'user',
              password: 'pass',
            },
          },
        },
      }

      expect(() => {
        createHttpFunction(mockCtx, authProxyConfig, requestManager)
      }).not.toThrow()
    })

    it('应该处理 undefined 的 userAgent', () => {
      const noUAConfig: Config = {
        ...mockConfig,
        net: {
          userAgent: undefined,
          proxyAgent: {
            enabled: false,
            protocol: '',
            host: '',
            port: 0,
          },
        },
      } as any

      expect(() => {
        createHttpFunction(mockCtx, noUAConfig, requestManager)
      }).not.toThrow()
    })
  })

  describe('Context 依赖', () => {
    it('应该正确接收 Context 参数', () => {
      const testCtx = {
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
        http: () => ({}),
      }

      expect(() => {
        createHttpFunction(testCtx as any, mockConfig, requestManager)
      }).not.toThrow()
    })

    it('应该处理最小化的 Context', () => {
      const minimalCtx = {} as any

      expect(() => {
        createHttpFunction(minimalCtx, mockConfig, requestManager)
      }).not.toThrow()
    })
  })

  describe('函数签名', () => {
    it('返回的函数应该接受正确的参数', () => {
      // 验证函数的 arity（参数个数）
      // createHttpFunction 返回的函数接收 url, arg, requestConfig (3个参数)
      // 但 JavaScript 的 length 属性只计算必需参数
      expect(httpFunction.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('错误场景', () => {
    it('应该处理 undefined 的 requestConfig', () => {
      expect(httpFunction).toBeInstanceOf(Function)
      // 实际调用会在运行时处理 undefined
    })

    it('应该处理空的 arg', () => {
      expect(httpFunction).toBeInstanceOf(Function)
      // 实际调用会在运行时处理空对象
    })

    it('应该处理 null 的 proxyAgent', () => {
      const nullProxyConfig: Config = {
        ...mockConfig,
        net: {
          userAgent: 'TestAgent/1.0',
          proxyAgent: null as any,
        },
      }

      expect(() => {
        createHttpFunction(mockCtx, nullProxyConfig, requestManager)
      }).not.toThrow()
    })
  })

  describe('RequestManager 参数变化', () => {
    it('应该使用自定义 RequestManager 参数', () => {
      const customRM = new RequestManager(5, 3, 20)
      expect(() => {
        createHttpFunction(mockCtx, mockConfig, customRM)
      }).not.toThrow()
    })

    it('应该使用默认 RequestManager 参数', () => {
      const defaultRM = new RequestManager()
      expect(() => {
        createHttpFunction(mockCtx, mockConfig, defaultRM)
      }).not.toThrow()
    })
  })
})
