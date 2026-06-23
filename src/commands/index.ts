import { Context } from 'koishi'

import type { Config } from '../types'
import { NotificationQueueManager } from '../core/notification-queue'
import { QueueTaskContent } from '../core/notification-queue-types'
import { normalizeError } from '../utils/error-handler'
import { trackError } from '../utils/error-tracker'
import { debug } from '../utils/logger'
import { getMessageCache, type CachedMessage, type MessageCacheManager } from '../utils/message-cache'
import { buildCommandLogContext, checkAuthority, extractSessionInfo } from './utils'

/**
 * 管理类命令依赖
 */
export interface ManagementCommandDeps {
  ctx: Context
  config: Config
  queueManager: NotificationQueueManager
}

interface CacheCommandContext {
  cache: MessageCacheManager
  platform: string
  guildId: string
  authority: number
  logContext?: Record<string, any>
}

/**
 * 注册管理类命令
 *
 * 设计要点（命令系统统一）：
 *  - cache/queue 父命令【不带 .action()】，由 Koishi 原生「无 action → 显示 help」接管，
 *    自动在 help 菜单/网页控制台列出子命令树。
 *  - 子命令注册为 rssowl.cache.list / rssowl.cache.stats 等真正的嵌套命令；
 *    用户在聊天里输入 "rsso.cache list"（带空格）时，Koishi 核心路由
 *    （inferCommand, core index.mjs:1377-1405）会自动解析到 rssowl.cache.list 子命令，
 *    输入方式与旧版完全一致，但获得了菜单可见性。
 *  - 父命令 rssowl.cache 必须无位置参数（`ctx.command('rssowl.cache', ...)`），
 *    否则路由会在父命令处 break，导致 list 被当作位置参数而非子命令。
 */
export function registerManagementCommands(deps: ManagementCommandDeps): void {
  registerCacheCommands(deps.ctx, deps.config, deps.queueManager)
  registerQueueCommands(deps.ctx, deps.config, deps.queueManager)
}

// 设计决策（审查 #9）：cache/queue 命令通过 ctx.guild() 限定为「仅群组可用」。
// 这是有意为之——缓存数据天然按 platform+guildId 分组，私聊没有有意义的 guildId，
// extractSessionInfo 依赖 session.event.guild.id；若放开到私聊会导致 guild 为 undefined 而崩溃，
// 且私聊也无"本群缓存"这一语义。因此保持 ctx.guild()，不在私聊降级。

// ---------------------------------------------------------------------------
// cache 命令树
// ---------------------------------------------------------------------------

