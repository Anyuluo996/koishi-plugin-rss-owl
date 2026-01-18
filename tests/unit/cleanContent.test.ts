/**
 * cleanContent 单元测试
 */

import { describe, it, expect } from '@jest/globals'
import { cleanContent } from '../../src/utils/common'

describe('cleanContent', () => {
  it('should remove HTML tags', () => {
    const result = cleanContent('<p>Hello <strong>World</strong></p>')
    expect(result).toBe('Hello World')
  })

  it('should handle plain text', () => {
    const result = cleanContent('Simple text without HTML')
    expect(result).toBe('Simple text without HTML')
  })

  it('should return empty string for empty input', () => {
    expect(cleanContent('')).toBe('')
  })

  it('should remove script tags', () => {
    const result = cleanContent('<script>alert("test")</script>Content')
    expect(result).not.toContain('script')
    expect(result).toContain('Content')
  })

  it('should remove style tags', () => {
    const result = cleanContent('<style>body{color:red}</style>Content')
    expect(result).not.toContain('style')
    expect(result).toContain('Content')
  })

  it('should remove img tags', () => {
    const result = cleanContent('<img src="test.jpg"/>Text content')
    expect(result).not.toContain('img')
    expect(result).toContain('Text content')
  })

  it('should remove video tags', () => {
    const result = cleanContent('<video src="test.mp4"></video>Content')
    expect(result).not.toContain('video')
    expect(result).toContain('Content')
  })

  it('should collapse whitespace', () => {
    const result = cleanContent('<p>Text1</p>  <p>Text2</p>')
    expect(result).not.toMatch(/\s{2,}/)
  })

  it('should trim result', () => {
    const result = cleanContent('  <p>Text</p>  ')
    expect(result).not.toMatch(/^\s/)
    expect(result).not.toMatch(/\s$/)
  })
})
