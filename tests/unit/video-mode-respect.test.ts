/**
 * videoMode 配置尊重回归测试
 *
 * 验证 processVideos 不再硬编码 useBase64Mode=true：
 *  - videoMode === 'base64' 时才内联 base64
 *  - videoMode === 'assets' / 'File' 时 getVideoUrl 内部按模式走对应分支
 *  - 图片链路（getImageUrl）的 useBase64Mode 不受影响（puppeteer 截图必须内联）
 */

import { describe, it, expect, jest } from '@jest/globals'
import * as cheerio from 'cheerio'
import { processVideos } from '../../src/core/item-processor-runtime'

// Mock getVideoUrl / getImageUrl，仅记录被传入的 useBase64Mode 参数
jest.mock('../../src/utils/media', () => ({
  getVideoUrl: jest.fn(async (_ctx, _config, _http, _url, _arg, useBase64Mode) =>
    `VIDEO_BASE64=${useBase64Mode}`),
  getImageUrl: jest.fn(async (_ctx, _config, _http, _url, _arg, useBase64Mode) =>
    `IMG_BASE64=${useBase64Mode}`),
  writeCacheFile: jest.fn(async () => 'file:///mock'),
  getCacheDir: jest.fn(() => '/tmp/cache'),
  delCache: jest.fn(async () => {}),
}))

// 屏蔽 renderer 内部依赖
jest.mock('../../src/core/renderer', () => ({
  preprocessHtmlImages: jest.fn(async (_c, _cfg, _h, html) => html),
  renderHtml2Image: jest.fn(async () => ''),
}))

const { getVideoUrl } = require('../../src/utils/media')

function makeDeps(videoMode: string) {
  return {
    ctx: { assets: { upload: async () => 'assets://mock' } } as any,
    config: { basic: { videoMode, usePoster: false } } as any,
    $http: (async () => ({ data: Buffer.alloc(0) })) as any,
  }
}

describe('processVideos — videoMode 配置尊重', () => {
  it('videoMode=base64 时 getVideoUrl 收到 useBase64Mode=true', async () => {
    const html = cheerio.load('<video src="https://x.com/v.mp4"></video>')
    ;(getVideoUrl as jest.Mock).mockClear()
    await processVideos(makeDeps('base64'), html, {} as any, [])
    expect((getVideoUrl as jest.Mock).mock.calls[0][5]).toBe(true)
  })

  it('videoMode=assets 时 getVideoUrl 收到 useBase64Mode=false', async () => {
    const html = cheerio.load('<video src="https://x.com/v.mp4"></video>')
    ;(getVideoUrl as jest.Mock).mockClear()
    await processVideos(makeDeps('assets'), html, {} as any, [])
    expect((getVideoUrl as jest.Mock).mock.calls[0][5]).toBe(false)
  })

  it('videoMode=File 时 getVideoUrl 收到 useBase64Mode=false', async () => {
    const html = cheerio.load('<video src="https://x.com/v.mp4"></video>')
    ;(getVideoUrl as jest.Mock).mockClear()
    await processVideos(makeDeps('File'), html, {} as any, [])
    expect((getVideoUrl as jest.Mock).mock.calls[0][5]).toBe(false)
  })

  it('videoMode=href 时 getVideoUrl 收到 useBase64Mode=false（href 在 getVideoUrl 内部前置 return）', async () => {
    const html = cheerio.load('<video src="https://x.com/v.mp4"></video>')
    ;(getVideoUrl as jest.Mock).mockClear()
    await processVideos(makeDeps('href'), html, {} as any, [])
    expect((getVideoUrl as jest.Mock).mock.calls[0][5]).toBe(false)
  })

  it('videoMode=filter 时 getVideoUrl 收到 useBase64Mode=false', async () => {
    const html = cheerio.load('<video src="https://x.com/v.mp4"></video>')
    ;(getVideoUrl as jest.Mock).mockClear()
    await processVideos(makeDeps('filter'), html, {} as any, [])
    expect((getVideoUrl as jest.Mock).mock.calls[0][5]).toBe(false)
  })
})
