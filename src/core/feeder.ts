import { Context, clone } from 'koishi'
import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { parsePubDate, parseQuickUrl } from '../utils/common'
import { delCache } from '../utils/media'
import { getRssData } from './parser'
import { RssItemProcessor } from './item-processor'
import { quickList } from '../constants'
import { getMessageCache } from '../utils/message-cache'

export interface FeederDependencies {
  ctx: Context
  config: Config
  $http: any
}

let interval: any = null

export function findRssItem(rssList: any[], keyword: number | string) {
  let index = ((rssList.findIndex(i => i.rssId === +keyword) + 1) ||
    (rssList.findIndex(i => i.url == keyword) + 1) ||
    (rssList.findIndex(i => i.url.indexOf(keyword) + 1) + 1) ||
    (rssList.findIndex(i => i.title.indexOf(keyword) + 1) + 1)) - 1
  return rssList[index]
}

export function getLastContent(item: any, config: Config) {
  let arr = ['title', 'description', 'link', 'guid']
  let obj = Object.assign({}, ...arr.map(i => clone(item?.[i]) ? { [i]: item[i] } : {}))
  return { ...obj, description: String(obj?.description).replaceAll(/\s/g, '') }
}

export function formatArg(options: any, config: Config): rssArg {
  let { arg, template } = options
  let json = Object.assign({}, ...(arg?.split(',')?.map((i: string) => ({ [i.split(":")[0]]: i.split(":")[1] })) || []))
  let key = ["forceLength", "reverse", "timeout", "interval", "merge", "maxRssItem", "firstLoad", "bodyWidth", "bodyPadding", "proxyAgent", "auth"]
  let booleanKey = ['firstLoad', "reverse", 'merge']
  let numberKey = ['forceLength', "timeout", 'interval', 'maxRssItem', 'bodyWidth', 'bodyPadding']
  let falseContent = ['false', 'null', '']

  json = Object.assign({}, ...Object.keys(json).filter((i: string) => key.some((key: string) => key == i)).map((key: string) => ({ [key]: booleanKey.some((bkey: string) => bkey == key) ? falseContent.some((c: string) => c == json[key]) : numberKey.some((nkey: string) => nkey == key) ? (+json[key]) : json[key] })))

  if (template && config.template) {
    json['template'] = template
  }

  // Date/Number conversions
  if (json.interval) json.interval = parseInt(json.interval) * 1000
  if (json.forceLength) json.forceLength = parseInt(json.forceLength)

  // Array conversions
  if (json.filter && typeof json.filter === 'string') json.filter = json.filter.split("/")
  if (json.block && typeof json.block === 'string') json.block = json.block.split("/")

  // Proxy Argument Parsing
  if (json.proxyAgent) {
    if (['false', 'none', ''].includes(String(json.proxyAgent))) {
      json.proxyAgent = { enabled: false }
    } else if (typeof json.proxyAgent === 'string') {
      // Parse string proxy: socks5://127.0.0.1:7890
      let protocolMatch = json.proxyAgent.match(/^(http|https|socks5)/)
      let protocol = protocolMatch ? protocolMatch[1] : 'http'
      let hostMatch = json.proxyAgent.match(/:\/\/([^:\/]+)/)
      let host = hostMatch ? hostMatch[1] : ''
      let portMatch = json.proxyAgent.match(/:(\d+)/)
      let port = portMatch ? parseInt(portMatch[1]) : 7890

      let proxyAgent: any = { enabled: true, protocol, host, port }

      if (json.auth) {
        let [username, password] = json.auth.split("/")
        proxyAgent.auth = { username, password }
      }
      json.proxyAgent = proxyAgent
    }
  }

  return json
}

