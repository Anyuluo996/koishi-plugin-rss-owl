import axios from 'axios'
import { Context } from 'koishi'
import { Config, rssArg } from '../types'
import { normalizeError } from './error-handler'
import { createDebugWithContext } from './logger'
import { sleep } from './common'
import { buildAxiosProxyConfig, mergeProxyAgent } from './proxy'
import { validateUrlOrThrow, SecurityError, getSecurityOptions } from './security'

// 简化版 RequestManager，仅用于普通 API 请求，大文件下载建议绕过
export class RequestManager {
  private queue: Array<() => Promise<any>> = []
  private running = 0
  private maxConcurrent: number
  private lastRefill: number
  private tokens: number
  private refillRate: number
  private bucketSize: number

  constructor(maxConcurrent = 3, refillRate = 2, bucketSize = 10) {
    this.maxConcurrent = maxConcurrent
    this.refillRate = refillRate
    this.bucketSize = bucketSize
    this.tokens = bucketSize
    this.lastRefill = Date.now()
  }

  private refill() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.bucketSize, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }

  // 简单的入队逻辑
  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          this.processNext()
        }
      })
      this.processNext()
    })
  }

  private processNext() {
    this.refill()

    // 如果令牌不足，稍后重试
    if (this.tokens < 1) {
      setTimeout(() => this.processNext(), 500)
      return
    }

    if (this.running >= this.maxConcurrent || this.queue.length === 0) return

    const task = this.queue.shift()
    if (task) {
      this.tokens -= 1
      this.running++
      task()
    }
  }
}

export const createHttpFunction = (ctx: Context, config: Config, requestManager: RequestManager) => {
  return async (url: string, arg: rssArg, requestConfig: any = {}) => {
    const isHeavyRequest = requestConfig.responseType === 'arraybuffer' || requestConfig.responseType === 'stream'
    const requestType = isHeavyRequest ? 'heavy' : 'normal'
    const requestTimeout = (arg.timeout || 60) * 1000
    const requestDebug = createDebugWithContext(config, {
      url,
      requestType,
      isHeavyRequest,
      timeout: requestTimeout,
    })

    // URL 安全验证
    try {
      validateUrlOrThrow(url, getSecurityOptions(config))
    } catch (error) {
      if (error instanceof SecurityError) {
        const normalizedError = normalizeError(error)
        requestDebug(`URL 安全验证失败: ${normalizedError.message}`, 'security', 'error', {
          stage: 'security-validation',
        })
        throw error
      }
      throw error
    }

    // 关键修改：如果检测到是大文件下载（responseType 为 arraybuffer 或 stream），绕过队列直接请求
    // 这样避免视频下载阻塞 RSS 轮询，也避免因队列超时导致下载失败
    const makeRequest = async () => {
      // 基础配置
      requestDebug(`[DEBUG_PROXY] fetcher makeRequest arg.proxyAgent: ${JSON.stringify(arg?.proxyAgent)}`, 'request', 'details')
      const configObj: any = {
        timeout: requestTimeout,
        headers: {
          'User-Agent': config.net.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        // 允许传入自定义 proxyAgent
        ...(arg.proxyAgent?.enabled ? {} : {})
      }

      // 代理配置：复用 utils/proxy.ts 的合并 + 构造 helper（CLAUDE.md:346 规范）
      // mergeProxyAgent 已处理“arg 缺失回落全局 / arg 不完整用全局补全”的防御性逻辑
      const currentProxyAgent = mergeProxyAgent(arg?.proxyAgent, config.net?.proxyAgent, config)
      const proxyEnabled = Boolean(currentProxyAgent?.enabled)

      let proxyUrl = ''
      if (proxyEnabled && currentProxyAgent.host) {
        proxyUrl = `${currentProxyAgent.protocol}://${currentProxyAgent.host}:${currentProxyAgent.port}`
        requestDebug(`[DEBUG_PROXY] fetcher 使用代理`, 'request', 'details', {
          proxyEnabled: true,
          proxyUrl,
        })
        // 用合并后的片段构造 axios 代理配置，与 ai-client / search-providers 同源
        const proxyConfig = buildAxiosProxyConfig({ net: { proxyAgent: currentProxyAgent } } as Config)
        configObj.httpsAgent = proxyConfig.httpsAgent
        configObj.proxy = false  // 禁用 axios 原生 proxy
      }

      // 合并外部配置
      // 注意：必须深拷贝 headers，否则可能丢失 UA
      if (requestConfig.headers) {
        configObj.headers = { ...configObj.headers, ...requestConfig.headers }
        delete requestConfig.headers
      }

      const finalConfig = { ...configObj, ...requestConfig }
      const requestContext = {
        proxyEnabled,
        proxyUrl,
      }

      // 对于重请求，打印更详细的日志（包含代理状态）
      if (isHeavyRequest) {
        const proxyInfo = proxyEnabled ? ` [代理: ${proxyUrl}]` : ' [直连]'
        requestDebug(`Heavy Request${proxyInfo}: ${url}`, 'request', 'details', requestContext)
      } else {
        requestDebug(`Request: ${url}`, 'request', 'details', requestContext)
      }

      let retries = 3
      let lastError: any

      while (retries > 0) {
        try {
          return await axios.get(url, finalConfig)
        } catch (error: any) {
          lastError = error
          retries--

          const status = error.response?.status || 'Unknown'
          const errMsg = error.message || error.code || error

          if (retries > 0) {
            requestDebug(`[Request Retry] 剩余 ${retries} 次: ${url} [Status: ${status}] ${errMsg}`, 'request', 'info', {
              ...requestContext,
              retryCount: 3 - retries,
              retriesRemaining: retries,
              status,
            })
            await sleep(1500) // 增加重试间隔
          }
        }
      }

      const normalizedError = normalizeError(lastError || new Error('Max retries reached'))
      const status = lastError?.response?.status || 'Unknown'

      requestDebug(`Request failed after retries: ${normalizedError.message}`, 'request', 'error', {
        ...requestContext,
        status,
        retriesRemaining: 0,
      })

      throw normalizedError
    }

    if (isHeavyRequest) {
      return makeRequest() // 直接执行，不走队列
    } else {
      return requestManager.enqueue(makeRequest)
    }
  }
}
