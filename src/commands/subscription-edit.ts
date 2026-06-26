import { Context } from 'koishi'

import type { Config, TemplateType } from '../types'
import { checkAuthority, extractSessionInfo, parseTargets } from './utils'

interface EditCommandOptions {
  title?: string
  url?: string
  template?: TemplateType
  selector?: string
  target?: string
  test?: boolean
}

export interface SubscriptionEditCommandDeps {
  ctx: Context
  config: Config
}

export function registerSubscriptionEditCommand(deps: SubscriptionEditCommandDeps): void {
  deps.ctx.guild()
    .command('rssowl.edit <id:number>', '修改订阅配置')
    .alias('rsso.edit', 'rsed')
    .usage(`修改订阅的配置项

用法:
  rsso.edit 1 -t "新标题"        - 修改标题
  rsso.edit 1 -i content         - 修改模板
  rsso.edit 1 -u https://...      - 修改URL
  rsso.edit 1 -s ".item"         - 修改选择器（HTML监控）
  rsso.edit 1 --target onebot:123  - 修改推送目标（高级权限）
  rsso.edit 1 --target "onebot:123,telegram:456"  - 多个推送目标（高级权限）
  rsso.edit 1 -t "新标题" --test  - 测试修改（不保存）

示例:
  rsso.edit 1 -t "我的订阅"
  rsso.edit 1 -i custom
  rsso.edit 1 --target onebot:123456
  rsso.edit 1 --target "onebot:123,telegram:456"

💡 提示:
  - 使用列表序号（1, 2, 3...）而不是数据库ID
  - 推送目标格式: platform:guildId
  - 多个目标用逗号分隔或多次使用 --target
    `)
    .option('title', '-t <title> 修改标题', { type: 'string' })
    .option('url', '-u <url> 修改URL', { type: 'string' })
    .option('template', '-i <template> 修改模板', { type: 'string' })
    .option('selector', '-s <selector> 修改选择器（HTML监控）', { type: 'string' })
    .option('target', '--target <target> 修改推送目标（高级权限）')
    .option('test', '--test 测试修改（不保存）')
    .example('rsso.edit 1 -t "新标题"')
    .action(async ({ session, options }, id) => {
      const { guildId, platform, authority } = extractSessionInfo(session as any)
      const rssList = await deps.ctx.database.get('rssOwl', { platform, guildId })
      const listIndex = id - 1

      if (listIndex < 0 || listIndex >= rssList.length) {
        return `❌ 序号 ${id} 不存在\n当前共有 ${rssList.length} 个订阅\n\n使用 rsso.list 查看完整列表`
      }

      const rssItem = rssList[listIndex]
      const baseAuthorityCheck = checkAuthority(authority, deps.config.basic.authority, `权限不足！当前权限: ${authority}，需要权限: ${deps.config.basic.authority} 或以上`)
      if (!baseAuthorityCheck.success) return baseAuthorityCheck.message

      if (options.target) {
        const targetAuthorityCheck = checkAuthority(authority, deps.config.basic.advancedAuthority, `❌ 修改推送目标需要高级权限\n当前权限: ${authority}，需要权限: ${deps.config.basic.advancedAuthority} 或以上`)
        if (!targetAuthorityCheck.success) return targetAuthorityCheck.message
      }

      const hasChanges = options.title || options.url || options.template || options.selector || options.target
      if (!hasChanges) {
        return '❌ 请指定要修改的内容\n可用选项: -t (标题), -u (URL), -i (模板), -s (选择器), --target (推送目标)\n💡 使用 --help 查看详细帮助'
      }

      const parseResult = parseTargets(options.target)
      if (parseResult.invalidTarget) {
        return `❌ 推送目标格式错误: "${parseResult.invalidTarget}"\n正确格式: platform:guildId\n示例: onebot:123456\n\n支持多个目标，用逗号分隔:\n  --target "onebot:123,telegram:456"`
      }

      if (options.test) {
        return buildEditPreview(rssItem, id, options, parseResult.targets)
      }

      return saveSubscriptionChanges(deps.ctx, rssItem, id, options, parseResult.targets)
    })
}

