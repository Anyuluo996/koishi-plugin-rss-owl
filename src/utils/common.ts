import { Config } from '../types'
import { debug } from './logger'
import * as cheerio from 'cheerio'

export const sleep = (delay = 1000) => new Promise(resolve => setTimeout(resolve, delay))

/**
 * 标准化 RSS 字段内容，统一数组 / 空值 / 非字符串输入。
 *
 * 统一入口，避免在各 core 模块内重复定义私有副本。
 */
export function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.join('')
  if (value === undefined || value === null) return ''
  return String(value)
}

// 安全的时间解析函数，处理各种格式
export const parsePubDate = (config: Config, pubDate: any): Date => {
  if (!pubDate) return new Date(0)
  try {
    const date = new Date(pubDate)
    // 检查是否为有效日期
    if (isNaN(date.getTime())) {
      debug(config, `无效的日期格式: ${pubDate}`, 'date parse', 'error')
      return new Date(0)
    }
    return date
  } catch (error) {
    debug(config, `日期解析错误: ${pubDate}, ${error}`, 'date parse', 'error')
    return new Date(0)
  }
}

// 辅助函数：确保 URL 包含协议并去除多余空格
export const ensureUrlProtocol = (url: string) => {
  if (!url) return ''
  // 去除首尾空格，并只取第一个空格前的内容 (防止贪婪匹配导致的错误)
  url = url.trim().split(/\s+/)[0]

  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`
  }
  return url
}

// 通用内容解析函数
export const parseContent = (content: any, attr = undefined): string | undefined => {
  if (!content) return undefined
  if (typeof content == 'string') return content
  if (attr && content?.[attr]) return parseContent(content?.[attr])
  if (content['__cdata']) return content['__cdata']?.join?.("") || content['__cdata']
  if (content['__text']) return content['__text']?.join?.("") || content['__text']

  if (Object.prototype.toString.call(content) === '[object Array]') {
    return parseContent(content[0], attr)
  } else if (Object.prototype.toString.call(content) === '[object Object]') {
    return (Object.values(content) as any[]).reduce<string>((t: string, v: any) => {
      if (v && (typeof v == 'string' || v?.join)) {
        let text = v?.join("") || v
        return (typeof text === 'string' && text.length > t.length) ? text : t
      } else { return t }
    }, '')
  } else {
    return content
  }
}

// 模板内容解析函数
export const parseTemplateContent = (template: string, item: any): string => {
  return template.replace(/{{(.+?)}}/g, (i: string) => {
    // 添加空值检查，防止 match 返回 null 时崩溃
    const match = i.match(/^{{(.*)}}$/)
    if (!match) return i

    const content = match[1]
    if (!content) return i

    return content.split("|").reduce((t: any, v: string) => {
      // 添加空值检查
      const literalMatch = v.match(/^'(.*)'$/)
      if (literalMatch) {
        return t || literalMatch[1]
      }

      return v.split(".").reduce((t: any, v: string) => {
        // Date 格式化处理
        if (new RegExp("Date").test(v)) {
          const dateVal = t?.[v]
          return dateVal ? new Date(dateVal).toLocaleString('zh-CN') : ""
        }
        return t?.[v] || ""
      }, item)
    }, '')
  })
}

// 快速URL解析函数
export const parseQuickUrl = (url: string, rssHubUrl: string, quickList: any[]): string => {
  let correntQuickObj = quickList.find(i => new RegExp(`^${i.prefix}:`).test(url))
  if (!correntQuickObj) return url
  let routeMatch = url.match(new RegExp(`(?<=^${correntQuickObj.prefix}:).*`))
  if (!routeMatch) return url
  let route = routeMatch[0]

  // 复用模块级 parseTemplateContent，避免内嵌重复实现
  const rUrl = parseTemplateContent(correntQuickObj.replace, { rsshub: rssHubUrl, route })
  return rUrl
}

// 清洗内容，只保留纯文本
export const cleanContent = (htmlContent: string): string => {
  const $ = cheerio.load(htmlContent || '')
  // 移除脚本、样式、图片等无关标签，减少 token 消耗
  $('script').remove()
  $('style').remove()
  $('img').remove()
  $('video').remove()
  let plainText = $.text().replace(/\s+/g, ' ').trim()
  return plainText
}
