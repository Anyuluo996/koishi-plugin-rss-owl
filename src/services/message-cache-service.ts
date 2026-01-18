/**
 * 消息缓存 WebUI 服务
 * 提供 HTTP 接口用于查看和管理缓存消息
 */

import { Context } from 'koishi'
import { getMessageCache } from '../utils/message-cache'

// 声明 server 类型
declare module 'koishi' {
  interface Context {
    server?: {
      get(path: string, handler: (query: any) => any): void
      post(path: string, handler: (query: any, body: any) => any): void
    }
  }
}

/**
 * 注册消息缓存服务
 */
export function registerMessageCacheService(ctx: Context) {
  // 如果 server 不可用，直接返回
  if (!ctx.server) {
    ctx.logger?.warn('server plugin not available, message cache API endpoints not registered')
    return
  }

  // 获取缓存消息列表
  ctx.server.get('/rss/cache/messages', async (query) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const guildId = query.guild as string
    const platform = query.platform as string
    const rssId = query.rssId as string
    const limit = parseInt(query.limit as string) || 20
    const offset = parseInt(query.offset as string) || 0

    try {
      const messages = await cache.getMessages({
        guildId,
        platform,
        rssId,
        limit,
        offset
      })

      return {
        success: true,
        data: messages,
        total: messages.length
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 获取单条缓存消息
  ctx.server.get('/rss/cache/message/:id', async (query) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const id = parseInt(query.id as string)

    try {
      const message = await cache.getMessage(id)

      if (!message) {
        return {
          success: false,
          error: '消息不存在'
        }
      }

      return {
        success: true,
        data: message
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 获取缓存统计
  ctx.server.get('/rss/cache/stats', async (query) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const guildId = query.guild as string
    const platform = query.platform as string

    try {
      const stats = await cache.getStats({
        guildId,
        platform
      })

      return {
        success: true,
        data: stats
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 搜索缓存消息
  ctx.server.get('/rss/cache/search', async (query) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const keyword = query.keyword as string
    const guildId = query.guild as string
    const platform = query.platform as string
    const rssId = query.rssId as string
    const limit = parseInt(query.limit as string) || 20

    try {
      const messages = await cache.searchMessages({
        keyword,
        guildId,
        platform,
        rssId,
        limit
      })

      return {
        success: true,
        data: messages,
        total: messages.length
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 清理缓存
  ctx.server.post('/rss/cache/cleanup', async (query, body) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const guildId = query.guild as string
    const platform = query.platform as string
    const rssId = query.rssId as string
    const keepLatest = body.keepLatest ? parseInt(body.keepLatest as string) : undefined

    try {
      const deletedCount = await cache.cleanup({
        guildId,
        platform,
        rssId,
        keepLatest
      })

      return {
        success: true,
        data: {
          deletedCount
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 清空所有缓存
  ctx.server.post('/rss/cache/clear', async (query) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const guildId = query.guild as string
    const platform = query.platform as string

    try {
      const deletedCount = await cache.clearAll({
        guildId,
        platform
      })

      return {
        success: true,
        data: {
          deletedCount
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })

  // 更新缓存大小配置
  ctx.server.post('/rss/cache/config', async (query, body) => {
    const cache = getMessageCache()
    if (!cache) {
      return { error: '消息缓存未启用' }
    }

    const maxSize = parseInt(body.maxSize as string)

    if (isNaN(maxSize) || maxSize < 1) {
      return {
        success: false,
        error: '无效的缓存大小'
      }
    }

    try {
      cache.setMaxCacheSize(maxSize)

      return {
        success: true,
        data: {
          maxSize
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  })
}

/**
 * 消息缓存 API 接口文档
 */
export const messageCacheApiDocs = {
  // 获取缓存消息列表
  getMessages: {
    method: 'GET',
    path: '/rss/cache/messages',
    description: '获取缓存消息列表',
    parameters: {
      guild: '群组 ID（可选）',
      platform: '平台（可选）',
      rssId: '订阅 ID（可选）',
      limit: '返回数量（默认 20）',
      offset: '偏移量（默认 0）'
    }
  },

  // 获取单条消息
  getMessage: {
    method: 'GET',
    path: '/rss/cache/message/:id',
    description: '获取单条缓存消息详情',
    parameters: {
      id: '消息 ID（路径参数）'
    }
  },

  // 获取统计
  getStats: {
    method: 'GET',
    path: '/rss/cache/stats',
    description: '获取缓存统计信息',
    parameters: {
      guild: '群组 ID（可选）',
      platform: '平台（可选）'
    }
  },

  // 搜索消息
  searchMessages: {
    method: 'GET',
    path: '/rss/cache/search',
    description: '搜索缓存消息',
    parameters: {
      keyword: '搜索关键词（可选）',
      guild: '群组 ID（可选）',
      platform: '平台（可选）',
      rssId: '订阅 ID（可选）',
      limit: '返回数量（默认 20）'
    }
  },

  // 清理缓存
  cleanup: {
    method: 'POST',
    path: '/rss/cache/cleanup',
    description: '清理缓存（保留最新的 N 条）',
    parameters: {
      guild: '群组 ID（可选）',
      platform: '平台（可选）',
      rssId: '订阅 ID（可选）',
      keepLatest: '保留最新的消息数量（可选）'
    }
  },

  // 清空缓存
  clearAll: {
    method: 'POST',
    path: '/rss/cache/clear',
    description: '清空所有缓存',
    parameters: {
      guild: '群组 ID（可选）',
      platform: '平台（可选）'
    }
  },

  // 更新配置
  updateConfig: {
    method: 'POST',
    path: '/rss/cache/config',
    description: '更新缓存配置',
    parameters: {
      maxSize: '最大缓存条数'
    }
  }
}

/**
 * 生成 API 使用示例
 */
export function generateApiExamples(baseUrl: string = 'http://localhost:5140') {
  return {
    // 获取缓存消息列表
    getMessages: `${baseUrl}/rss/cache/messages?limit=20&offset=0`,
    getMessagesByGuild: `${baseUrl}/rss/cache/messages?guild=123456&platform=onebot`,
    getMessagesByRSS: `${baseUrl}/rss/cache/messages?rssId=example-feed&limit=10`,

    // 获取单条消息
    getMessage: `${baseUrl}/rss/cache/message/1`,

    // 获取统计
    getStats: `${baseUrl}/rss/cache/stats`,
    getStatsByGuild: `${baseUrl}/rss/cache/stats?guild=123456&platform=onebot`,

    // 搜索消息
    search: `${baseUrl}/rss/cache/search?keyword=新闻&limit=20`,

    // 清理缓存
    cleanup: `${baseUrl}/rss/cache/cleanup?keepLatest=100`,
    cleanupByGuild: `${baseUrl}/rss/cache/cleanup?guild=123456&platform=onebot&keepLatest=50`,

    // 清空缓存
    clearAll: `${baseUrl}/rss/cache/clear`,
    clearByGuild: `${baseUrl}/rss/cache/clear?guild=123456&platform=onebot`,

    // 更新配置
    updateConfig: `${baseUrl}/rss/cache/config?maxSize=200`
  }
}
