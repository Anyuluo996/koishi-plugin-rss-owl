import { Context } from 'koishi'

import type { Config, TemplateType, rssArg } from '../types'
import { ensureUrlProtocol } from '../utils/common'
import { getFriendlyErrorMessage } from '../utils/error-handler'
import { buildCommandLogContext, extractSessionInfo } from './utils'

type DebugType = 'disable' | 'error' | 'info' | 'details'
type HtmlMonitorArg = rssArg & { title?: string }

interface HtmlMonitorOptions {
  selector?: string
  title?: string
  template?: TemplateType
  text?: boolean
  puppeteer?: boolean
  wait?: string
  waitSelector?: string
  test?: boolean
}

interface AskCommandOptions {
  test?: boolean
}

interface WatchCommandOptions {
  puppeteer?: boolean
  test?: boolean
}

export interface WebMonitorCommandDeps {
  ctx: Context
  config: Config
  debug: (message: any, name?: string, type?: DebugType, context?: Record<string, any>) => void
  mixinArg: (arg: Record<string, any>) => rssArg
  getRssData: (url: string, arg: Record<string, any>) => Promise<any[]>
  parseRssItem: (item: any, arg: Record<string, any>, authorId: string | number) => Promise<string>
  generateSelectorByAI: (url: string, instruction: string, html: string) => Promise<string>
  fetchUrl: (url: string, arg?: Record<string, any>) => Promise<string>
}

export function registerWebMonitorCommands(deps: WebMonitorCommandDeps): void {
  registerHtmlMonitorCommand(deps)
  registerAskCommand(deps)
  registerWatchCommand(deps)
}

function registerHtmlMonitorCommand(deps: WebMonitorCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.html <url:string>', '监控网页变化 (CSS Selector)')
    .alias('rsso.html', 'rshm')
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
      if (!url) return '❌ 请输入 URL'
      if (!options.selector) return '❌ 请指定 CSS 选择器 (-s)'

      const logContext = buildCommandLogContext(session as any, 'rsso.html', options.test ? 'test' : 'create')
      const { guildId, platform } = extractSessionInfo(session as any)
      const botSelfId = session.bot?.selfId
      const normalizedUrl = ensureUrlProtocol(url)
      const rawArg = buildHtmlMonitorArg(options as HtmlMonitorOptions)
      const arg = deps.mixinArg(rawArg)

      try {
        if (options.test) {
          const items = await deps.getRssData(normalizedUrl, arg)
          if (!items.length) return '❌ 未找到符合选择器的元素'
          return buildItemsPreview(items, `找到 ${items.length} 个元素:`, true)
        }

        const rssList = await deps.ctx.database.get(('rssOwl' as any), { platform, guildId })
        if (rssList.find(item => item.url === normalizedUrl)) return '❌ 该订阅已存在'

        const htmlItems = await deps.getRssData(normalizedUrl, arg)
        if (!htmlItems.length) return '❌ 未找到符合选择器的元素，无法创建订阅'

        const title = options.title || htmlItems[0]?.rss?.channel?.title || `HTML监控: ${normalizedUrl}`
        const rssItem: any = {
          url: normalizedUrl,
          platform,
          guildId,
          author: botSelfId,
          rssId: title,
          arg: rawArg,
          title,
          lastPubDate: new Date(),
          lastContent: [],
          followers: [],
        }

        if (deps.config.basic.urlDeduplication && rssList.find(item => item.rssId === rssItem.rssId)) {
          return `❌ 订阅已存在: ${rssItem.rssId}`
        }

        await deps.ctx.database.create(('rssOwl' as any), rssItem)

        if (deps.config.basic.firstLoad && arg.firstLoad !== false && htmlItems.length > 0) {
          await broadcastInitialItems(deps, `${platform}:${guildId}`, htmlItems, rssItem)
        }

        return `✅ 订阅成功: ${title}\n💡 提示: HTML监控基于内容变化检测，请确保选择器稳定`
      } catch (error) {
        deps.debug(error, 'html error', 'error', logContext)
        return `❌ 抓取失败: ${getFriendlyErrorMessage(error, 'HTML监控')}`
      }
    })
}