function registerCacheCommands(ctx: Context, config: Config, queueManager: NotificationQueueManager): void {
  // 父命令：无 action，Koishi 自动显示 help + 子命令列表
  ctx.guild()
    .command('rssowl.cache', '消息缓存管理')
    .alias('rsso.cache', 'rsc')
    .usage(`查看和管理已推送的 RSS 消息缓存（仅限当前群组）。

输入 rsso.cache 不带子命令可查看所有子命令，或直接使用：
  rsso.cache list [页数]      查看缓存消息列表
  rsso.cache search <关键词>  搜索缓存消息
  rsso.cache stats            查看缓存统计
  rsso.cache message <ID>     查看消息详情（真实 ID）
  rsso.cache pull <ID>        重新推送缓存消息（真实 ID）
  rsso.cache clear            清空本群缓存（需权限）
  rsso.cache cleanup [N]      清理并保留最新 N 条（需权限）

注意：
  - 仅显示/操作【当前群组】的缓存
  - message/pull 使用 list 中方括号 [ID:xxx] 显示的真实数据库 ID`)

  // 子命令：list
  ctx.guild()
    .command('rssowl.cache.list [page:number]', '查看缓存消息列表')
    .alias('rsso.cache.list')
    .usage(`查看当前群组的缓存消息列表（分页，每页 10 条）。

示例:
  rsso.cache list       查看第 1 页
  rsso.cache list 2     查看第 2 页`)
    .example('rsso.cache list')
    .action(async ({ session }, page) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'list')
      if (typeof cmd === 'string') return cmd
      return handleCacheList(cmd, page ? [String(page)] : [], config)
    })

  // 子命令：search
  ctx.guild()
    .command('rssowl.cache.search <keyword:text>', '搜索缓存消息')
    .alias('rsso.cache.search')
    .usage(`在当前群组的缓存中搜索包含关键词的消息。

示例:
  rsso.cache search 新闻`)
    .example('rsso.cache search 新闻')
    .action(async ({ session }, keyword) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'search')
      if (typeof cmd === 'string') return cmd
      if (!keyword) return '请提供搜索关键词\n用法: rsso.cache search <关键词>'
      return handleCacheSearch(cmd, [keyword], config)
    })

  // 子命令：stats
  ctx.guild()
    .command('rssowl.cache.stats', '查看缓存统计')
    .alias('rsso.cache.stats')
    .usage('查看当前群组的缓存统计信息（总数、按订阅分布、时间范围）。')
    .example('rsso.cache stats')
    .action(async ({ session }) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'stats')
      if (typeof cmd === 'string') return cmd
      return handleCacheStats(cmd, config)
    })

  // 子命令：message
  ctx.guild()
    .command('rssowl.cache.message <id:number>', '查看缓存消息详情')
    .alias('rsso.cache.message')
    .usage(`按真实 ID 查看缓存消息详情（ID 来自 list 列表中的 [ID:xxx]）。

示例:
  rsso.cache message 42`)
    .example('rsso.cache message 42')
    .action(async ({ session }, id) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'message')
      if (typeof cmd === 'string') return cmd
      return handleCacheMessage(cmd, id != null ? [String(id)] : [], config)
    })

  // 子命令：pull
  ctx.guild()
    .command('rssowl.cache.pull <id:number>', '重新推送缓存消息')
    .alias('rsso.cache.pull')
    .usage(`按真实 ID 重新推送一条缓存消息（ID 来自 list 列表中的 [ID:xxx]）。
推送经发送队列，与正常 feed 推送路径一致（含重试/降级）。

示例:
  rsso.cache pull 42`)
    .example('rsso.cache pull 42')
    .action(async ({ session }, id) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'pull')
      if (typeof cmd === 'string') return cmd
      return handleCachePull(ctx, queueManager, session as any, cmd, id != null ? [String(id)] : [], config)
    })

  // 子命令：clear（需权限）
  ctx.guild()
    .command('rssowl.cache.clear', '清空本群缓存')
    .alias('rsso.cache.clear')
    .usage('清空当前群组的所有缓存消息（需要基础权限）。')
    .example('rsso.cache clear')
    .action(async ({ session }) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'clear')
      if (typeof cmd === 'string') return cmd
      const ac = checkAuthority(cmd.authority, config.basic.authority, permissionDeniedMsg(cmd.authority, config))
      if (!ac.success) return ac.message
      return handleCacheClear(cmd, config)
    })

  // 子命令：cleanup（需权限）
  ctx.guild()
    .command('rssowl.cache.cleanup [keepLatest:number]', '清理缓存')
    .alias('rsso.cache.cleanup')
    .usage(`清理当前群组缓存，保留最新 N 条（需要基础权限）。
不传 N 时使用配置的最大缓存限制。

示例:
  rsso.cache cleanup        按配置上限清理
  rsso.cache cleanup 50     保留最新 50 条`)
    .example('rsso.cache cleanup 50')
    .action(async ({ session }, keepLatest) => {
      const cmd = buildCacheCmd(session, 'rsso.cache', 'cleanup')
      if (typeof cmd === 'string') return cmd
      const ac = checkAuthority(cmd.authority, config.basic.authority, permissionDeniedMsg(cmd.authority, config))
      if (!ac.success) return ac.message
      return handleCacheCleanup(cmd, keepLatest != null ? [String(keepLatest)] : [], config)
    })
}

// ---------------------------------------------------------------------------
// queue 命令树
// ---------------------------------------------------------------------------

