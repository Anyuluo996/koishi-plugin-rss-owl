import { Context } from 'koishi'

import {
  NewQueueTask,
  QueueCreateResult,
  QueueStats,
  QueueTask,
  QueueTaskContent,
  QueueTaskIdentity,
} from './notification-queue-types'

export const RSS_NOTIFICATION_QUEUE_TABLE = 'rss_notification_queue'

export class NotificationQueueStore {
  constructor(
    private ctx: Context,
    private batchSize: number,
  ) { }

  async findTaskByIdentity(identity: QueueTaskIdentity): Promise<QueueTask | null> {
    const tasks = await this.ctx.database.get(RSS_NOTIFICATION_QUEUE_TABLE, identity) as QueueTask[]

    if (!tasks.length) {
      return null
    }

    return [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  }

  async createTask(task: NewQueueTask): Promise<QueueCreateResult> {
    const existingTask = await this.findTaskByIdentity({
      subscribeId: task.subscribeId,
      uid: task.uid,
      guildId: task.guildId,
      platform: task.platform,
    })

    if (existingTask) {
      return {
        task: existingTask,
        created: false,
      }
    }

    const queueTask: QueueTask = {
      ...task,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const createdTask = await this.ctx.database.create(RSS_NOTIFICATION_QUEUE_TABLE, queueTask) as Partial<QueueTask>

    return {
      task: {
        ...queueTask,
        ...createdTask,
      },
      created: true,
    }
  }

  async getPendingTasks(): Promise<QueueTask[]> {
    const now = new Date()
    const pendingTasks = await this.ctx.database.get(
      RSS_NOTIFICATION_QUEUE_TABLE,
      { status: 'PENDING' },
      { limit: this.batchSize },
    ) as QueueTask[]

    const retryTasks = await this.ctx.database.get(
      RSS_NOTIFICATION_QUEUE_TABLE,
      { status: 'RETRY' },
      { limit: this.batchSize },
    ) as QueueTask[]

    const readyRetryTasks = retryTasks.filter(task =>
      task.nextRetryTime && new Date(task.nextRetryTime) <= now,
    )

    return [...pendingTasks, ...readyRetryTasks]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, this.batchSize)
  }

  async markTaskSuccess(taskId: number): Promise<void> {
    await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: taskId }, {
      status: 'SUCCESS',
      nextRetryTime: null,
      failReason: null,
      updatedAt: new Date(),
    })
  }

  async markTaskRetry(task: QueueTask, nextTime: Date, reason: string): Promise<void> {
    await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: task.id }, {
      status: 'RETRY',
      nextRetryTime: nextTime,
      retryCount: (task.retryCount || 0) + 1,
      failReason: reason,
      updatedAt: new Date(),
    })
  }

  async updateTaskForDowngrade(task: QueueTask, content: QueueTaskContent): Promise<void> {
    await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: task.id }, {
      content,
      status: 'RETRY',
      nextRetryTime: new Date(),
      retryCount: (task.retryCount || 0) + 1,
      failReason: null,
      updatedAt: new Date(),
    })
  }

  async markTaskFailed(taskId: number, reason: string): Promise<void> {
    await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: taskId }, {
      status: 'FAILED',
      nextRetryTime: null,
      failReason: reason,
      updatedAt: new Date(),
    })
  }

  async recoverRetryTasksWithoutNextRetryTime(): Promise<number> {
    const retryTasks = await this.ctx.database.get(
      RSS_NOTIFICATION_QUEUE_TABLE,
      { status: 'RETRY' },
      { limit: this.batchSize },
    ) as QueueTask[]

    const invalidTasks = retryTasks.filter(task => !task.nextRetryTime)

    for (const task of invalidTasks) {
      await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: task.id }, {
        status: 'RETRY',
        nextRetryTime: new Date(),
        updatedAt: new Date(),
      })
    }

    return invalidTasks.length
  }

  async getStats(): Promise<QueueStats> {
    const allTasks = await this.ctx.database.get(RSS_NOTIFICATION_QUEUE_TABLE, {})

    return {
      pending: allTasks.filter((task: any) => task.status === 'PENDING').length,
      retry: allTasks.filter((task: any) => task.status === 'RETRY').length,
      failed: allTasks.filter((task: any) => task.status === 'FAILED').length,
      success: allTasks.filter((task: any) => task.status === 'SUCCESS').length,
    }
  }

  async retryFailedTasks(taskId?: number): Promise<number> {
    const where = taskId ? { id: taskId } : { status: 'FAILED' }
    const tasks = await this.ctx.database.get(RSS_NOTIFICATION_QUEUE_TABLE, where) as QueueTask[]
    const failedTasks = tasks.filter(task => task.status === 'FAILED')

    for (const task of failedTasks) {
      await this.ctx.database.set(RSS_NOTIFICATION_QUEUE_TABLE, { id: task.id }, {
        status: 'PENDING',
        retryCount: 0,
        nextRetryTime: null,
        failReason: null,
        updatedAt: new Date(),
      })
    }

    return failedTasks.length
  }

  async cleanupSuccessTasks(olderThanHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
    const tasks = await this.ctx.database.get(
      RSS_NOTIFICATION_QUEUE_TABLE,
      { status: 'SUCCESS', updatedAt: { $lt: cutoffTime } },
    ) as QueueTask[]

    for (const task of tasks) {
      await this.ctx.database.remove(RSS_NOTIFICATION_QUEUE_TABLE, { id: task.id })
    }

    return tasks.length
  }
}