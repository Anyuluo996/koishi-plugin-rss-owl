/**
 * parseTemplateContent 和 parseQuickUrl 基本测试
 */

import { describe, it, expect } from '@jest/globals'
import { parseTemplateContent, parseQuickUrl } from '../../src/utils/common'

describe('parseTemplateContent', () => {
  it('应该处理简单的模板替换', () => {
    const template = 'Hello {{name}}'
    const item = { name: 'World' }
    const result = parseTemplateContent(template, item)
    expect(result).toContain('World')
  })

  it('应该处理多个占位符', () => {
    const template = '{{title}} - {{author}}'
    const item = { title: 'Test', author: 'Author' }
    const result = parseTemplateContent(template, item)
    expect(result).toContain('Test')
    expect(result).toContain('Author')
  })

  it('应该处理嵌套属性访问', () => {
    const template = '{{user.name}}'
    const item = { user: { name: 'John' } }
    const result = parseTemplateContent(template, item)
    expect(result).toContain('John')
  })

  it('应该处理带管道符的模板', () => {
    const template = '{{name|default}}'
    const item = { name: 'Value', default: 'Default' }
    const result = parseTemplateContent(template, item)
    expect(result).toBeTruthy()
  })

  it('应该处理空模板', () => {
    const template = ''
    const item = { name: 'Test' }
    const result = parseTemplateContent(template, item)
    expect(result).toBe('')
  })

  it('应该处理没有占位符的模板', () => {
    const template = 'Just plain text'
    const item = { name: 'Test' }
    const result = parseTemplateContent(template, item)
    expect(result).toBe('Just plain text')
  })

  it('应该处理属性不存在的情况', () => {
    const template = '{{missing}}'
    const item = { existing: 'value' }
    const result = parseTemplateContent(template, item)
    // 当属性不存在时，函数返回空字符串
    expect(result).toBe('')
  })
})

describe('parseQuickUrl', () => {
  it('应该返回普通URL（无前缀匹配）', () => {
    const url = 'https://example.com'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList: any[] = []
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toBe(url)
  })

  it('应该处理空的 quickList', () => {
    const url = 'test:value'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList: any[] = []
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toBe(url)
  })

  it('应该匹配前缀并替换URL', () => {
    const url = 'custom:test-route'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList = [
      {
        prefix: 'custom',
        replace: 'https://example.com/{{route}}',
      },
    ]
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toContain('test-route')
  })

  it('应该使用 rsshub 变量', () => {
    const url = 'test:path'
    const rssHubUrl = 'https://rsshub.app'
    const quickList = [
      {
        prefix: 'test',
        replace: '{{rsshub}}/{{route}}',
      },
    ]
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toContain('https://rsshub.app')
  })

  it('应该处理多个 quickList 项', () => {
    const url = 'second:test'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList = [
      {
        prefix: 'first',
        replace: 'https://first.com/{{route}}',
      },
      {
        prefix: 'second',
        replace: 'https://second.com/{{route}}',
      },
    ]
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toContain('second.com')
  })

  it('应该匹配第一个合适的前缀', () => {
    const url = 'common:test'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList = [
      {
        prefix: 'common',
        replace: 'https://first.com/{{route}}',
      },
      {
        prefix: 'common',
        replace: 'https://second.com/{{route}}',
      },
    ]
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    // 应该匹配第一个
    expect(result).toContain('first.com')
  })

  it('应该处理包含特殊字符的路由', () => {
    const url = 'test:special-chars_123'
    const rssHubUrl = 'https://rsshub.example.com'
    const quickList = [
      {
        prefix: 'test',
        replace: 'https://example.com/path/{{route}}',
      },
    ]
    const result = parseQuickUrl(url, rssHubUrl, quickList)
    expect(result).toContain('special-chars_123')
  })
})