const mergeProxyAgent = (argProxy: any, configProxy: any, config: Config) => {
  // 打印调试信息
  debug(config, `合并代理配置 - argProxy: ${JSON.stringify(argProxy)}, configProxy.enabled: ${configProxy?.enabled}`, 'proxy merge debug', 'details')

  // 1. Explicit disable in Args (必须是明确设置为 false)
  if (argProxy?.enabled === false) {
    debug(config, `订阅明确禁用代理`, 'proxy merge', 'details')
    return { enabled: false }
  }

  // 2. Arg 有完整的 proxy 配置 (enabled=true 且有 host) -> 使用 Arg
  if (argProxy?.enabled === true && argProxy?.host) {
    debug(config, `使用订阅的代理配置`, 'proxy merge', 'details')
    return argProxy
  }

  // 3. Arg 是空对象、undefined、null，或者没有 enabled 字段 -> 使用全局配置
  // 这是关键：如果订阅没有单独配置代理，就应该使用全局配置
  const shouldUseConfigProxy = !argProxy || Object.keys(argProxy || {}).length === 0 || argProxy?.enabled === undefined || argProxy?.enabled === null

  if (shouldUseConfigProxy) {
    if (configProxy?.enabled) {
      const result = {
        enabled: true,
        protocol: configProxy.protocol,
        host: configProxy.host,
        port: configProxy.port,
        auth: configProxy.auth?.enabled ? configProxy.auth : undefined
      }
      debug(config, `使用全局代理: ${result.protocol}://${result.host}:${result.port}`, 'proxy merge', 'info')
      return result
    } else {
      debug(config, `全局代理未启用`, 'proxy merge', 'details')
    }
  }

  // 4. Arg 的 enabled=true 但没有 host -> 尝试补充全局配置
  if (argProxy?.enabled === true && !argProxy?.host) {
    const result = {
      ...configProxy,
      ...argProxy,
      auth: configProxy?.auth?.enabled ? configProxy.auth : undefined
    }
    debug(config, `订阅代理配置不完整，补充全局配置`, 'proxy merge', 'details')
    return result
  }

  // 5. Default disabled
  debug(config, `代理未配置，使用默认(禁用)`, 'proxy merge', 'details')
  return { enabled: false }
}

const mergeProxyAgentWithLog = (argProxy: any, configProxy: any, config: Config) => {
  const result = mergeProxyAgent(argProxy, configProxy, config);
  debug(config, `[DEBUG_PROXY] mergeProxyAgent input: arg=${JSON.stringify(argProxy)} conf=${JSON.stringify(configProxy)} output=${JSON.stringify(result)}`, 'proxy merge', 'details');
  return result;
}

export function mixinArg(arg: any, config: Config): rssArg {
  const mergedProxy = mergeProxyAgentWithLog(arg?.proxyAgent, config.net?.proxyAgent, config)

  // 打印代理配置合并结果（方便调试）
  if (mergedProxy?.enabled) {
    debug(config, `使用代理: ${mergedProxy.protocol}://${mergedProxy.host}:${mergedProxy.port}`, 'proxy merge', 'details')
  } else {
    debug(config, `代理未启用`, 'proxy merge', 'details')
  }

  // Flatten config into base object, prioritizing Config values
  // We explicitly take known safe config sections
  const baseConfig = {
    ...config.basic,
    // Add other flat config sections if necessary
  }

  const res = {
    ...baseConfig,
    ...arg, // Args override basic config
    filter: [...(config.msg?.keywordFilter || []), ...(arg?.filter || [])],
    block: [...(config.msg?.keywordBlock || []), ...(arg?.block || [])],
    template: arg.template ?? config.basic?.defaultTemplate,
    proxyAgent: mergedProxy
  }
  debug(config, `[DEBUG_PROXY] mixinArg return: ${JSON.stringify(res.proxyAgent)}`, 'mixin', 'details');
  return res;
}

