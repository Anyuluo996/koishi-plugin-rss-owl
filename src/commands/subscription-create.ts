import { Context } from 'koishi'

import type { Config, TemplateType } from '../types'
import { ensureUrlProtocol } from '../utils/common'
import { getFriendlyErrorMessage } from '../utils/error-handler'
import { buildCommandLogContext, checkAuthority, extractSessionInfo, parseTarget, isValidUrl } from './utils'

export interface QuickListItem {
  prefix: string
  name: string
  detail: string
  example: string
  replace: string
}

/**
 * 按稳定键解析快速订阅项（审查 #12）。
 * 优先按 prefix（稳定标识）匹配，避免数组重排导致「编号 1 指向不同项」的漂移；
 * prefix 未命中时再回退到数字序号（向后兼容老用法）。
 * 返回 null 表示既非合法 prefix 也非合法序号。
 */
export function resolveQuickItem(
  input: string,
  quickList: QuickListItem[],
): { item: QuickListItem; matchedBy: 'prefix' | 'index' } | null {
  if (!input) return null
  const trimmed = String(input).trim()

  // 1) prefix 精确匹配（稳定键）
  const byPrefix = quickList.find(q => q.prefix === trimmed)
  if (byPrefix) return { item: byPrefix, matchedBy: 'prefix' }

  // 2) 数字序号回退（兼容历史用法，依赖数组顺序，不稳定）
  const num = parseInt(trimmed, 10)
  if (!Number.isNaN(num) && num >= 1 && num <= quickList.length) {
    const item = quickList[num - 1]
    return { item, matchedBy: 'index' }
  }

  return null
}

interface CreateCommandOptions {
  quick?: string
  list?: string
  remove?: string
  removeAll?: boolean
  follow?: string
  followAll?: string
  target?: string
  arg?: string
  template?: TemplateType
  title?: string
  pull?: string
  force?: boolean
  daily?: string
  test?: boolean
}

export interface SubscriptionCreateCommandDeps {
  ctx: Context
  config: Config
  usage: string
  quickList: QuickListItem[]
  parseQuickUrl: (url: string) => string
  parsePubDate: (pubDate: any) => Date
  getRssData: (url: string, arg: any) => Promise<any[]>
  parseRssItem: (item: any, arg: any, authorId: string | number) => Promise<string>
  formatArg: (options: Record<string, any>) => any
  mixinArg: (arg: any) => any
  debug: (message: any, name?: string, type?: 'disable' | 'error' | 'info' | 'details', context?: Record<string, any>) => void
}

/**
 * 注册主订阅命令。
 */
