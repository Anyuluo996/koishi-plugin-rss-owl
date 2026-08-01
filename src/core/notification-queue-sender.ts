import { Context } from 'koishi'

import { Config } from '../types'
import { normalizeError } from '../utils/error-handler'
import { createDebugWithContext } from '../utils/logger'
import { isQueueDowngradeError } from './notification-queue-retry'
import { QueueTask, QueueTaskContent } from './notification-queue-types'

type QueueDebugFn = ReturnType<typeof createDebugWithContext>

interface NotificationQueueSenderDeps {
  ctx: Context
  config: Config
  createTaskDebug: (task: Partial<QueueTask>) => QueueDebugFn
  buildTaskLogContext: (task: Partial<QueueTask>) => Record<string, any>
}

/**
 * 将单个合并转发消息按子消息数量拆分为多个独立的合并转发消息。
 *
 * 背景_OneBot 端(NapCat/Lagrange 等)收到 forward 后需逐个下载所有远程媒体再打包上传，
 * 单个 forward 内媒体节点过多会触发 `send_group_forward_msg` 超时。
 * 拆成多个小 forward 分多次发送，每批下载量可控。
 *
 * 结构约定(feeder-runtime.ts buildFinalMessage 产出)：
 *   <message forward><author id="X"/>{子<message>...}</message>{可选的外部<message>at提及</message>}
 *
 * - 非 forward 消息 或 batchSize 未配置/无效 → 原样返回单元素数组
 * - 子节点数 ≤ batchSize → 不拆分
 * - 子节点数 > batchSize → 按 batchSize 切片，每批保留 <author>，外部 at 提及附加到最后一批
 *
 * 外层 forward 闭合标签不能用非贪婪正则定位（会被首个子节点 </message> 截断），
 * 故用深度栈扫描 `<message` / `</message>` 找到深度归零处，即外层闭合位置。
 *
 * @param message - 完整消息字符串
 * @param batchSize - 单个 forward 最多子消息数；未配置/<=0 则不拆分
 * @returns 拆分后的消息字符串数组
 */
export function splitForwardMessage(message: string, batchSize?: number): string[] {
  if (!batchSize || batchSize <= 0) return [message]

  const prefix = '<message forward>'
  if (!message.startsWith(prefix)) return [message]

  // 栈扫描定位外层 forward 的闭合位置（深度归零）
  const closeEnd = findForwardCloseEnd(message, prefix.length)
  if (closeEnd === -1) return [message] // 格式异常，原样返回交由上层处理

  const closeTag = '</message>'
  const inner = message.slice(prefix.length, closeEnd - closeTag.length)
  const trailing = message.slice(closeEnd) // forward 外部内容（如 followers 的 <message>at提及</message>）

  // 提取 <author .../> 段（紧跟 forward 开头，在首个子 <message> 之前）
  const authorMatch = inner.match(/^<author[^>]*\/>/)
  const author = authorMatch ? authorMatch[0] : ''
  const innerAfterAuthor = authorMatch ? inner.slice(authorMatch[0].length) : inner

  // 提取所有内部 <message>...</message> 子节点
  // （子节点内部不会再嵌套 <message>，非贪婪匹配安全）
  const childNodes = innerAfterAuthor.match(/<message\b[\s\S]*?<\/message>/g) || []

  // 子节点数不超过阈值 → 不拆分
  if (childNodes.length <= batchSize) return [message]

  const batches: string[] = []
  for (let i = 0; i < childNodes.length; i += batchSize) {
    const slice = childNodes.slice(i, i + batchSize).join('')
    batches.push(`${prefix}${author}${slice}${closeTag}`)
  }

  // 外部 at 提及等附加到最后一批之后（独立于 forward）
  if (trailing) {
    batches[batches.length - 1] += trailing
  }

  return batches
}

/**
 * 从 startPos 起用深度栈扫描，返回外层 forward 的闭合标签结束位置。
 * 遇到 `<message` 深度 +1，遇到 `</message>` 深度 -1，深度归零即外层闭合。
 * @returns 闭合位置（含 `</message>`）；格式异常返回 -1
 */
function findForwardCloseEnd(message: string, startPos: number): number {
  const openTag = '<message'
  const closeTag = '</message>'
  let depth = 1
  let pos = startPos
  while (pos < message.length) {
    const nextOpen = message.indexOf(openTag, pos)
    const nextClose = message.indexOf(closeTag, pos)
    if (nextClose === -1) return -1
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      pos = nextOpen + openTag.length
    } else {
      depth--
      pos = nextClose + closeTag.length
      if (depth === 0) return pos
    }
  }
  return -1
}

export function downgradeQueueMessage(content: QueueTaskContent): QueueTaskContent {
  if (content.isDowngraded) {
    return {
      ...content,
      isDowngraded: true,
    }
  }

  const downgradedMessage = content.message.replace(/<video[^>]*>.*?<\/video>/gis, (match: string) => {
    const srcMatch = match.match(/src=["']([^"']+)["']/)
    if (srcMatch) {
      return `\n🎬 视频: ${srcMatch[1]}\n`
    }
    return '\n[视频不支持]\n'
  })

  return {
    ...content,
    message: downgradedMessage,
    isDowngraded: true,
  }
}

export class NotificationQueueSender {
  constructor(private deps: NotificationQueueSenderDeps) { }

  async sendMessage(task: QueueTask): Promise<void> {
    const { guildId, platform, content } = task
    const target = `${platform}:${guildId}`
    const taskDebug = this.deps.createTaskDebug(task)

    // 合并转发按子消息数量分批：单个 forward 内媒体节点过多会导致 OneBot 端下载超时
    const batches = splitForwardMessage(content.message, this.deps.config.basic?.forwardBatchSize)

    try {
      for (const batch of batches) {
        await this.deps.ctx.broadcast([target], batch)
      }
      taskDebug(`消息发送成功: ${target}${batches.length > 1 ? ` (分${batches.length}批发送)` : ''}`, 'queue', 'details')
    } catch (sendError: any) {
      if (isQueueDowngradeError(sendError) && !content.isDowngraded) {
        taskDebug('检测到 OneBot 1200 错误，尝试降级处理', 'queue', 'info', { errorCode: '1200' })
      }

      throw sendError
    }
  }

  async downgradeMessage(content: QueueTaskContent): Promise<QueueTaskContent> {
    return downgradeQueueMessage(content)
  }

  async cacheMessage(task: QueueTask): Promise<void> {
    if (!this.deps.config.cache?.enabled) {
      return
    }

    const taskDebug = this.deps.createTaskDebug(task)
    const { getMessageCache } = await import('../utils/message-cache')
    const cache = getMessageCache()

    if (!cache) {
      return
    }

    try {
      await cache.addMessage({
        rssId: task.rssId,
        guildId: task.guildId,
        platform: task.platform,
        title: task.content.title || '',
        content: task.content.description || '',
        link: task.content.link || '',
        pubDate: task.content.pubDate || new Date(),
        imageUrl: task.content.imageUrl || '',
        videoUrl: '',
        finalMessage: task.content.message,
      })
    } catch (err: any) {
      const normalizedError = normalizeError(err)
      taskDebug(`缓存消息失败: ${normalizedError.message}`, 'cache', 'info')
    }
  }
}