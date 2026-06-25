import { Logger } from 'koishi'
import { Config, debugLevel } from '../types'

const logger = new Logger('rss-owl')

export type DebugLogType = "disable" | "error" | "info" | "details"

/**
 * 把 config.debug 映射到 Koishi/reggol 的原生日志级别数值。
 *
 * reggol 级别（见 reggol/index.d.ts）：
 *   SILENT=0, SUCCESS/ERROR=1, INFO/WARN=2, DEBUG=3
 *
 * 本插件的 debug 字段语义：
 *   disable → 0（SILENT，什么也不输出）
 *   error   → 1（仅 error）
 *   info    → 2（error + info/warn）
 *   details → 3（含 debug 全量）
 */
function debugLevelToReggol(debug?: Config['debug']): number {
  switch (debug) {
    case 'error': return Logger.ERROR
    case 'info': return Logger.INFO
    case 'details': return Logger.DEBUG
    default: return Logger.SILENT
  }
}

/**
 * 把 config.debug 同步到 Koishi 原生日志分级 `Logger.levels['rss-owl']`。
 *
 * 这样本插件的日志可见性既受自身 debug 字段控制，也能被 Koishi 全局 levels
 * （WebUI 的 logger 插件、配置文件中的 levels.base / levels['rss-owl']）覆盖/调节。
 * 应在 apply() 启动时调用一次；值未变化时不重复写入。
 */
let lastAppliedLevel: number | undefined

export function applyDebugLevel(config: Config): void {
  const target = debugLevelToReggol(config.debug)
  if (lastAppliedLevel === target) return
  lastAppliedLevel = target
  Logger.levels = Logger.levels || { base: 2 }
  ;(Logger.levels as any)['rss-owl'] = target
}

/**
 * 按 config.debug 判定某级是否应输出。
 * 在 debug() 中作为性能预检门控（避免对注定被丢弃的日志做脱敏/格式化），
 * 与 applyDebugLevel 同步到 Koishi levels 的语义保持一致；最终输出与否仍由 reggol levels 决定。
 */
export function shouldLog(config: Config, type: DebugLogType): boolean {
  const typeLevel = debugLevel.findIndex(i => i === type)
  if (typeLevel < 1) return false

  const configLevel = debugLevel.findIndex(i => i === config.debug)
  if (configLevel < 0) return false

  return typeLevel <= configLevel
}

/**
 * 子命名空间 logger 缓存，避免每条日志都 extend。
 * 用 logger.extend('feeder') 产出 rss-owl:feeder，命名空间天然带模块名，
 * 取代此前 formatTextLog 里手工拼 [name] 前缀的做法（与 Koishi Logger 命名空间重复）。
 */
const subLoggers = new Map<string, Logger>()
function getSubLogger(name: string): Logger {
  if (!name) return logger
  let sub = subLoggers.get(name)
  if (!sub) {
    sub = logger.extend(name)
    subLoggers.set(name, sub)
  }
  return sub
}

/**
 * 敏感信息模式定义
 */
