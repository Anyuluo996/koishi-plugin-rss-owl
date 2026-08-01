/**
 * NotificationQueueManager 单元测试
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { NotificationQueueManager, QueueTask } from '../../src/core/notification-queue'
import { classifyQueueError, getQueueRuntimeConfig } from '../../src/core/notification-queue-retry'
import { downgradeQueueMessage } from '../../src/core/notification-queue-sender'
import { Config } from '../../src/types'

function createConfig(queue?: Config['queue']): Config {
  return {
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
      enabled: false,
      maxSize: 100,
    },
    queue,
  } as Config
}

function createTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: 1,
    subscribeId: 'sub-1',
    rssId: 'rss-1',
    uid: 'uid-1',
    guildId: 'guild-1',
    platform: 'onebot',
    content: { message: 'test message', title: 'test title' },
    status: 'PENDING',
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function matchesQuery(task: QueueTask, query: Record<string, any> = {}): boolean {
  return Object.entries(query).every(([key, expected]) => {
    const actual = (task as any)[key]
    if (expected && typeof expected === 'object' && '$lt' in expected) {
      return new Date(actual).getTime() < new Date(expected.$lt).getTime()
    }
    return actual === expected
  })
}

function createMockContext(initialTasks: QueueTask[] = []) {
  let nextId = initialTasks.reduce((max, task) => Math.max(max, task.id || 0), 0) + 1
  const tasks = initialTasks.map(task => ({ ...task }))

  const database = {
    get: jest.fn(async (_table: string, query: Record<string, any> = {}, options?: { limit?: number }) => {
      const matched = tasks.filter(task => matchesQuery(task, query))
      return options?.limit ? matched.slice(0, options.limit) : matched
    }),
    create: jest.fn(async (_table: string, task: QueueTask) => {
      const createdTask = { ...task, id: nextId++ }
      tasks.push(createdTask)
      return { id: createdTask.id }
    }),
    set: jest.fn(async (_table: string, query: Record<string, any>, update: Partial<QueueTask>) => {
      for (const task of tasks) {
        if (matchesQuery(task, query)) {
          Object.assign(task, update)
        }
      }
    }),
    remove: jest.fn(async (_table: string, query: Record<string, any>) => {
      for (let index = tasks.length - 1; index >= 0; index--) {
        if (matchesQuery(tasks[index], query)) {
          tasks.splice(index, 1)
        }
      }
    }),
  }

  return {
    ctx: {
      database,
      broadcast: jest.fn(async () => undefined),
    } as any,
    tasks,
  }
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('notification-queue helpers', () => {
  it('应该收紧 queue 运行时配置边界', () => {
    const runtimeConfig = getQueueRuntimeConfig({
      queue: {
        batchSize: 0,
        maxRetries: 999,
        processInterval: 1,
        cleanupHours: 9999,
      },
    } as Config)

    expect(runtimeConfig).toEqual({
      batchSize: 1,
      maxRetries: 20,
      processIntervalSeconds: 5,
      cleanupHours: 720,
    })
  })

  it('应该正确分类 FAILED / DOWNGRADE / RETRY 错误', () => {
    expect(classifyQueueError({ code: 'UnknownGroup' }).action).toBe('FAILED')
    expect(classifyQueueError({ code: '1200' }, { isDowngraded: false }).action).toBe('DOWNGRADE')
    expect(classifyQueueError(new Error('timeout')).action).toBe('RETRY')
  })

  it('应该将 video 标签降级为可读文本', () => {
    const result = downgradeQueueMessage({
      message: '<p>hello</p><video src="https://example.com/video.mp4"></video>',
      isDowngraded: false,
    })

    expect(result.message).toContain('<p>hello</p>')
    expect(result.message).toContain('🎬 视频: https://example.com/video.mp4')
    expect(result.message).not.toContain('<video')
    expect(result.isDowngraded).toBe(true)
  })
})

describe('NotificationQueueManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('应该添加任务并设置默认状态', async () => {
    const { ctx, tasks } = createMockContext()
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    const result = await queueManager.addTask({
      subscribeId: 'sub-1',
      rssId: 'rss-1',
      uid: 'uid-1',
      guildId: 'guild-1',
      platform: 'onebot',
      content: { message: 'hello' },
    })

    expect(result.id).toBeDefined()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('PENDING')
    expect(tasks[0].retryCount).toBe(0)
  })

  it('应该跳过重复任务入队并返回已存在任务', async () => {
    const existingTask = createTask({ id: 11, updatedAt: new Date('2026-03-11T10:00:00Z') })
    const { ctx, tasks } = createMockContext([existingTask])
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    const result = await queueManager.addTask({
      subscribeId: existingTask.subscribeId,
      rssId: existingTask.rssId,
      uid: existingTask.uid,
      guildId: existingTask.guildId,
      platform: existingTask.platform,
      content: { message: 'duplicate' },
    })

    expect(result.id).toBe(11)
    expect(tasks).toHaveLength(1)
    expect(ctx.database.create).not.toHaveBeenCalled()
  })

  it('应该返回正确的队列统计', async () => {
    const { ctx } = createMockContext([
      createTask({ id: 1, status: 'PENDING' }),
      createTask({ id: 2, status: 'RETRY' }),
      createTask({ id: 3, status: 'FAILED' }),
      createTask({ id: 4, status: 'SUCCESS' }),
      createTask({ id: 5, status: 'SUCCESS' }),
    ])
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await expect(queueManager.getStats()).resolves.toEqual({
      pending: 1,
      retry: 1,
      failed: 1,
      success: 2,
    })
  })

  it('应该重置失败任务为 PENDING 并清理失败字段', async () => {
    const failedTask = createTask({
      id: 21,
      status: 'FAILED',
      retryCount: 3,
      nextRetryTime: new Date(),
      failReason: 'boom',
    })
    const { ctx, tasks } = createMockContext([failedTask])
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await expect(queueManager.retryFailedTasks()).resolves.toBe(1)
    expect(tasks[0].status).toBe('PENDING')
    expect(tasks[0].retryCount).toBe(0)
    expect(tasks[0].nextRetryTime).toBeNull()
    expect(tasks[0].failReason).toBeNull()
  })

  it('应该在未显式传参时使用 queue.cleanupHours 清理成功任务', async () => {
    const { ctx, tasks } = createMockContext([
      createTask({ id: 31, status: 'SUCCESS', updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }),
      createTask({ id: 32, status: 'SUCCESS', updatedAt: new Date(Date.now() - 30 * 60 * 1000) }),
    ])
    const queueManager = new NotificationQueueManager(ctx, createConfig({ cleanupHours: 1 }))

    await expect(queueManager.cleanupSuccessTasks()).resolves.toBe(1)
    expect(tasks.map(task => task.id)).toEqual([32])
  })

  it('应该在发送成功后标记任务成功', async () => {
    const { ctx, tasks } = createMockContext([createTask({ id: 41, status: 'PENDING' })])
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await queueManager.processQueue()

    expect(ctx.broadcast).toHaveBeenCalledWith(['onebot:guild-1'], 'test message')
    expect(tasks[0].status).toBe('SUCCESS')
    expect(tasks[0].nextRetryTime).toBeNull()
    expect(tasks[0].failReason).toBeNull()
  })

  it('应该将临时错误标记为 RETRY 并设置 nextRetryTime', async () => {
    const { ctx, tasks } = createMockContext([createTask({ id: 51, status: 'PENDING' })])
    ctx.broadcast.mockRejectedValueOnce(new Error('Network timeout'))
    const queueManager = new NotificationQueueManager(ctx, createConfig({ maxRetries: 2 }))

    await queueManager.processQueue()

    expect(tasks[0].status).toBe('RETRY')
    expect(tasks[0].retryCount).toBe(1)
    expect(tasks[0].nextRetryTime).toBeInstanceOf(Date)
    expect(tasks[0].failReason).toContain('Network timeout')
  })

  it('应该在达到最大重试次数后直接失败', async () => {
    const { ctx, tasks } = createMockContext([
      createTask({ id: 61, status: 'PENDING', retryCount: 2 }),
    ])
    ctx.broadcast.mockRejectedValueOnce(new Error('Still failing'))
    const queueManager = new NotificationQueueManager(ctx, createConfig({ maxRetries: 2 }))

    await queueManager.processQueue()

    expect(tasks[0].status).toBe('FAILED')
    expect(tasks[0].nextRetryTime).toBeNull()
    expect(tasks[0].failReason).toContain('超过最大重试次数(2)')
  })

  it('应该在识别到 1200 错误时降级并立即重试', async () => {
    const { ctx, tasks } = createMockContext([
      createTask({
        id: 71,
        content: { message: '<video src="video.mp4"></video>', isDowngraded: false },
      }),
    ])
    const mediaError = Object.assign(new Error('OneBot retcode 1200'), { code: '1200' })
    ctx.broadcast.mockRejectedValueOnce(mediaError)
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await queueManager.processQueue()

    expect(tasks[0].status).toBe('RETRY')
    expect(tasks[0].retryCount).toBe(1)
    expect(tasks[0].nextRetryTime).toBeInstanceOf(Date)
    expect(tasks[0].failReason).toBeNull()
    expect(tasks[0].content.isDowngraded).toBe(true)
    expect(tasks[0].content.message).toContain('🎬 视频: video.mp4')
  })

  it('应该将永久错误直接标记为 FAILED', async () => {
    const { ctx, tasks } = createMockContext([createTask({ id: 81, status: 'PENDING' })])
    ctx.broadcast.mockRejectedValueOnce(Object.assign(new Error('UnknownGroup'), { code: 'UnknownGroup' }))
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await queueManager.processQueue()

    expect(tasks[0].status).toBe('FAILED')
    expect(tasks[0].failReason).toContain('UnknownGroup')
  })

  it('应该在首次处理前恢复缺少 nextRetryTime 的 RETRY 任务', async () => {
    const { ctx, tasks } = createMockContext([
      createTask({ id: 91, status: 'RETRY', retryCount: 1, nextRetryTime: undefined }),
    ])
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    await queueManager.processQueue()

    expect(ctx.broadcast).toHaveBeenCalledWith(['onebot:guild-1'], 'test message')
    expect(tasks[0].status).toBe('SUCCESS')
    expect(tasks[0].nextRetryTime).toBeNull()
  })

  it('应该通过 isProcessing 防止并发处理', async () => {
    let resolveBroadcast!: () => void
    const broadcastPromise = new Promise<void>(resolve => {
      resolveBroadcast = resolve
    })

    const { ctx } = createMockContext([createTask({ id: 101, status: 'PENDING' })])
    ctx.broadcast.mockImplementationOnce(() => broadcastPromise)
    const queueManager = new NotificationQueueManager(ctx, createConfig())

    const firstRun = queueManager.processQueue()
    await flushPromises()

    expect(queueManager.isProcessing()).toBe(true)
    const getCallsBefore = ctx.database.get.mock.calls.length

    await queueManager.processQueue()

    expect(ctx.database.get.mock.calls.length).toBe(getCallsBefore)

    resolveBroadcast()
    await firstRun

    expect(queueManager.isProcessing()).toBe(false)
  })

  it('合并转发子消息过多时按 forwardBatchSize 分多次 broadcast', async () => {
    // 构造含 9 个子节点的大 forward + 外部 at 提及
    const children = Array.from({ length: 9 }, (_, i) => `<message>子${i + 1}</message>`).join('')
    const bigForward = `<message forward><author id="bot-1"/>${children}</message><message><at id="123"/></message>`

    const { ctx, tasks } = createMockContext([
      createTask({ id: 111, status: 'PENDING', content: { message: bigForward } }),
    ])
    // 配置 forwardBatchSize=4 → 应拆成 3 批 (4+4+1)
    const config = createConfig()
    config.basic!.forwardBatchSize = 4
    const queueManager = new NotificationQueueManager(ctx, config)

    await queueManager.processQueue()

    // broadcast 被调用 3 次
    expect(ctx.broadcast).toHaveBeenCalledTimes(3)
    // 每次第二个参数都是合法的小 forward
    for (const call of ctx.broadcast.mock.calls) {
      const content = call[1] as string
      expect(content).toMatch(/^<message forward>/)
    }
    // 最后一批尾部带外部 at 提及
    const lastCall = ctx.broadcast.mock.calls[ctx.broadcast.mock.calls.length - 1]
    expect(lastCall[1]).toContain('<at id="123"/>')
    // 任务成功
    expect(tasks[0].status).toBe('SUCCESS')
  })

  it('非 forward 消息不受 forwardBatchSize 影响（仍单次 broadcast）', async () => {
    const { ctx } = createMockContext([createTask({ id: 121, status: 'PENDING' })])
    const config = createConfig()
    config.basic!.forwardBatchSize = 4
    const queueManager = new NotificationQueueManager(ctx, config)

    await queueManager.processQueue()

    expect(ctx.broadcast).toHaveBeenCalledTimes(1)
    expect(ctx.broadcast).toHaveBeenCalledWith(['onebot:guild-1'], 'test message')
  })
})