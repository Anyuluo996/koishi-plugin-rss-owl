import { Context } from 'koishi'

import type { Config } from '../types'
import { getFriendlyErrorMessage, normalizeError } from '../utils/error-handler'
import { debug } from '../utils/logger'
import { buildCommandLogContext, checkAuthority, extractSessionInfo } from './utils'

export interface SubscriptionCommandDeps {
  ctx: Context
  config: Config
  parsePubDate: (pubDate: any) => Date
  parseQuickUrl: (url: string) => string
  getRssData: (url: string, arg: any) => Promise<any[]>
  parseRssItem: (item: any, arg: any, authorId: string | number) => Promise<string>
  mixinArg: (arg: any) => any
}

export function registerSubscriptionManagementCommands(deps: SubscriptionCommandDeps): void {
  registerListCommand(deps)
  registerRemoveCommand(deps)
  registerPullCommand(deps)
  registerFollowCommand(deps)
}

function registerListCommand(deps: SubscriptionCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.list [id:number]', '查看订阅列表')
    .alias('rsso.list', 'rsls')
    .usage(`查看订阅列表

用法:
  rsso.list              - 查看所有订阅
  rsso.list 1            - 查看订阅 #1 的详情（使用列表序号）
    `)
    .example('rsso.list')
    .action(async ({ session }, id) => {
      const { guildId, platform } = extractSessionInfo(session as any)
      const rssList = await getGuildSubscriptions(deps.ctx, platform, guildId)

      if (id === undefined) {
        if (rssList.length === 0) return '当前没有任何订阅'
        return rssList.map((item, index) => {
          const isCrossGroup = item.platform !== platform || item.guildId !== guildId
          return `${index + 1}. ${item.title}${isCrossGroup ? ' [跨群]' : ''} [ID:${item.id}]`
        }).join('\n')
      }

      const rssItem = getSubscriptionByIndex(rssList, id)
      if (!rssItem) return getSubscriptionNotFoundMessage(id, rssList.length)

      const followers = rssItem.followers?.length > 0 ? rssItem.followers.join(', ') : '无'
      const pushTarget = `${rssItem.platform}:${rssItem.guildId}`
      const isCrossGroup = rssItem.platform !== platform || rssItem.guildId !== guildId
      const targetInfo = isCrossGroup
        ? `推送目标: ${pushTarget} (跨群订阅)`
        : `推送目标: ${pushTarget} (本群)`

      return `订阅详情 [序号:${id} | ID:${rssItem.id}]
标题: ${rssItem.title}
链接: ${rssItem.url}
类型: ${rssItem.arg?.type || 'RSS'}
模板: ${rssItem.arg?.template || deps.config.basic.defaultTemplate}
${targetInfo}
更新时间: ${rssItem.lastPubDate ? deps.parsePubDate(rssItem.lastPubDate).toLocaleString('zh-CN', { hour12: false }) : '未知'}
关注者: ${followers}`
    })
}

function registerRemoveCommand(deps: SubscriptionCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.remove <id:number>', '删除订阅')
    .alias('rsso.remove', 'rsrm')
    .usage(`删除订阅

用法:
  rsso.remove 1           - 删除订阅 #1（使用列表序号）
  rsso.remove --all       - 删除全部订阅（需要权限）
    `)
    .option('all', '--all 删除全部订阅')
    .example('rsso.remove 1')
    .action(async ({ session, options }, id) => {
      const { guildId, platform, authority } = extractSessionInfo(session as any)

      if (options.all) {
        const authorityCheck = checkAuthority(authority, deps.config.basic.authority, `权限不足！当前权限: ${authority}，需要权限: ${deps.config.basic.authority} 或以上`)
        if (!authorityCheck.success) return authorityCheck.message
        await deps.ctx.database.remove(('rssOwl' as any), { platform, guildId })
        return '✅ 已删除全部订阅'
      }

      const rssList = await getGuildSubscriptions(deps.ctx, platform, guildId)
      const rssItem = getSubscriptionByIndex(rssList, id)
      if (!rssItem) return getSubscriptionNotFoundMessage(id, rssList.length)

      await deps.ctx.database.remove(('rssOwl' as any), { id: rssItem.id })
      return `✅ 已删除订阅: ${rssItem.title}`
    })
}

