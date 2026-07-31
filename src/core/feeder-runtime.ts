import { Context, clone } from 'koishi'

import { quickList } from '../constants'
import { Config, rssArg } from '../types'
import { parsePubDate, parseQuickUrl } from '../utils/common'
import { normalizeError } from '../utils/error-handler'
import { getResendUpdatedContent, shouldMergeVideo } from '../utils/legacy-config'
import { createDebugWithContext } from '../utils/logger'
import { RssItemProcessor } from './item-processor'
import { getRssData } from './parser'

type FeedDebugFn = ReturnType<typeof createDebugWithContext>

/**
 * 构建订阅抓取日志上下文。
 *
 * @param rssItem - 订阅记录
 * @returns 日志上下文
 */
export function buildFeedLogContext(rssItem: any): Record<string, any> {
  return {
    subscribeId: String(rssItem.id),
    rssId: rssItem.rssId || rssItem.title,
    rssTitle: rssItem.title,
    url: rssItem.url,
    guildId: rssItem.guildId,
    platform: rssItem.platform,
  }
}

/**
 * 创建带订阅上下文的调试函数。
 *
 * @param config - 插件配置
 * @param rssItem - 订阅记录
 * @returns 调试函数
 */
export function createFeedDebug(config: Config, rssItem: any): FeedDebugFn {
  return createDebugWithContext(config, buildFeedLogContext(rssItem))
}

/**
 * 根据序号、URL 或标题查找订阅项。
 *
 * @param rssList - 订阅列表
 * @param keyword - 查找关键字
 * @returns 匹配到的订阅项
 */
export function findRssItem(rssList: any[], keyword: number | string) {
  if (typeof keyword === 'number' || /^\d+$/.test(String(keyword))) {
    const listIndex = parseInt(String(keyword)) - 1
    if (listIndex >= 0 && listIndex < rssList.length) {
      return rssList[listIndex]
    }
  }

  const index = ((rssList.findIndex(i => i.rssId === +keyword) + 1) ||
    (rssList.findIndex(i => i.url == keyword) + 1) ||
    (rssList.findIndex(i => i.url.indexOf(keyword) + 1) + 1) ||
    (rssList.findIndex(i => i.title.indexOf(keyword) + 1) + 1)) - 1

  if (index < 0 || index >= rssList.length) {
    return undefined
  }
  return rssList[index]
}

/**
 * 提取用于去重的内容字段。
 *
 * @param item - RSS 条目
 * @param _config - 插件配置（保留兼容签名）
 * @returns 去重内容对象
 */
export function getLastContent(item: any, _config: Config) {
  const keys = ['title', 'description', 'link', 'guid']
  const obj = Object.assign({}, ...keys.map(key => clone(item?.[key]) ? { [key]: item[key] } : {}))
  return { ...obj, description: String(obj?.description).replaceAll(/\s/g, '') }
}

/**
 * 抓取订阅的所有 RSS 条目。
 *
 * @param ctx - Koishi 上下文
 * @param config - 插件配置
 * @param $http - HTTP 函数
 * @param rssItem - 订阅记录
 * @param arg - 运行时参数
 * @param feedDebug - 调试函数
 * @returns 抓取到的条目列表
 */
export async function fetchRssItems(
  ctx: Context,
  config: Config,
  $http: any,
  rssItem: any,
  arg: rssArg,
  feedDebug: FeedDebugFn,
): Promise<any[]> {
  const rssHubUrl = config.msg?.rssHubUrl || 'https://hub.slarker.me'

  try {
    const urls = rssItem.url.split('|').map((url: string) => parseQuickUrl(url, rssHubUrl, quickList))
    const results = await Promise.all(urls.map(async (url: string) => await getRssData(ctx, config, $http, url, arg)))
    return results.flat(1)
  } catch (error: any) {
    const normalizedError = normalizeError(error)
    feedDebug(`Fetch failed for ${rssItem.title}: ${normalizedError.message}`, 'feeder', 'error', {
      stage: 'fetch',
    })
    return []
  }
}

/**
 * 按过滤词过滤抓取结果。
 *
 * @param items - 原始条目列表
 * @param arg - 运行时参数
 * @param feedDebug - 调试函数
 * @returns 过滤后的条目列表
 */
export function filterItems(items: any[], arg: rssArg, feedDebug: FeedDebugFn): any[] {
  return items.filter(item => {
    const matchKeyword = arg.filter?.find((keyword: string) =>
      new RegExp(keyword, 'im').test(item.title) || new RegExp(keyword, 'im').test(item.description),
    )
    if (matchKeyword) {
      feedDebug(`filter:${matchKeyword}`, 'feeder', 'info', { matchedKeyword: matchKeyword })
      feedDebug(item, 'filter rss item', 'info', { matchedKeyword: matchKeyword })
    }
    return !matchKeyword
  })
}

/**
 * 检查条目是否为新增或更新内容。
 *
 * @param config - 插件配置
 * @param rssItem - 订阅记录
 * @param items - 过滤后的条目列表
 * @param arg - 运行时参数
 * @param feedDebug - 调试函数
 * @returns 新条目、最新发布时间与当前去重内容
 */