function registerQueueCommands(ctx: Context, config: Config, queueManager: NotificationQueueManager): void {
  // 父命令：无 action，Koishi 自动显示 help + 子命令列表
  ctx.guild()
    .command('rssowl.queue', '发送队列管理')
    .alias('rsso.queue', 'rsq')
    .usage(`查看和管理发送队列。

输入 rsso.queue 不带子命令可查看所有子命令，或直接使用：
  rsso.queue stats            查看队列统计
  rsso.queue retry [id]       重试失败任务（需权限）
  rsso.queue retry --all      重试所有失败任务（需权限）
  rsso.queue cleanup [hours]  清理旧的成功任务（默认 24 小时，需权限）`)

  // 子命令：stats
  ctx.guild()
    .command('rssowl.queue.stats', '查看发送队列统计')
    .alias('rsso.queue.stats')
    .usage('查看发送队列各状态的任务数量。')
    .example('rsso.queue stats')
    .action(async ({ session }) => {
      const logContext = buildCommandLogContext(session as any, 'rsso.queue', 'stats')
      return handleQueueStats(queueManager, config, logContext)
    })

  // 子命令：retry（需权限）
  ctx.guild()
    .command('rssowl.queue.retry [id:number]', '重试发送队列失败任务')
    .alias('rsso.queue.retry')
    .option('all', '--all 重试所有失败任务')
    .usage(`重试发送队列中失败的任务（需要基础权限）。

示例:
  rsso.queue retry 5      重试 ID 为 5 的任务
  rsso.queue retry --all  重试所有失败任务`)
    .example('rsso.queue retry --all')
    .action(async ({ session, options }, id) => {
      const { authority } = extractSessionInfo(session as any)
      const ac = checkAuthority(authority, config.basic.authority, permissionDeniedMsg(authority, config))
      if (!ac.success) return ac.message
      const logContext = buildCommandLogContext(session as any, 'rsso.queue', 'retry')
      const args = options?.all ? ['--all'] : (id != null ? [String(id)] : [])
      return handleQueueRetry(queueManager, args, config, logContext)
    })

  // 子命令：cleanup（需权限）
  ctx.guild()
    .command('rssowl.queue.cleanup [hours:number]', '清理发送队列成功任务')
    .alias('rsso.queue.cleanup')
    .usage(`清理超过指定小时数的成功任务（需要基础权限）。
不传 hours 时默认 24 小时。

示例:
  rsso.queue cleanup        清理 24 小时前的成功任务
  rsso.queue cleanup 48     清理 48 小时前的成功任务`)
    .example('rsso.queue cleanup 48')
    .action(async ({ session }, hours) => {
      const { authority } = extractSessionInfo(session as any)
      const ac = checkAuthority(authority, config.basic.authority, permissionDeniedMsg(authority, config))
      if (!ac.success) return ac.message
      const logContext = buildCommandLogContext(session as any, 'rsso.queue', 'cleanup')
      return handleQueueCleanup(queueManager, hours != null ? [String(hours)] : [], config, logContext)
    })
}

// ---------------------------------------------------------------------------
// cache 命令上下文构造
// ---------------------------------------------------------------------------

/**
 * 从 session 构造 cache 命令上下文，并预先校验缓存是否启用。
 * 返回 string 时表示出错消息（应直接 return），返回 CacheCommandContext 时继续。
 */
function buildCacheCmd(session: any, parent: string, sub: string): CacheCommandContext | string {
  const { platform, guildId, authority } = extractSessionInfo(session as any)
  const cache = getMessageCache()
  if (!cache) {
    return '消息缓存功能未启用，请在配置中启用 cache.enabled'
  }
  const logContext = buildCommandLogContext(session as any, parent, sub)
  return { cache, platform, guildId, authority, logContext }
}

function permissionDeniedMsg(authority: number, config: Config): string {
  return `❌ 权限不足！当前权限: ${authority}，需要权限: ${config.basic.authority} 或以上`
}

// ---------------------------------------------------------------------------
// cache handlers（业务逻辑不变，仅统一轻量 emoji 风格）
// ---------------------------------------------------------------------------

