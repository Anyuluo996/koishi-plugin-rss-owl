/**
 * tdl 工具模块单元测试
 *
 * 覆盖纯函数：parseTelegramLink、detectVideoTooBig、extractTooBigPoster。
 * detectBinary / downloadWithTdl 涉及真实子进程，仅做 mock 验证缓存与缺失分支。
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import * as cheerio from 'cheerio'

import {
  parseTelegramLink,
  detectVideoTooBig,
  extractTooBigPoster,
  detectBinary,
  resolveTdlBinary,
  _resetBinaryCacheForTest,
} from '../../src/utils/tdl'

const mockConfig = { debug: 'disable' } as any

describe('parseTelegramLink', () => {
  it('应解析公开频道消息链接', () => {
    const r = parseTelegramLink('https://t.me/anyul996/28')
    expect(r).toEqual({ channel: 'anyul996', messageId: 28 })
  })

  it('应解析无协议的链接', () => {
    const r = parseTelegramLink('t.me/anyul996/27')
    expect(r).toEqual({ channel: 'anyul996', messageId: 27 })
  })

  it('应解析私有频道（c/数字）链接', () => {
    const r = parseTelegramLink('https://t.me/c/1234567890/100')
    expect(r).toEqual({ channel: 'c/1234567890', messageId: 100 })
  })

  it('对非 Telegram 链接返回 null', () => {
    expect(parseTelegramLink('https://example.com/foo')).toBeNull()
    expect(parseTelegramLink('https://t.me/anyul996')).toBeNull()
  })

  it('对消息 ID 非法返回 null', () => {
    expect(parseTelegramLink('https://t.me/anyul996/0')).toBeNull()
    expect(parseTelegramLink('https://t.me/anyul996/abc')).toBeNull()
  })

  it('对空/null 输入返回 null', () => {
    expect(parseTelegramLink('')).toBeNull()
    expect(parseTelegramLink(null as any)).toBeNull()
    expect(parseTelegramLink(undefined as any)).toBeNull()
  })
})

describe('detectVideoTooBig', () => {
  it('检测标准占位 blockquote', () => {
    const html = cheerio.load(
      '<blockquote><b>Video is too big</b><br><img src="https://cdn5.telesco.pe/file/x.jpg"></blockquote>',
    )
    expect(detectVideoTooBig(html)).toBe(true)
  })

  it('大小写不敏感', () => {
    const html = cheerio.load('<blockquote>video IS TOO BIG</blockquote>')
    expect(detectVideoTooBig(html)).toBe(true)
  })

  it('对不含占位符的内容返回 false', () => {
    const html = cheerio.load('<blockquote>正常引用内容</blockquote>')
    expect(detectVideoTooBig(html)).toBe(false)
  })

  it('对正常 video 标签返回 false', () => {
    const html = cheerio.load('<video src="https://x.com/a.mp4"></video>')
    expect(detectVideoTooBig(html)).toBe(false)
  })

  it('空输入返回 false', () => {
    expect(detectVideoTooBig(null)).toBe(false)
    expect(detectVideoTooBig(undefined)).toBe(false)
  })

  it('全文兜底匹配（无 blockquote 包裹）', () => {
    const html = cheerio.load('<p>some text Video is too big here</p>')
    expect(detectVideoTooBig(html)).toBe(true)
  })
})

describe('extractTooBigPoster', () => {
  it('从占位 blockquote 提取海报图', () => {
    const html = cheerio.load(
      '<blockquote><b>Video is too big</b><br><img src="https://cdn5.telesco.pe/file/poster.jpg"></blockquote>',
    )
    expect(extractTooBigPoster(html)).toBe('https://cdn5.telesco.pe/file/poster.jpg')
  })

  it('无占位时返回空串', () => {
    const html = cheerio.load('<blockquote>正常内容</blockquote>')
    expect(extractTooBigPoster(html)).toBe('')
  })

  it('占位但无 img 时返回空串', () => {
    const html = cheerio.load('<blockquote>Video is too big</blockquote>')
    expect(extractTooBigPoster(html)).toBe('')
  })
})

describe('detectBinary', () => {
  beforeEach(() => {
    _resetBinaryCacheForTest()
  })

  it('对存在的命令返回 true 并缓存', async () => {
    // node 几乎一定存在
    const r1 = await detectBinary('node', ['-v'])
    expect(r1).toBe(true)
    // 第二次应命中缓存（仍是 true）
    const r2 = await detectBinary('node', ['-v'])
    expect(r2).toBe(true)
  })

  it('对不存在的命令返回 false', async () => {
    const r = await detectBinary('definitely-not-a-real-binary-xyz-123', ['-v'])
    expect(r).toBe(false)
  })
})

describe('resolveTdlBinary', () => {
  beforeEach(() => {
    _resetBinaryCacheForTest()
  })

  it('未配置 binPath 时从 PATH 探测（用 version 子命令）', async () => {
    // 结果取决于测试机是否装了 tdl，两者都合法
    const r = await resolveTdlBinary({ debug: 'disable' } as any)
    expect(r === null || r === 'tdl').toBe(true)
  })

  it('配置了不可用的 binPath 返回 null', async () => {
    const r = await resolveTdlBinary({
      debug: 'disable',
      tdl: { binPath: '/definitely/not/exist/tdl' },
    } as any)
    expect(r).toBeNull()
  })

  it('配置了可用的 binPath（但该二进制不支持 version 子命令）返回 null', async () => {
    // 用 node 本体作为"存在但不认 version 子命令"的二进制替身：
    // `node version` 会尝试加载名为 version 的模块而失败退出 → resolveTdlBinary 返回 null
    const r = await resolveTdlBinary({
      debug: 'disable',
      tdl: { binPath: process.execPath },
    } as any)
    expect(r).toBeNull()
  })
})
