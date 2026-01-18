import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as cheerio from 'cheerio'
import * as crypto from 'crypto'
import { Config } from '../types'
import { debug } from '../utils/logger'

/**
 * AI 摘要缓存接口
 */
interface CacheEntry {
  summary: string
  timestamp: number
}

/**
 * AI 摘要结果接口
 */
interface SummaryResult {
  success: boolean
  summary: string
  cached: boolean
  error?: string
}

/**
 * AI 摘要缓存管理器
 */
export class AiSummaryCache {
  private cache: Map<string, CacheEntry> = new Map()
  private ttl: number // 缓存过期时间（毫秒）

  constructor(ttl: number = 24 * 60 * 60 * 1000) {
    this.ttl = ttl
  }

  /**
   * 生成缓存键（基于内容的哈希）
   */
  private generateKey(title: string, content: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${title}|||${content}`)
      .digest('hex')
    return hash
  }

  /**
   * 获取缓存
   */
  get(title: string, content: string): string | null {
    const key = this.generateKey(title, content)
    const entry = this.cache.get(key)

    if (!entry) return null

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.summary
  }

  /**
   * 设置缓存
   */
  set(title: string, content: string, summary: string): void {
    const key = this.generateKey(title, content)
    this.cache.set(key, {
      summary,
      timestamp: Date.now()
    })
  }

  /**
   * 清除过期缓存
   */
  cleanExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// 全局缓存实例
let globalCache: AiSummaryCache | null = null

/**
 * 初始化 AI 摘要缓存
 */
export function initAiCache(ttl?: number): void {
  if (!globalCache) {
    globalCache = new AiSummaryCache(ttl)
    debug({ debug: 'info' } as Config, 'AI 摘要缓存已初始化', 'AI-Cache', 'info')
  }
}

/**
 * 清洗 HTML 内容为纯文本
 */
function cleanHtmlContent(contentHtml: string, maxLength: number): string {
  const $ = cheerio.load(contentHtml || '')
  // 移除脚本、样式、图片等无关标签
  $('script').remove()
  $('style').remove()
  $('img').remove()
  $('video').remove()
  let plainText = $.text().replace(/\s+/g, ' ').trim()

  // 截断超长文本
  if (plainText.length > maxLength) {
    plainText = plainText.substring(0, maxLength) + '...'
  }

  return plainText
}

/**
 * 构建代理配置
 */
function buildProxyConfig(config: Config): any {
  const requestConfig: any = {}

  if (config.net.proxyAgent?.enabled) {
    const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
    requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
    requestConfig.proxy = false
  }

  return requestConfig
}

/**
 * 调用 AI API 生成摘要（带智能降级）
 */
async function callAiApi(
  config: Config,
  prompt: string,
  context: string
): Promise<SummaryResult> {
  // 最大重试次数
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      debug(config, `AI 请求尝试 ${attempt + 1}/${maxRetries + 1}: ${context}`, 'AI', 'info')

      const requestConfig: any = {
        headers: {
          'Authorization': `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: config.ai.timeout,
        ...buildProxyConfig(config)
      }

      const response = await axios.post(
        `${config.ai.baseUrl!.replace(/\/+$/, '')}/chat/completions`,
        {
          model: config.ai.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        },
        requestConfig
      )

      const summary = response.data?.choices?.[0]?.message?.content?.trim()

      if (!summary) {
        throw new Error('AI 返回空结果')
      }

      debug(config, `AI 摘要生成成功: ${summary.substring(0, 20)}...`, 'AI', 'details')
      return {
        success: true,
        summary,
        cached: false
      }
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries

      debug(
        config,
        `AI 请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}): ${error.message}`,
        'AI',
        isLastAttempt ? 'error' : 'info'
      )

      // 如果是最后一次尝试，返回降级结果
      if (isLastAttempt) {
        return {
          success: false,
          summary: '',
          cached: false,
          error: error.message
        }
      }

      // 等待后重试（指数退避）
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000 // 1s, 2s
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  // 不应该到这里，但为了类型安全
  return {
    success: false,
    summary: '',
    cached: false,
    error: '未知错误'
  }
}

/**
 * 生成单条 AI 摘要（带缓存和降级）
 */
export async function getAiSummary(
  config: Config,
  title: string,
  contentHtml: string
): Promise<string> {
  // AI 功能未启用
  if (!config.ai.enabled || !config.ai.apiKey) return ''

  // 初始化缓存（如果还没初始化）
  if (!globalCache) {
    initAiCache()
  }

  // 清洗内容
  const plainText = cleanHtmlContent(contentHtml, config.ai.maxInputLength!)

  // 内容太少不总结
  if (!plainText || plainText.length < 50) return ''

  // 检查缓存
  const cachedSummary = globalCache!.get(title, plainText)
  if (cachedSummary) {
    debug(config, `使用缓存的 AI 摘要: ${title}`, 'AI-Cache', 'details')
    return cachedSummary
  }

  // 构建 Prompt
  const prompt = config.ai.prompt!
    .replace('{{title}}', title || '')
    .replace('{{content}}', plainText)

  // 调用 AI API
  const result = await callAiApi(config, prompt, `单条摘要: ${title}`)

  // 缓存成功的结果
  if (result.success && result.summary) {
    globalCache!.set(title, plainText, result.summary)
  }

  return result.summary
}