async function handleCacheList(cmdCtx: CacheCommandContext, args: string[], config: Config): Promise<string> {
  const { cache, platform, guildId, logContext } = cmdCtx
  const page = parseInt(args[0]) || 1
  const limit = 10
  const offset = (page - 1) * limit

  try {
    // 限定到当前群组，杜绝跨群泄露
    const messages = await cache.getMessages({ limit, offset, platform, guildId })

    if (messages.length === 0) {
      return '暂无缓存消息'
    }

    const stats = await cache.getStats({ platform, guildId })
    let output = `缓存消息列表 (第${page}页，共${Math.max(1, Math.ceil(stats.totalMessages / limit))}页，总计${stats.totalMessages}条)\n\n`

    output += messages.map((msg, index) => {
      const date = new Date(msg.createdAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      })
      const title = msg.title.length > 30 ? msg.title.substring(0, 30) + '...' : msg.title
      return `${offset + index + 1}. [ID:${msg.id}] [${msg.rssId}] ${title}\n   时间: ${date}\n   链接: ${msg.link}`
    }).join('\n\n')

    output += `\n\n💡 使用 "rsso.cache list ${page + 1}" 查看下一页`
    output += '\n💡 使用 "rsso.cache message <ID>" 查看详情（ID 为方括号中的真实 ID）'
    output += '\n💡 使用 "rsso.cache pull <ID>" 推送消息（使用真实 ID）'
    return output
  } catch (error: any) {
    logCacheError(config, error, 'cache list error', { ...logContext, page, limit })
    return `❌ 获取消息列表失败: ${error.message}`
  }
}

async function handleCacheMessage(cmdCtx: CacheCommandContext, args: string[], config: Config): Promise<string> {
  const { cache, logContext } = cmdCtx
  const realId = parseInt(args[0])
  if (!realId || realId < 1) {
    return '请提供真实 ID\n用法: rsso.cache message <ID>\n示例: rsso.cache message 42\n💡 提示：使用 "rsso.cache list" 查看方括号中的真实 ID'
  }

  try {
    const message = await resolveCacheMessageById(cmdCtx, realId)
    if (!message) {
      return `❌ 未找到 ID 为 ${args[0]} 的消息（或该消息不属于当前群组）\n💡 使用 "rsso.cache list" 查看可用的真实 ID`
    }

    const pubDate = new Date(message.pubDate).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })
    const createdAt = new Date(message.createdAt).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })

    let output = `消息详情 (ID:${message.id})\n\n`
    output += `标题: ${message.title}\n订阅: ${message.rssId}\n群组: ${message.platform}:${message.guildId}\n链接: ${message.link}\n发布时间: ${pubDate}\n缓存时间: ${createdAt}\n`

    if (message.content) {
      const content = message.content.length > 200 ? message.content.substring(0, 200) + '...' : message.content
      output += `\n内容:\n${content}`
    }
    if (message.imageUrl) output += `\n\n图片: ${message.imageUrl}`
    if (message.videoUrl) output += `\n\n视频: ${message.videoUrl}`
    return output
  } catch (error: any) {
    logCacheError(config, error, 'cache message error', { ...logContext, realId })
    return `❌ 获取消息详情失败: ${error.message}`
  }
}

async function handleCacheSearch(cmdCtx: CacheCommandContext, args: string[], config: Config): Promise<string> {
  const { cache, platform, guildId, logContext } = cmdCtx
  const keyword = args[0]

  try {
    // 限定到当前群组
    const messages = await cache.searchMessages({ keyword, limit: 10, platform, guildId })
    if (messages.length === 0) {
      return `未找到包含 "${keyword}" 的消息`
    }

    let output = `搜索结果 "${keyword}" (找到${messages.length}条)\n\n`
    output += messages.map((msg, index) => {
      const date = new Date(msg.createdAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      })
      const title = msg.title.length > 30 ? msg.title.substring(0, 30) + '...' : msg.title
      return `${index + 1}. [ID:${msg.id}] [${msg.rssId}] ${title}\n   时间: ${date}`
    }).join('\n\n')

    output += '\n\n💡 使用 "rsso.cache message <ID>" 查看详情（使用方括号中的真实 ID）'
    return output
  } catch (error: any) {
    logCacheError(config, error, 'cache search error', { ...logContext, keyword })
    return `❌ 搜索失败: ${error.message}`
  }
}