const SENSITIVE_PATTERNS = [
  // API Key 模式
  { pattern: /api[_-]?key["']?\s*[:=]\s*["']?([^"'&\s,}]+)/gi, replacement: 'api_key=***' },
  // Bearer Token
  { pattern: /Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/gi, replacement: 'Bearer ***' },
  // Basic Auth
  { pattern: /Basic\s+([A-Za-z0-9+/=]+)/gi, replacement: 'Basic ***' },
  // 代理认证
  { pattern: /([a-zA-Z]+):\/\/([^:]+):([^@]+)@/gi, replacement: '$1://$2:***@' },
  // 密码字段
  { pattern: /["']?password["']?\s*[:=]\s*["']?([^"'&\s,}]+)/gi, replacement: 'password=***' },
  // 密钥字段
  { pattern: /["']?secret["']?\s*[:=]\s*["']?([^"'&\s,}]+)/gi, replacement: 'secret=***' },
  { pattern: /["']?token["']?\s*[:=]\s*["']?([^"'&\s,}]+)/gi, replacement: 'token=***' },
  // AWS Access Key
  { pattern: /(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g, replacement: '***' },
  // GitHub Token
  { pattern: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, replacement: '***' },
  // JWT Token (更精确的匹配)
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '***' },
]

/**
 * 脱敏日志消息，移除敏感信息
 *
 * @param message - 原始消息（字符串或对象）
 * @returns 脱敏后的消息
 */
function sanitizeLogMessage(message: any): any {
  if (typeof message === 'string') {
    let sanitized = message
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement)
    }
    return sanitized
  }

  if (message === null || message === undefined) {
    return message
  }

  if (message instanceof Error) {
    const sanitizedError = new Error(sanitizeLogMessage(message.message))
    sanitizedError.name = message.name
    return sanitizedError
  }

  // 如果是对象，深度脱敏
  if (typeof message === 'object') {
    try {
      // 先序列化再脱敏，然后反序列化
      const jsonStr = JSON.stringify(message)
      let sanitized = jsonStr

      for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, replacement)
      }

      return JSON.parse(sanitized)
    } catch {
      // 如果序列化失败，返回原始对象的脱敏版本
      return sanitizeObject(message)
    }
  }

  return message
}

/**
 * 递归脱敏对象中的敏感字段
 */
function sanitizeObject(obj: any, depth = 0): any {
  // 防止无限递归
  if (depth > 5 || obj === null || obj === undefined) {
    return obj
  }

  // 敏感字段列表
  const sensitiveFields = new Set([
    'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'apikey', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
    'auth', 'authorization', 'credential', 'privateKey', 'private_key',
    'sessionId', 'session_id', 'sessionid', 'cookie', 'x-api-key',
    'x-api-key', 'bearer', 'basic'
  ])

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1))
  }

  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      if (sensitiveFields.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('token')) {
        result[key] = '***'
      } else if (typeof value === 'object') {
        result[key] = sanitizeObject(value, depth + 1)
      } else if (typeof value === 'string') {
        // 检查字符串值是否包含可能的 token
        if (value.length > 30 && /[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/.test(value)) {
          result[key] = '***'
        } else {
          result[key] = value
        }
      } else {
        result[key] = value
      }
    }
    return result
  }

  return obj
}

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
 * 按 Koishi 原生日志级别输出。
 *
 * 关键纠错：'details' 之前被错压成 logger.info()，现归到 logger.debug()，
 * 让 reggol 的 levels（SILENT=0 / ERROR=1 / INFO=2 / DEBUG=3）能正确分级过滤。
 * 模块名 name 通过子命名空间 logger.extend(name) 体现（如 rss-owl:feeder），
 * 不再手工拼 [name] 前缀。
 */
function emitLog(type: DebugLogType, content: string, name = ''): void {
  const target = getSubLogger(name)
  if (type === 'error') return target.error(content)
  if (type === 'info') return target.info(content)
  return target.debug(content) // 'details'
}

function filterContextFields(
  context: Record<string, any>,
  contextFields?: string[]
): Record<string, any> {
  if (!contextFields?.length) {
    return context
  }

  const filteredContext: Record<string, any> = {}
  contextFields.forEach((field) => {
    if (context[field] !== undefined) {
      filteredContext[field] = context[field]
    }
  })
  return filteredContext
}

function formatContextValue(value: any): string {
  if (value instanceof Error) {
    return value.message || value.name
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function formatTextLog(
  message: string,
  name: string,
  context: Record<string, any> | undefined,
  loggingConfig: Config['logging']
): string {
  // 模块名不再手工拼前缀：已由子命名空间 logger（rss-owl:<name>）体现，
  // 避免与 Koishi Logger 命名空间重复输出。
  void name
  const textOutput = message.trim()
  if (!context || Object.keys(context).length === 0) {
    return textOutput
  }

  const filteredContext = filterContextFields(context, loggingConfig?.contextFields)
  if (Object.keys(filteredContext).length === 0) {
    return textOutput
  }

  const contextStr = Object.entries(filteredContext)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${formatContextValue(value)}`)
    .join(', ')

  return `${textOutput}\n↳ ${contextStr}`
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
  type: DebugLogType = 'details',
  context?: Record<string, any>
) {
  // 性能预检：按 config.debug 快速跳过注定被 Koishi levels 丢弃的日志，
  // 避免无谓的脱敏/格式化开销。最终是否真正输出由 reggol levels 决定
  // （applyDebugLevel 已把 config.debug 同步到 Logger.levels['rss-owl']）。
  if (!shouldLog(config, type)) return

  // 检查是否启用日志脱敏（默认启用）
  const sanitizeEnabled = config.logging?.sanitizeLogs !== false
  if (sanitizeEnabled) {
    message = sanitizeLogMessage(message)
    if (context) {
      context = sanitizeObject(context)
    }
  }

  // 获取日志配置
  const loggingConfig = config.logging || {}

  // 格式化消息内容
  let formattedMessage: string
  if (typeof message === 'string') {
    formattedMessage = message
  } else if (message instanceof Error) {
    formattedMessage = message.message || String(message)
  } else if (typeof message === 'function') {
    formattedMessage = String(message)
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
      const filteredContext = filterContextFields(context, loggingConfig.contextFields)
      if (Object.keys(filteredContext).length > 0) {
        logEntry.context = filteredContext
      }
    }

    // 输出结构化日志
    emitLog(type, JSON.stringify(logEntry), name)
  } else {
    emitLog(type, formatTextLog(formattedMessage, name, context, loggingConfig), name)
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
    type: DebugLogType = 'details',
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
