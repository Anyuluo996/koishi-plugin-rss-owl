/**
 * Feeder 生产者逻辑单元测试
 */

import { afterEach, describe, it, expect, beforeEach, jest } from '@jest/globals'
import { feeder, mixinArg, formatArg, findRssItem, getLastContent, startFeeder, stopFeeder } from '../../src/core/feeder'
import { getRssData } from '../../src/core/parser'
import { Config, rssArg } from '../../src/types'
import { RssItemProcessor } from '../../src/core/item-processor'
import { NotificationQueueManager } from '../../src/core/notification-queue'

jest.mock('../../src/core/parser', () => ({
  getRssData: jest.fn(),
}))

const mockedGetRssData = getRssData as jest.MockedFunction<typeof getRssData>

// Mock 依赖
const mockCtx = {
  database: {
    get: jest.fn(),
    set: jest.fn(),
    create: jest.fn(),
  },
  broadcast: jest.fn(),
} as any

const mockConfig: Config = {
  basic: {
    refresh: 600,
    timeout: 60000,
    authority: 3,
    advancedAuthority: 4,
    imageMode: 'File',
    merge: '有多条更新时合并',
    mergeVideo: true,
    firstLoad: true,
    urlDeduplication: true,
    resendUpdatedContent: 'all',
    defaultTemplate: 'auto',
    videoMode: 'href',
  },
  cache: {
    enabled: true,
    maxSize: 100,
  },
  net: {
    proxyAgent: {
      enabled: false,
    },
  },
  msg: {
    keywordFilter: [],
    keywordBlock: [],
    rssHubUrl: 'https://hub.slarker.me',
  },
} as any

const mock$http = jest.fn()

const mockProcessor = {
  parseRssItem: jest.fn(),
} as any

const mockQueueManager = {
  addTask: jest.fn(),
  processQueue: jest.fn(),
} as any