export function registerSubscriptionCreateCommand(deps: SubscriptionCreateCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl <url:text>', '订阅 RSS/源')
    .alias('rsso')
    .usage(deps.usage)
    .option('target', '--target <platform:guildId> 跨群订阅（高级权限）')
    .option('arg', '-a <content> 自定义配置')
    .option('template', '-i <content> 消息模板')
    .option('title', '-t <content> 自定义命名')
    .option('force', '强行写入')
    .option('daily', '-d <content>')
    .option('test', '-T 测试')
    .option('quick', '-q [content] 查询快速订阅列表')
    .example('rsso https://hub.slarker.me/qqorw')
    .action(async ({ session, options }, url) => {
      const logContext = buildCommandLogContext(session as any, 'rsso', 'create')
      deps.debug(options, 'options', 'info', logContext)

      const { guildId, platform, authorId: userId, authority } = extractSessionInfo(session as any)
      const botSelfId = session.bot?.selfId

      deps.debug(`${platform}:${userId}:${guildId}, bot:${botSelfId}`, '', 'info', logContext)

      if (options?.quick === '') {
        // 同时显示序号与 prefix，引导用户使用稳定的 prefix 键
        return '输入 rsso -q <prefix|序号> 查询详情\n' + deps.quickList.map((v, i) => `${i + 1}.${v.name} [${v.prefix}]`).join('\n')
      }

      if (options?.quick) {
        const resolved = resolveQuickItem(options.quick, deps.quickList as QuickListItem[])
        if (!resolved) return `快速订阅不存在: ${options.quick}\n💡 使用 rsso -q 查看可用列表（支持 prefix 或序号）`
        const { item: currentQuickObj, matchedBy } = resolved
        const hint = matchedBy === 'index' ? '\n💡 提示：序号会随列表调整变化，推荐使用 prefix [' + currentQuickObj.prefix + '] 作为稳定键' : ''
        return `${currentQuickObj.name}\n${currentQuickObj.detail}\n例:rsso -T ${currentQuickObj.example}\n(${deps.parseQuickUrl(currentQuickObj.example)})${hint}`
      }

      if (platform.includes('sandbox') && !options.test && url) {
        session.send('沙盒中无法推送更新，但RSS依然会被订阅，建议使用 -T 选项进行测试')
      }

      if (!url) return deps.usage

      // 校验 URL 格式，给用户即时反馈，避免带着非法 URL 走到网络请求
      if (!isValidUrl(ensureUrlProtocol(url))) {
        return '❌ URL 格式不正确，请以 http:// 或 https:// 开头'
      }

      const rssList = await deps.ctx.database.get('rssOwl', { platform, guildId })

      if (rssList.find(item => item.url === url)) return '❌ 该订阅已存在'

      const rawArg = deps.formatArg(options as Record<string, any>)
      const arg = deps.mixinArg(rawArg)
      let targetPlatform = platform
      let targetGuildId = guildId

      if (options?.target) {
        const authorityCheck = checkAuthority(authority, deps.config.basic.advancedAuthority, `权限不足！当前权限: ${authority}，需要权限: ${deps.config.basic.advancedAuthority} 或以上`)
        if (!authorityCheck.success) return authorityCheck.message

        const parsedTarget = parseTarget(options.target)
        if (!parsedTarget) {
          return '请输入正确的群号，格式为 platform:guildId 或 platform：guildId\n示例: onebot:123456'
        }

        targetPlatform = parsedTarget.platform
        targetGuildId = parsedTarget.guildId

        if (options.test) {
          try {
            await deps.ctx.broadcast([`${targetPlatform}:${targetGuildId}`], '跨群订阅测试消息')
            return `✅ 测试消息已发送到目标群组\n目标: ${targetPlatform}:${targetGuildId}\n\n说明：Bot 可以访问该群组，跨群订阅可以正常工作。\n去掉 --test 选项完成订阅。`
          } catch (error: any) {
            return `❌ 无法发送到目标群组\n目标: ${targetPlatform}:${targetGuildId}\n错误: ${error.message}\n\n请确认：\n1. Bot 是否在该群组中\n2. 群组ID 是否正确\n3. 平台名称是否正确（如 onebot, telegram 等）`
          }
        }
      }

      let title = options?.title || ''

      try {
        url = deps.parseQuickUrl(url)
        const rssItemList = await deps.getRssData(ensureUrlProtocol(url), arg)

        if (options.test) {
          const testItem = rssItemList[0]
          if (!testItem) return '未获取到数据'

          const testArg = { ...arg, url: title || testItem.rss.channel.title, title: title || testItem.rss.channel.title }
          if (!testArg.template) testArg.template = deps.config.basic.defaultTemplate
          return deps.parseRssItem(testItem, testArg, userId)
        }

        if (!title) {
          title = rssItemList[0]?.rss.channel.title
          if (!title) return '无法获取标题，请使用 -t 指定标题'
        }

        const lastPubDate = deps.parsePubDate(rssItemList[0]?.pubDate)
        const rssItem: any = {
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
          const forceCheck = checkAuthority(authority, deps.config.basic.authority, `权限不足！当前权限: ${authority}，需要权限: ${deps.config.basic.authority} 或以上`)
          if (!forceCheck.success) return forceCheck.message
        } else if (deps.config.basic.urlDeduplication && rssList.find(item => item.rssId === rssItem.rssId)) {
          return `❌ 订阅已存在: ${rssItem.rssId}`
        }

        await deps.ctx.database.create('rssOwl', rssItem)

        if (deps.config.basic.firstLoad && arg.firstLoad !== false && rssItemList.length > 0) {
          let itemArray = rssItemList.sort((a, b) => deps.parsePubDate(b.pubDate).getTime() - deps.parsePubDate(a.pubDate).getTime())
          if (arg.reverse) itemArray = itemArray.reverse()
          const maxItem = arg.forceLength || 1
          const mergedArg = deps.mixinArg(rssItem.arg)
          const messageList = await Promise.all(itemArray.filter((_, index) => index < maxItem).map(async item => deps.parseRssItem(item, { ...rssItem, ...mergedArg }, rssItem.author)))
          await deps.ctx.broadcast([`${targetPlatform}:${targetGuildId}`], messageList.join(''))
        }

        return `✅ 订阅成功: ${title}`
      } catch (error) {
        deps.debug(error, 'add error', 'error', logContext)
        return `订阅失败: ${getFriendlyErrorMessage(error, '添加订阅')}`
      }
    })
}