import { Context, clone } from 'koishi'

import { Config, rssArg } from '../types'
import { parsePubDate } from '../utils/common'
import { normalizeError } from '../utils/error-handler'
import { getNextUpdateTime, normalizeSubscriptionArg, setNextUpdateTime } from '../utils/legacy-config'
import { createDebugWithContext, debug } from '../utils/logger'
import { mixinArg } from './feeder-arg'
import {
  buildFeedLogContext,
  buildFinalMessage,
  checkForUpdates,
  createFeedDebug,
  fetchRssItems,
  filterItems,
  generateMessages,
  getLastContent,
} from './feeder-runtime'
import { RssItemProcessor } from './item-processor'
import { NotificationQueueManager, QueueTaskContent } from './notification-queue'
import { getQueueRuntimeConfig } from './notification-queue-retry'

export interface FeederDependencies {
  ctx: Context
  config: Config
  $http: any
  queueManager: NotificationQueueManager
}

export { formatArg, mixinArg } from './feeder-arg'
export { findRssItem, getLastContent } from './feeder-runtime'

let interval: any = null
let queueInterval: any = null
let cleanupInterval: any = null

// 重入栅栏：feeder() 单轮可能跑很久（订阅多 + 网络/tdl 慢），
// 若耗时超过 refreshInterval，下一次 interval tick 会并发启动第二个 feeder()，
// 导致同一消息被重复入队（addTask 的读-写去重非原子）→ 重复推送。
// 仿照 NotificationQueueManager.processQueue 的 processing 标志，单轮串行。
let feederRunning = false

function shouldSkipByInterval(rssItem: any, arg: rssArg, originalArg: Record<string, any>): boolean {
  if (!rssItem.arg.interval) return false

  const now = Date.now()
  const nextUpdateTime = getNextUpdateTime(arg)
  if (nextUpdateTime && nextUpdateTime > now) return true

  if (nextUpdateTime) {
    const missed = Math.ceil((now - nextUpdateTime) / arg.interval)
    setNextUpdateTime(originalArg, nextUpdateTime + (arg.interval * (missed || 1)))
  } else {
    setNextUpdateTime(originalArg, now + arg.interval)
  }

  return false
}

async function persistSubscriptionState(ctx: Context, rssItemId: number, state: Record<string, any>): Promise<void> {
  await ctx.database.set('rssOwl', { id: rssItemId }, state)
}

function buildQueueUid(item: any, config: Config): string {
  return String(
    item?.link
    || item?.guid
    || JSON.stringify(getLastContent(item, config))
  )
}

// ============ 主函数 ============

/**
 * 生产者：抓取 RSS，发现新消息，存入队列
 */
export async function feeder(deps: FeederDependencies, processor: RssItemProcessor) {
  const { ctx, config, $http, queueManager } = deps
  const rssList = await ctx.database.get('rssOwl', {})
  if (!rssList || rssList.length === 0) return

  for (const rssItem of rssList) {
    try {
      const feedDebug = createFeedDebug(config, rssItem)
      const arg: rssArg = mixinArg(rssItem.arg || {}, config)
      feedDebug(`[DEBUG_PROXY] feeder mixinArg result proxyAgent: ${JSON.stringify(arg.proxyAgent)}`, 'feeder', 'details')
      const originalArg = normalizeSubscriptionArg(clone(rssItem.arg || {}))

      if (shouldSkipByInterval(rssItem, arg, originalArg)) continue

      const rssItemList = await fetchRssItems(ctx, config, $http, rssItem, arg, feedDebug)
      if (rssItemList.length === 0) {
        await persistSubscriptionState(ctx, rssItem.id, {
          lastPubDate: rssItem.lastPubDate,
          arg: originalArg,
          lastContent: rssItem.lastContent || { itemArray: [] },
        })
        continue
      }

      const filteredItems = filterItems(rssItemList, arg, feedDebug)
      if (filteredItems.length === 0) {
        const latestItem = [...rssItemList]
          .sort((a, b) => parsePubDate(config, b.pubDate).getTime() - parsePubDate(config, a.pubDate).getTime())[0]

        await persistSubscriptionState(ctx, rssItem.id, {
          lastPubDate: latestItem ? parsePubDate(config, latestItem.pubDate) : rssItem.lastPubDate,
          arg: originalArg,
          lastContent: latestItem
            ? { itemArray: [getLastContent(latestItem, config)] }
            : (rssItem.lastContent || { itemArray: [] }),
        })
        continue
      }

      const { newItems, latestPubDate, currentContent } = checkForUpdates(config, rssItem, filteredItems, arg, feedDebug)

      if (newItems.length === 0) {
        feedDebug(`${rssItem.title}: No new items found after filtering`, 'feeder', 'info', { newItemCount: 0 })
        await persistSubscriptionState(ctx, rssItem.id, {
          lastPubDate: latestPubDate,
          arg: originalArg,
          lastContent: { itemArray: currentContent },
        })
        continue
      }

      feedDebug(`${rssItem.title}: Found ${newItems.length} new items`, 'feeder', 'info', { newItemCount: newItems.length })
      feedDebug(newItems.map(i => i.title), 'feeder', 'info', { newItemCount: newItems.length })

      const { messageList, itemsToSend } = await generateMessages(processor, newItems, rssItem, arg)

      if (messageList.length === 0) {
        feedDebug(`${rssItem.title}: Items found but parsed to empty messages`, 'feeder', 'info', { newItemCount: newItems.length })
        await persistSubscriptionState(ctx, rssItem.id, {
          lastPubDate: latestPubDate,
          arg: originalArg,
          lastContent: { itemArray: currentContent },
        })
        continue
      }

      const message = buildFinalMessage(config, messageList, rssItem, arg)

      const taskContent: QueueTaskContent = {
        message,
        originalItem: itemsToSend[0],
        isDowngraded: false,
        title: itemsToSend[0]?.title,
        description: itemsToSend[0]?.description,
        link: itemsToSend[0]?.link,
        pubDate: parsePubDate(config, itemsToSend[0]?.pubDate),
        imageUrl: itemsToSend[0]?.enclosure?.url,
      }

      await queueManager.addTask({
        subscribeId: String(rssItem.id),
        rssId: String(rssItem.rssId || rssItem.title),
        uid: buildQueueUid(itemsToSend[0], config),
        guildId: rssItem.guildId,
        platform: rssItem.platform,
        content: taskContent,
      })

      feedDebug(`✓ 已添加到发送队列: ${rssItem.title}`, 'feeder', 'info', {
        queuedItemTitle: itemsToSend[0]?.title,
      })

      await persistSubscriptionState(ctx, rssItem.id, {
        lastPubDate: latestPubDate,
        arg: originalArg,
        lastContent: { itemArray: currentContent },
      })

    } catch (err: any) {
      const normalizedError = normalizeError(err)
      const feedContext = buildFeedLogContext(rssItem)

      debug(config, `Feeder error for ${rssItem.url}: ${normalizedError.message}`, 'feeder', 'error', feedContext)
    }
  }
}

