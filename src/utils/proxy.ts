import type { AxiosRequestConfig } from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'

import type { Config } from '../types'
import { debug } from './logger'

/**
 * 代理配置片段（订阅级 / 全局级通用形状）。
 */
export interface ProxyAgentShape {
  enabled?: boolean
  protocol?: string
  host?: string
  port?: number | string
  auth?: { enabled?: boolean; user?: string; pass?: string } & Record<string, any>
  [key: string]: any
}

/**
 * 合并订阅级代理配置 (argProxy) 与全局代理配置 (configProxy)。
 *
 * 优先级：
 *   1. argProxy.enabled === false → 显式禁用
 *   2. argProxy.enabled === true 且有 host → 用订阅配置
 *   3. argProxy 缺失 / 未设置 enabled → 回落全局配置
 *   4. argProxy.enabled === true 但缺 host → 用全局补全
 *   5. 其余 → 禁用
 *
 * 返回值与 `config.net.proxyAgent` 同构，可直接喂给 `buildAxiosProxyConfig`。
 *
 * 本函数原位于 `core/feeder-arg.ts`，提升到此处以统一代理 helper 归属，
 * 供 fetcher / feeder 等模块复用，避免重复实现合并逻辑。
 */
export function mergeProxyAgent(argProxy: any, configProxy: any, config: Config): ProxyAgentShape {
  debug(config, `合并代理配置 - argProxy: ${JSON.stringify(argProxy)}, configProxy.enabled: ${configProxy?.enabled}`, 'proxy merge debug', 'details')

  if (argProxy?.enabled === false) {
    debug(config, '订阅明确禁用代理', 'proxy merge', 'details')
    return { enabled: false }
  }

  if (argProxy?.enabled === true && argProxy?.host) {
    debug(config, '使用订阅的代理配置', 'proxy merge', 'details')
    return argProxy
  }

  const shouldUseConfigProxy = !argProxy || Object.keys(argProxy || {}).length === 0 || argProxy?.enabled === undefined || argProxy?.enabled === null

  if (shouldUseConfigProxy) {
    if (configProxy?.enabled) {
      const result = {
        enabled: true,
        protocol: configProxy.protocol,
        host: configProxy.host,
        port: configProxy.port,
        auth: configProxy.auth?.enabled ? configProxy.auth : undefined,
      }
      debug(config, `使用全局代理: ${result.protocol}://${result.host}:${result.port}`, 'proxy merge', 'info')
      return result
    }
    debug(config, '全局代理未启用', 'proxy merge', 'details')
  }

  if (argProxy?.enabled === true && !argProxy?.host) {
    const result = {
      ...configProxy,
      ...argProxy,
      auth: configProxy?.auth?.enabled ? configProxy.auth : undefined,
    }
    debug(config, '订阅代理配置不完整，补充全局配置', 'proxy merge', 'details')
    return result
  }

  debug(config, '代理未配置，使用默认(禁用)', 'proxy merge', 'details')
  return { enabled: false }
}

/**
 * 构造 axios 的代理配置（httpsAgent + 关闭 axios 原生 proxy）。
 *
 * 接受完整的 Config（读取 config.net.proxyAgent）。对于需要按订阅合并代理的场景，
 * 先用 `mergeProxyAgent` 得到统一片段，再包成 `{ net: { proxyAgent } }` 传入。
 */
export function buildAxiosProxyConfig(config: Config): Pick<AxiosRequestConfig, 'httpsAgent' | 'proxy'> {
  if (!config.net?.proxyAgent?.enabled) {
    return {}
  }

  const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
  return {
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false,
  }
}