/**
 * 批量生成 AI 摘要（多条更新合并为一条）
 */
export async function getBatchAiSummary(
  config: Config,
  items: Array<{ title: string; content: string }>
): Promise<string> {
  // AI 功能未启用或项目数量为0
  if (!config.ai.enabled || !config.ai.apiKey || items.length === 0) return ''

  // 只有一条时使用单条摘要
  if (items.length === 1) {
    return getAiSummary(config, items[0].title, items[0].content)
  }

  debug(config, `批量生成 AI 摘要: ${items.length} 条内容`, 'AI-Batch', 'info')

  try {
    // 清洗所有内容
    const cleanedItems = items
      .map(item => ({
        title: item.title,
        content: cleanHtmlContent(item.content, config.ai.maxInputLength! / items.length)
      }))
      .filter(item => item.content.length >= 50) // 过滤太短的内容

    if (cleanedItems.length === 0) {
      debug(config, '所有内容都太短，无法生成批量摘要', 'AI-Batch', 'info')
      return ''
    }

    // 构建批量 Prompt
    const prompt = `请简要总结以下 ${cleanedItems.length} 条新闻/文章的核心内容，要求：
1. 语言简洁流畅，每条总结不超过30字
2. 按顺序总结，使用数字编号
3. 突出重点信息

${cleanedItems.map((item, index) => `
${index + 1}. 标题：${item.title}
   内容：${item.content}
`).join('\n')}

总结：`

    // 调用 AI API
    const result = await callAiApi(config, prompt, `批量摘要: ${cleanedItems.length}条`)

    if (result.success && result.summary) {
      debug(config, `批量摘要生成成功: ${result.summary.substring(0, 50)}...`, 'AI-Batch', 'details')
    }

    return result.summary
  } catch (error: any) {
    debug(config, `批量摘要生成失败: ${error.message}`, 'AI-Batch', 'error')
    return ''
  }
}

/**
 * 智能摘要：根据内容数量自动选择单条或批量摘要
 */
export async function getSmartAiSummary(
  config: Config,
  items: Array<{ title: string; content: string }>
): Promise<string> {
  if (!config.ai.enabled || !config.ai.apiKey || items.length === 0) {
    return ''
  }

  // 根据配置决定是否使用批量摘要
  const threshold = 3 // 超过3条时使用批量摘要

  if (items.length > threshold) {
    return getBatchAiSummary(config, items)
  } else {
    // 少量内容时，生成单条摘要后合并
    const summaries = await Promise.all(
      items.map(item => getAiSummary(config, item.title, item.content))
    )
    return summaries.filter(s => s).join('\n\n')
  }
}

/**
 * 清除过期缓存
 */
export function cleanExpiredCache(): void {
  if (globalCache) {
    globalCache.cleanExpired()
  }
}

/**
 * 清空所有缓存
 */
export function clearAiCache(): void {
  if (globalCache) {
    globalCache.clear()
  }
}

/**
 * 获取缓存统计信息
 */
export function getAiCacheStats(): { size: number; keys: string[] } | null {
  if (globalCache) {
    return globalCache.getStats()
  }
  return null
}

// ============ 导出原有的 AI 选择器生成功能 ============

/**
 * AI 智能生成 CSS 选择器（保持原有功能）
 */
export async function generateSelectorByAI(
  config: Config,
  url: string,
  instruction: string,
  html: string
): Promise<string> {
  if (!config.ai.enabled || !config.ai.apiKey) {
    throw new Error('需在配置中开启 AI 功能并填写 API Key')
  }

  // 预处理 HTML
  const $ = cheerio.load(html)
  $('script, style, svg, path, link, meta, noscript').remove()
  $('*').contents().each((_, e) => {
    if (e.type === 'comment') $(e).remove()
  })

  // 限制长度节省 token
  let cleanHtml = $('body').html()?.replace(/\s+/g, ' ').trim().substring(0, 15000) || ''

  const prompt = `
    作为一名爬虫专家，请根据提供的 HTML 代码片段，为一个网页监控工具生成一个 CSS Selector。

    目标网页：${url}
    用户需求：${instruction}

    要求：
    1. 只返回 CSS Selector 字符串，不要包含任何解释、Markdown 标记或代码块符号。
    2. Selector 必须尽可能精确，通常用于提取列表中的一项或多项。
    3. 如果是列表，请确保 Selector 能选中列表项的容器。

    HTML片段：
    ${cleanHtml}
    `

  try {
    debug(config, `正在请求 AI 生成选择器: ${instruction}`, 'AI-Selector', 'info')

    const requestConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000,
      ...buildProxyConfig(config)
    }

    const response = await axios.post(
      `${config.ai.baseUrl!.replace(/\/+$/, '')}/chat/completions`,
      {
        model: config.ai.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      },
      requestConfig
    )

    let selector = response.data?.choices?.[0]?.message?.content?.trim()
    selector = selector?.replace(/`/g, '')?.replace(/^css/i, '')?.trim()

    debug(config, `AI 生成的选择器: ${selector}`, 'AI-Selector', 'info')
    return selector || ''
  } catch (error: any) {
    debug(config, `AI 生成选择器失败: ${error.message}`, 'AI-Selector', 'error')
    throw error
  }
}
