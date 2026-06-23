/**
 * MessageCacheManager 关键行为回归
 *
 * 重点验证（对应审查 #2：批量删除，避免逐条 + 全表入内存）：
 *  - clearAll 使用 database.remove(where) 批量删除，而不是逐条 remove({id})
 *  - cleanup 基于边界 createdAt 只删除超出 keepLatest 的旧消息
 *  - getMessages/getStats/searchMessages 透传作用域过滤
 */

import { describe, it, expect, jest } from '@jest/globals'
import { MessageCacheManager } from '../../src/utils/message-cache'
import type { CachedMessage } from '../../src/utils/message-cache'

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  Logger: function () { return { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
}))

function makeFakeCtx() {
  const removes: any[] = []
  const gets: any[] = []
  const db = {
    get: jest.fn(async (table: string, where: any, opts?: any) => {
      gets.push({ table, where, opts })
      return []
    }),
    remove: jest.fn(async (table: string, where: any) => {
      removes.push({ table, where })
    }),
    create: jest.fn(async () => ({})),
  }
  const ctx: any = { database: db }
  return { ctx, db, removes, gets }
}

describe('MessageCacheManager — clearAll 批量删除', () => {
  it('count=0 时直接返回 0 且不调用 remove', async () => {
    const { ctx, db } = makeFakeCtx()
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    const n = await mgr.clearAll({ platform: 'onebot', guildId: 'guild-A' })
    expect(n).toBe(0)
    expect(db.remove).not.toHaveBeenCalled()
  })

  it('有匹配行时使用 remove(where) 一次性批量删除', async () => {
    const { ctx, db } = makeFakeCtx()
    // 模拟 get 命中 3 条
    db.get.mockResolvedValueOnce([
      { id: 1 }, { id: 2 }, { id: 3 },
    ])
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    const n = await mgr.clearAll({ platform: 'onebot', guildId: 'guild-A' })
    expect(n).toBe(3)
    // 必须是带 where 的批量 remove，而不是按 id 循环
    expect(db.remove).toHaveBeenCalledTimes(1)
    expect(db.remove).toHaveBeenCalledWith('rss_message_cache', { platform: 'onebot', guildId: 'guild-A' })
  })

  it('未限定作用域时 clearAll 删除全部（全局清理语义）', async () => {
    const { ctx, db } = makeFakeCtx()
    db.get.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    const n = await mgr.clearAll()
    expect(n).toBe(2)
    expect(db.remove).toHaveBeenCalledWith('rss_message_cache', {})
  })
})

describe('MessageCacheManager — cleanup 边界删除', () => {
  it('总量不足 keepLatest 时不删除', async () => {
    const { ctx, db } = makeFakeCtx()
    // 边界查询返回空（说明总量 < keepLatest）
    db.get.mockResolvedValueOnce([])
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    const n = await mgr.cleanup({ keepLatest: 50, platform: 'onebot', guildId: 'guild-A' })
    expect(n).toBe(0)
    expect(db.remove).not.toHaveBeenCalled()
  })

  it('基于边界 createdAt 删除更旧的消息', async () => {
    const { ctx, db } = makeFakeCtx()
    const boundary = new Date('2026-06-10T00:00:00Z')
    // 第 1 次 get：边界查询命中（offset=keepLatest-1）
    db.get.mockResolvedValueOnce([{ createdAt: boundary }])
    // 第 2 次 get：batchRemove 内部的计数查询返回 5 条
    db.get.mockResolvedValueOnce([1, 2, 3, 4, 5])

    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    const n = await mgr.cleanup({ keepLatest: 10, platform: 'onebot', guildId: 'guild-A' })

    expect(n).toBe(5)
    // 边界查询带 limit/offset/sort
    const boundaryCall = db.get.mock.calls[0]
    expect(boundaryCall[2]).toMatchObject({ limit: 1, offset: 9, sort: { createdAt: 'desc' } })
    // 批量 remove 使用 createdAt < 边界 的条件
    expect(db.remove).toHaveBeenCalledWith('rss_message_cache', {
      platform: 'onebot',
      guildId: 'guild-A',
      createdAt: { $lt: boundary },
    })
  })
})

describe('MessageCacheManager — 作用域过滤透传', () => {
  it('getMessages 透传 platform/guildId', async () => {
    const { ctx, db } = makeFakeCtx()
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    await mgr.getMessages({ platform: 'tg', guildId: 'g1', limit: 5, offset: 0 })
    expect(db.get.mock.calls[0][1]).toMatchObject({ platform: 'tg', guildId: 'g1' })
  })

  it('searchMessages 透传 platform/guildId', async () => {
    const { ctx, db } = makeFakeCtx()
    db.get.mockResolvedValueOnce([])
    const mgr = new MessageCacheManager(ctx, {} as any, 100)
    await mgr.searchMessages({ keyword: 'x', platform: 'tg', guildId: 'g1' })
    expect(db.get.mock.calls[0][1]).toMatchObject({ platform: 'tg', guildId: 'g1' })
  })
})