function buildEditPreview(rssItem: any, id: number, options: EditCommandOptions, parsedTargets: string[]): string {
  let testOutput = `修改预览 [序号:${id} | ID:${rssItem.id}]\n\n`
  testOutput += `当前标题: ${rssItem.title}\n`
  testOutput += `当前URL: ${rssItem.url}\n`
  testOutput += `当前推送目标: ${rssItem.platform}:${rssItem.guildId}\n`
  if (options.title) testOutput += `→ 新标题: ${options.title}\n`
  if (options.url) testOutput += `→ 新URL: ${options.url}\n`
  if (options.template) testOutput += `→ 新模板: ${options.template}\n`
  if (options.selector) testOutput += `→ 新选择器: ${options.selector}\n`
  if (parsedTargets.length > 0) {
    if (parsedTargets.length === 1) {
      testOutput += `→ 新推送目标: ${parsedTargets[0]}\n`
    } else {
      testOutput += `→ 新推送目标:\n  ${parsedTargets.join('\n  ')}\n`
      testOutput += '\n⚠️ 注意: 多个推送目标会创建多个订阅记录\n每个目标会复制当前的订阅配置\n'
    }
  }
  testOutput += '\n⚠️ 测试模式：不会保存修改\n去掉 --test 选项保存更改'
  return testOutput
}

async function saveSubscriptionChanges(ctx: Context, rssItem: any, id: number, options: EditCommandOptions, parsedTargets: string[]): Promise<string> {
  const updates: any = {}

  if (options.title) updates.title = options.title
  if (options.url) updates.url = options.url

  if (options.template) {
    if (!rssItem.arg) rssItem.arg = {}
    rssItem.arg.template = options.template
    updates.arg = rssItem.arg
  }

  if (options.selector) {
    if (!rssItem.arg) rssItem.arg = {}
    rssItem.arg.selector = options.selector
    updates.arg = rssItem.arg
  }

  try {
    if (parsedTargets.length > 0) {
      if (parsedTargets.length === 1) {
        const [newPlatform, newGuildId] = parsedTargets[0].split(/[:：]/)
        updates.platform = newPlatform
        updates.guildId = newGuildId
        await ctx.database.set('rssOwl', rssItem.id, updates)

        let result = `✅ 订阅已更新 [序号:${id} | ID:${rssItem.id}]\n\n`
        if (options.title) result += `标题: ${rssItem.title} → ${options.title}\n`
        if (options.url) result += `URL: ${rssItem.url} → ${options.url}\n`
        if (options.template) result += `模板: ${rssItem.arg?.template || 'default'} → ${options.template}\n`
        if (options.selector) result += `选择器: ${rssItem.arg?.selector || '无'} → ${options.selector}\n`
        result += `推送目标: ${rssItem.platform}:${rssItem.guildId} → ${parsedTargets[0]}\n`
        return result.trim()
      }

      const originalTarget = `${rssItem.platform}:${rssItem.guildId}`
      let result = `✅ 订阅已更新 [序号:${id} | ID:${rssItem.id}]\n\n`
      result += `已创建 ${parsedTargets.length} 个推送目标:\n\n`
      result += `1. 原订阅 (本群): ${originalTarget}\n`

      await ctx.database.set('rssOwl', rssItem.id, updates)

      for (let i = 0; i < parsedTargets.length; i++) {
        const [newPlatform, newGuildId] = parsedTargets[i].split(/[:：]/)
        const existing = await ctx.database.get('rssOwl', {
          platform: newPlatform,
          guildId: newGuildId,
          url: rssItem.url
        })

        if (existing.length > 0) {
          result += `${i + 2}. ⚠️ ${newPlatform}:${newGuildId} (订阅已存在，已跳过)\n`
          continue
        }

        const newSubscription = {
          ...rssItem,
          id: undefined,
          platform: newPlatform,
          guildId: newGuildId,
        }

        const created = await ctx.database.create('rssOwl', newSubscription)
        result += `${i + 2}. ✅ ${newPlatform}:${newGuildId} (新订阅ID: ${created.id})\n`
      }

      if (options.title) result += `\n标题: ${rssItem.title} → ${options.title}\n`
      if (options.url) result += `URL: ${rssItem.url} → ${options.url}\n`
      result += '\n💡 提示: 可以使用 rsso.list 查看所有订阅'
      return result.trim()
    }

    await ctx.database.set('rssOwl', rssItem.id, updates)

    let result = `✅ 订阅已更新 [序号:${id} | ID:${rssItem.id}]\n\n`
    if (options.title) result += `标题: ${rssItem.title} → ${options.title}\n`
    if (options.url) result += `URL: ${rssItem.url} → ${options.url}\n`
    if (options.template) result += `模板: ${rssItem.arg?.template || 'default'} → ${options.template}\n`
    if (options.selector) result += `选择器: ${rssItem.arg?.selector || '无'} → ${options.selector}\n`
    return result.trim()
  } catch (error: any) {
    return `更新失败: ${error.message}`
  }
}