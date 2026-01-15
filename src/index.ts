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

// Import core modules
import { getAiSummary, generateSelectorByAI } from './core/ai'
import { getRssData } from './core/parser'
import { renderHtml2Image, preprocessHtmlImages } from './core/renderer'
import { RssItemProcessor } from './core/item-processor'
import { startFeeder, stopFeeder, formatArg, mixinArg, findRssItem, getLastContent } from './core/feeder'

// Import database and constants
import { setupDatabase } from './database'
import { usage, quickList } from './constants'

const logger = new Logger('rss-owl')
const X2JS = require("x2js")
const x2js = new X2JS()

export const inject = { required: ["database"], optional: ["puppeteer", "censor", "assets"] }

export function apply(ctx: Context, config: Config) {
  // Setup database
  setupDatabase(ctx)

  // Initialize request manager and HTTP function
  const requestManager = new RequestManager(3, 2, 10)
  const $http = createHttpFunction(ctx, config, requestManager)

  // Initialize RSS item processor
  const processor = new RssItemProcessor(ctx, config, $http)

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

  // Helper functions (keeping locally for command use)
  const debugLocal = (message: any, name = '', type: "disable" | "error" | "info" | "details" = 'details') => {
    debug(config, message, name, type)
  }

  const sleep = (delay = 1000) => new Promise(resolve => setTimeout(resolve, delay));

  const getCacheDirLocal = () => getCacheDir(config)
  const writeCacheFileLocal = async (fileUrl: string) => writeCacheFile(fileUrl, config)
  const delCacheLocal = async () => delCache(config)

  const getImageUrlLocal = async (url: string, arg: any, useBase64Mode = false) =>
    getImageUrl(ctx, config, $http, url, arg, useBase64Mode)

  const getVideoUrlLocal = async (url: string, arg: any, useBase64Mode = false, dom: any) =>
    getVideoUrl(ctx, config, $http, url, arg, useBase64Mode, dom)

  const puppeteerToFileLocal = async (puppeteer: string) =>
    puppeteerToFile(ctx, config, puppeteer)

  const parseRssItem = async (item: any, arg: any, authorId: string | number) =>
    processor.parseRssItem(item, arg, authorId)

  const getAiSummaryLocal = async (title: string, contentHtml: string) =>
    getAiSummary(config, title, contentHtml)

  const generateSelectorByAILocal = async (url: string, instruction: string, html: string) =>
    generateSelectorByAI(config, url, instruction, html)

  const getRssDataLocal = async (url: string, arg: any) =>
    getRssData(ctx, config, $http, url, arg)

  const renderHtml2ImageLocal = async (htmlContent: string, arg?: any) =>
    renderHtml2Image(ctx, config, $http, htmlContent, arg)

  const preprocessHtmlImagesLocal = async (htmlContent: string, arg?: any) =>
    preprocessHtmlImages(ctx, config, $http, htmlContent, arg)

  const parseQuickUrlLocal = (url: string) =>
    parseQuickUrl(url, config.msg.rssHubUrl, quickList)

  const parsePubDateLocal = (pubDate: any) =>
    parsePubDate(config, pubDate)

  const formatArgLocal = (options: any) =>
    formatArg(options, config)

  const mixinArgLocal = (arg: any) =>
    mixinArg(arg, config)

  const findRssItemLocal = (rssList: any[], keyword: number | string) =>
    findRssItem(rssList, keyword)

  const getLastContentLocal = (item: any) =>
    getLastContent(item, config)

  // Register commands
  ctx.guild()
    .command('rssowl <url:text>', '*订阅 RSS 链接*')
    .alias('rsso')
    .usage(usage)
    .option('list', '-l [content] 查看订阅列表(详情)')
    .option('remove', '-r <content> [订阅id|关键字] *删除订阅*')
    .option('removeAll', '*删除全部订阅*')
    .option('follow', '-f <content> [订阅id|关键字] 关注订阅，在该订阅更新时提醒你')
    .option('followAll', '<content> [订阅id|关键字] **在该订阅更新时提醒所有人**')
    .option('target', '<content> [群组id] **跨群订阅**')
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
      const { id: author } = session.event.user as any
      const { authority } = session.user as any

      debugLocal(`${platform}:${author}:${guildId}`, '', 'info')
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
        if (rssItem.followers.includes(author)) return '已经关注过了'
        rssItem.followers.push(author)
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
          return '拉取失败'
        }
      }

      if (url) {
        if (rssList.find(i => i.url == url)) return '该订阅已存在'
        let arg = formatArgLocal(options)
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
            let msg = await parseRssItem(testItem, testArg, author)
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
            author,
            rssId: rssItemList[0]?.rss?.channel?.title ? rssItemList[0].rss.channel.title : title,
            arg,
            title,
            lastPubDate,
            lastContent: [],
            followers: [],
            firstime: lastPubDate
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
            let messageList = await Promise.all(itemArray.filter((v, i) => i < maxItem).map(async i => await parseRssItem(i, { ...rssItem, ...rssItem.arg }, rssItem.author)))
            let message = messageList.join("")
            await ctx.broadcast([`${targetPlatform}:${targetGuildId}`], message)
          }
          return `订阅成功: ${title}`
        } catch (error) {
          debugLocal(error, 'add error', 'error')
          return `订阅失败: ${error}`
        }
      }
      return usage
    })

  // HTML monitoring command
  ctx.guild()
    .command('rssowl.html <url:string>', '监控静态网页 (CSS Selector)')
    .alias('rsso.html')
    .usage(`
示例: rsso.html https://www.zhihu.com/billboard -s ".BillBoard-item:first-child"
    `)
    .option('selector', '-s <选择器> CSS 选择器 (必填)')
    .option('title', '-t <标题> 自定义订阅标题')
    .option('template', '-i <模板> 消息模板 (推荐 content)')
    .option('text', '--text 只提取纯文本')
    .option('puppeteer', '-P 使用 Puppeteer 渲染')
    .option('wait', '-w <毫秒> 渲染后等待时间')
    .option('waitSelector', '-W <选择器> 等待特定元素')
    .option('test', '-T 测试抓取结果')
    .action(async ({ session, options }, url) => {
      if (!url) return '请输入 URL'
      if (!options.selector) return '请指定 CSS 选择器 (-s)'

      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: author } = session.event.user as any

      url = ensureUrlProtocol(url)
      let arg: any = {
        type: 'html' as const,
        selector: options.selector,
        template: options.template || 'content',
        textOnly: !!options.text,
        mode: options.puppeteer ? 'puppeteer' : 'static',
        waitFor: options.wait ? parseInt(options.wait) : undefined,
        waitSelector: options.waitSelector,
        title: options.title
      }

      try {
        if (options.test) {
          let items = await getRssDataLocal(url, arg)
          if (!items || items.length === 0) return '未找到符合选择器的元素'
          let preview = items.slice(0, 3).map((item: any) =>
            `标题: ${item.title}\n内容: ${item.description?.substring(0, 100)}...`
          ).join('\n\n')
          return `找到 ${items.length} 个元素:\n\n${preview}`
        }

        // Add subscription logic here similar to main RSS command
        return 'HTML 监控功能开发中，请使用 -T 测试选择器'
      } catch (error: any) {
        debugLocal(error, 'html error', 'error')
        return `抓取失败: ${error.message}`
      }
    })

  // AI subscription command
  ctx.guild()
    .command('rssowl.ask <url:string> <instruction:text>', 'AI 智能订阅网页')
    .alias('rsso.ask')
    .usage('例如: rsso.ask https://news.ycombinator.com "监控首页的前5条新闻标题"')
    .option('test', '-T 测试模式 (只分析不订阅)')
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
        return `AI 分析失败: ${error.message}`
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
    .action(async ({ session, options }, url, keyword) => {
      if (!url) return '请输入 URL'

      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: author } = session.event.user as any

      url = ensureUrlProtocol(url)

      let arg: any = {
        type: 'html' as const,
        selector: keyword ? `*:contains("${keyword}")` : 'body',
        textOnly: !!keyword,
        mode: options.puppeteer ? 'puppeteer' : 'static',
        template: 'content' as const
      }

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
        return `监控失败: ${error.message}`
      }
    })
}