async function handleCacheStats(cmdCtx: CacheCommandContext, config: Config): Promise<string> {
  const { cache, platform, guildId, logContext } = cmdCtx
  try {
    // 限定到当前群组
    const stats = await cache.getStats({ platform, guildId })
    let output = `缓存统计信息（本群）\n\n总消息数: ${stats.totalMessages}\n`

    if (stats.oldestMessage) output += `最早消息: ${new Date(stats.oldestMessage).toLocaleString('zh-CN')}\n`
    if (stats.newestMessage) output += `最新消息: ${new Date(stats.newestMessage).toLocaleString('zh-CN')}\n`

    output += '\n按订阅统计:\n'
    Object.entries(stats.bySubscription).sort(([, a], [, b]) => b - a).slice(0, 10).forEach(([rssId, count]) => {
      output += `  ${rssId}: ${count}条\n`
    })

    output += `\n最大缓存限制: ${cache.getMaxCacheSize()}条`
    return output
  } catch (error: any) {
    logCacheError(config, error, 'cache stats error', logContext)
    return `❌ 获取统计信息失败: ${error.message}`
  }
}

async function handleCacheClear(cmdCtx: CacheCommandContext, config: Config): Promise<string> {
  const { cache, platform, guildId, logContext } = cmdCtx
  try {
    // 限定到当前群组
    const deletedCount = await cache.clearAll({ platform, guildId })
    return `✅ 已清空本群缓存，共删除 ${deletedCount} 条消息`
  } catch (error: any) {
    logCacheError(config, error, 'cache clear error', logContext)
    return `❌ 清空缓存失败: ${error.message}`
  }
}

async function handleCacheCleanup(cmdCtx: CacheCommandContext, args: string[], config: Config): Promise<string> {
  const { cache, platform, guildId, logContext } = cmdCtx
  const keepLatest = parseInt(args[0]) || cache.getMaxCacheSize()

  try {
    // 限定到当前群组
    const deletedCount = await cache.cleanup({ keepLatest, platform, guildId })
    if (deletedCount === 0) {
      return '✅ 当前群组缓存数量未超过限制，无需清理'
    }
    return `✅ 已清理本群缓存，保留最新 ${keepLatest} 条，删除 ${deletedCount} 条消息`
  } catch (error: any) {
    logCacheError(config, error, 'cache cleanup error', { ...logContext, keepLatest })
    return `❌ 清理缓存失败: ${error.message}`
  }
}

async function handleCachePull(
  ctx: Context,
  queueManager: NotificationQueueManager,
  session: any,
  cmdCtx: CacheCommandContext,
  args: string[],
  config: Config,
): Promise<string> {
  const { logContext } = cmdCtx
  const realId = parseInt(args[0])
  if (!realId || realId < 1) {
    return '请提供有效的真实 ID\n用法: rsso.cache pull <ID>\n示例: rsso.cache pull 42\n💡 提示：使用 "rsso.cache list" 查看方括号中的真实 ID'
  }

  let message: CachedMessage | null = null

  try {
    message = await resolveCacheMessageById(cmdCtx, realId)
    if (!message) {
      return `❌ 未找到 ID 为 ${args[0]} 的消息（或该消息不属于当前群组）\n💡 使用 "rsso.cache list" 查看可用的真实 ID`
    }
    if (!message.finalMessage) {
      return '❌ 该消息没有缓存的最终消息\n💡 这条消息可能是旧版本缓存，请重新订阅后重试'
    }

    const { id: guildId } = session.event.guild as any
    const { platform } = session.event as any

    // 走发送队列而不是直接 ctx.broadcast，与 feeder 推送路径保持一致：
    //  - 经队列可获得重试 / 降级（OneBot 1200 等错误）保护
    //  - 统一的日志/追踪上下文
    //  - finalMessage 在缓存前已按 msg.censor 完成审查包裹，此处保持原样不重复包裹
    // 为避免与原 feed 任务的 uid 去重冲突（队列按 subscribeId+uid+target 去重），
    // 重新推送使用带 cache-pull 前缀与时间戳的唯一 uid。
    const taskContent: QueueTaskContent = {
      message: message.finalMessage,
      originalItem: undefined,
      isDowngraded: false,
      title: message.title,
      description: message.content,
      link: message.link,
      pubDate: message.pubDate,
      imageUrl: message.imageUrl,
    }

    await queueManager.addTask({
      subscribeId: `cache-pull:${message.id}`,
      rssId: message.rssId,
      uid: `cache-pull:${message.id}:${Date.now()}`,
      guildId,
      platform,
      content: taskContent,
    })

    return `✅ 已将消息（ID:${message.id}）加入发送队列，即将重新推送`
  } catch (error: any) {
    const { id: guildId } = session.event.guild as any
    const { platform } = session.event as any
    logCacheError(config, error, 'cache pull error', {
      ...logContext,
      realId,
      guildId,
      platform,
      target: `${platform}:${guildId}`,
      cachedMessageId: message?.id,
      rssId: message?.rssId,
    })
    return `❌ 推送消息失败: ${error.message}`
  }
}

