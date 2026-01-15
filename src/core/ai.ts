import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as cheerio from 'cheerio'
import { Config } from '../types'
import { debug } from '../utils/logger'

export async function getAiSummary(config: Config, title: string, contentHtml: string): Promise<string> {
  if (!config.ai.enabled || !config.ai.apiKey) return ''

  // 1. 清洗内容，只保留纯文本
  const $ = cheerio.load(contentHtml || '')
  // 移除脚本、样式、图片等无关标签，减少 token 消耗
  $('script').remove()
  $('style').remove()
  $('img').remove()
  $('video').remove()
  let plainText = $.text().replace(/\s+/g, ' ').trim()

  // 2. 截断超长文本
  if (plainText.length > config.ai.maxInputLength!) {
    plainText = plainText.substring(0, config.ai.maxInputLength!) + '...'
  }

  if (!plainText || plainText.length < 50) return '' // 内容太少不总结

  // 3. 构建 Prompt
  const prompt = config.ai.prompt!
    .replace('{{title}}', title || '')
    .replace('{{content}}', plainText)

  try {
    debug(config, `正在生成摘要: ${title}`, 'AI', 'info')

    // 4. 构建请求配置（支持代理）
    const requestConfig: any = {
      headers: {
        'Authorization': `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.ai.timeout,
    }

    // 复用代理配置
    if (config.net.proxyAgent?.enabled) {
      const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
      requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
      requestConfig.proxy = false
    }

    // 5. 发送请求
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
    debug(config, `摘要生成成功: ${summary?.substring(0, 20)}...`, 'AI', 'details')
    return summary || ''
  } catch (error: any) {
    debug(config, `AI 摘要生成失败: ${error.message}`, 'AI', 'error')
    return ''
  }
}

// AI 智能生成 CSS 选择器
export async function generateSelectorByAI(config: Config, url: string, instruction: string, html: string): Promise<string> {
  if (!config.ai.enabled || !config.ai.apiKey) throw new Error('需在配置中开启 AI 功能并填写 API Key')

  // 预处理 HTML
  const $ = cheerio.load(html)
  $('script, style, svg, path, link, meta, noscript').remove()
  $('*').contents().each((_, e) => { if (e.type === 'comment') $(e).remove() })

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
    }

    if (config.net.proxyAgent?.enabled) {
      const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
      requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
      requestConfig.proxy = false
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
