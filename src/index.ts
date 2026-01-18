import { Context, Session, Logger, Schema, h, clone } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { } from '@koishijs/censor'

// Export types and config
export { Config } from './config'
export * from './types'
export { templateList } from './config'

import type { Config } from './types'

export const name = '@anyul/koishi-plugin-rss'

// Import utilities
import { debug } from './utils/logger'
import { createHttpFunction, RequestManager } from './utils/fetcher'
import { parsePubDate, ensureUrlProtocol, parseQuickUrl, parseTemplateContent, cleanContent } from './utils/common'
import { getImageUrl, getVideoUrl, puppeteerToFile, writeCacheFile, delCache, getCacheDir } from './utils/media'
import { getDefaultTemplate, getDescriptionTemplate } from './utils/template'
import { getFriendlyErrorMessage } from './utils/error-handler'
import { executeCommand, CommandError } from './commands/error-handler'

// Import core modules
import { getAiSummary, generateSelectorByAI } from './core/ai'
import { getRssData } from './core/parser'
import { renderHtml2Image, preprocessHtmlImages } from './core/renderer'
import { RssItemProcessor } from './core/item-processor'
import { startFeeder, stopFeeder, formatArg, mixinArg, findRssItem, getLastContent } from './core/feeder'
import { initMessageCache, getMessageCache } from './utils/message-cache'
import { registerMessageCacheService } from './services/message-cache-service'

// Import database and constants
import { setupDatabase } from './database'
import { usage, quickList } from './constants'

const logger = new Logger('rss-owl')
const X2JS = require("x2js")
const x2js = new X2JS()

export const inject = { required: ["database"], optional: ["puppeteer", "censor", "assets", "server"] }

