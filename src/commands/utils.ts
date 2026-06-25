/**
 * 命令辅助函数
 * 提供命令共享的工具函数
 */

import { Context, Session } from 'koishi'
import { Config } from '../types'
import { getFriendlyErrorMessage, normalizeError } from '../utils/error-handler'
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

export interface ParseTargetsResult {
  targets: string[]
  invalidTarget?: string
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
 * 构建命令日志上下文
 */
export function buildCommandLogContext(session: Session, command?: string, operation?: string): Record<string, any> {
  const sessionInfo = extractSessionInfo(session)
  const context: Record<string, any> = {
    ...sessionInfo,
    userId: sessionInfo.authorId,
  }

  if (command) context.command = command
  if (operation) context.operation = operation

  return context
}

/**
 * 命令错误处理包装器
 * 统一处理命令执行中的错误
 */
export function withCommandErrorHandling(
  config: Config,
  operation: string,
  handler: () => Promise<string>,
  context?: Record<string, any>
): Promise<string> {
  return handler().catch((error) => {
    const normalizedError = normalizeError(error)
    debug(config, normalizedError, `${operation} error`, 'error', context)
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
 * 解析多个推送目标
 */
export function parseTargets(targetInput?: string): ParseTargetsResult {
  if (!targetInput) {
    return { targets: [] }
  }

  const targets = targetInput
    .split(/[;,，；]/)
    .map(target => target.trim())
    .filter(Boolean)

  for (const target of targets) {
    if (!parseTarget(target)) {
      return {
        targets: [],
        invalidTarget: target,
      }
    }
  }

  return { targets }
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