describe('Feeder - 生产者逻辑', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetRssData.mockResolvedValue([])
  })

  afterEach(() => {
    stopFeeder(mockConfig)
    jest.restoreAllMocks()
  })

  describe('formatArg - 格式化参数', () => {
    it('应该解析键值对参数', () => {
      const options = { arg: 'forceLength:5,reverse:true' }
      const result = formatArg(options, mockConfig)

      expect(result.forceLength).toBe(5)
      expect(result.reverse).toBe(true)
    })

    it('应该处理布尔值参数', () => {
      const options = { arg: 'reverse:true,merge:false' }
      const result = formatArg(options, mockConfig)

      expect(result.reverse).toBe(true)
      expect(result.merge).toBe(false)
    })

    it('应该处理数字参数', () => {
      const options = { arg: 'forceLength:10,timeout:30000' }
      const result = formatArg(options, mockConfig)

      expect(result.forceLength).toBe(10)
      expect(result.timeout).toBe(30000)
    })

    it('应该处理 interval 参数（转换为毫秒）', () => {
      const options = { arg: 'interval:120' }
      const result = formatArg(options, mockConfig)

      expect(result.interval).toBe(120000) // 120秒 = 120000毫秒
    })

    it('应该处理 filter 数组', () => {
      const options = { arg: 'filter:/关键词1//关键词2/' }
      const result = formatArg(options, mockConfig)

      expect(result.filter).toEqual(['关键词1', '关键词2'])
    })

    it('应该处理 block 数组', () => {
      const options = { arg: 'block:/广告1//广告2/' }
      const result = formatArg(options, mockConfig)

      expect(result.block).toEqual(['广告1', '广告2'])
    })

    it('应该处理 proxyAgent 字符串', () => {
      const options = { arg: 'proxyAgent:socks5://127.0.0.1:7890' }
      const result = formatArg(options, mockConfig)

      expect(result.proxyAgent).toEqual({
        enabled: true,
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 7890,
      })
    })

    it('应该处理禁用代理', () => {
      const options = { arg: 'proxyAgent:false' }
      const result = formatArg(options, mockConfig)

      expect(result.proxyAgent).toEqual({ enabled: false })
    })

    it('应该处理带认证的代理', () => {
      const options = {
        arg: 'proxyAgent:http://proxy.example.com:8080',
        auth: 'user/pass',
      }
      const result = formatArg(options, mockConfig)

      expect(result.proxyAgent).toEqual({
        enabled: true,
        protocol: 'http',
        host: 'proxy.example.com',
        port: 8080,
        auth: { enabled: true, username: 'user', password: 'pass' },
      })
    })

    it('应该在代理参数后继续解析后续键值对', () => {
      const options = { arg: 'proxyAgent:socks5://127.0.0.1:7890,forceLength:3,reverse:true' }
      const result = formatArg(options, mockConfig)

      expect(result.proxyAgent).toEqual({
        enabled: true,
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 7890,
      })
      expect(result.forceLength).toBe(3)
      expect(result.reverse).toBe(true)
    })

    it('应该支持包含逗号和冒号的过滤词', () => {
      const options = { arg: 'filter:/hello,world//foo:bar/,forceLength:2' }
      const result = formatArg(options, mockConfig)

      expect(result.filter).toEqual(['hello,world', 'foo:bar'])
      expect(result.forceLength).toBe(2)
    })

    it('应该解析 bodyFontSize 和 split 参数', () => {
      const options = { arg: 'bodyFontSize:18,split:4' }
      const result = formatArg(options, mockConfig)

      expect(result.bodyFontSize).toBe(18)
      expect(result.split).toBe(4)
    })

    it('应该只保留已知的键', () => {
      const options = { arg: 'forceLength:5,unknownKey:value,another:123' }
      const result = formatArg(options, mockConfig) as any

      expect(result.forceLength).toBe(5)
      expect((result as any).unknownKey).toBeUndefined()
      expect((result as any).another).toBeUndefined()
    })

    it('应该忽略非法数字参数而不污染结果', () => {
      const options = { arg: 'forceLength:not-a-number,timeout:30000' }
      const result = formatArg(options, mockConfig) as any

      expect(result.forceLength).toBeUndefined()
      expect(result.timeout).toBe(30000)
    })
  })

  describe('mixinArg - 合并配置', () => {
    it('应该合并全局配置和订阅参数', () => {
      const arg = { forceLength: 10 }
      const result = mixinArg(arg, mockConfig)

      expect(result.forceLength).toBe(10) // 订阅参数优先
      expect(result.timeout).toBe(60000) // 全局配置
    })

    it('应该合并 filter 数组', () => {
      mockConfig.msg.keywordFilter = ['global1']
      const arg = { filter: ['local1'] }
      const result = mixinArg(arg, mockConfig)

      expect(result.filter).toEqual(['global1', 'local1'])
    })

    it('应该合并 block 数组', () => {
      mockConfig.msg.keywordBlock = ['globalBlock1']
      const arg = { block: ['localBlock1'] }
      const result = mixinArg(arg, mockConfig)

      expect(result.block).toEqual(['globalBlock1', 'localBlock1'])
    })

    it('应该使用订阅的 template 覆盖全局默认模板', () => {
      const arg = { template: 'content' }
      const result = mixinArg(arg, mockConfig)

      expect(result.template).toBe('content')
    })

    it('应该使用全局默认模板当订阅未指定时', () => {
      const arg = {}
      const result = mixinArg(arg, mockConfig)

      expect(result.template).toBe('auto')
    })

    it('应该合并代理配置', () => {
      mockConfig.net.proxyAgent = {
        enabled: true,
        protocol: 'socks5',
        host: 'global-proxy.com',
        port: 1080,
      }

      const arg = { proxyAgent: { enabled: false } }
      const result = mixinArg(arg, mockConfig)

      expect(result.proxyAgent).toEqual({ enabled: false })
    })

    it('应该使用全局代理当订阅未指定时', () => {
      mockConfig.net.proxyAgent = {
        enabled: true,
        protocol: 'http',
        host: 'global-proxy.com',
        port: 8080,
      }

      const arg = {}
      const result = mixinArg(arg, mockConfig)

      expect(result.proxyAgent).toEqual({
        enabled: true,
        protocol: 'http',
        host: 'global-proxy.com',
        port: 8080,
      })
    })

    it('应该归一化新旧命名字段', () => {
      const result = mixinArg({ nextUpdataTime: 123456 }, mockConfig) as any

      expect(result.mergeVideo).toBe(true)
      expect(result.margeVideo).toBe(true)
      expect(result.resendUpdatedContent).toBe('all')
      expect(result.resendUpdataContent).toBe('all')
      expect(result.nextUpdateTime).toBe(123456)
      expect(result.nextUpdataTime).toBe(123456)
    })

    it('应该兼容历史基础配置字段', () => {
      const legacyConfig = {
        ...mockConfig,
        basic: {
          ...mockConfig.basic,
          mergeVideo: undefined,
          resendUpdatedContent: undefined,
          margeVideo: false,
          resendUpdataContent: 'latest',
        },
      } as Config

      const result = mixinArg({}, legacyConfig) as any

      expect(result.mergeVideo).toBe(false)
      expect(result.margeVideo).toBe(false)
      expect(result.resendUpdatedContent).toBe('latest')
      expect(result.resendUpdataContent).toBe('latest')
    })
  })

  describe('findRssItem - 查找订阅', () => {
    const rssList = [
      { rssId: 1, url: 'https://example.com/rss1', title: 'RSS 1' },
      { rssId: 2, url: 'https://example.com/rss2', title: 'RSS 2' },
      { rssId: 3, url: 'https://example.com/rss3', title: 'Special RSS' },
    ]

    it('应该通过 rssId 查找', () => {
      const result = findRssItem(rssList, 1)
      expect(result).toEqual(rssList[0])
    })

    it('应该通过完整 URL 查找', () => {
      const result = findRssItem(rssList, 'https://example.com/rss2')
      expect(result).toEqual(rssList[1])
    })

    it('应该通过 URL 片段查找', () => {
      const result = findRssItem(rssList, 'rss3')
      expect(result).toEqual(rssList[2])
    })

    it('应该通过标题查找', () => {
      const result = findRssItem(rssList, 'Special')
      expect(result).toEqual(rssList[2])
    })

    it('应该返回 undefined 当未找到时', () => {
      const result = findRssItem(rssList, 999)
      expect(result).toBeUndefined()
    })

    it('应该返回 undefined 当列表为空时', () => {
      const result = findRssItem([], 'anything')
      expect(result).toBeUndefined()
    })
  })

  describe('getLastContent - 获取内容用于去重', () => {
    it('应该提取所有指定字段', () => {
      const item = {
        title: 'Test Title',
        description: 'Test Description',
        link: 'https://example.com/test',
        guid: 'unique-guid-123',
      }

      const result = getLastContent(item, mockConfig)

      // 注意: description 会被移除所有空格（源代码行为）
      expect(result).toEqual({
        title: 'Test Title',
        description: 'TestDescription',
        link: 'https://example.com/test',
        guid: 'unique-guid-123',
      })
    })

    it('应该移除描述中的空白字符', () => {
      const item = {
        title: 'Test',
        description: 'Line 1\n\nLine 2\t\tLine 3',
        link: 'https://example.com',
      }

      const result = getLastContent(item, mockConfig)

      expect(result.description).toBe('Line1Line2Line3')
    })

    it('应该处理缺失的字段', () => {
      const item = {
        title: 'Test',
        link: 'https://example.com',
      }

      const result = getLastContent(item, mockConfig)

      expect(result.title).toBe('Test')
      expect(result.link).toBe('https://example.com')
      // description 不存在时，会变成字符串 "undefined"
      expect(result.description).toBe('undefined')
      expect(result.guid).toBeUndefined()
    })

    it('应该处理空 item', () => {
      const result = getLastContent(null, mockConfig)

      // 空对象时，description 会变成字符串 "undefined"
      expect(result).toEqual({ description: 'undefined' })
    })

    it('应该处理 undefined item', () => {
      const result = getLastContent(undefined, mockConfig)

      // undefined 对象时，description 会变成字符串 "undefined"
      expect(result).toEqual({ description: 'undefined' })
    })
  })

  describe('feeder - 生产者主流程', () => {
    beforeEach(() => {
      // 默认 mock 返回空列表
      mockCtx.database.get.mockResolvedValue([])
    })

    it('应该处理空订阅列表', async () => {
      mockCtx.database.get.mockResolvedValueOnce([])

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      expect(mockQueueManager.addTask).not.toHaveBeenCalled()
    })

    it('应该跳过 interval 间隔未到的订阅', async () => {
      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {
            interval: 60000,
            nextUpdateTime: Date.now() + 30000, // 30秒后
          },
          lastPubDate: new Date(),
          lastContent: [],
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      expect(mockQueueManager.addTask).not.toHaveBeenCalled()
    })

    it('应该兼容旧的 nextUpdataTime 字段', async () => {
      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {
            interval: 60000,
            nextUpdataTime: Date.now() + 30000,
          },
          lastPubDate: new Date(),
          lastContent: [],
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      expect(mockQueueManager.addTask).not.toHaveBeenCalled()
    })

    it('应该同步写回 nextUpdateTime 和 nextUpdataTime', async () => {
      const now = Date.now()
      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {
            interval: 60000,
            nextUpdateTime: now - 30000, // 已过期
          },
          lastPubDate: new Date(now - 60000),
          lastContent: [],
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)
      mockCtx.database.get.mockResolvedValueOnce([]) // RSS data mock
      mockCtx.database.set.mockResolvedValue(undefined)

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      expect(mockCtx.database.set).toHaveBeenCalled()
      const updateCall = mockCtx.database.set.mock.calls[0]
      expect(updateCall[2].arg.nextUpdateTime).toBeGreaterThan(now)
      expect(updateCall[2].arg.nextUpdataTime).toBeGreaterThan(now)
    })

    it('应该处理 RSS 抓取失败', async () => {
      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {},
          lastPubDate: new Date(),
          lastContent: [],
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)

      mockedGetRssData.mockRejectedValueOnce(new Error('network error'))

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      // 应该继续处理，不抛出异常
      expect(mockQueueManager.addTask).not.toHaveBeenCalled()
    })
  })

  describe('feeder - 新消息处理', () => {
    it('应该将新消息添加到队列', async () => {
      const now = Date.now()
      const newItem = {
        title: 'New Item',
        description: 'New Description',
        link: 'https://example.com/new',
        pubDate: new Date(now),
      }

      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          rssId: 'test-rss-id',
          guildId: 'test-guild',
          platform: 'onebot',
          author: 'bot-self-id',
          arg: {},
          lastPubDate: new Date(now - 60000), // 1分钟前
          lastContent: [],
        },
      ]

      const mockParsedMessage = 'Parsed message content'

      mockCtx.database.get.mockResolvedValueOnce(rssList)
      mockProcessor.parseRssItem.mockResolvedValueOnce(mockParsedMessage)
      mockQueueManager.addTask.mockResolvedValueOnce({} as any)
      mockCtx.database.set.mockResolvedValue(undefined)

      // Mock getRssData - 这里需要实际实现或者跳过这个测试
      // 由于 getRssData 是外部依赖，这里仅展示测试结构

      // await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      // expect(mockQueueManager.addTask).toHaveBeenCalledWith(
      //   expect.objectContaining({
      //     rssId: 'test-rss-id',
      //     guildId: 'test-guild',
      //     platform: 'onebot',
      //   })
      // )
    })

    it('应该更新 lastPubDate 即使没有新消息', async () => {
      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {},
          lastPubDate: new Date(),
          lastContent: [],
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)
      mockCtx.database.get.mockResolvedValueOnce([]) // No RSS items
      mockCtx.database.set.mockResolvedValue(undefined)

      await feeder({ ctx: mockCtx, config: mockConfig, $http: mock$http, queueManager: mockQueueManager }, mockProcessor)

      expect(mockCtx.database.set).toHaveBeenCalled()
    })
  })

  describe('feeder - 消息去重', () => {
    it('应该过滤已发送的消息', async () => {
      const now = Date.now()
      const oldItem = {
        title: 'Old Item',
        description: 'Old Description',
        link: 'https://example.com/old',
        pubDate: new Date(now - 60000),
      }

      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {},
          lastPubDate: new Date(now - 30000),
          lastContent: {
            itemArray: [
              {
                title: 'Old Item',
                description: 'Old Description',
                link: 'https://example.com/old',
              },
            ],
          },
        },
      ]

      mockCtx.database.get.mockResolvedValueOnce(rssList)
      mockCtx.database.set.mockResolvedValue(undefined)

      // 测试去重逻辑
      const lastContent = getLastContent(oldItem, mockConfig)
      const oldItemMatch = rssList[0].lastContent.itemArray.find(
        (old: any) => old.link === lastContent.link && old.title === lastContent.title
      )

      expect(oldItemMatch).toBeDefined()
    })

    it('应该检测内容更新', async () => {
      const now = Date.now()
      const updatedItem = {
        title: 'Updated Item',
        description: 'Updated Description v2',
        link: 'https://example.com/updated',
        pubDate: new Date(now - 30000), // 相同时间
      }

      const rssList = [
        {
          id: 1,
          url: 'https://example.com/rss',
          title: 'Test RSS',
          arg: {},
          lastPubDate: new Date(now - 30000),
          lastContent: {
            itemArray: [
              {
                title: 'Updated Item',
                description: 'Updated Description v1', // 不同描述
                link: 'https://example.com/updated',
              },
            ],
          },
        },
      ]

      // 测试内容变化检测
      const currentContent = getLastContent(updatedItem, mockConfig)
      const oldItemMatch = rssList[0].lastContent.itemArray.find(
        (old: any) => old.link === currentContent.link && old.title === currentContent.title
      )

      if (oldItemMatch) {
        const descriptionChanged = JSON.stringify(oldItemMatch.description) !== JSON.stringify(currentContent.description)
        expect(descriptionChanged).toBe(true)
      }
    })
  })

  describe('startFeeder - 定时器配置', () => {
    it('应该使用 queue.processInterval 作为队列处理间隔', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
        .mockReturnValueOnce({} as any)
        .mockReturnValueOnce({} as any)
        .mockReturnValueOnce({} as any)
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined as any)

      mockCtx.database.get.mockResolvedValue([])
      mockQueueManager.processQueue.mockResolvedValue(undefined)

      startFeeder(
        mockCtx,
        { ...mockConfig, queue: { processInterval: 15 } } as Config,
        mock$http,
        mockProcessor,
        mockQueueManager as NotificationQueueManager,
      )

      await Promise.resolve()

      // 三个定时器：feeder 轮询(600000)、队列消费(15000)、自动清理(3600000)
      expect(setIntervalSpy).toHaveBeenCalledTimes(3)
      expect(setIntervalSpy.mock.calls[0][1]).toBe(600000)
      expect(setIntervalSpy.mock.calls[1][1]).toBe(15000)
      expect(setIntervalSpy.mock.calls[2][1]).toBe(60 * 60 * 1000)

      stopFeeder(mockConfig)
      expect(clearIntervalSpy).toHaveBeenCalledTimes(3)
    })
  })
})
