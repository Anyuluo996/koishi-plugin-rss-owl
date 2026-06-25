/**
 * 缓存管理命令的单元测试
 *
 * 重点回归（对应命令系统审查的高优先级修复）：
 *  1. 跨群隔离：cache handler 必须把 platform/guildId 透传给底层查询，
 *     A 群执行命令看不到、删不掉 B 群的缓存（防跨群泄露）
 *  2. 真实 ID 解析：message/pull 使用真实数据库 ID，且必须校验归属当前群
 *  3. clear/cleanup/stats/search 均按当前群作用域
 */

import { describe, it, expect, jest } from '@jest/globals'
import {
  resolveCacheMessageById,
  handleCacheList,
  handleCacheMessage,
  handleCacheSearch,
  handleCacheStats,
  handleCacheClear,
  handleCacheCleanup,
  handleCachePull,
  type CacheCommandContext,
} from '../../src/commands/index'
import type { CachedMessage, MessageCacheManager } from '../../src/utils/message-cache'

// 屏蔽 handler 内部日志副作用，避免污染测试输出 / 触发未初始化依赖
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  debugError: jest.fn(),
}))

function makeMessage(over: Partial<CachedMessage> & { id: number }): CachedMessage {
  return {
    id: over.id,
    rssId: over.rssId ?? 'feed-a',
    guildId: over.guildId ?? 'guild-A',
    platform: over.platform ?? 'onebot',
    title: over.title ?? `title-${over.id}`,
    content: over.content ?? `content-${over.id}`,
    link: over.link ?? `https://example.com/${over.id}`,
    pubDate: over.pubDate ?? new Date('2026-06-01T00:00:00Z'),
    imageUrl: over.imageUrl,
    videoUrl: over.videoUrl,
    finalMessage: over.finalMessage,
    createdAt: over.createdAt ?? new Date('2026-06-01T00:00:00Z'),
  }
}

/** 构造一个记录调用参数的 mock cache，便于断言是否带上了作用域过滤。
 *  无论是否传入 override，都会记录每次调用，再委托 override 决定返回值。 */
function makeMockCache(over: Partial<MessageCacheManager> = {}): MessageCacheManager & {
  calls: any[]
} {
  const calls: any[] = []
  const fallbackStats = { totalMessages: 0, bySubscription: {}, byGuild: {} }
  const wrap = <A extends any[]>(m: string, fn: ((...a: A) => any) | undefined) =>
    jest.fn(async (...a: A) => {
      calls.push({ m, args: a })
      return fn ? await (fn as any)(...a) : undefined
    })
  const cache = {
    getMessages: wrap('getMessages', (over.getMessages as any) ?? (() => [])),
    getMessage: wrap('getMessage', (over.getMessage as any) ?? (() => null)),
    getStats: wrap('getStats', (over.getStats as any) ?? (() => fallbackStats)),
    searchMessages: wrap('searchMessages', (over.searchMessages as any) ?? (() => [])),
    clearAll: wrap('clearAll', (over.clearAll as any) ?? (() => 0)),
    cleanup: wrap('cleanup', (over.cleanup as any) ?? (() => 0)),
    getMaxCacheSize: jest.fn(() => (over.getMaxCacheSize as any)?.() ?? 100),
    calls,
  }
  return cache as any
}

/** 断言 helper：取出指定方法的调用记录 */
function callOf(cache: any, m: string) {
  return cache.calls.find((c: any) => c.m === m)
}

function makeCmdCtx(over: Partial<CacheCommandContext> = {}): CacheCommandContext {
  return {
    cache: over.cache ?? (makeMockCache() as any),
    platform: over.platform ?? 'onebot',
    guildId: over.guildId ?? 'guild-A',
    authority: over.authority ?? 1,
    logContext: over.logContext,
  }
}

const config = { basic: { authority: 2 }, debug: 'disable' } as any