export function checkForUpdates(
  config: Config,
  rssItem: any,
  items: any[],
  arg: rssArg,
  feedDebug: FeedDebugFn,
): { newItems: any[]; latestPubDate: Date; currentContent: any[] } {
  const resendUpdatedContent = getResendUpdatedContent(config)
  let itemArray = items
    .sort((a, b) => parsePubDate(config, b.pubDate).getTime() - parsePubDate(config, a.pubDate).getTime())

  if (itemArray.length === 0) {
    return { newItems: [], latestPubDate: new Date(), currentContent: [] }
  }

  const latestItem = itemArray[0]
  const lastPubDate = parsePubDate(config, latestItem.pubDate)

  feedDebug(`${rssItem.title}: Latest item date=${lastPubDate.toISOString()}, DB date=${rssItem.lastPubDate ? new Date(rssItem.lastPubDate).toISOString() : 'none'}`, 'feeder', 'details')

  const currentContent = resendUpdatedContent === 'all'
    ? itemArray.map((item: any) => getLastContent(item, config))
    : [getLastContent(latestItem, config)]

  if (arg.reverse) {
    itemArray = itemArray.reverse()
  }

  let rssItemArray: any[] = []

  if (rssItem.arg.forceLength) {
    rssItemArray = itemArray.slice(0, rssItem.arg.forceLength)
    feedDebug(`${rssItem.title}: Force length mode, taking ${rssItemArray.length} items`, 'feeder', 'details')
  } else {
    feedDebug(`${rssItem.title}: Checking ${itemArray.length} items for updates`, 'feeder', 'details')
    rssItemArray = itemArray.filter((item, index) => {
      const currentItemTime = parsePubDate(config, item.pubDate).getTime()
      const lastTime = rssItem.lastPubDate ? parsePubDate(config, rssItem.lastPubDate).getTime() : 0

      feedDebug(`[${index}] ${item.title?.substring(0, 30)}: time=${new Date(currentItemTime).toISOString()} > last=${new Date(lastTime).toISOString()} ? ${currentItemTime > lastTime}`, 'feeder', 'details')

      if (currentItemTime > lastTime) {
        feedDebug(`[${index}] ✓ Item is new (time check)`, 'feeder', 'details')
        return true
      }

      if (resendUpdatedContent !== 'disable') {
        const newItemContent = getLastContent(item, config)
        const oldItemMatch = rssItem.lastContent?.itemArray?.find((old: any) =>
          (newItemContent.guid && old.guid === newItemContent.guid) ||
          (old.link === newItemContent.link && old.title === newItemContent.title),
        )

        if (oldItemMatch) {
          const descriptionChanged = JSON.stringify(oldItemMatch.description) !== JSON.stringify(newItemContent.description)
          if (descriptionChanged) {
            feedDebug(`[${index}] ✓ Item is updated (content changed)`, 'feeder', 'details')
          } else {
            feedDebug(`[${index}] ✗ Item filtered (already sent)`, 'feeder', 'details')
          }
          return descriptionChanged
        }

        feedDebug(`[${index}] ✗ Item filtered (no match in lastContent)`, 'feeder', 'details')
      }

      feedDebug(`[${index}] ✗ Item filtered (failed all checks)`, 'feeder', 'details')
      return false
    })

    if (arg.maxRssItem) {
      rssItemArray = rssItemArray.slice(0, arg.maxRssItem)
    }
  }

  return { newItems: rssItemArray, latestPubDate: lastPubDate, currentContent }
}

/**
 * 将 RSS 条目解析为待发送消息。
 *
 * @param processor - 条目处理器
 * @param items - 待发送条目
 * @param rssItem - 订阅记录
 * @param arg - 运行时参数
 * @returns 消息列表与发送顺序条目列表
 */
export async function generateMessages(
  processor: RssItemProcessor,
  items: any[],
  rssItem: any,
  arg: rssArg,
): Promise<{ messageList: string[]; itemsToSend: any[] }> {
  const itemsToSend = [...items].reverse()
  const messageList = (await Promise.all(
    itemsToSend.map(async item => await processor.parseRssItem(item, { ...rssItem, ...arg }, rssItem.author)),
  )).filter(message => message)

  return { messageList, itemsToSend }
}

/**
 * 构建最终入队消息内容。
 *
 * @param config - 插件配置
 * @param messageList - 消息片段列表
 * @param rssItem - 订阅记录
 * @param arg - 运行时参数
 * @returns 最终发送消息
 */
export function buildFinalMessage(config: Config, messageList: string[], rssItem: any, arg: rssArg): string {
  let message = ''
  const shouldMerge = arg.merge === true || config.basic?.merge === '一直合并' || (config.basic?.merge === '有多条更新时合并' && messageList.length > 1)
  const hasVideo = shouldMergeVideo(config) && messageList.some(msg => /<video/.test(msg))
  // 图片数量达到阈值（4 张）时合并转发，规避部分适配器对大量图片的限制
  const MERGE_IMAGE_THRESHOLD = 4
  const imageCount = messageList.reduce((sum, msg) => sum + (msg.match(/<img\b/gi)?.length || 0), 0)
  const shouldMergeByImage = imageCount >= MERGE_IMAGE_THRESHOLD

  if (shouldMerge || hasVideo || shouldMergeByImage) {
    message = `<message forward><author id="${rssItem.author}"/>${messageList.map(msg => `<message>${msg}</message>`).join('')}</message>`
  } else {
    message = messageList.join('')
  }

  if (rssItem.followers && rssItem.followers.length > 0) {
    const mentions = rssItem.followers.map((id: string) => `<at ${id === 'all' ? 'type="all"' : `id="${id}"`}/>`).join(' ')
    message += `<message>${mentions}</message>`
  }

  return message
}