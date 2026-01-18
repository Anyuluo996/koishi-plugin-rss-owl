/**
 * 命令辅助函数
 * 提供命令共享的工具函数
 */

import { Context, Session } from 'koishi'
import { Config } from '../types'
import { getFriendlyErrorMessage } from '../utils/error-handler'
import { debug } from '../utils/logger'

/**
 * 命令执行上下文
 */
export interface CommandContext {
  ctx: Context
  session: Session
  config: Config
}

/**
 * 会话信息提取
 */
export interface SessionInfo {
  guildId: string
  platform: string
  authorId: string
  authority: number
}

/**
 * 从会话中提取信息
 */
export function extractSessionInfo(session: Session): SessionInfo {
  const { id: guildId } = session.event.guild as any
  const { platform } = session.event as any
  const { id: authorId } = session.event.user as any
  const { authority } = session.user as any

  return { guildId, platform, authorId, authority }
}

/**
 * 命令错误处理包装器
 * 统一处理命令执行中的错误
 */
export function withCommandErrorHandling(
  config: Config,
  operation: string,
  handler: () => Promise<string>
): Promise<string> {
  return handler().catch((error) => {
    debug(config, error, `${operation} error`, 'error')
    return Promise.resolve(`${operation}失败: ${getFriendlyErrorMessage(error, operation)}`)
  })
}

/**
 * 权限检查辅助函数
 */
export function checkAuthority(
  authority: number,
  required: number,
  customMessage?: string
): { success: boolean; message?: string } {
  if (authority >= required) {
    return { success: true }
  }
  return {
    success: false,
    message: customMessage || '权限不足'
  }
}

/**
 * 解析目标群组
 */
export function parseTarget(target: string): { platform: string; guildId: string } | null {
  const parts = target.split(/[:：]/)
  if (parts.length !== 2) {
    return null
  }
  return {
    platform: parts[0],
    guildId: parts[1]
  }
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
