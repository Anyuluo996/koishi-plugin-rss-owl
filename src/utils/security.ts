import { Config } from '../types'

/**
 * 安全验证错误类
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityError'
  }
}

// 内网 IP 范围定义
const INTERNAL_IP_RANGES = [
  // IPv4 回环地址
  { start: '127.0.0.0', end: '127.255.255.255' },
  // IPv4 私有地址 - 10.0.0.0/8
  { start: '10.0.0.0', end: '10.255.255.255' },
  // IPv4 私有地址 - 172.16.0.0/12
  { start: '172.16.0.0', end: '172.31.255.255' },
  // IPv4 私有地址 - 192.168.0.0/16
  { start: '192.168.0.0', end: '192.168.255.255' },
  // IPv4 链路本地地址 - 169.254.0.0/16 (包含 169.254.169.254 云元数据)
  { start: '169.254.0.0', end: '169.254.255.255' },
  // IPv4 广播地址
  { start: '255.255.255.255', end: '255.255.255.255' },
  // IPv4 0.0.0.0
  { start: '0.0.0.0', end: '0.0.0.0' },
  // IPv6 回环地址
  { start: '::1', end: '::1' },
  // IPv6 链路本地地址 (fe80::/10)
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },
  // IPv6 唯一本地地址 (fc00::/7)
  { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },
]

// 禁止的 Hostname 关键词
const FORBIDDEN_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',    // GCP 元数据服务
  'metadata.google',              // GCP 元数据
  'kubernetes.default.svc',       // Kubernetes
  'kubernetes.default',           // Kubernetes
  'etcd-client.kube-system',     // Kubernetes etcd
  'etcd.kube-system',             // Kubernetes etcd
]

/**
 * 将 IP 字符串转换为数字数组（支持 IPv4 和 IPv6）
 */
function ipToNumberArray(ip: string): number[] {
  if (ip.includes(':')) {
    // IPv6
    const parts = ip.split(':')
    return parts.map(part => {
      if (part === '') return 0
      return parseInt(part, 16)
    })
  } else {
    // IPv4
    return ip.split('.').map(part => parseInt(part, 10))
  }
}

/**
 * 比较两个 IP 地址（支持 IPv4 和 IPv6）
 * 返回负数表示 a < b，正数表示 a > b，0 表示相等
 */
function compareIps(a: string, b: string): number {
  const aArr = ipToNumberArray(a)
  const bArr = ipToNumberArray(b)

  const maxLen = Math.max(aArr.length, bArr.length)

  for (let i = 0; i < maxLen; i++) {
    const aVal = aArr[i] || 0
    const bVal = bArr[i] || 0
    if (aVal !== bVal) {
      return aVal - bVal
    }
  }
  return 0
}

/**
 * 检查 IP 是否在指定范围内
 */
function isIpInRange(ip: string, start: string, end: string): boolean {
  return compareIps(ip, start) >= 0 && compareIps(ip, end) <= 0
}

/**
 * 检测是否为内网 IP
 *
 * @param urlString - 要检查的 URL
 * @returns true 表示是内网 IP
 */
/**
 * 验证 IPv4 地址是否合法（每个八位组在 0-255 之间）
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every(part => {
    const num = parseInt(part, 10)
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part
  })
}

/**
 * 验证 IPv6 地址是否合法
 */
function isValidIPv6(ip: string): boolean {
  // 简单验证：检查是否为有效的 IPv6 格式
  if (ip === '::1' || ip === '::') return true
  const parts = ip.split(':')
  // IPv6 应该最多有 8 个部分
  if (parts.length > 8) return false
  return parts.every(part => {
    if (part === '') return true
    // 每个部分应该是 0-4 位十六进制
    return /^[0-9a-fA-F]{1,4}$/.test(part)
  })
}

