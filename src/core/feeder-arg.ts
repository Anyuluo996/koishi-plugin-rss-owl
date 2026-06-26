import { Config, rssArg } from '../types'
import { normalizeBasicConfig, normalizeSubscriptionArg } from '../utils/legacy-config'
import { mergeProxyAgent } from '../utils/proxy'
import { debug } from '../utils/logger'

const ARG_ENTRY_KEYS = [
  'forceLength',
  'reverse',
  'timeout',
  'interval',
  'merge',
  'maxRssItem',
  'firstLoad',
  'bodyWidth',
  'bodyPadding',
  'bodyFontSize',
  'split',
  'filter',
  'block',
  'proxyAgent',
] as const

type ArgEntryKey = typeof ARG_ENTRY_KEYS[number]

const BOOLEAN_ARG_KEYS = new Set<ArgEntryKey>(['firstLoad', 'reverse', 'merge'])
const NUMBER_ARG_KEYS = new Set<ArgEntryKey>([
  'forceLength',
  'timeout',
  'interval',
  'maxRssItem',
  'bodyWidth',
  'bodyPadding',
  'bodyFontSize',
  'split',
])
const ARRAY_ARG_KEYS = new Set<ArgEntryKey>(['filter', 'block'])
const FALSE_CONTENT = new Set(['false', 'null', 'none', ''])

function parseArrayArg(value: string): string[] {
  return value
    .split('/')
    .map(item => item.trim())
    .filter(Boolean)
}

function extractKnownArgEntries(arg?: string): Partial<Record<ArgEntryKey, string>> {
  if (!arg) return {}

  const pattern = new RegExp(`(^|,)\\s*(${ARG_ENTRY_KEYS.join('|')})\\s*:`, 'g')
  const matches = [...arg.matchAll(pattern)]
  const result: Partial<Record<ArgEntryKey, string>> = {}

  for (let index = 0; index < matches.length; index++) {
    const currentMatch = matches[index]
    const nextMatch = matches[index + 1]
    const key = currentMatch[2] as ArgEntryKey
    const valueStart = (currentMatch.index ?? 0) + currentMatch[0].length
    const valueEnd = nextMatch?.index ?? arg.length
    result[key] = arg.slice(valueStart, valueEnd).replace(/,\s*$/, '').trim()
  }

  return result
}

function parseBooleanArg(value: unknown): boolean {
  return !FALSE_CONTENT.has(String(value ?? '').trim().toLowerCase())
}

function parseNumberArg(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeScalarArgValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  return value.split(',')[0].trim()
}

function parseProxyAgentArg(value: unknown, auth?: string): rssArg['proxyAgent'] | undefined {
  if (typeof value === 'object' && value !== null) {
    return value as rssArg['proxyAgent']
  }

  const normalizedValue = String(normalizeScalarArgValue(value) ?? '').trim()
  if (FALSE_CONTENT.has(normalizedValue.toLowerCase())) {
    return { enabled: false }
  }

  const proxyUrl = normalizedValue.includes('://') ? normalizedValue : `http://${normalizedValue}`

  try {
    const parsedUrl = new URL(proxyUrl)
    const protocol = parsedUrl.protocol.replace(':', '') || 'http'
    const host = parsedUrl.hostname
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 7890

    if (!host) return undefined

    const proxyAgent: rssArg['proxyAgent'] = {
      enabled: true,
      protocol,
      host,
      port,
    }

    if (auth) {
      const [username = '', password = ''] = auth.split('/')
      if (username) {
        proxyAgent.auth = { enabled: true, username, password }
      }
    }

    return proxyAgent
  } catch {
    return undefined
  }
}

// mergeProxyAgent 已提升到 utils/proxy.ts，统一代理 helper 归属

function mergeProxyAgentWithLog(argProxy: any, configProxy: any, config: Config) {
  const result = mergeProxyAgent(argProxy, configProxy, config)
  debug(config, `[DEBUG_PROXY] mergeProxyAgent input: arg=${JSON.stringify(argProxy)} conf=${JSON.stringify(configProxy)} output=${JSON.stringify(result)}`, 'proxy merge', 'details')
  return result
}

/**
 * 将命令选项解析为订阅参数对象。
 *
 * @param options - 命令选项
 * @param config - 插件配置
 * @returns 解析后的订阅参数
 */
export function formatArg(options: any, config: Config): rssArg {
  const { arg, template, auth } = options || {}
  const rawEntries: Record<string, unknown> = typeof arg === 'string'
    ? extractKnownArgEntries(arg)
    : (arg || {})
  const json: Partial<rssArg> = {}

  for (const [rawKey, rawValue] of Object.entries(rawEntries)) {
    const key = rawKey as ArgEntryKey

    if (!ARG_ENTRY_KEYS.includes(key)) continue

    if (key === 'proxyAgent') {
      const proxyAgent = parseProxyAgentArg(rawValue, auth)
      if (proxyAgent) {
        json.proxyAgent = proxyAgent
      }
      continue
    }

    if (ARRAY_ARG_KEYS.has(key)) {
      if (Array.isArray(rawValue)) {
        json[key] = rawValue.filter(Boolean) as never
      } else {
        const parsedArray = parseArrayArg(String(rawValue ?? ''))
        if (parsedArray.length) {
          json[key] = parsedArray as never
        }
      }
      continue
    }

    if (BOOLEAN_ARG_KEYS.has(key)) {
      json[key] = parseBooleanArg(normalizeScalarArgValue(rawValue)) as never
      continue
    }

    if (NUMBER_ARG_KEYS.has(key)) {
      const parsedNumber = parseNumberArg(normalizeScalarArgValue(rawValue))
      if (parsedNumber !== undefined) {
        json[key] = parsedNumber as never
      }
      continue
    }

    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
      json[key] = String(rawValue).trim() as never
    }
  }

  if (template && config.template) {
    json.template = template
  }

  if (typeof json.interval === 'number') json.interval *= 1000

  return json as rssArg
}

/**
 * 合并全局配置与订阅级参数。
 *
 * @param arg - 订阅级参数
 * @param config - 插件配置
 * @returns 合并后的运行时参数
 */
export function mixinArg(arg: any, config: Config): rssArg {
  const normalizedArg = normalizeSubscriptionArg(arg)
  const mergedProxy = mergeProxyAgentWithLog(normalizedArg?.proxyAgent, config.net?.proxyAgent, config)

  if (mergedProxy?.enabled) {
    debug(config, `使用代理: ${mergedProxy.protocol}://${mergedProxy.host}:${mergedProxy.port}`, 'proxy merge', 'details')
  } else {
    debug(config, '代理未启用', 'proxy merge', 'details')
  }

  const baseConfig = normalizeBasicConfig({
    ...config.basic,
  })

  const result = normalizeSubscriptionArg({
    ...baseConfig,
    ...normalizedArg,
    filter: [...(config.msg?.keywordFilter || []), ...(normalizedArg?.filter || [])],
    block: [...(config.msg?.keywordBlock || []), ...(normalizedArg?.block || [])],
    template: normalizedArg.template ?? baseConfig.defaultTemplate,
    proxyAgent: mergedProxy,
  })

  debug(config, `[DEBUG_PROXY] mixinArg return: ${JSON.stringify(result.proxyAgent)}`, 'mixin', 'details')
  return result as rssArg
}