function registerPullCommand(deps: SubscriptionCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.pull <id:number>', '拉取订阅最新内容')
    .alias('rsso.pull', 'rspl')
    .usage(`拉取订阅最新内容

用法:
  rsso.pull 1             - 拉取订阅 #1 的最新更新（使用列表序号）
    `)
    .example('rsso.pull 1')
    .action(async ({ session }, id) => {
      const { guildId, platform } = extractSessionInfo(session as any)
      const rssList = await getGuildSubscriptions(deps.ctx, platform, guildId)
      const rssItem = getSubscriptionByIndex(rssList, id)
      if (!rssItem) return getSubscriptionNotFoundMessage(id, rssList.length)

      const logContext = {
        ...buildCommandLogContext(session as any, 'rsso.pull', 'pull'),
        subscriptionIndex: id,
        subscribeId: String(rssItem.id),
        rssId: rssItem.rssId || rssItem.title,
        url: rssItem.url,
      }

      try {
        const arg = deps.mixinArg(rssItem.arg || {})
        const rssItemList = (await Promise.all(
          String(rssItem.url).split('|')
            .map(url => deps.parseQuickUrl(url))
            .map(async url => await deps.getRssData(url, arg))
        )).flat(1)

        let itemArray = rssItemList.sort((a, b) => deps.parsePubDate(b.pubDate).getTime() - deps.parsePubDate(a.pubDate).getTime())
        if (arg.reverse) itemArray = itemArray.reverse()

        const maxItem = arg.forceLength || 1
        const messageList = await Promise.all(
          itemArray
            .filter((_, index) => index < maxItem)
            .map(async item => await deps.parseRssItem(item, { ...rssItem, ...arg }, rssItem.author))
        )

        return messageList.join('')
      } catch (error) {
        const normalizedError = normalizeError(error)
        debug(deps.config, normalizedError, 'pull error', 'error', logContext)
        return `拉取失败: ${getFriendlyErrorMessage(error, '获取订阅数据')}`
      }
    })
}

function registerFollowCommand(deps: SubscriptionCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.follow <id:number>', '关注订阅')
    .alias('rsso.follow', 'rsfw')
    .usage(`关注订阅，在该订阅更新时提醒你

用法:
  rsso.follow 1           - 关注订阅 #1（仅提醒你）
  rsso.follow 1 --all     - 关注订阅 #1（提醒所有人，需要高级权限）
    `)
    .option('all', '--all 提醒所有人')
    .example('rsso.follow 1')
    .action(async ({ session, options }, id) => {
      const { guildId, platform, authorId, authority } = extractSessionInfo(session as any)
      const rssList = await getGuildSubscriptions(deps.ctx, platform, guildId)
      const rssItem = getSubscriptionByIndex(rssList, id)
      if (!rssItem) return getSubscriptionNotFoundMessage(id, rssList.length)

      const followers = Array.isArray(rssItem.followers) ? [...rssItem.followers] : []
      if (options.all) {
        const authorityCheck = checkAuthority(authority, deps.config.basic.advancedAuthority, `权限不足！当前权限: ${authority}，需要权限: ${deps.config.basic.advancedAuthority} 或以上`)
        if (!authorityCheck.success) return authorityCheck.message
        if (followers.includes('all')) return '💡 已经设置全员提醒'
        followers.push('all')
        await deps.ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { followers })
        return '✅ 已设置全员提醒'
      }

      if (followers.includes(authorId)) return '💡 已经关注过了'
      followers.push(authorId)
      await deps.ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { followers })
      return '✅ 关注成功'
    })
}

async function getGuildSubscriptions(ctx: Context, platform: string, guildId: string): Promise<any[]> {
  return ctx.database.get(('rssOwl' as any), { platform, guildId })
}

function getSubscriptionByIndex(rssList: any[], id: number): any | null {
  const listIndex = id - 1
  if (listIndex < 0 || listIndex >= rssList.length) return null
  return rssList[listIndex]
}

function getSubscriptionNotFoundMessage(id: number, total: number): string {
  return `❌ 序号 ${id} 不存在\n当前共有 ${total} 个订阅\n\n使用 rsso.list 查看完整列表`
}