function registerAskCommand(deps: WebMonitorCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.ask <url:string> <instruction:text>', 'AI 智能订阅网页')
    .alias('rsso.ask', 'rsak')
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
      if (!url) return '❌ 请输入网址'
      if (!instruction) return '❌ 请描述你的需求'

      const logContext = buildCommandLogContext(session as any, 'rsso.ask', options.test ? 'test' : 'analyze')
      const normalizedUrl = ensureUrlProtocol(url)

      try {
        const html = await deps.fetchUrl(normalizedUrl)
        const selector = await deps.generateSelectorByAI(normalizedUrl, instruction, html)

        if (options.test) {
          const items = await deps.getRssData(normalizedUrl, {
            type: 'html',
            selector,
            template: 'content',
          })

          if (!items.length) return `❌ 选择器未匹配到任何元素: ${selector}`
          return `AI 生成的选择器: ${selector}\n\n匹配到 ${items.length} 个元素:\n${items.slice(0, 2).map((item: any) => normalizePreviewText(item?.title) || '无标题').join('\n')}`
        }

        return `AI 生成的选择器: ${selector}\n请使用 rsso.html ${normalizedUrl} -s "${selector}" 完成订阅`
      } catch (error) {
        deps.debug(error, 'ask error', 'error', logContext)
        return `❌ AI 分析失败: ${getFriendlyErrorMessage(error, 'AI生成选择器')}`
      }
    })
}

function registerWatchCommand(deps: WebMonitorCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.watch <url:string> [keyword:text]', '简单网页监控')
    .alias('rsso.watch', 'rswt')
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
      if (!url) return '❌ 请输入 URL'

      const logContext = buildCommandLogContext(session as any, 'rsso.watch', options.test ? 'test' : 'preview')
      const normalizedUrl = ensureUrlProtocol(url)
      const arg = deps.mixinArg(buildWatchArg(keyword, options as WatchCommandOptions))

      try {
        if (options.test) {
          const items = await deps.getRssData(normalizedUrl, arg)
          if (!items.length) return '❌ 未找到内容'
          return buildItemsPreview(items, `找到 ${items.length} 条内容:`, false)
        }

        return '💡 请使用 rsso 命令完成订阅，或使用 -T 测试'
      } catch (error) {
        deps.debug(error, 'watch error', 'error', logContext)
        return `❌ 监控失败: ${getFriendlyErrorMessage(error, '网页监控')}`
      }
    })
}

export function buildHtmlMonitorArg(options: HtmlMonitorOptions): HtmlMonitorArg {
  return {
    type: 'html',
    selector: options.selector,
    template: options.template || 'content',
    textOnly: Boolean(options.text),
    mode: options.puppeteer ? 'puppeteer' : 'static',
    waitFor: options.wait ? parseInt(options.wait, 10) : undefined,
    waitSelector: options.waitSelector,
    title: options.title,
  }
}

export function buildWatchArg(keyword: string | undefined, options: WatchCommandOptions): rssArg {
  return {
    type: 'html',
    selector: keyword ? `*:contains("${keyword}")` : 'body',
    textOnly: Boolean(keyword),
    mode: options.puppeteer ? 'puppeteer' : 'static',
    template: 'content',
  }
}

async function broadcastInitialItems(
  deps: WebMonitorCommandDeps,
  target: string,
  items: any[],
  rssItem: any,
): Promise<void> {
  const maxItem = rssItem.arg?.forceLength || 1
  const mergedArg = deps.mixinArg(rssItem.arg || {})
  const messageList = await Promise.all(
    items
      .filter((_, index) => index < maxItem)
      .map(async item => deps.parseRssItem(item, { ...rssItem, ...mergedArg }, rssItem.author)),
  )

  await deps.ctx.broadcast([target], messageList.join(''))
}

function buildItemsPreview(items: any[], header: string, withContentLabel: boolean): string {
  const preview = items.slice(0, 3).map((item: any) => {
    const title = normalizePreviewText(item?.title) || '无标题'
    const description = truncatePreviewText(normalizePreviewText(item?.description), 100)
    const body = withContentLabel ? `内容: ${description}` : description
    return `标题: ${title}\n${body}`
  }).join('\n\n')

  return `${header}\n\n${preview}`
}

function normalizePreviewText(value: unknown): string {
  if (Array.isArray(value)) return value.join('')
  if (value === undefined || value === null) return ''
  return String(value)
}

function truncatePreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.substring(0, maxLength)}...`
}