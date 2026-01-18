/**
 * 命令错误处理中间件
 * 提供统一的错误处理和用户友好的错误消息
 */

import { Context, Session, Logger } from 'koishi'
import { Config } from '../types'
import { getFriendlyErrorMessage } from '../utils/error-handler'

const logger = new Logger('rss-owl-command')

/**
 * 命令执行结果
 */
export interface CommandResult {
  success: boolean
  message: string
  error?: any
}

/**
 * 命令错误类型
 */
export enum CommandErrorType {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * 命令错误类
 */
export class CommandError extends Error {
  constructor(
    public type: CommandErrorType,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

/**
 * 包装命令执行，提供统一的错误处理
 */
export async function executeCommand(
  ctx: Context,
  config: Config,
  operationName: string,
  handler: () => Promise<string>
): Promise<string> {
  try {
    return await handler()
  } catch (error) {
    // 如果是 CommandError，使用自定义消息
    if (error instanceof CommandError) {
      logError(config, operationName, error)
      return formatCommandError(error)
    }

    // 其他错误使用友好错误消息
    logError(config, operationName, error)
    const friendlyMessage = getFriendlyErrorMessage(error, operationName)
    return `${operationName}失败: ${friendlyMessage}`
  }
}

/**
 * 记录命令错误
 */
function logError(config: Config, operation: string, error: any) {
  if (config.debug === 'details' || config.debug === 'error') {
    logger.error(`[${operation}]`, error)
  }
}

/**
 * 格式化命令错误消息
 */
function formatCommandError(error: CommandError): string {
  switch (error.type) {
    case CommandErrorType.PERMISSION_DENIED:
      return error.message
    case CommandErrorType.INVALID_ARGUMENT:
      return `参数错误: ${error.message}`
    case CommandErrorType.NOT_FOUND:
      return `未找到: ${error.message}`
    case CommandErrorType.ALREADY_EXISTS:
      return `已存在: ${error.message}`
    case CommandErrorType.NETWORK_ERROR:
      return `网络错误: ${error.message}`
    default:
      return error.message || '操作失败，请稍后重试'
  }
}

/**
 * 创建权限检查错误
 */
export function permissionDenied(customMessage?: string): CommandError {
  return new CommandError(
    CommandErrorType.PERMISSION_DENIED,
    customMessage || '权限不足'
  )
}

/**
 * 创建参数错误
 */
export function invalidArgument(message: string): CommandError {
  return new CommandError(
    CommandErrorType.INVALID_ARGUMENT,
    message
  )
}

/**
 * 创建未找到错误
 */
export function notFound(resource: string): CommandError {
  return new CommandError(
    CommandErrorType.NOT_FOUND,
    resource
  )
}

/**
 * 创建已存在错误
 */
export function alreadyExists(resource: string): CommandError {
  return new CommandError(
    CommandErrorType.ALREADY_EXISTS,
    resource
  )
}