export async function feeder(deps: FeederDependencies, processor: RssItemProcessor) {
  const { ctx, config, $http } = deps
  // debug(config, "feeder run", 'debug');

  // Use type assertion for custom table
  const rssList = await ctx.database.get(('rssOwl' as any), {})
  if (!rssList || rssList.length === 0) return

  for (const rssItem of rssList) {
    try {
      // 1. Prepare Arguments
      let arg: rssArg = mixinArg(rssItem.arg || {}, config)
      debug(config, `[DEBUG_PROXY] feeder mixinArg result proxyAgent: ${JSON.stringify(arg.proxyAgent)}`, 'feeder', 'details')
      let originalArg = clone(rssItem.arg || {})

      // 2. Interval Check
      if (rssItem.arg.interval) {
        const now = Date.now()
        if (arg.nextUpdataTime && arg.nextUpdataTime > now) continue

        // Calculate next update time
        if (arg.nextUpdataTime) {
          const missed = Math.ceil((now - arg.nextUpdataTime) / arg.interval)
          originalArg.nextUpdataTime = arg.nextUpdataTime + (arg.interval * (missed || 1))
        } else {
          originalArg.nextUpdataTime = now + arg.interval
        }
      }

      // 3. Fetch RSS Data
      // Use config.msg.rssHubUrl for quick url parsing
      const rssHubUrl = config.msg?.rssHubUrl || 'https://hub.slarker.me'

      let rssItemList = []
      try {
        const urls = rssItem.url.split("|").map((u: string) => parseQuickUrl(u, rssHubUrl, quickList))
        const fetchPromises = urls.map((url: string) => getRssData(ctx, config, $http, url, arg))
        const results = await Promise.all(fetchPromises)
        rssItemList = results.flat(1)
      } catch (err: any) {
        debug(config, `Fetch failed for ${rssItem.title}: ${err.message}`, 'feeder', 'info')
        continue
      }

      if (rssItemList.length === 0) continue

      // 4. Sort and Filter
      let itemArray = rssItemList
        .sort((a, b) => parsePubDate(config, b.pubDate).getTime() - parsePubDate(config, a.pubDate).getTime())
        .filter(item => {
          // Keyword filter
          const matchKeyword = arg.filter?.find((keyword: string) =>
            new RegExp(keyword, 'im').test(item.title) || new RegExp(keyword, 'im').test(item.description)
          )
          if (matchKeyword) {
            debug(config, `filter:${matchKeyword}`, '', 'info')
            debug(config, item, 'filter rss item', 'info')
          }
          return !matchKeyword
        })

      if (itemArray.length === 0) continue

      // 5. Check for Updates
      const latestItem = itemArray[0]
      const lastPubDate = parsePubDate(config, latestItem.pubDate)

      debug(config, `${rssItem.title}: Latest item date=${lastPubDate.toISOString()}, DB date=${rssItem.lastPubDate ? new Date(rssItem.lastPubDate).toISOString() : 'none'}`, 'feeder', 'details')

      // Prepare content for deduplication
      const currentContent = config.basic?.resendUpdataContent === 'all'
        ? itemArray.map((i: any) => getLastContent(i, config))
        : [getLastContent(latestItem, config)]

      // Reverse if needed for sending order (oldest first usually)
      if (arg.reverse) {
        itemArray = itemArray.reverse()
      }

      let rssItemArray = []

      if (rssItem.arg.forceLength) {
        // Force length mode: ignore time, just take N items
        rssItemArray = itemArray.slice(0, arg.forceLength)
        debug(config, `${rssItem.title}: Force length mode, taking ${rssItemArray.length} items`, 'feeder', 'details')
      } else {
        // Standard mode: Time & Content check
        debug(config, `${rssItem.title}: Checking ${itemArray.length} items for updates`, 'feeder', 'details')
        rssItemArray = itemArray.filter((v, i) => {
          const currentItemTime = parsePubDate(config, v.pubDate).getTime()
          const lastTime = rssItem.lastPubDate ? parsePubDate(config, rssItem.lastPubDate).getTime() : 0

          debug(config, `[${i}] ${v.title?.substring(0, 30)}: time=${new Date(currentItemTime).toISOString()} > last=${new Date(lastTime).toISOString()} ? ${currentItemTime > lastTime}`, 'feeder', 'details')

          // Strict time check
          if (currentItemTime > lastTime) {
            debug(config, `[${i}] ✓ Item is new (time check)`, 'feeder', 'details')
            return true
          }

          // Content hash check (if time is same but content changed)
          if (config.basic?.resendUpdataContent !== 'disable') {
            const newItemContent = getLastContent(v, config)
            const oldItemMatch = rssItem.lastContent?.itemArray?.find((old: any) =>
              (newItemContent.guid && old.guid === newItemContent.guid) ||
              (old.link === newItemContent.link && old.title === newItemContent.title)
            )

            if (oldItemMatch) {
              // If description changed, it's an update
              const descriptionChanged = JSON.stringify(oldItemMatch.description) !== JSON.stringify(newItemContent.description)
              if (descriptionChanged) {
                debug(config, `[${i}] ✓ Item is updated (content changed)`, 'feeder', 'details')
              } else {
                debug(config, `[${i}] ✗ Item filtered (already sent)`, 'feeder', 'details')
              }
              return descriptionChanged
            } else {
              debug(config, `[${i}] ✗ Item filtered (no match in lastContent)`, 'feeder', 'details')
            }
          }
          debug(config, `[${i}] ✗ Item filtered (failed all checks)`, 'feeder', 'details')
          return false
        })

        // Apply Max Item Limit
        if (arg.maxRssItem) {
          rssItemArray = rssItemArray.slice(0, arg.maxRssItem)
        }
      }

      if (rssItemArray.length === 0) {
        debug(config, `${rssItem.title}: No new items found after filtering`, 'feeder', 'info')
        // No new items, but we should still update 'lastContent' to latest state to prevent future drifts
        await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, {
          lastPubDate,
          arg: originalArg,
          lastContent: { itemArray: currentContent }
        })
        continue
      }

      debug(config, `${rssItem.title}: Found ${rssItemArray.length} new items`, 'feeder', 'info')
      debug(config, rssItemArray.map(i => i.title), '', 'info')

      // 6. Process Items (Generate Messages)
      const itemsToSend = [...rssItemArray].reverse()

      const messageList = (await Promise.all(
        itemsToSend.map(async i => await processor.parseRssItem(i, { ...rssItem, ...arg }, rssItem.author))
      )).filter(m => m) // Filter empty messages

      if (messageList.length === 0) {
        debug(config, `${rssItem.title}: Items found but parsed to empty messages`, 'feeder', 'info')
        // Items found but parsed to empty (e.g. filtered by video mode)
        await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { lastPubDate, arg: originalArg, lastContent: { itemArray: currentContent } })
        continue
      }

      // 7. Construct Final Message
      let message = ""
      const shouldMerge = arg.merge === true || config.basic?.merge === '一直合并' || (config.basic?.merge === '有多条更新时合并' && messageList.length > 1)

      // Check for video merge requirement
      const hasVideo = config.basic?.margeVideo && messageList.some(msg => /<video/.test(msg))

      if (shouldMerge || hasVideo) {
        message = `<message forward><author id="${rssItem.author}"/>${messageList.map(m => `<message>${m}</message>`).join("")}</message>`
      } else {
        message = messageList.join("")
      }

      // Add mentions
      if (rssItem.followers && rssItem.followers.length > 0) {
        const mentions = rssItem.followers.map((id: string) => `<at ${id === 'all' ? 'type="all"' : `id="${id}"`}/>`).join(" ")
        message += `<message>${mentions}</message>`
      }

      // 8. Send Broadcast
      try {
        debug(config, `Sending update for ${rssItem.title} to ${rssItem.platform}:${rssItem.guildId}`, 'feeder', 'details')

        // Koishi broadcast 会自动查找可用的 bot，无需手动检查
        // author 字段兼容用户ID和bot selfId两种格式
        // 发送消息
        try {
          await ctx.broadcast([`${rssItem.platform}:${rssItem.guildId}`], message)
          debug(config, `更新成功:${rssItem.title}`, '', 'info')
        } catch (sendError: any) {
          // OneBot retcode 1200: 不支持的消息格式（通常是视频）
          if (sendError.code?.toString?.() === '1200' || sendError.message?.includes('1200')) {
            debug(config, `消息格式不被支持，尝试清理视频元素后重试: ${rssItem.title}`, 'feeder', 'info')

            // 移除 video 元素，保留视频链接
            const fallbackMessage = message
              .replace(/<video[^>]*>.*?<\/video>/gis, (match: string) => {
                // 提取视频 URL
                const srcMatch = match.match(/src=["']([^"']+)["']/)
                if (srcMatch) {
                  return `\n🎬 视频: ${srcMatch[1]}\n`
                }
                return '\n[视频不支持]\n'
              })

            try {
              await ctx.broadcast([`${rssItem.platform}:${rssItem.guildId}`], fallbackMessage)
              debug(config, `降级发送成功:${rssItem.title}`, '', 'info')
            } catch (retryError: any) {
              debug(config, `降级发送也失败: ${retryError.message}`, 'feeder', 'error')
              throw retryError
            }
          } else {
            throw sendError
          }
        }

        // 缓存最终发送的消息
        if (config.cache?.enabled && messageList.length > 0) {
          const cache = getMessageCache()
          if (cache) {
            // 缓存每条消息的最终形式
            for (let i = 0; i < itemsToSend.length && i < messageList.length; i++) {
              const item = itemsToSend[i]
              const finalMsg = messageList[i]

              try {
                await cache.addMessage({
                  rssId: rssItem.rssId.toString(),
                  guildId: rssItem.guildId,
                  platform: rssItem.platform,
                  title: item.title || '',
                  content: item.description || '',
                  link: item.link || '',
                  pubDate: parsePubDate(config, item.pubDate),
                  imageUrl: item.enclosure?.url || '',
                  videoUrl: '',
                  finalMessage: finalMsg // 缓存最终发送的消息
                })
              } catch (err) {
                debug(config, `缓存消息失败: ${err.message}`, 'cache', 'info')
              }
            }
          }
        }
      } catch (err: any) {
        debug(config, `RSS推送失败 [${rssItem.title}]: ${err.message}`, 'feeder', 'error')
        console.error(`RSS推送失败 [${rssItem.title}]: ${err.message}`)
        // 即使发送失败，也要更新数据库状态，避免无限重试
      }

      // 9. Update Database State
      await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, {
        lastPubDate,
        arg: originalArg,
        lastContent: { itemArray: currentContent }
      })

    } catch (err: any) {
      debug(config, `Feeder error for ${rssItem.url}: ${err.message}`, 'feeder', 'error')
    }
  }
}

export function startFeeder(ctx: Context, config: Config, $http: any, processor: RssItemProcessor) {
  const deps = { ctx, config, $http }

  // Initial run
  feeder(deps, processor).catch(err => console.error("Initial feeder run failed:", err))

  const refreshInterval = (config.basic?.refresh || 600) * 1000
  interval = setInterval(async () => {
    if (config.basic?.imageMode === 'File') {
      await delCache(config)
    }
    await feeder(deps, processor)
  }, refreshInterval)
}

export function stopFeeder() {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}