export function apply(ctx: Context, config: Config) {
  // Setup database
  setupDatabase(ctx)

  // Initialize request manager and HTTP function
  const requestManager = new RequestManager(3, 2, 10)
  const $http = createHttpFunction(ctx, config, requestManager)

  // Initialize RSS item processor
  const processor = new RssItemProcessor(ctx, config, $http)

  // Initialize message cache
  if (config.cache?.enabled) {
    initMessageCache(ctx, config, config.cache.maxSize || 100)
    // Register HTTP API service
    registerMessageCacheService(ctx)
  }

  // Lifecycle management
  ctx.on('ready', async () => {
    startFeeder(ctx, config, $http, processor)
  })

  ctx.on('dispose', async () => {
    stopFeeder()
    if (config.basic.imageMode === 'File') {
      delCache(config)
    }
  })

  // Helper functions for commands
  const debugLocal = (message: any, name = '', type: "disable" | "error" | "info" | "details" = 'details') => {
    debug(config, message, name, type)
  }

  // Frequently used helper functions
  const parseQuickUrlLocal = (url: string) =>
    parseQuickUrl(url, config.msg.rssHubUrl, quickList)

  const parsePubDateLocal = (pubDate: any) =>
    parsePubDate(config, pubDate)

  const getRssDataLocal = async (url: string, arg: any) =>
    getRssData(ctx, config, $http, url, arg)

  const parseRssItem = async (item: any, arg: any, authorId: string | number) =>
    processor.parseRssItem(item, arg, authorId)

  const formatArgLocal = (options: any) =>
    formatArg(options, config)

  const mixinArgLocal = (arg: any) =>
    mixinArg(arg, config)

  const findRssItemLocal = (rssList: any[], keyword: number | string) =>
    findRssItem(rssList, keyword)

  const generateSelectorByAILocal = async (url: string, instruction: string, html: string) =>
    generateSelectorByAI(config, url, instruction, html)

  // Register commands
  ctx.guild()
    .command('rssowl <url:text>', '订阅 RSS 链接')
    .alias('rsso')
    .usage(usage)
    .option('list', '-l [content] 查看订阅列表(详情)')
    .option('remove', '-r <content> [订阅id|关键字] 删除订阅')
    .option('removeAll', '删除全部订阅')
    .option('follow', '-f <content> [订阅id|关键字] 关注订阅，在该订阅更新时提醒你')
    .option('followAll', '<content> [订阅id|关键字] 在该订阅更新时提醒所有人')
    .option('target', '<content> [群组id] 跨群订阅')
    .option('arg', '-a <content> 自定义配置')
    .option('template', '-i <content> 消息模板[content(文字模板)|default(图片模板)],更多见readme')
    .option('title', '-t <content> 自定义命名')
    .option('pull', '-p <content> [订阅id|关键字]拉取订阅id最后更新')
    .option('force', '强行写入')
    .option('daily', '-d <content>')
    .option('test', '-T 测试')
    .option('quick', '-q [content] 查询快速订阅列表')
    .example('rsso https://hub.slarker.me/qqorw')
    .action(async ({ session, options }, url) => {
      debugLocal(options, 'options', 'info')

      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: userId } = session.event.user as any
      const { authority } = session.user as any
      // 获取 bot selfId 用于后续推送
      const botSelfId = session.bot?.selfId

      debugLocal(`${platform}:${userId}:${guildId}, bot:${botSelfId}`, '', 'info')
      if (options?.quick === '') {
        return '输入 rsso -q [id] 查询详情\n' + quickList.map((v, i) => `${i + 1}.${v.name}`).join('\n')
      }
      if (options?.quick) {
        let correntQuickObj = quickList[parseInt(options?.quick) - 1]
        return `${correntQuickObj.name}\n${correntQuickObj.detail}\n例:rsso -T ${correntQuickObj.example}\n(${parseQuickUrlLocal(correntQuickObj.example)})`
      }
      if ((platform.indexOf("sandbox") + 1) && !options.test && url) {
        session.send('沙盒中无法推送更新，但RSS依然会被订阅，建议使用 -T 选项进行测试')
      }

      const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })

      if (options?.list === '') {
        debugLocal(rssList, 'rssList', 'info')
        if (rssList.length == 0) return '当前没有任何订阅'
        return rssList.map((v, i) => `${i + 1}. ${v.title} [${v.id}]`).join('\n')
      }
      if (options?.list) {
        let rssItem = findRssItemLocal(rssList, options.list)
        if (!rssItem) return '未找到该订阅'
        return `标题: ${rssItem.title}\n链接: ${rssItem.url}\n更新时间: ${rssItem.lastPubDate ? parsePubDateLocal(rssItem.lastPubDate).toLocaleString('zh-CN', { hour12: false }) : '未知'}`
      }

      if (options?.remove) {
        if (authority > config.basic.authority) {
          let rssItem = findRssItemLocal(rssList, options.remove)
          if (!rssItem) return '未找到该订阅'
          await ctx.database.remove(('rssOwl' as any), rssItem.id)
          return '删除成功'
        }
        return '权限不足'
      }
      if (options?.removeAll) {
        if (authority > config.basic.authority) {
          await ctx.database.remove(('rssOwl' as any), { platform, guildId })
          return '删除成功'
        }
        return '权限不足'
      }
      if (options?.follow) {
        let rssItem = findRssItemLocal(rssList, options.follow)
        if (!rssItem) return '未找到该订阅'
        if (!rssItem.followers) rssItem.followers = []
        if (rssItem.followers.includes(userId)) return '已经关注过了'
        rssItem.followers.push(userId)
        await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { followers: rssItem.followers })
        return '关注成功'
      }
      if (options?.followAll) {
        if (authority >= config.basic.advancedAuthority) {
          let rssItem = findRssItemLocal(rssList, options.followAll)
          if (!rssItem) return '未找到该订阅'
          if (!rssItem.followers) rssItem.followers = []
          rssItem.followers.push('all')
          await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { followers: rssItem.followers })
          return '关注成功'
        }
        return '权限不足'
      }
      if (options?.pull) {
        let rssItem = findRssItemLocal(rssList, options.pull)
        if (!rssItem) return '未找到该订阅'
        try {
          let arg = mixinArgLocal(rssItem.arg || {})
          let rssItemList = (await Promise.all(rssItem.url.split("|")
            .map((i: string) => parseQuickUrlLocal(i))
            .map(async (url: string) => await getRssDataLocal(url, arg)))).flat(1)
          let itemArray = rssItemList.sort((a, b) => parsePubDateLocal(b.pubDate).getTime() - parsePubDateLocal(a.pubDate).getTime())
          if (arg.reverse) itemArray = itemArray.reverse()
          const maxItem = arg.forceLength || 1
          let messageList = await Promise.all(itemArray.filter((v, i) => i < maxItem).map(async i => await parseRssItem(i, { ...rssItem, ...arg }, rssItem.author)))
          return messageList.join("")
        } catch (error) {
          debugLocal(error, 'pull error', 'error')
          return `拉取失败: ${getFriendlyErrorMessage(error, '获取订阅数据')}`
        }
      }

      if (url) {
        if (rssList.find(i => i.url == url)) return '该订阅已存在'
        let rawArg = formatArgLocal(options)
        let arg = mixinArgLocal(rawArg)
        let targetPlatform = platform
        let targetGuildId = guildId
        if (options?.target) {
          if (authority >= config.basic.advancedAuthority) {
            let target = options.target.split(/[:：]/)
            if (target.length == 1) {
              return '请输入正确的群号，格式为 platform:guildId 或 platform：guildId'
            }
            targetPlatform = target[0]
            targetGuildId = target[1]
          } else {
            return '权限不足'
          }
        }
        let title = options?.title || ""
        let rssItemList = []
        try {
          url = parseQuickUrlLocal(url)
          rssItemList = await getRssDataLocal(ensureUrlProtocol(url), arg)
          if (options.test) {
            let testItem = rssItemList[0]
            if (!testItem) return '未获取到数据'
            // 应用默认模板配置（如果没有指定模板）
            let testArg = { ...arg, url: title || testItem.rss.channel.title, title: title || testItem.rss.channel.title }
            if (!testArg.template) {
              testArg.template = config.basic.defaultTemplate
            }
            let msg = await parseRssItem(testItem, testArg, userId)
            return msg
          }
          if (!title) {
            title = rssItemList[0]?.rss.channel.title
            if (!title) return '无法获取标题，请使用 -t 指定标题'
          }
          let lastPubDate = parsePubDateLocal(rssItemList[0]?.pubDate)
          let rssItem: any = {
            url,
            platform: targetPlatform,
            guildId: targetGuildId,
            author: botSelfId,
            rssId: rssItemList[0]?.rss?.channel?.title ? rssItemList[0].rss.channel.title : title,
            arg: rawArg,
            title,
            lastPubDate,
            lastContent: [],
            followers: []
          }
          if (options.force) {
            if (authority < config.basic.authority) return '权限不足'
          } else {
            if (config.basic.urlDeduplication && rssList.find(i => i.rssId == rssItem.rssId)) return `订阅已存在: ${rssItem.rssId}`
          }
          await ctx.database.create(('rssOwl' as any), rssItem)
          if (config.basic.firstLoad && arg.firstLoad !== false && rssItemList.length > 0) {
            let itemArray = rssItemList.sort((a, b) => parsePubDateLocal(b.pubDate).getTime() - parsePubDateLocal(a.pubDate).getTime())
            if (arg.reverse) itemArray = itemArray.reverse()
            const maxItem = arg.forceLength || 1
            // 使用合并后的配置来确保图片/视频模式生效
            const mergedArg = mixinArgLocal(rssItem.arg)
            let messageList = await Promise.all(itemArray.filter((v, i) => i < maxItem).map(async i => await parseRssItem(i, { ...rssItem, ...mergedArg }, rssItem.author)))
            let message = messageList.join("")
            await ctx.broadcast([`${targetPlatform}:${targetGuildId}`], message)
          }
          return `订阅成功: ${title}`
        } catch (error) {
          debugLocal(error, 'add error', 'error')
          return `订阅失败: ${getFriendlyErrorMessage(error, '添加订阅')}`
        }
      }
      return usage
    })

  // HTML monitoring command
  ctx.guild()
    .command('rssowl.html <url:string>', '监控网页变化 (CSS Selector)')
    .alias('rsso.html')
    .usage(`
HTML 网页监控功能，使用 CSS 选择器提取内容
用法:
  rsso.html https://example.com -s ".item"                    - 监控网页变化
  rsso.html https://example.com -s ".item" -T                  - 测试选择器
  rsso.html https://example.com -s ".item" -t "我的订阅"       - 自定义标题
  rsso.html https://example.com -s ".item" -P                  - SPA 动态页面
  rsso.html https://example.com -s ".item" -w 5000             - 渲染后等待5秒

示例:
  rsso.html https://www.zhihu.com/billboard -s ".BillBoard-item:first-child"
  rsso.html https://news.ycombinator.com -s ".titleline > a"
    `)
    .option('selector', '-s <选择器> CSS 选择器 (必填)')
    .option('title', '-t <标题> 自定义订阅标题')
    .option('template', '-i <模板> 消息模板 (推荐 content)')
    .option('text', '--text 只提取纯文本')
    .option('puppeteer', '-P 使用 Puppeteer 渲染 (适用于SPA)')
    .option('wait', '-w <毫秒> 渲染后等待时间')
    .option('waitSelector', '-W <选择器> 等待特定元素出现')
    .option('test', '-T 测试抓取结果 (不创建订阅)')
    .example('rsso.html https://news.ycombinator.com -s ".titleline > a"')
    .action(async ({ session, options }, url) => {
      if (!url) return '请输入 URL'
      if (!options.selector) return '请指定 CSS 选择器 (-s)'

      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: userId } = session.event.user as any
      // 获取 bot selfId 用于后续推送
      const botSelfId = session.bot?.selfId

      url = ensureUrlProtocol(url)
      let rawArg: any = {
        type: 'html' as const,
        selector: options.selector,
        template: options.template || 'content',
        textOnly: !!options.text,
        mode: options.puppeteer ? 'puppeteer' : 'static',
        waitFor: options.wait ? parseInt(options.wait) : undefined,
        waitSelector: options.waitSelector,
        title: options.title
      }
      let arg = mixinArgLocal(rawArg)

      try {
        // Test mode: just preview the data
        if (options.test) {
          let items = await getRssDataLocal(url, arg)
          if (!items || items.length === 0) return '未找到符合选择器的元素'
          let preview = items.slice(0, 3).map((item: any) =>
            `标题: ${item.title}\n内容: ${item.description?.substring(0, 100)}...`
          ).join('\n\n')
          return `找到 ${items.length} 个元素:\n\n${preview}`
        }

        // Full subscription flow (similar to RSS subscription)
        const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })

        // Check if subscription already exists
        if (rssList.find(i => i.url == url)) {
          return '该订阅已存在'
        }

        // Get HTML monitoring data
        let htmlItems = await getRssDataLocal(url, arg)
        if (!htmlItems || htmlItems.length === 0) {
          return '未找到符合选择器的元素，无法创建订阅'
        }

        // Determine title
        let title = options?.title || htmlItems[0]?.rss?.channel?.title || `HTML监控: ${url}`

        // Create subscription record
        let rssItem: any = {
          url,
          platform,
          guildId,
          author: botSelfId,
          rssId: title, // Use title as rssId for HTML monitoring
          arg: rawArg,
          title,
          lastPubDate: new Date(), // HTML monitoring doesn't have real timestamps
          lastContent: [],
          followers: []
        }

        // Check for duplicate (if enabled)
        if (config.basic.urlDeduplication && rssList.find(i => i.rssId == rssItem.rssId)) {
          return `订阅已存在: ${rssItem.rssId}`
        }

        // Save to database
        await ctx.database.create(('rssOwl' as any), rssItem)

        // First load preview (if enabled)
        if (config.basic.firstLoad && arg.firstLoad !== false && htmlItems.length > 0) {
          const maxItem = arg.forceLength || 1
          // 使用合并后的配置来确保图片/视频模式生效
          const mergedArg = mixinArgLocal(rssItem.arg)
          let messageList = await Promise.all(
            htmlItems
              .filter((v, i) => i < maxItem)
              .map(async i => await parseRssItem(i, { ...rssItem, ...mergedArg }, rssItem.author))
          )
          let message = messageList.join("")
          await ctx.broadcast([`${platform}:${guildId}`], message)
        }

        return `订阅成功: ${title}\n提示: HTML监控基于内容变化检测，请确保选择器稳定`
      } catch (error: any) {
        debugLocal(error, 'html error', 'error')
        return `抓取失败: ${getFriendlyErrorMessage(error, 'HTML监控')}`
      }
    })

  // AI subscription command
  ctx.guild()
    .command('rssowl.ask <url:string> <instruction:text>', 'AI 智能订阅网页')
    .alias('rsso.ask')
    .usage(`AI 智能订阅功能，自动生成 CSS 选择器

前置要求:
  - 需要配置 AI 功能 (config.ai.enabled = true)
  - 需要配置 API Key (config.ai.apiKey)

用法:
  rsso.ask https://news.ycombinator.com "监控首页的前5条新闻标题"

示例:
  rsso.ask https://www.zhihu.com/billboard "获取热榜第一条"
  rsso.ask https://example.com "提取所有文章标题" -T
    `)
    .option('test', '-T 测试模式 (只分析不订阅)')
    .example('rsso.ask https://news.ycombinator.com "监控首页的前5条新闻标题"')
    .action(async ({ session, options }, url, instruction) => {
      if (!url) return '请输入网址'
      if (!instruction) return '请描述你的需求'

      url = ensureUrlProtocol(url)

      try {
        let html = (await $http(url, {})).data
        let selector = await generateSelectorByAILocal(url, instruction, html)

        if (options.test) {
          let testArg = {
            type: 'html' as const,
            selector,
            template: 'content' as const
          }
          let items = await getRssDataLocal(url, testArg)
          if (!items || items.length === 0) return `选择器未匹配到任何元素: ${selector}`
          return `AI 生成的选择器: ${selector}\n\n匹配到 ${items.length} 个元素:\n${items.slice(0, 2).map((i: any) => i.title).join('\n')}`
        }

        return `AI 生成的选择器: ${selector}\n请使用 rsso.html ${url} -s "${selector}" 完成订阅`
      } catch (error: any) {
        debugLocal(error, 'ask error', 'error')
        return `AI 分析失败: ${getFriendlyErrorMessage(error, 'AI生成选择器')}`
      }
    })

  // Simple watch command
  ctx.guild()
    .command('rssowl.watch <url:string> [keyword:text]', '简单网页监控')
    .alias('rsso.watch')
    .usage(`
简单网页监控，支持关键词或整页监控。
用法:
  rsso.watch https://example.com                    - 监控整页变化
  rsso.watch https://example.com "缺货"             - 监控包含关键词的内容
  rsso.watch https://example.com "缺货" -P          - SPA 动态页面
  rsso.watch https://example.com "缺货" -T          - 测试模式 (只预览不订阅)
    `)
    .option('puppeteer', '-P 使用 Puppeteer 渲染')
    .option('test', '-T 测试模式 (只预览不订阅)')
    .example('rsso.watch https://example.com "缺货"')
    .action(async ({ session, options }, url, keyword) => {
      if (!url) return '请输入 URL'

      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: userId } = session.event.user as any
      // 获取 bot selfId 用于后续推送
      const botSelfId = session.bot?.selfId

      url = ensureUrlProtocol(url)

      let rawArg: any = {
        type: 'html' as const,
        selector: keyword ? `*:contains("${keyword}")` : 'body',
        textOnly: !!keyword,
        mode: options.puppeteer ? 'puppeteer' : 'static',
        template: 'content' as const
      }
      let arg = mixinArgLocal(rawArg)

      try {
        if (options.test) {
          let items = await getRssDataLocal(url, arg)
          if (!items || items.length === 0) return '未找到内容'
          let preview = items.slice(0, 3).map((item: any) =>
            `标题: ${item.title}\n${item.description?.substring(0, 100)}...`
          ).join('\n\n')
          return `找到 ${items.length} 条内容:\n\n${preview}`
        }

        return '请使用 rsso 命令完成订阅，或使用 -T 测试'
      } catch (error: any) {
        debugLocal(error, 'watch error', 'error')
        return `监控失败: ${getFriendlyErrorMessage(error, '网页监控')}`
      }
    })

  // Message cache management commands
  ctx.guild()
    .command('rssowl.cache', '消息缓存管理')
    .alias('rsso.cache')
    .usage(`
消息缓存管理功能，查看和管理已推送的 RSS 消息缓存。

用法:
  rsso.cache list [页数]              - 查看缓存消息列表
  rsso.cache search <关键词>          - 搜索缓存消息
  rsso.cache stats                    - 查看缓存统计
  rsso.cache message <序号>           - 查看消息详情
  rsso.cache pull <序号>             - 重新推送缓存消息
  rsso.cache clear                    - 清空所有缓存
  rsso.cache cleanup [保留数量]       - 清理缓存（保留最新N条）

示例:
  rsso.cache list                     - 查看第1页（每页10条）
  rsso.cache list 2                   - 查看第2页
  rsso.cache search 新闻              - 搜索包含"新闻"的消息
  rsso.cache stats                    - 查看统计信息
  rsso.cache message 1                - 查看序号1的消息详情
  rsso.cache pull 1                  - 推送序号1的消息
  rsso.cache cleanup 50               - 清理并保留最新50条

注意：序号从1开始，会在列表中显示对应的真实数据库ID
    `)
    .action(async ({ session, options }, subcommand, ...args) => {
      const { authority } = session.user as any
      const cache = getMessageCache()

      // 检查缓存是否启用
      if (!cache) {
        return '消息缓存功能未启用，请在配置中启用 cache.enabled'
      }

      // 如果没有子命令，显示帮助
      if (!subcommand) {
        return `消息缓存管理

可用指令:
  rsso.cache list [页数]              - 查看缓存消息列表
  rsso.cache search <关键词>          - 搜索缓存消息
  rsso.cache stats                    - 查看缓存统计
  rsso.cache message <序号>           - 查看消息详情
  rsso.cache pull <序号>             - 重新推送缓存消息
  rsso.cache clear                    - 清空所有缓存
  rsso.cache cleanup [保留数量]       - 清理缓存（保留最新N条）

详细信息请使用: rsso.cache --help`
      }

      // 处理子命令
      switch (subcommand) {
        case 'list': {
          const page = parseInt(args[0]) || 1
          const limit = 10
          const offset = (page - 1) * limit

          try {
            const messages = await cache.getMessages({
              limit,
              offset
            })

            if (messages.length === 0) {
              return `暂无缓存消息`
            }

            const stats = await cache.getStats()

            let output = `📋 缓存消息列表 (第${page}页，共${Math.ceil(stats.totalMessages / limit)}页，总计${stats.totalMessages}条)\n\n`

            output += messages.map((msg, index) => {
              const date = new Date(msg.createdAt).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
              const title = msg.title.length > 30 ? msg.title.substring(0, 30) + '...' : msg.title
              // 显示序号，在括号中显示真实ID
              const serialNumber = index + 1
              return `${serialNumber}. [ID:${msg.id}] [${msg.rssId}] ${title}\n   时间: ${date}\n   链接: ${msg.link}`
            }).join('\n\n')

            output += `\n\n💡 使用 "rsso.cache list ${page + 1}" 查看下一页`
            output += `\n💡 使用 "rsso.cache pull <序号>" 推送消息（注意：序号基于当前页）`
            output += `\n💡 使用 "rsso.cache message <序号>" 查看详情`

            return output
          } catch (error: any) {
            debugLocal(error, 'cache list error', 'error')
            return `获取消息列表失败: ${error.message}`
          }
        }

        case 'message': {
          const serialNumber = parseInt(args[0])

          if (!serialNumber || serialNumber < 1) {
            return '请提供序号\n使用方法: rsso.cache message <序号>\n示例: rsso.cache message 1\n💡 提示：使用 "rsso.cache list" 查看序号'
          }

          try {
            // 通过序号查找消息（与pull命令相同的逻辑）
            const limit = 10
            const maxPagesToSearch = 10
            let foundMessage = null
            let actualPage = 1
            let targetSerialNumber = serialNumber

            for (let page = 1; page <= maxPagesToSearch; page++) {
              const offset = (page - 1) * limit
              const messages = await cache.getMessages({
                limit,
                offset
              })

              if (messages.length === 0) break

              if (targetSerialNumber <= messages.length) {
                foundMessage = messages[targetSerialNumber - 1]
                actualPage = page
                break
              }

              targetSerialNumber -= messages.length
            }

            if (!foundMessage) {
              return `❌ 未找到序号为 ${args[0]} 的消息\n💡 使用 "rsso.cache list" 查看可用的序号`
            }

            const pubDate = new Date(foundMessage.pubDate).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
            const createdAt = new Date(foundMessage.createdAt).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })

            let output = `📰 消息详情 (第${actualPage}页序号${args[0]}，真实ID:${foundMessage.id})\n\n`
            output += `📰 标题: ${foundMessage.title}\n`
            output += `📡 订阅: ${foundMessage.rssId}\n`
            output += `👥 群组: ${foundMessage.platform}:${foundMessage.guildId}\n`
            output += `🔗 链接: ${foundMessage.link}\n`
            output += `📅 发布时间: ${pubDate}\n`
            output += `💾 缓存时间: ${createdAt}\n`

            if (foundMessage.content) {
              const content = foundMessage.content.length > 200
                ? foundMessage.content.substring(0, 200) + '...'
                : foundMessage.content
              output += `\n📝 内容:\n${content}`
            }

            if (foundMessage.imageUrl) {
              output += `\n\n🖼️ 图片: ${foundMessage.imageUrl}`
            }

            if (foundMessage.videoUrl) {
              output += `\n\n🎬 视频: ${foundMessage.videoUrl}`
            }

            return output
          } catch (error: any) {
            debugLocal(error, 'cache message error', 'error')
            return `获取消息详情失败: ${error.message}`
          }
        }

        case 'search': {
          const keyword = args[0]

          if (!keyword) {
            return '请提供搜索关键词\n使用方法: rsso.cache search <关键词>'
          }

          try {
            const messages = await cache.searchMessages({
              keyword,
              limit: 10
            })

            if (messages.length === 0) {
              return `未找到包含 "${keyword}" 的消息`
            }

            let output = `🔍 搜索结果 "${keyword}" (找到${messages.length}条)\n\n`

            output += messages.map((msg, index) => {
              const date = new Date(msg.createdAt).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
              const title = msg.title.length > 30 ? msg.title.substring(0, 30) + '...' : msg.title
              // 搜索结果显示序号和真实ID
              return `${index + 1}. [ID:${msg.id}] [${msg.rssId}] ${title}\n   时间: ${date}`
            }).join('\n\n')

            output += `\n\n💡 使用 "rsso.cache message <真实ID>" 查看详情`

            return output
          } catch (error: any) {
            debugLocal(error, 'cache search error', 'error')
            return `搜索失败: ${error.message}`
          }
        }

        case 'stats': {
          try {
            const stats = await cache.getStats()

            let output = `📊 缓存统计信息\n\n`
            output += `📦 总消息数: ${stats.totalMessages}\n`

            if (stats.oldestMessage) {
              const oldest = new Date(stats.oldestMessage).toLocaleString('zh-CN')
              output += `📅 最早消息: ${oldest}\n`
            }

            if (stats.newestMessage) {
              const newest = new Date(stats.newestMessage).toLocaleString('zh-CN')
              output += `📅 最新消息: ${newest}\n`
            }

            output += `\n📡 按订阅统计:\n`

            const subscriptionEntries = Object.entries(stats.bySubscription)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)

            if (subscriptionEntries.length > 0) {
              subscriptionEntries.forEach(([rssId, count]) => {
                output += `  ${rssId}: ${count}条\n`
              })
            }

            output += `\n👥 按群组统计:\n`

            const guildEntries = Object.entries(stats.byGuild)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)

            if (guildEntries.length > 0) {
              guildEntries.forEach(([guild, count]) => {
                output += `  ${guild}: ${count}条\n`
              })
            }

            output += `\n⚙️ 最大缓存限制: ${cache.getMaxCacheSize()}条`

            return output
          } catch (error: any) {
            debugLocal(error, 'cache stats error', 'error')
            return `获取统计信息失败: ${error.message}`
          }
        }

        case 'clear': {
          if (authority < config.basic.authority) {
            return '权限不足，需要权限等级 >= ' + config.basic.authority
          }

          try {
            const deletedCount = await cache.clearAll()
            return `✅ 已清空所有缓存，共删除 ${deletedCount} 条消息`
          } catch (error: any) {
            debugLocal(error, 'cache clear error', 'error')
            return `清空缓存失败: ${error.message}`
          }
        }

        case 'cleanup': {
          if (authority < config.basic.authority) {
            return '权限不足，需要权限等级 >= ' + config.basic.authority
          }

          const keepLatest = parseInt(args[0]) || cache.getMaxCacheSize()

          try {
            const deletedCount = await cache.cleanup({ keepLatest })
            if (deletedCount === 0) {
              return `✅ 当前缓存数量未超过限制，无需清理`
            }
            return `✅ 已清理缓存，保留最新 ${keepLatest} 条，删除 ${deletedCount} 条消息`
          } catch (error: any) {
            debugLocal(error, 'cache cleanup error', 'error')
            return `清理缓存失败: ${error.message}`
          }
        }

        case 'pull': {
          const serialNumber = parseInt(args[0])

          if (!serialNumber || serialNumber < 1) {
            return '请提供有效的序号\n使用方法: rsso.cache pull <序号>\n示例: rsso.cache pull 1\n💡 提示：使用 "rsso.cache list" 查看序号'
          }

          try {
            // 需要获取当前页的所有消息来找到对应的序号
            // 默认从第1页开始查找
            const limit = 10
            const maxPagesToSearch = 10 // 最多搜索10页
            let foundMessage = null
            let actualPage = 1
            let targetSerialNumber = serialNumber // 可修改的副本

            for (let page = 1; page <= maxPagesToSearch; page++) {
              const offset = (page - 1) * limit
              const messages = await cache.getMessages({
                limit,
                offset
              })

              if (messages.length === 0) break

              // 检查当前页是否有该序号
              if (targetSerialNumber <= messages.length) {
                foundMessage = messages[targetSerialNumber - 1]
                actualPage = page
                break
              }

              // 序号不在当前页，继续下一页
              targetSerialNumber -= messages.length
            }

            if (!foundMessage) {
              return `❌ 未找到序号为 ${args[0]} 的消息\n💡 使用 "rsso.cache list" 查看可用的序号`
            }

            // 检查是否有缓存的最终消息
            if (!foundMessage.finalMessage) {
              return `❌ 该消息没有缓存的最终消息\n💡 这条消息可能是旧版本缓存，请重新订阅后重试`
            }

            // 获取当前群组信息
            const { id: guildId } = session.event.guild as any
            const { platform } = session.event as any

            // 直接发送缓存的最终消息
            await ctx.broadcast([`${platform}:${guildId}`], foundMessage.finalMessage)

            // 返回空字符串，不额外显示提示信息
            return ''
          } catch (error: any) {
            debugLocal(error, 'cache pull error', 'error')
            return `推送消息失败: ${error.message}`
          }
        }

        default:
          return `未知的子命令: ${subcommand}\n使用 "rsso.cache" 查看可用指令`
      }
    })
}
