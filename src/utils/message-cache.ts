/**
 * 消息缓存管理器
 * 缓存已推送的 RSS 消息，支持查询和管理
 */

import { Context } from 'koishi'
import { Logger } from 'koishi'
import { Config } from '../types'
import { debug } from './logger'

const logger = new Logger('rss-owl:cache')

/**
 * 缓存消息接口
 */
export interface CachedMessage {
  id?: number
  rssId: string
  guildId: string
  platform: string
  title: string
  content: string
  link: string
  pubDate: Date
  imageUrl?: string
  videoUrl?: string
  createdAt: Date
}

/**
 * 缓存统计接口
 */
export interface CacheStats {
  totalMessages: number
  bySubscription: Record<string, number>
  byGuild: Record<string, number>
  oldestMessage?: Date
  newestMessage?: Date
}

/**
 * 消息缓存管理器类
 */
export class MessageCacheManager {
  private maxCacheSize: number
  private ctx: Context
  private config: Config

  constructor(ctx: Context, config: Config, maxCacheSize: number = 100) {
    this.ctx = ctx
    this.config = config
    this.maxCacheSize = maxCacheSize
  }

  /**
   * 添加消息到缓存
   */
  async addMessage(message: Omit<CachedMessage, 'id' | 'createdAt'>): Promise<CachedMessage> {
    const cachedMessage: CachedMessage = {
      ...message,
      createdAt: new Date()
    }

    // 检查是否已存在（根据 link 去重）
    const existing = await this.ctx.database.get(('rss_message_cache' as any), {
      link: message.link
    })

    if (existing.length > 0) {
      debug(this.config, `消息已存在，跳过缓存: ${message.title}`, 'cache', 'details')
      return existing[0] as CachedMessage
    }

    // 插入新消息
    await this.ctx.database.create(('rss_message_cache' as any), cachedMessage)
    logger.info(`缓存消息: ${message.title} (RSS: ${message.rssId})`)

    // 检查是否需要清理
    await this.checkAndCleanup()

    return cachedMessage
  }

  /**
   * 批量添加消息
   */
  async addMessages(messages: Omit<CachedMessage, 'id' | 'createdAt'>[]): Promise<void> {
    for (const message of messages) {
      await this.addMessage(message)
    }
  }

  /**
   * 获取缓存消息列表
   */
  async getMessages(options: {
    guildId?: string
    rssId?: string
    platform?: string
    limit?: number
    offset?: number
  } = {}): Promise<CachedMessage[]> {
    const { guildId, rssId, platform, limit = 20, offset = 0 } = options

    // 构建查询条件
    const where: any = {}
    if (guildId) where.guildId = guildId
    if (rssId) where.rssId = rssId
    if (platform) where.platform = platform

    // 查询消息（按创建时间倒序）
    const messages = await this.ctx.database.get(('rss_message_cache' as any), where, {
      limit,
      offset,
      sort: { createdAt: 'desc' }
    })

    return messages as CachedMessage[]
  }

  /**
   * 获取单条消息详情
   */
  async getMessage(id: number): Promise<CachedMessage | null> {
    const messages = await this.ctx.database.get(('rss_message_cache' as any), { id })
    return (messages[0] as CachedMessage) || null
  }

  /**
   * 获取缓存统计
   */
  async getStats(options: { guildId?: string; platform?: string } = {}): Promise<CacheStats> {
    const { guildId, platform } = options

    // 构建查询条件
    const where: any = {}
    if (guildId) where.guildId = guildId
    if (platform) where.platform = platform

    // 获取所有消息
    const messages = await this.ctx.database.get(('rss_message_cache' as any), where)

    // 统计
    const stats: CacheStats = {
      totalMessages: messages.length,
      bySubscription: {},
      byGuild: {}
    }

    let oldest: Date | null = null
    let newest: Date | null = null

    for (const msg of messages as any[]) {
      // 按订阅统计
      stats.bySubscription[msg.rssId] = (stats.bySubscription[msg.rssId] || 0) + 1

      // 按群组统计
      const guildKey = `${msg.platform}:${msg.guildId}`
      stats.byGuild[guildKey] = (stats.byGuild[guildKey] || 0) + 1

      // 时间范围
      if (!oldest || msg.createdAt < oldest) oldest = msg.createdAt
      if (!newest || msg.createdAt > newest) newest = msg.createdAt
    }

    if (oldest) stats.oldestMessage = oldest
    if (newest) stats.newestMessage = newest

    return stats
  }

