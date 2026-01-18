/**
 * parseContent 单元测试
 */

import { describe, it, expect } from '@jest/globals'
import { parseContent } from '../../src/utils/common'

describe('parseContent', () => {
  it('should return undefined for null or undefined input', () => {
    expect(parseContent(null)).toBeUndefined()
    expect(parseContent(undefined)).toBeUndefined()
    expect(parseContent('')).toBeUndefined()
  })

  it('should return string directly', () => {
    expect(parseContent('simple string')).toBe('simple string')
  })

  it('should extract __cdata field', () => {
    const input = { __cdata: 'CDATA content' }
    expect(parseContent(input)).toBe('CDATA content')
  })

  it('should extract __text field', () => {
    const input = { __text: 'Text content' }
    expect(parseContent(input)).toBe('Text content')
  })

  it('should extract __cdata array', () => {
    const input = { __cdata: ['content1', 'content2'] }
    expect(parseContent(input)).toBe('content1content2')
  })

  it('should extract from array first element', () => {
    const input = ['first item', 'second item']
    expect(parseContent(input)).toBe('first item')
  })

  it('should extract with attribute', () => {
    const input = { _attr: 'attribute value', other: 'value' }
    expect(parseContent(input, '_attr')).toBe('attribute value')
  })
})
