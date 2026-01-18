import { Logger } from 'koishi'
import { Config, debugLevel } from '../types'

const logger = new Logger('rss-owl')

/**
 * 结构化日志接口
 */
interface StructuredLogEntry {
  timestamp?: string
  level?: string
  module?: string
  message: string
  context?: Record<string, any>
}

/**
 * 增强的调试日志函数
 *
 * @param config - 配置对象
 * @param message - 日志消息（字符串或对象）
 * @param name - 模块名称
 * @param type - 日志级别
 * @param context - 额外的上下文信息
 */
export function debug(
  config: Config,
  message: any,
  name = '',
  type: "disable" | "error" | "info" | "details" = 'details',
  context?: Record<string, any>
) {
  const typeLevel = debugLevel.findIndex(i => i == type)
  if (typeLevel < 1) return
  if (typeLevel > debugLevel.findIndex(i => i == config.debug)) return

  // 获取日志配置
  const loggingConfig = config.logging || {}

  // 格式化消息内容
  let formattedMessage: string
  if (typeof message === 'string') {
    formattedMessage = message
  } else if (message === null || message === undefined) {
    formattedMessage = String(message)
  } else {
    try {
      // 对于复杂对象，使用 JSON.stringify 并处理循环引用
      formattedMessage = JSON.stringify(message, (_, value) => {
        if (typeof value === 'function') return '[Function]'
        if (value instanceof Error) return value.message
        return value
      }, 2)
    } catch {
      formattedMessage = String(message)
    }
  }

  // 如果启用结构化日志，输出 JSON 格式
  if (loggingConfig.structured) {
    const logEntry: StructuredLogEntry = {
      message: formattedMessage
    }

    // 添加时间戳
    if (loggingConfig.includeTimestamp !== false) {
      logEntry.timestamp = new Date().toISOString()
    }

    // 添加日志级别
    if (loggingConfig.includeLevel !== false) {
      logEntry.level = type
    }

    // 添加模块名
    if (loggingConfig.includeModule !== false && name) {
      logEntry.module = name
    }

    // 添加上下文信息
    if (loggingConfig.includeContext && context) {
      // 如果指定了 contextFields，只包含这些字段
      if (loggingConfig.contextFields && loggingConfig.contextFields.length > 0) {
        const filteredContext: Record<string, any> = {}
        loggingConfig.contextFields.forEach(field => {
          if (context[field] !== undefined) {
            filteredContext[field] = context[field]
          }
        })
        if (Object.keys(filteredContext).length > 0) {
          logEntry.context = filteredContext
        }
      } else if (Object.keys(context).length > 0) {
        // 否则包含所有上下文
        logEntry.context = context
      }
    }

    // 输出结构化日志
    logger.info(JSON.stringify(logEntry))
  } else {
    // 传统文本格式
    let textOutput = formattedMessage

    // 添加模块前缀（如果有）
    if (name) {
      textOutput = `[${name}] ${textOutput}`
    }

    // 如果有上下文且不使用结构化日志，在末尾添加简化的上下文信息
    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' ')
      textOutput += ` | ${contextStr}`
    }

    logger.info(textOutput)
  }
}

/**
 * 便捷函数：记录错误日志
 */
export function debugError(
  config: Config,
  message: any,
  name = '',
  context?: Record<string, any>
) {
  return debug(config, message, name, 'error', context)
}

/**
 * 便捷函数：记录信息日志
 */
export function debugInfo(
  config: Config,
  message: any,
  name = '',
  context?: Record<string, any>
) {
  return debug(config, message, name, 'info', context)
}

/**
 * 创建带有固定上下文的调试函数
 *
 * @param config - 配置对象
 * @param fixedContext - 固定的上下文信息
 * @returns 带有固定上下文的 debug 函数
 *
 * @example
 * const feedDebug = createDebugWithContext(config, { guildId: '123', platform: 'onebot' })
 * feedDebug('Processing feed', 'feeder', 'info')
 * // 输出会自动包含 guildId 和 platform
 */
export function createDebugWithContext(
  config: Config,
  fixedContext: Record<string, any>
) {
  return (
    message: any,
    name = '',
    type: "disable" | "error" | "info" | "details" = 'details',
    additionalContext?: Record<string, any>
  ) => {
    const mergedContext = {
      ...fixedContext,
      ...additionalContext
    }
    return debug(config, message, name, type, mergedContext)
  }
}

export { logger }
