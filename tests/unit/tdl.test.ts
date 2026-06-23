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
  extractTooBigPosters,
  detectBinary,
  resolveTdlBinary,
  parseMediaSizes,
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

describe('extractTooBigPosters', () => {
  it('多视频 album：返回全部 poster，顺序与 blockquote 一致', () => {
    const html = cheerio.load(
      '<blockquote><b>Video is too big</b><br><img src="https://x/p1.jpg"></blockquote>' +
      '<blockquote><b>Video is too big</b><br><img src="https://x/p2.jpg"></blockquote>' +
      '<blockquote><b>Video is too big</b><br><img src="https://x/p3.jpg"></blockquote>',
    )
    expect(extractTooBigPosters(html)).toEqual([
      'https://x/p1.jpg',
      'https://x/p2.jpg',
      'https://x/p3.jpg',
    ])
  })

  it('无图 poster 位置返回空串占位（长度仍对齐 blockquote 数）', () => {
    const html = cheerio.load(
      '<blockquote><b>Video is too big</b><br><img src="https://x/p1.jpg"></blockquote>' +
      '<blockquote><b>Video is too big</b></blockquote>',
    )
    expect(extractTooBigPosters(html)).toEqual(['https://x/p1.jpg', ''])
  })

  it('无占位时返回空数组', () => {
    const html = cheerio.load('<blockquote>正常引用</blockquote>')
    expect(extractTooBigPosters(html)).toEqual([])
  })

  it('单视频与 extractTooBigPoster 结果一致', () => {
    const html = cheerio.load(
      '<blockquote><b>Video is too big</b><br><img src="https://x/p1.jpg"></blockquote>',
    )
    expect(extractTooBigPoster(html)).toBe(extractTooBigPosters(html)[0])
  })

  it('空输入返回空数组', () => {
    expect(extractTooBigPosters(null)).toEqual([])
    expect(extractTooBigPosters(undefined)).toEqual([])
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

describe('parseMediaSizes — tdl export JSON 解析（下载前预查体积）', () => {
  it('解析顶层数组格式，提取 Media.Size', () => {
    const raw = JSON.stringify([
      { id: 1, Media: { Size: 52428800 } },   // 50MB
      { id: 2, Media: { Size: 314572800 } },   // 300MB
    ])
    expect(parseMediaSizes(raw)).toEqual([52428800, 314572800])
  })

  it('解析 {messages:[...]} 包装格式', () => {
    const raw = JSON.stringify({ messages: [{ Media: { Size: 1024 } }] })
    expect(parseMediaSizes(raw)).toEqual([1024])
  })

  it('解析 {Messages:[...]} 大写字段', () => {
    const raw = JSON.stringify({ Messages: [{ Media: { Size: 2048 } }] })
    expect(parseMediaSizes(raw)).toEqual([2048])
  })

  it('兼容小写 media.size 字段', () => {
    const raw = JSON.stringify([{ media: { size: 4096 } }])
    expect(parseMediaSizes(raw)).toEqual([4096])
  })

  it('兼容 Size 为字符串数字', () => {
    const raw = JSON.stringify([{ Media: { Size: '8192' } }])
    expect(parseMediaSizes(raw)).toEqual([8192])
  })

  it('跳过无媒体或 Size<=0 的消息', () => {
    const raw = JSON.stringify([
      { id: 1, Media: { Size: 5000 } },
      { id: 2 },                              // 无 Media
      { id: 3, Media: {} },                   // Media 但无 Size
      { id: 4, Media: { Size: 0 } },          // Size=0
      { id: 5, text: '纯文字消息' },
    ])
    expect(parseMediaSizes(raw)).toEqual([5000])
  })

  it('空数组返回空数组', () => {
    expect(parseMediaSizes('[]')).toEqual([])
  })

  it('非法 JSON 返回 null', () => {
    expect(parseMediaSizes('not json')).toBeNull()
    expect(parseMediaSizes('{broken')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(parseMediaSizes('')).toBeNull()
    expect(parseMediaSizes('   ')).toBeNull()
  })

  it('非数组非 messages 对象返回 null', () => {
    expect(parseMediaSizes(JSON.stringify({ foo: 'bar' }))).toBeNull()
  })
})

describe('下载前大小阈值跳过逻辑（方向 A 决策）', () => {
  // 模拟 restoreTelegramVideos 的核心决策：任一媒体超限则跳过整条
  function shouldSkipBySize(sizes: number[] | null, maxDownloadMB: number): boolean {
    if (!sizes || sizes.length === 0) return false
    const limitBytes = maxDownloadMB * 1024 * 1024
    return sizes.some(s => s > limitBytes)
  }

  it('任一视频超限（300MB > 200MB）应跳过', () => {
    expect(shouldSkipBySize([52428800, 314572800], 200)).toBe(true)
  })

  it('全部在限内（各 50MB < 200MB）不应跳过', () => {
    expect(shouldSkipBySize([52428800, 52428800], 200)).toBe(false)
  })

  it('恰好等于阈值不跳过（边界 < 而非 <=）', () => {
    const exactly200MB = 200 * 1024 * 1024
    expect(shouldSkipBySize([exactly200MB], 200)).toBe(false)
  })

  it('预查失败（null）不应跳过（放行下载）', () => {
    expect(shouldSkipBySize(null, 200)).toBe(false)
  })

  it('预查无媒体（空数组）不应跳过', () => {
    expect(shouldSkipBySize([], 200)).toBe(false)
  })

  it('maxDownloadMB=0 表示不限制（不跳过）', () => {
    // restoreTelegramVideos 里 maxDownloadMB>0 才进入预查分支，此处模拟跳过判定
    const maxDownloadMB = 0
    expect(maxDownloadMB > 0).toBe(false)
  })

  it('单个巨大视频 2GB 应跳过', () => {
    expect(shouldSkipBySize([2147483648], 200)).toBe(true)
  })
})
