/**
 * 消息发送队列管理器
 * 实现可靠的消息推送，支持重试、降级和错误处理
 */

import { Context } from 'koishi'
import { Config } from '../types'
import { debug } from '../utils/logger'

// 队列任务状态
export type QueueStatus = 'PENDING' | 'RETRY' | 'FAILED' | 'SUCCESS'

/**
 * 队列任务接口
 */
export interface QueueTask {
  id?: number
  subscribeId: string          // 关联的订阅ID
  rssId: string                // 订阅源标识
  uid: string                  // 消息唯一标识
  guildId: string              // 目标群组
  platform: string             // 目标平台
  content: QueueTaskContent    // 消息内容
  status: QueueStatus          // 状态
  retryCount: number           // 当前重试次数
  nextRetryTime?: Date         // 下次重试时间
  createdAt: Date              // 创建时间
  updatedAt: Date              // 最后更新时间
  failReason?: string          // 失败原因
}

/**
 * 队列任务内容
 */
export interface QueueTaskContent {
  message: string              // 最终消息
  originalItem?: any           // 原始 RSS item（用于降级处理）
  isDowngraded?: boolean       // 是否已降级
  title?: string               // 标题（用于缓存）
  description?: string         // 描述（用于缓存）
  link?: string                // 链接（用于缓存）
  pubDate?: Date               // 发布时间（用于缓存）
  imageUrl?: string            // 图片URL（用于缓存）
}

/**
 * 消息发送队列管理器
 */
export class NotificationQueueManager {
  private ctx: Context
  private config: Config
  private processing = false
  private maxRetries = 5
  private batchSize = 10