  /**
   * 清理缓存
   */
  async cleanup(options: {
    guildId?: string
    rssId?: string
    platform?: string
    keepLatest?: number
  } = {}): Promise<number> {
    const { guildId, rssId, platform, keepLatest = this.maxCacheSize } = options

    // 构建查询条件
    const where: any = {}
    if (guildId) where.guildId = guildId
    if (rssId) where.rssId = rssId
    if (platform) where.platform = platform

    // 获取所有匹配的消息
    const messages = await this.ctx.database.get(('rss_message_cache' as any), where, {
      sort: { createdAt: 'desc' }
    })

    // 如果消息数量超过限制，删除旧消息
    if (messages.length > keepLatest) {
      const toDelete = messages.slice(keepLatest) as any[]
      const idsToDelete = toDelete.map(m => m.id)

      for (const id of idsToDelete) {
        await this.ctx.database.remove(('rss_message_cache' as any), { id })
      }

      logger.info(`清理了 ${toDelete.length} 条缓存消息`)
      return toDelete.length
    }

    return 0
  }

  /**
   * 清空所有缓存
   */
  async clearAll(options: { guildId?: string; platform?: string } = {}): Promise<number> {
    const { guildId, platform } = options

    // 构建查询条件
    const where: any = {}
    if (guildId) where.guildId = guildId
    if (platform) where.platform = platform

    // 获取所有消息
    const messages = await this.ctx.database.get(('rss_message_cache' as any), where)

    // 删除所有消息
    for (const msg of messages as any[]) {
      await this.ctx.database.remove(('rss_message_cache' as any), { id: msg.id })
    }

    logger.info(`清空了 ${messages.length} 条缓存消息`)
    return messages.length
  }

  /**
   * 检查并自动清理
   */
  private async checkAndCleanup(): Promise<void> {
    const stats = await this.getStats()

    if (stats.totalMessages > this.maxCacheSize) {
      logger.info(`缓存数量(${stats.totalMessages})超过限制(${this.maxCacheSize})，开始清理`)
      await this.cleanup({ keepLatest: this.maxCacheSize })
    }
  }

  /**
   * 更新最大缓存大小
   */
  setMaxCacheSize(size: number): void {
    this.maxCacheSize = Math.max(1, size)
    logger.info(`更新最大缓存大小为: ${this.maxCacheSize}`)
  }

  /**
   * 获取最大缓存大小
   */
  getMaxCacheSize(): number {
    return this.maxCacheSize
  }

  /**
   * 搜索消息
   */
  async searchMessages(query: {
    keyword?: string
    guildId?: string
    rssId?: string
    platform?: string
    limit?: number
  }): Promise<CachedMessage[]> {
    const { keyword, guildId, rssId, platform, limit = 20 } = query

    // 构建查询条件
    const where: any = {}
    if (guildId) where.guildId = guildId
    if (rssId) where.rssId = rssId
    if (platform) where.platform = platform

    // 获取所有消息（数据库不支持模糊查询，需要在内存中过滤）
    let messages = await this.ctx.database.get(('rss_message_cache' as any), where, {
      sort: { createdAt: 'desc' }
    })

    // 关键词搜索
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase()
      messages = (messages as any[]).filter(m =>
        m.title.toLowerCase().includes(lowerKeyword) ||
        m.content.toLowerCase().includes(lowerKeyword)
      )
    }

    // 限制返回数量
    return (messages as CachedMessage[]).slice(0, limit)
  }
}

// 全局缓存管理器实例
let globalMessageCache: MessageCacheManager | null = null

/**
 * 初始化全局消息缓存管理器
 */
export function initMessageCache(ctx: Context, config: Config, maxSize: number = 100): MessageCacheManager {
  if (!globalMessageCache) {
    globalMessageCache = new MessageCacheManager(ctx, config, maxSize)
    logger.info('消息缓存管理器已初始化')
  }

  return globalMessageCache
}

/**
 * 获取全局消息缓存管理器
 */
export function getMessageCache(): MessageCacheManager | null {
  return globalMessageCache
}