export function startFeeder(ctx: Context, config: Config, $http: any, processor: RssItemProcessor, queueManager: NotificationQueueManager) {
  // 幂等清理：若上一实例的 interval 尚未清理（未走 dispose 就再次 startFeeder），
  // 先清掉旧句柄，避免 ghost 定时器泄漏。
  if (interval) { clearInterval(interval); interval = null }
  if (queueInterval) { clearInterval(queueInterval); queueInterval = null }
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null }

  const deps = { ctx, config, $http, queueManager }
  const lifecycleDebug = createDebugWithContext(config, { lifecycle: 'feeder' })
  const queueRuntimeConfig = getQueueRuntimeConfig(config)

  // 受重入栅栏保护的 feeder 运行：避免上一轮未跑完时下一轮并发启动
  const runFeederGuarded = () => {
    if (feederRunning) {
      debug(config, 'feeder 上一轮仍在运行，跳过本次 tick', 'feeder', 'details', { skipped: true })
      return Promise.resolve()
    }
    feederRunning = true
    return feeder(deps, processor).finally(() => {
      feederRunning = false
    })
  }

  // Initial run
  runFeederGuarded().catch(err => {
    const normalizedError = normalizeError(err)
    lifecycleDebug(`Initial feeder run failed: ${normalizedError.message}`, 'feeder', 'error', {
      operation: 'initial-feeder-run',
    })
  })

  // 启动生产者定时器（抓取 RSS）
  const refreshInterval = (config.basic?.refresh || 600) * 1000
  interval = setInterval(async () => {
    if (config.basic?.imageMode === 'File') {
      const { delCache } = await import('../utils/media')
      await delCache(config)
    }
    await runFeederGuarded()
  }, refreshInterval)

  // 启动消费者定时器（处理发送队列）
  // 频率更高，确保消息快速发送
  const queueProcessInterval = queueRuntimeConfig.processIntervalSeconds * 1000
  queueInterval = setInterval(async () => {
    await queueManager.processQueue()
  }, queueProcessInterval)

  // 启动清理定时器：周期性删除过期的 SUCCESS/FAILED 任务，
  // 防止 rss_notification_queue 表无限膨胀拖慢查询（此前只手动命令清理）。
  // 每小时一次，cleanupHours 控制具体保留时长。
  cleanupInterval = setInterval(async () => {
    try {
      await queueManager.runAutomaticCleanup()
    } catch (err: any) {
      const normalizedError = normalizeError(err)
      lifecycleDebug(`自动清理失败: ${normalizedError.message}`, 'queue', 'error', {
        operation: 'automatic-cleanup',
      })
    }
  }, 60 * 60 * 1000)

  // 立即处理一次队列（启动时）
  queueManager.processQueue().catch(err => {
    const normalizedError = normalizeError(err)
    lifecycleDebug(`Initial queue processing failed: ${normalizedError.message}`, 'queue', 'error', {
      operation: 'initial-queue-processing',
    })
  })

  lifecycleDebug('Feeder started', 'feeder', 'info', {
    refreshInterval,
    queueProcessInterval,
  })
}

export function stopFeeder(config?: Config) {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
  if (queueInterval) {
    clearInterval(queueInterval)
    queueInterval = null
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
  // 复位栅栏：避免上一轮未跑完就 stopFeeder 后，下次 startFeeder 时栅栏卡死
  feederRunning = false

  if (config) {
    const lifecycleDebug = createDebugWithContext(config, { lifecycle: 'feeder' })
    lifecycleDebug('Feeder stopped', 'feeder', 'info')
  }
}