  // 指数退避时间（秒）：10s, 30s, 1m, 5m, 10m
  private backoffDelays = [10, 30, 60, 300, 600]

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx
    this.config = config
  }

  /**
   * 添加任务到队列
   */
  async addTask(task: Omit<QueueTask, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>): Promise<QueueTask> {
    const queueTask: QueueTask = {
      ...task,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await this.ctx.database.create(('rss_notification_queue' as any), queueTask)
    debug(this.config, `任务已加入队列: [${task.rssId}] ${task.content.title}`, 'queue', 'info')

    return queueTask
  }

  /**
   * 处理队列中的任务
   */
  async processQueue(): Promise<void> {
    if (this.processing) {
      debug(this.config, '队列正在处理中，跳过本次', 'queue', 'details')
      return
    }

    this.processing = true
    try {
      // 1. 查找待处理任务
      const tasks = await this.getPendingTasks()

      if (tasks.length === 0) {
        return
      }

      debug(this.config, `开始处理 ${tasks.length} 个待发送任务`, 'queue', 'info')

      // 2. 逐个处理任务
      for (const task of tasks) {
        await this.processTask(task)
      }
    } catch (err: any) {
      debug(this.config, `队列处理异常: ${err.message}`, 'queue', 'error')
      console.error('Queue processing error:', err)
    } finally {
      this.processing = false
    }
  }

  /**
   * 获取待处理任务
   */
  private async getPendingTasks(): Promise<QueueTask[]> {
    const now = new Date()

    // 获取所有 PENDING 状态的任务
    const pendingTasks = await this.ctx.database.get(
      ('rss_notification_queue' as any),
      { status: 'PENDING' },
      { limit: this.batchSize }
    ) as QueueTask[]

    // 获取到达重试时间的 RETRY 状态任务
    const retryTasks = await this.ctx.database.get(
      ('rss_notification_queue' as any),
      { status: 'RETRY' },
      { limit: this.batchSize }
    ) as QueueTask[]

    // 过滤出到达重试时间的任务
    const readyRetryTasks = retryTasks.filter(task =>
      task.nextRetryTime && new Date(task.nextRetryTime) <= now
    )

    // 合并并按创建时间排序
    return [...pendingTasks, ...readyRetryTasks]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, this.batchSize)
  }

  /**
   * 处理单个任务
   */
  private async processTask(task: QueueTask): Promise<void> {
    debug(this.config, `处理任务 [${task.rssId}] ${task.content.title} (重试${task.retryCount}次)`, 'queue', 'details')

    try {
      // 尝试发送消息
      await this.sendMessage(task)

      // 发送成功：标记为 SUCCESS
      await this.markTaskSuccess(task.id!)
      debug(this.config, `✓ 任务发送成功: [${task.rssId}] ${task.content.title}`, 'queue', 'info')

      // 写入缓存
      await this.cacheMessage(task)

    } catch (error: any) {
      // 进入错误处理流程
      await this.handleSendError(task, error)
    }
  }

  /**
   * 发送消息（带降级机制）
   */
  private async sendMessage(task: QueueTask): Promise<void> {
    const { guildId, platform, content } = task
    const target = `${platform}:${guildId}`

    try {
      // 第一次尝试：发送原始消息
      await this.ctx.broadcast([target], content.message)
      debug(this.config, `消息发送成功: ${target}`, 'queue', 'details')

    } catch (sendError: any) {
      // OneBot retcode 1200: 不支持的消息格式（通常是视频）
      const isOneBot1200 = sendError.code?.toString?.() === '1200' || sendError.message?.includes('1200')

      if (isOneBot1200 && !content.isDowngraded) {
        debug(this.config, `检测到 OneBot 1200 错误，尝试降级处理`, 'queue', 'info')
        throw { ...sendError, isMediaError: true, requiresDowngrade: true }
      }

      throw sendError
    }
  }

  /**
   * 处理发送错误
   */
  private async handleSendError(task: QueueTask, error: any): Promise<void> {
    const errorMsg = error.message || 'Unknown error'

    // 1. 永久性错误 (Fatal) - 不需要重试
    if (this.isFatalError(error)) {
      await this.markTaskFailed(task.id!, errorMsg)
      debug(this.config, `✗ 永久性失败，放弃重试: [${task.rssId}] ${task.content.title} - ${errorMsg}`, 'queue', 'error')
      return
    }

    // 2. 降级重试 (Downgrade) - 针对媒体格式错误
    if (error.requiresDowngrade && !task.content.isDowngraded) {
      const downgradedContent = await this.downgradeMessage(task.content)
      await this.updateTaskForDowngrade(task.id!, downgradedContent)
      debug(this.config, `→ 消息已降级，立即重试: [${task.rssId}] ${task.content.title}`, 'queue', 'info')
      return
    }

    // 3. 暂时性错误 (Transient) - 使用指数退避
    const delay = this.backoffDelays[task.retryCount] || this.backoffDelays[this.backoffDelays.length - 1]
    const nextTime = new Date(Date.now() + delay * 1000)

    await this.markTaskRetry(task.id!, nextTime, errorMsg)
    debug(this.config, `→ 任务将在 ${Math.ceil(delay / 60)} 分钟后重试: [${task.rssId}] ${task.content.title}`, 'queue', 'info')
  }

  /**
   * 判断是否为永久性错误
   */
  private isFatalError(error: any): boolean {
    const errorCode = error.code || error.retcode

    // 群组不存在 / 账号不在群内
    if (errorCode === 'UnknownGroup' || errorCode === 'GROUP_NOT_FOUND') {
      return true
    }

    // 账号被封禁 / 被拉黑
    if (errorCode === 'UserBlock' || errorCode === 'BANNED') {
      return true
    }

    // 权限不足
    if (errorCode === 'PermissionDenied' || errorCode === 'NO_PERMISSION') {
      return true
    }

    // 超过最大重试次数
    // 这个判断在调用处处理

    return false
  }

  /**
   * 降级消息（移除媒体元素）
   */
  private async downgradeMessage(content: QueueTaskContent): Promise<QueueTaskContent> {
    // 移除 video 元素，保留视频链接
    let downgradedMessage = content.message.replace(/<video[^>]*>.*?<\/video>/gis, (match: string) => {
      const srcMatch = match.match(/src=["']([^"']+)["']/)
      if (srcMatch) {
        return `\n🎬 视频: ${srcMatch[1]}\n`
      }
      return '\n[视频不支持]\n'
    })

    // 移除 img 元素，保留图片链接（可选）
    // downgradedMessage = downgradedMessage.replace(/<img[^>]*>/gis, (match: string) => {
    //   const srcMatch = match.match(/src=["']([^"']+)["']/)
    //   if (srcMatch) {
    //     return `\n🖼️ 图片: ${srcMatch[1]}\n`
    //   }
    //   return '\n[图片不支持]\n'
    // })

    return {
      ...content,
      message: downgradedMessage,
      isDowngraded: true
    }
  }

  /**
   * 标记任务为成功
   */
  private async markTaskSuccess(taskId: number): Promise<void> {
    await this.ctx.database.set(('rss_notification_queue' as any), { id: taskId }, {
      status: 'SUCCESS',
      updatedAt: new Date()
    })

    // 可选：定期清理成功任务，避免数据库膨胀
    // await this.ctx.database.remove(('rss_notification_queue' as any), { id: taskId })
  }

  /**
   * 标记任务为重试
   */
  private async markTaskRetry(taskId: number, nextTime: Date, reason: string): Promise<void> {
    await this.ctx.database.set(('rss_notification_queue' as any), { id: taskId }, {
      status: 'RETRY',
      nextRetryTime: nextTime,
      retryCount: this.ctx.database.get(('rss_notification_queue' as any), { id: taskId }).then((tasks: any[]) => {
        return (tasks[0]?.retryCount || 0) + 1
      }),
      failReason: reason,
      updatedAt: new Date()
    })
  }

  /**
   * 更新任务为降级重试
   */
  private async updateTaskForDowngrade(taskId: number, newContent: QueueTaskContent): Promise<void> {
    // 获取当前任务
    const tasks = await this.ctx.database.get(('rss_notification_queue' as any), { id: taskId }) as any[]

    if (tasks.length === 0) return

    const currentTask = tasks[0]

    await this.ctx.database.set(('rss_notification_queue' as any), { id: taskId }, {
      content: newContent,
      status: 'RETRY',
      nextRetryTime: new Date(), // 立即重试
      retryCount: currentTask.retryCount + 1,
      updatedAt: new Date()
    })
  }

  /**
   * 标记任务为失败
   */
  private async markTaskFailed(taskId: number, reason: string): Promise<void> {
    await this.ctx.database.set(('rss_notification_queue' as any), { id: taskId }, {
      status: 'FAILED',
      failReason: reason,
      updatedAt: new Date()
    })
  }

  /**
   * 缓存成功发送的消息
   */
  private async cacheMessage(task: QueueTask): Promise<void> {
    if (!this.config.cache?.enabled) {
      return
    }

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
        finalMessage: task.content.message
      })
    } catch (err: any) {
      debug(this.config, `缓存消息失败: ${err.message}`, 'cache', 'info')
    }
  }

  /**
   * 获取队列统计信息
   */
  async getStats(): Promise<{
    pending: number
    retry: number
    failed: number
    success: number
  }> {
    const allTasks = await this.ctx.database.get(('rss_notification_queue' as any), {})

    return {
      pending: allTasks.filter((t: any) => t.status === 'PENDING').length,
      retry: allTasks.filter((t: any) => t.status === 'RETRY').length,
      failed: allTasks.filter((t: any) => t.status === 'FAILED').length,
      success: allTasks.filter((t: any) => t.status === 'SUCCESS').length
    }
  }

  /**
   * 重试失败的任务
   */
  async retryFailedTasks(taskId?: number): Promise<number> {
    const where = taskId ? { id: taskId } : { status: 'FAILED' }
    const tasks = await this.ctx.database.get(('rss_notification_queue' as any), where)

    for (const task of tasks) {
      await this.ctx.database.set(('rss_notification_queue' as any), { id: task.id }, {
        status: 'PENDING',
        retryCount: 0,
        failReason: null,
        updatedAt: new Date()
      })
    }

    debug(this.config, `已重置 ${tasks.length} 个失败任务为 PENDING 状态`, 'queue', 'info')

    return tasks.length
  }

  /**
   * 清理旧的成功任务
   */
  async cleanupSuccessTasks(olderThanHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)

    const tasks = await this.ctx.database.get(
      ('rss_notification_queue' as any),
      { status: 'SUCCESS', updatedAt: { $lt: cutoffTime } }
    )

    for (const task of tasks) {
      await this.ctx.database.remove(('rss_notification_queue' as any), { id: task.id })
    }

    debug(this.config, `已清理 ${tasks.length} 个旧的成功任务`, 'queue', 'info')

    return tasks.length
  }
}
