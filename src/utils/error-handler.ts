/**
 * 友好错误提示系统
 *
 * 将技术性错误转换为用户友好的提示信息
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  DNS_NOT_FOUND = 'DNS_NOT_FOUND',

  // 解析错误
  PARSE_ERROR = 'PARSE_ERROR',
  INVALID_RSS = 'INVALID_RSS',
  INVALID_HTML = 'INVALID_HTML',
  INVALID_JSON = 'INVALID_JSON',

  // 配置错误
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_URL = 'INVALID_URL',

  // 权限错误
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  AUTH_FAILED = 'AUTH_FAILED',

  // 资源错误
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_TIMEOUT = 'RESOURCE_TIMEOUT',

  // AI 错误
  AI_ERROR = 'AI_ERROR',
  AI_TIMEOUT = 'AI_TIMEOUT',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',

  // 代理错误
  PROXY_ERROR = 'PROXY_ERROR',
  PROXY_AUTH_FAILED = 'PROXY_AUTH_FAILED',

  // 其他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
  [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorType.CONNECTION_REFUSED]: '服务器拒绝连接，可能是服务器不可用',
  [ErrorType.DNS_NOT_FOUND]: '无法解析域名，请检查URL是否正确',

  [ErrorType.PARSE_ERROR]: '内容解析失败，格式可能不正确',
  [ErrorType.INVALID_RSS]: '无效的RSS格式，请确认链接是否为RSS源',
  [ErrorType.INVALID_HTML]: 'HTML解析失败，请检查CSS选择器是否正确',
  [ErrorType.INVALID_JSON]: 'JSON格式错误',

  [ErrorType.INVALID_CONFIG]: '配置参数无效',
  [ErrorType.MISSING_CONFIG]: '缺少必需的配置项',
  [ErrorType.INVALID_URL]: 'URL格式不正确，请以 http:// 或 https:// 开头',

  [ErrorType.PERMISSION_DENIED]: '权限不足，该操作需要更高权限',
  [ErrorType.AUTH_FAILED]: '身份验证失败',

  [ErrorType.RESOURCE_NOT_FOUND]: '资源未找到',
  [ErrorType.RESOURCE_TIMEOUT]: '资源加载超时',

  [ErrorType.AI_ERROR]: 'AI服务异常',
  [ErrorType.AI_TIMEOUT]: 'AI请求超时',
  [ErrorType.AI_QUOTA_EXCEEDED]: 'AI配额已用完',

  [ErrorType.PROXY_ERROR]: '代理连接失败',
  [ErrorType.PROXY_AUTH_FAILED]: '代理认证失败',

  [ErrorType.UNKNOWN_ERROR]: '未知错误',
}

/**
 * Node.js 错误码到错误类型的映射
 */
const NODE_ERROR_CODE_MAP: Record<string, ErrorType> = {
  // 网络相关
  'ENOTFOUND': ErrorType.DNS_NOT_FOUND,
  'ETIMEDOUT': ErrorType.TIMEOUT,
  'ECONNREFUSED': ErrorType.CONNECTION_REFUSED,
  'ECONNRESET': ErrorType.NETWORK_ERROR,
  'ECONNABORTED': ErrorType.NETWORK_ERROR,
  'ENETUNREACH': ErrorType.NETWORK_ERROR,
  'EHOSTUNREACH': ErrorType.NETWORK_ERROR,

  // 权限相关
  'EACCES': ErrorType.PERMISSION_DENIED,
  'EPERM': ErrorType.PERMISSION_DENIED,

  // 资源相关
  'ENOENT': ErrorType.RESOURCE_NOT_FOUND,
}

/**
 * HTTP 状态码到错误类型的映射
 */
const HTTP_STATUS_CODE_MAP: Record<number, ErrorType> = {
  400: ErrorType.INVALID_CONFIG,
  401: ErrorType.AUTH_FAILED,
  403: ErrorType.PERMISSION_DENIED,
  404: ErrorType.RESOURCE_NOT_FOUND,
  408: ErrorType.TIMEOUT,
  429: ErrorType.RESOURCE_TIMEOUT,
  500: ErrorType.NETWORK_ERROR,
  502: ErrorType.NETWORK_ERROR,
  503: ErrorType.NETWORK_ERROR,
  504: ErrorType.TIMEOUT,
}

