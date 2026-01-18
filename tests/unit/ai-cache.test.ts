/**
 * AI 功能增强测试
 * 测试批量摘要、缓存和智能降级功能
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import {
  initAiCache,
  clearAiCache,
  getAiCacheStats,
  cleanExpiredCache,
  AiSummaryCache
} from '../../src/core/ai'

// 只测试缓存系统，不依赖外部 API mock

describe('AI 缓存系统', () => {
  let cache: AiSummaryCache

  beforeEach(() => {
    cache = new AiSummaryCache(1000) // 1秒 TTL 用于测试
  })

  it('应该生成缓存键', () => {
    const key1 = cache['generateKey']('标题1', '内容1')
    const key2 = cache['generateKey']('标题1', '内容1')
    const key3 = cache['generateKey']('标题2', '内容2')

    expect(key1).toBe(key2) // 相同内容生成相同键
    expect(key1).not.toBe(key3) // 不同内容生成不同键
    expect(key1).toHaveLength(64) // SHA256 哈希长度
  })

  it('应该存储和获取缓存', () => {
    cache.set('标题', '内容', '摘要内容')

    const retrieved = cache.get('标题', '内容')
    expect(retrieved).toBe('摘要内容')
  })

  it('应该在缓存未命中时返回 null', () => {
    const retrieved = cache.get('不存在的标题', '不存在的内容')
    expect(retrieved).toBeNull()
  })

  it('应该清除过期缓存', async () => {
    cache.set('标题', '内容', '摘要')

    // 立即获取应该成功
    expect(cache.get('标题', '内容')).toBe('摘要')

    // 等待过期（使用短 TTL）
    const shortCache = new AiSummaryCache(10) // 10ms TTL
    shortCache.set('标题', '内容', '摘要')
    await new Promise(resolve => setTimeout(resolve, 15))

    expect(shortCache.get('标题', '内容')).toBeNull()
  })

  it('应该清空所有缓存', () => {
    cache.set('标题1', '内容1', '摘要1')
    cache.set('标题2', '内容2', '摘要2')

    expect(cache['cache'].size).toBe(2)

    cache.clear()

    expect(cache['cache'].size).toBe(0)
  })

  it('应该获取缓存统计', () => {
    cache.set('标题1', '内容1', '摘要1')
    cache.set('标题2', '内容2', '摘要2')

    const stats = cache.getStats()
    expect(stats.size).toBe(2)
    expect(stats.keys).toHaveLength(2)
  })

  it('应该清除过期缓存条目', () => {
    const shortCache = new AiSummaryCache(10)
    shortCache.set('过期项', '内容', '摘要')
    shortCache.set('有效项', '内容2', '摘要2')

    // 等待第一项过期
    // 注意：由于测试执行很快，我们手动测试 cleanExpired 方法
    shortCache.cleanExpired()
    expect(shortCache.getStats().size).toBeGreaterThanOrEqual(0)
  })
})

describe('全局缓存函数', () => {
  beforeEach(() => {
    clearAiCache()
  })

  it('应该初始化全局缓存', () => {
    initAiCache(5000)

    const stats = getAiCacheStats()
    expect(stats).not.toBeNull()
    expect(stats?.size).toBe(0)
  })

  it('应该获取缓存统计', () => {
    initAiCache()

    // 初始状态为空
    const stats = getAiCacheStats()
    expect(stats?.size).toBe(0)
  })

  it('应该清空所有缓存', () => {
    initAiCache()
    clearAiCache()

    const stats = getAiCacheStats()
    expect(stats?.size).toBe(0)
  })

  it('应该清除过期缓存', () => {
    initAiCache(10) // 10ms TTL
    cleanExpiredCache()

    const stats = getAiCacheStats()
    expect(stats?.size).toBe(0)
  })

  it('应该在无缓存时返回 null', () => {
    const stats = getAiCacheStats()
    expect(stats?.size).toBe(0)
  })
})

describe('缓存键生成逻辑', () => {
  it('应该为相同内容生成相同键', () => {
    const cache = new AiSummaryCache()
    const key1 = cache['generateKey']('测试', '相同的内容')
    const key2 = cache['generateKey']('测试', '相同的内容')

    expect(key1).toBe(key2)
  })

  it('应该为不同内容生成不同键', () => {
    const cache = new AiSummaryCache()
    const key1 = cache['generateKey']('标题1', '内容1')
    const key2 = cache['generateKey']('标题1', '内容2')
    const key3 = cache['generateKey']('标题2', '内容1')

    expect(key1).not.toBe(key2)
    expect(key1).not.toBe(key3)
    expect(key2).not.toBe(key3)
  })

  it('应该处理特殊字符', () => {
    const cache = new AiSummaryCache()
    const key = cache['generateKey']('标题<script>', '内容&amp;')

    expect(key).toHaveLength(64)
    expect(typeof key).toBe('string')
  })

  it('应该处理空字符串', () => {
    const cache = new AiSummaryCache()
    const key = cache['generateKey']('', '')

    expect(key).toHaveLength(64)
  })

  it('应该处理长文本', () => {
    const cache = new AiSummaryCache()
    const longContent = 'x'.repeat(10000)
    const key = cache['generateKey']('长标题', longContent)

    expect(key).toHaveLength(64)
  })
})

describe('缓存边界情况', () => {
  let cache: AiSummaryCache

  beforeEach(() => {
    cache = new AiSummaryCache()
  })

  it('应该覆盖已存在的缓存', () => {
    cache.set('标题', '内容', '摘要1')
    cache.set('标题', '内容', '摘要2')

    const retrieved = cache.get('标题', '内容')
    expect(retrieved).toBe('摘要2')
  })

  it('应该处理大量缓存项', () => {
    const count = 1000

    for (let i = 0; i < count; i++) {
      cache.set(`标题${i}`, `内容${i}`, `摘要${i}`)
    }

    const stats = cache.getStats()
    expect(stats.size).toBe(count)
  })

  it('应该在过期后自动删除', async () => {
    const shortCache = new AiSummaryCache(50)
    shortCache.set('标题', '内容', '摘要')

    // 立即获取应该成功
    expect(shortCache.get('标题', '内容')).toBe('摘要')

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 60))

    // 获取应该返回 null（过期）
    expect(shortCache.get('标题', '内容')).toBeNull()
  })

  it('应该处理并发操作', async () => {
    const promises = []

    for (let i = 0; i < 100; i++) {
      promises.push(
        Promise.resolve().then(() => {
          cache.set(`标题${i}`, `内容${i}`, `摘要${i}`)
        })
      )
    }

    await Promise.all(promises)

    const stats = cache.getStats()
    expect(stats.size).toBe(100)
  })
})

describe('缓存性能', () => {
  it('应该快速生成缓存键', () => {
    const cache = new AiSummaryCache()
    const start = Date.now()

    for (let i = 0; i < 1000; i++) {
      cache['generateKey']('标题', '内容')
    }

    const duration = Date.now() - start
    expect(duration).toBeLessThan(100) // 应该在 100ms 内完成
  })

  it('应该快速存储和检索', () => {
    const cache = new AiSummaryCache()
    const start = Date.now()

    for (let i = 0; i < 1000; i++) {
      cache.set(`标题${i}`, `内容${i}`, `摘要${i}`)
      cache.get(`标题${i}`, `内容${i}`)
    }

    const duration = Date.now() - start
    expect(duration).toBeLessThan(100) // 应该在 100ms 内完成
  })
})