describe('缓存命令 — 跨群隔离回归', () => {
  it('handleCacheList 必须把 platform/guildId 透传给 getMessages 和 getStats', async () => {
    const cache = makeMockCache({
      getMessages: async () => [makeMessage({ id: 5 })],
      getStats: async () => ({ totalMessages: 1, bySubscription: {}, byGuild: {} }),
    })
    await handleCacheList({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, ['1'], config)

    expect(callOf(cache, 'getMessages').args[0]).toMatchObject({ platform: 'onebot', guildId: 'guild-A', limit: 10, offset: 0 })
    expect(callOf(cache, 'getStats').args[0]).toMatchObject({ platform: 'onebot', guildId: 'guild-A' })
  })

  it('handleCacheSearch 必须限定到当前群', async () => {
    const cache = makeMockCache({ searchMessages: async () => [] })
    await handleCacheSearch({ ...makeCmdCtx({ cache, platform: 'tg', guildId: 'guild-B' }) }, ['关键词'], config)
    expect(callOf(cache, 'searchMessages').args[0]).toMatchObject({ keyword: '关键词', platform: 'tg', guildId: 'guild-B' })
  })

  it('handleCacheStats 必须只统计当前群', async () => {
    const cache = makeMockCache()
    await handleCacheStats({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, config)
    expect(callOf(cache, 'getStats').args[0]).toMatchObject({ platform: 'onebot', guildId: 'guild-A' })
  })

  it('handleCacheClear 必须只清空当前群', async () => {
    const cache = makeMockCache({ clearAll: async () => 3 })
    const out = await handleCacheClear({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, config)
    expect(callOf(cache, 'clearAll').args[0]).toMatchObject({ platform: 'onebot', guildId: 'guild-A' })
    expect(out).toContain('本群')
    expect(out).toContain('3')
  })

  it('handleCacheCleanup 必须只清理当前群并透传 keepLatest', async () => {
    const cache = makeMockCache({ cleanup: async () => 7 })
    const out = await handleCacheCleanup({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, ['50'], config)
    expect(callOf(cache, 'cleanup').args[0]).toMatchObject({ keepLatest: 50, platform: 'onebot', guildId: 'guild-A' })
    expect(out).toContain('本群')
  })
})

describe('缓存命令 — 真实 ID 解析与归属校验', () => {
  it('resolveCacheMessageById 命中本群消息', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-A' }),
    })
    const msg = await resolveCacheMessageById({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, 42)
    expect(msg).not.toBeNull()
    expect(msg?.id).toBe(42)
  })

  it('resolveCacheMessageById 拦截跨群 ID（即使 ID 存在于其它群）', async () => {
    const cache = makeMockCache({
      // 消息真实归属 guild-B，但当前命令来自 guild-A
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-B' }),
    })
    const msg = await resolveCacheMessageById({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, 42)
    expect(msg).toBeNull()
  })

  it('resolveCacheMessageById 对不存在的 ID 返回 null', async () => {
    const cache = makeMockCache({ getMessage: async () => null })
    const msg = await resolveCacheMessageById(makeCmdCtx({ cache }), 999)
    expect(msg).toBeNull()
  })

  it('handleCacheMessage 缺 ID 时给出真实 ID 用法提示', async () => {
    const out = await handleCacheMessage(makeCmdCtx(), [], config)
    expect(out).toContain('真实 ID')
  })

  it('handleCacheMessage 命中本群消息时输出详情', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, title: '新闻', platform: 'onebot', guildId: 'guild-A', content: '正文' }),
    })
    const out = await handleCacheMessage({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, ['42'], config)
    expect(out).toContain('ID:42')
    expect(out).toContain('新闻')
  })

  it('handleCacheMessage 跨群 ID 返回未找到提示', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-B' }),
    })
    const out = await handleCacheMessage({ ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }, ['42'], config)
    expect(out).toContain('未找到')
    expect(out).toContain('不属于当前群组')
  })
})

describe('缓存命令 — pull 走发送队列（#8：不再直接 broadcast）', () => {
  function makeSession(platform = 'onebot', guildId = 'guild-A') {
    const event: any = { platform, guild: { id: guildId } }
    return { event } as any
  }

  it('命中本群消息时通过 queueManager.addTask 入队，而非 ctx.broadcast', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-A', finalMessage: '<p>msg</p>' }),
    })
    const addTask = jest.fn<(t: any) => Promise<any>>(async () => ({ ok: true }))
    const queueManager = { addTask } as any
    const ctx = { broadcast: jest.fn(async () => {}) } as any
    const cmdCtx = { ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }

    const out = await handleCachePull(ctx, queueManager, makeSession(), cmdCtx, ['42'], config)

    expect(addTask).toHaveBeenCalledTimes(1)
    // 必须走队列，绝不能再用 ctx.broadcast
    expect((ctx.broadcast as jest.Mock)).not.toHaveBeenCalled()
    // 入队任务的 target 信息来自当前会话，避免跨群
    const task = addTask.mock.calls[0][0] as any
    expect(task).toMatchObject({ subscribeId: 'cache-pull:42', rssId: 'feed-a', guildId: 'guild-A', platform: 'onebot' })
    expect(task.content.message).toBe('<p>msg</p>')
    // uid 必须唯一（带时间戳），避免与原 feed 任务去重冲突导致重发被吞
    expect(String(task.uid)).toMatch(/^cache-pull:42:\d+$/)
    expect(out).toContain('已将消息')
  })

  it('跨群 ID 直接拒绝，不调用 addTask', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-B', finalMessage: 'x' }),
    })
    const addTask = jest.fn(async () => ({ ok: true } as any))
    const queueManager = { addTask } as any
    const ctx = { broadcast: jest.fn(async () => {}) } as any
    const cmdCtx = { ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }

    const out = await handleCachePull(ctx, queueManager, makeSession(), cmdCtx, ['42'], config)
    expect(addTask).not.toHaveBeenCalled()
    expect(out).toContain('不属于当前群组')
  })

  it('缺少 finalMessage 时给出友好提示且不入队', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-A', finalMessage: undefined }),
    })
    const addTask = jest.fn(async () => ({ ok: true } as any))
    const queueManager = { addTask } as any
    const ctx = { broadcast: jest.fn(async () => {}) } as any
    const cmdCtx = { ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }

    const out = await handleCachePull(ctx, queueManager, makeSession(), cmdCtx, ['42'], config)
    expect(addTask).not.toHaveBeenCalled()
    expect(out).toContain('没有缓存的最终消息')
  })

  it('addTask 抛错时捕获并返回错误提示（不向上抛）', async () => {
    const cache = makeMockCache({
      getMessage: async () => makeMessage({ id: 42, platform: 'onebot', guildId: 'guild-A', finalMessage: 'x' }),
    })
    const addTask = jest.fn(async () => { throw new Error('队列已满') })
    const queueManager = { addTask } as any
    const ctx = { broadcast: jest.fn(async () => {}) } as any
    const cmdCtx = { ...makeCmdCtx({ cache, platform: 'onebot', guildId: 'guild-A' }) }

    const out = await handleCachePull(ctx, queueManager, makeSession(), cmdCtx, ['42'], config)
    expect(out).toContain('推送消息失败')
    expect(out).toContain('队列已满')
  })
})