/**
 * 根据错误对象获取错误类型
 *
 * @param error - 错误对象
 * @returns 错误类型
 */
export function getErrorType(error: any): ErrorType {
  // 1. 检查是否有自定义错误类型
  if (error.errorType) {
    return error.errorType
  }

  // 2. 检查 HTTP 状态码
  if (error.response?.status) {
    const statusCode = error.response.status
    return HTTP_STATUS_CODE_MAP[statusCode] || ErrorType.NETWORK_ERROR
  }

  // 3. 检查 Node.js 错误码
  if (error.code) {
    return NODE_ERROR_CODE_MAP[error.code] || ErrorType.UNKNOWN_ERROR
  }

  // 4. 根据错误消息判断
  const message = error.message || error.toString()

  if (message.includes('timeout') || message.includes('超时')) {
    return ErrorType.TIMEOUT
  }
  if (message.includes('parse') || message.includes('解析')) {
    return ErrorType.PARSE_ERROR
  }
  if (message.includes('RSS') || message.includes('xml')) {
    return ErrorType.INVALID_RSS
  }
  if (message.includes('HTML') || message.includes('selector')) {
    return ErrorType.INVALID_HTML
  }
  if (message.includes('permission') || message.includes('权限')) {
    return ErrorType.PERMISSION_DENIED
  }
  if (message.includes('proxy') || message.includes('代理')) {
    return ErrorType.PROXY_ERROR
  }
  if (message.includes('AI') || message.includes('OpenAI')) {
    return ErrorType.AI_ERROR
  }

  return ErrorType.UNKNOWN_ERROR
}

/**
 * 获取友好的错误提示信息
 *
 * @param error - 错误对象
 * @param context - 错误上下文信息（可选）
 * @returns 用户友好的错误提示
 */
export function getFriendlyErrorMessage(error: any, context?: string): string {
  const errorType = getErrorType(error)
  let message = ERROR_MESSAGES[errorType]

  // 添加上下文信息
  if (context) {
    message = `${context}: ${message}`
  }

  // 添加调试信息（仅在开发模式）
  if (process.env.NODE_ENV === 'development' && error.message) {
    const originalMessage = error.message.trim()
    if (originalMessage && !message.includes(originalMessage)) {
      message += ` (${originalMessage})`
    }
  }

  return message
}

/**
 * 创建带有错误类型的错误对象
 *
 * @param message - 错误消息
 * @param errorType - 错误类型
 * @returns 错误对象
 */
export function createError(message: string, errorType: ErrorType): Error {
  const error = new Error(message) as any
  error.errorType = errorType
  return error
}

/**
 * 判断是否为网络错误
 *
 * @param error - 错误对象
 * @returns 是否为网络错误
 */
export function isNetworkError(error: any): boolean {
  const errorType = getErrorType(error)
  return [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT,
    ErrorType.CONNECTION_REFUSED,
    ErrorType.DNS_NOT_FOUND,
  ].includes(errorType)
}

/**
 * 判断是否为解析错误
 *
 * @param error - 错误对象
 * @returns 是否为解析错误
 */
export function isParseError(error: any): boolean {
  const errorType = getErrorType(error)
  return [
    ErrorType.PARSE_ERROR,
    ErrorType.INVALID_RSS,
    ErrorType.INVALID_HTML,
    ErrorType.INVALID_JSON,
  ].includes(errorType)
}

/**
 * 判断是否为权限错误
 *
 * @param error - 错误对象
 * @returns 是否为权限错误
 */
export function isPermissionError(error: any): boolean {
  const errorType = getErrorType(error)
  return [
    ErrorType.PERMISSION_DENIED,
    ErrorType.AUTH_FAILED,
  ].includes(errorType)
}

/**
 * 判断是否可重试
 *
 * @param error - 错误对象
 * @returns 是否可重试
 */
export function isRetryable(error: any): boolean {
  const errorType = getErrorType(error)

  // 网络错误和超时通常可以重试
  if (isNetworkError(error)) {
    return true
  }

  // 资源超时可以重试
  if (errorType === ErrorType.RESOURCE_TIMEOUT) {
    return true
  }

  // 其他错误不建议重试
  return false
}
