import { Context } from 'koishi'

import { Config } from '../types'
import { normalizeError } from '../utils/error-handler'
import { createDebugWithContext } from '../utils/logger'
import { isQueueDowngradeError } from './notification-queue-retry'
import { QueueTask, QueueTaskContent } from './notification-queue-types'

type QueueDebugFn = ReturnType<typeof createDebugWithContext>

interface NotificationQueueSenderDeps {
  ctx: Context
  config: Config
  createTaskDebug: (task: Partial<QueueTask>) => QueueDebugFn
  buildTaskLogContext: (task: Partial<QueueTask>) => Record<string, any>
}

export function downgradeQueueMessage(content: QueueTaskContent): QueueTaskContent {
  if (content.isDowngraded) {
    return {
      ...content,
      isDowngraded: true,
    }
  }

  const downgradedMessage = content.message.replace(/<video[^>]*>.*?<\/video>/gis, (match: string) => {
    const srcMatch = match.match(/src=["']([^"']+)["']/)
    if (srcMatch) {
      return `\n🎬 视频: ${srcMatch[1]}\n`
    }
    return '\n[视频不支持]\n'
  })

  return {
    ...content,
    message: downgradedMessage,
    isDowngraded: true,
  }
}

export class NotificationQueueSender {
  constructor(private deps: NotificationQueueSenderDeps) { }

  async sendMessage(task: QueueTask): Promise<void> {
    const { guildId, platform, content } = task
    const target = `${platform}:${guildId}`
    const taskDebug = this.deps.createTaskDebug(task)

    try {
      await this.deps.ctx.broadcast([target], content.message)
      taskDebug(`消息发送成功: ${target}`, 'queue', 'details')
    } catch (sendError: any) {
      if (isQueueDowngradeError(sendError) && !content.isDowngraded) {
        taskDebug('检测到 OneBot 1200 错误，尝试降级处理', 'queue', 'info', { errorCode: '1200' })
      }

      throw sendError
    }
  }

  async downgradeMessage(content: QueueTaskContent): Promise<QueueTaskContent> {
    return downgradeQueueMessage(content)
  }

  async cacheMessage(task: QueueTask): Promise<void> {
    if (!this.deps.config.cache?.enabled) {
      return
    }

    const taskDebug = this.deps.createTaskDebug(task)
    const { getMessageCache } = await import('../utils/message-cache')
    const cache = getMessageCache()

    if (!cache) {
      return
    }

    try {
      await cache.addMessage({
        rssId: task.rssId,
        guildId: task.guildId,
        platform: task.platform,
        title: task.content.title || '',
        content: task.content.description || '',
        link: task.content.link || '',
        pubDate: task.content.pubDate || new Date(),
        imageUrl: task.content.imageUrl || '',
        videoUrl: '',
        finalMessage: task.content.message,
      })
    } catch (err: any) {
      const normalizedError = normalizeError(err)
      taskDebug(`缓存消息失败: ${normalizedError.message}`, 'cache', 'info')
    }
  }
}