export function isInternalUrl(urlString: string): boolean {
  if (!urlString) return false

  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()

    // 检查禁止的 hostname 关键词
    for (const forbidden of FORBIDDEN_HOSTNAMES) {
      if (hostname === forbidden || hostname.endsWith('.' + forbidden)) {
        return true
      }
    }

    // 检查是否为纯 IP 地址
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$|^::1$|^::$/

    if (ipPattern.test(hostname)) {
      // 验证 IPv4 是否合法
      if (!isValidIPv4(hostname)) {
        // 无效的 IP 地址，拒绝访问
        return true
      }
      // IPv4
      for (const range of INTERNAL_IP_RANGES) {
        if (range.start.includes('.')) {  // IPv4 range
          if (isIpInRange(hostname, range.start, range.end)) {
            return true
          }
        }
      }
    } else if (ipv6Pattern.test(hostname) || hostname.includes(':')) {
      // 验证 IPv6 是否合法
      if (!isValidIPv6(hostname)) {
        // 无效的 IP 地址，拒绝访问
        return true
      }
      // IPv6
      for (const range of INTERNAL_IP_RANGES) {
        if (range.start.includes(':')) {  // IPv6 range
          if (isIpInRange(hostname, range.start, range.end)) {
            return true
          }
        }
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * URL 白名单/黑名单验证
 *
 * @param urlString - 要检查的 URL
 * @param whitelist - 白名单域名列表
 * @param blacklist - 黑名单域名列表
 * @returns true 表示允许访问
 */
export function isAllowedUrl(
  urlString: string,
  whitelist?: string[],
  blacklist?: string[]
): boolean {
  if (!urlString) return false

  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()

    // 先检查黑名单
    if (blacklist && blacklist.length > 0) {
      for (const blocked of blacklist) {
        const blockedLower = blocked.toLowerCase()
        if (hostname === blockedLower || hostname.endsWith('.' + blockedLower)) {
          return false
        }
      }
    }

    // 如果有白名单，检查是否在白名单中
    if (whitelist && whitelist.length > 0) {
      for (const allowed of whitelist) {
        const allowedLower = allowed.toLowerCase()
        if (hostname === allowedLower || hostname.endsWith('.' + allowedLower)) {
          return true
        }
      }
      // 不在白名单中，拒绝访问
      return false
    }

    // 没有白名单，默认允许（但还需要通过内网检查）
    return true
  } catch {
    return false
  }
}

/**
 * 综合 URL 验证
 * 检查协议、内网 IP、白名单/黑名单
 *
 * @param urlString - 要检查的 URL
 * @param options - 验证选项
 * @returns 验证结果对象
 */
export function validateUrl(
  urlString: string,
  options: {
    whitelist?: string[]
    blacklist?: string[]
    allowHttp?: boolean
    allowHttps?: boolean
    allowOtherProtocols?: boolean
    allowInternalAccess?: boolean
    enabled?: boolean  // 安全检查总开关，默认不启用
  } = {}
): { valid: boolean; error?: string } {
  // 安全检查默认不启用
  if (options.enabled !== true) {
    return { valid: true }
  }

  if (!urlString) {
    return { valid: false, error: 'URL 不能为空' }
  }

  try {
    const url = new URL(urlString)

    // 协议检查
    const protocol = url.protocol.toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:') {
      if (!options.allowOtherProtocols) {
        return { valid: false, error: `不支持的协议: ${protocol}` }
      }
    }

    // HTTP/HTTPS 显式禁用检查
    if (protocol === 'http:' && options.allowHttp === false) {
      return { valid: false, error: 'HTTP 协议已被禁用' }
    }
    if (protocol === 'https:' && options.allowHttps === false) {
      return { valid: false, error: 'HTTPS 协议已被禁用' }
    }

    // 内网 IP 检查（除非明确允许）
    if (options.allowInternalAccess !== true && isInternalUrl(urlString)) {
      return { valid: false, error: '不允许访问内网 IP 地址' }
    }

    // 白名单/黑名单检查
    if (!isAllowedUrl(urlString, options.whitelist, options.blacklist)) {
      return { valid: false, error: 'URL 不在允许列表中或被列入黑名单' }
    }

    return { valid: true }
  } catch (error: any) {
    return { valid: false, error: `URL 解析失败: ${error.message}` }
  }
}

/**
 * 验证并抛出异常的便捷函数
 *
 * @param urlString - 要检查的 URL
 * @param options - 验证选项
 * @throws SecurityError 当验证失败时
 */
export function validateUrlOrThrow(
  urlString: string,
  options: {
    whitelist?: string[]
    blacklist?: string[]
    allowHttp?: boolean
    allowHttps?: boolean
    allowOtherProtocols?: boolean
    allowInternalAccess?: boolean
    enabled?: boolean
  } = {}
): void {
  const result = validateUrl(urlString, options)
  if (!result.valid) {
    throw new SecurityError(result.error!)
  }
}

/**
 * 从配置中获取安全验证选项
 *
 * @param config - 插件配置对象
 * @returns 安全验证选项
 */
export function getSecurityOptions(config: Config) {
  return {
    whitelist: config.security?.whitelist,
    blacklist: config.security?.blacklist,
    allowHttp: config.security?.allowHttp !== false,
    allowHttps: config.security?.allowHttps !== false,
    allowInternalAccess: config.security?.allowInternalAccess === true,
    enabled: config.security?.enabled === true,
  }
}

/**
 * 创建带有 URL 验证的 HTTP 函数包装器
 *
 * @param httpFunction - 原始的 HTTP 函数
 * @param config - 配置对象（用于获取白名单/黑名单）
 * @returns 包装后的 HTTP 函数
 */
export function createSafeHttpFunction(
  httpFunction: (url: string, ...args: any[]) => Promise<any>,
  config: Config
): (url: string, ...args: any[]) => Promise<any> {
  const securityOptions = getSecurityOptions(config)

  return async (url: string, ...args: any[]) => {
    // 验证 URL
    validateUrlOrThrow(url, securityOptions)

    return httpFunction(url, ...args)
  }
}