// ---------------------------------------------------------------------------
// queue handlers（业务逻辑不变）
// ---------------------------------------------------------------------------

async function handleQueueStats(queueManager: NotificationQueueManager, config: Config, logContext?: Record<string, any>): Promise<string> {
  try {
    const stats = await queueManager.getStats()
    const total = stats.pending + stats.retry + stats.failed + stats.success
    return `发送队列统计\n\n待发送: ${stats.pending}\n等待重试: ${stats.retry}\n❌ 发送失败: ${stats.failed}\n✅ 发送成功: ${stats.success}\n\n总计: ${total} 个任务`
  } catch (error: any) {
    logCacheError(config, error, 'queue stats error', logContext)
    return `❌ 获取统计信息失败: ${error.message}`
  }
}

async function handleQueueRetry(queueManager: NotificationQueueManager, args: string[], config: Config, logContext?: Record<string, any>): Promise<string> {
  try {
    const taskId = args[0]

    if (taskId === '--all') {
      const count = await queueManager.retryFailedTasks()
      return `✅ 已重置 ${count} 个失败任务为 PENDING 状态`
    }
    if (taskId) {
      const id = parseInt(taskId)
      if (isNaN(id)) {
        return `❌ 无效的任务ID: ${taskId}`
      }
      const count = await queueManager.retryFailedTasks(id)
      return count > 0 ? `✅ 已重置任务 ${id}` : `❌ 未找到任务 ${id}`
    }
    return '请指定任务ID或使用 --all 重试所有失败任务\n用法: rsso.queue retry <id|--all>'
  } catch (error: any) {
    logCacheError(config, error, 'queue retry error', { ...logContext, taskId: args[0] })
    return `❌ 重试失败: ${error.message}`
  }
}

async function handleQueueCleanup(queueManager: NotificationQueueManager, args: string[], config: Config, logContext?: Record<string, any>): Promise<string> {
  try {
    const hours = parseInt(args[0]) || 24
    const count = await queueManager.cleanupSuccessTasks(hours)
    if (count === 0) {
      return '✅ 没有需要清理的成功任务'
    }
    return `✅ 已清理 ${count} 个超过 ${hours} 小时的成功任务`
  } catch (error: any) {
    logCacheError(config, error, 'queue cleanup error', { ...logContext, hours: parseInt(args[0]) || 24 })
    return `❌ 清理失败: ${error.message}`
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 按真实数据库 ID 取缓存消息，并校验其归属当前群组（防跨群越权）。
 * 即使攻击者猜到其他群的 ID，也会因 platform/guildId 不匹配而被拦截。
 */
async function resolveCacheMessageById(
  cmdCtx: CacheCommandContext,
  realId: number,
): Promise<CachedMessage | null> {
  const { cache, platform, guildId } = cmdCtx
  const message = await cache.getMessage(realId)
  if (!message) return null
  // 归属校验：必须属于当前群组
  if (message.platform !== platform || message.guildId !== guildId) {
    return null
  }
  return message
}

function logCacheError(config: Config, error: any, scope: string, context?: Record<string, any>): void {
  const normalizedError = normalizeError(error)
  debug(config, normalizedError, scope, 'error', context)
  trackError(normalizedError, context)
}

export { registerSubscriptionManagementCommands } from './subscription-management'
export { registerSubscriptionEditCommand } from './subscription-edit'
export { registerSubscriptionCreateCommand } from './subscription-create'
export { registerWebMonitorCommands } from './web-monitor'
export { createCommandRuntimeDeps } from './runtime'

// 导出供单元测试使用（仅测试引用，命令注册逻辑不变）
export type { CacheCommandContext }
export {
  resolveCacheMessageById,
  handleCacheList,
  handleCacheMessage,
  handleCacheSearch,
  handleCacheStats,
  handleCacheClear,
  handleCacheCleanup,
  handleCachePull,
}
