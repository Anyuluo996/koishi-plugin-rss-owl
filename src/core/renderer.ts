import { Context, h } from 'koishi'
import * as cheerio from 'cheerio'
import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { getImageUrl } from '../utils/media'

// 预处理 HTML：下载所有图片并替换为 data URL，避免 Puppeteer 截图时加载外部图片超时
export async function preprocessHtmlImages(
  ctx: Context,
  config: Config,
  $http: any,
  htmlContent: string,
  arg?: rssArg
): Promise<string> {
  const $ = cheerio.load(htmlContent)
  const imgElements = $('img')
  const videoElements = $('video')

  const totalCount = imgElements.length + videoElements.length
  if (totalCount === 0) {
    return htmlContent
  }

  debug(config, `开始预处理 ${imgElements.length} 张图片和 ${videoElements.length} 个视频封面`, 'preprocess', 'info')

  // 使用 Promise.allSettled 而不是 Promise.all，确保单个图片失败不影响其他图片
  const imgResults = await Promise.allSettled(imgElements.map(async (_, i) => {
    const originalSrc = $(i).attr('src')
    if (!originalSrc || originalSrc.startsWith('data:')) {
      return { index: i, success: true, skipped: true }
    }

    try {
      // 使用 useBase64Mode=true 确保返回 data URL，设置 10 秒超时
      const dataUrl = await Promise.race([
        getImageUrl(ctx, config, $http, originalSrc, arg || {}, true),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('图片下载超时')), 10000)
        )
      ])
      if (dataUrl) {
        $(i).attr('src', dataUrl)
        debug(config, `图片替换成功: ${originalSrc.substring(0, 50)}...`, 'preprocess', 'details')
        return { index: i, success: true, src: originalSrc }
      } else {
        debug(config, `图片下载失败，保留原链接: ${originalSrc}`, 'preprocess', 'error')
        return { index: i, success: false, src: originalSrc }
      }
    } catch (error) {
      debug(config, `图片处理失败: ${error}`, 'preprocess', 'error')
      return { index: i, success: false, src: originalSrc }
    }
  }))

  // 统计图片处理结果
  const successCount = imgResults.filter(r => r.status === 'fulfilled' && r.value.success).length
  const failCount = imgResults.length - successCount
  if (failCount > 0) {
    debug(config, `${failCount} 张图片下载失败，将使用原链接`, 'preprocess', 'error')
  }

  // 使用 Promise.allSettled 处理视频封面
  const videoResults = await Promise.allSettled(videoElements.map(async (_, i) => {
    const poster = $(i).attr('poster')
    if (!poster || poster.startsWith('data:')) {
      return { index: i, success: true, skipped: true }
    }

    try {
      // 设置 10 秒超时
      const dataUrl = await Promise.race([
        getImageUrl(ctx, config, $http, poster, arg || {}, true),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('视频封面下载超时')), 10000)
        )
      ])
      if (dataUrl) {
        $(i).attr('poster', dataUrl)
        debug(config, `视频封面替换成功: ${poster.substring(0, 50)}...`, 'preprocess', 'details')
        return { index: i, success: true, src: poster }
      } else {
        debug(config, `视频封面下载失败，保留原链接: ${poster}`, 'preprocess', 'error')
        return { index: i, success: false, src: poster }
      }
    } catch (error) {
      debug(config, `视频封面处理失败: ${error}`, 'preprocess', 'error')
      return { index: i, success: false, src: poster }
    }
  }))

  // 统计视频封面处理结果
  const videoSuccessCount = videoResults.filter(r => r.status === 'fulfilled' && r.value.success).length
  const videoFailCount = videoResults.length - videoSuccessCount
  if (videoFailCount > 0) {
    debug(config, `${videoFailCount} 个视频封面下载失败，将使用原链接`, 'preprocess', 'error')
  }

  return $.html()
}

export async function renderHtml2Image(
  ctx: Context,
  config: Config,
  $http: any,
  htmlContent: string,
  arg?: rssArg
): Promise<any> {
  let page = await ctx.puppeteer.page()
  try {
    debug(config, htmlContent, 'htmlContent', 'details')

    // 预处理：下载所有图片并替换为 data URL，避免加载外部图片超时
    htmlContent = await preprocessHtmlImages(ctx, config, $http, htmlContent, arg)

    // 设置 deviceScaleFactor 以控制截图清晰度（必须在 setContent 之前）
    // 保持 viewport 宽度与 bodyWidth 匹配，避免排版错乱
    const bodyWidth = config.template.bodyWidth || 600
    const bodyPadding = config.template.bodyPadding || 20
    const viewportWidth = bodyWidth + bodyPadding * 2 + 100  // 预留额外空间

    await page.setViewport({
      width: viewportWidth,
      height: 1200,
      deviceScaleFactor: config.template.deviceScaleFactor
    })
    debug(config, `设置截图清晰度: ${config.template.deviceScaleFactor}x, viewport: ${viewportWidth}x1200`, 'deviceScaleFactor', 'info')

    // 拦截视频请求，避免加载视频导致超时
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      // 阻止视频和音频资源加载，只加载图片和样式
      if (req.resourceType() === 'media') {
        req.abort()
      } else {
        req.continue()
      }
    })

    // 使用 domcontentloaded 避免等待视频等慢速资源
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 })

    if (!config.basic.autoSplitImage) {
      const image = await page.screenshot({ type: "png" })
      // assets 模式
      if (config.basic.imageMode === 'assets' && ctx.assets) {
        try {
          // ★★★ 修复点：Buffer 转 Data URL ★★★
          const base64 = `data:image/png;base64,${image.toString('base64')}`
          const url = await ctx.assets.upload(base64, `rss-shot-${Date.now()}.png`)
          debug(config, `HTML截图 Assets 上传成功: ${url}`, 'assets', 'info')
          return h.image(url)
        } catch (error) {
          debug(config, `HTML截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
          // 降级到 base64
        }
      }
      return h.image(image, 'image/png')
    }

    let [height, width, x, y] = await page.evaluate(() => [
      document.body.offsetHeight,
      document.body.offsetWidth,
      parseInt(document.defaultView.getComputedStyle(document.body).marginLeft) || 0,
      parseInt(document.defaultView.getComputedStyle(document.body).marginTop) || 0
    ])

    let size = 10000
    debug(config, [height, width, x, y], 'pptr img size', 'details')
    const split = Math.ceil(height / size)

    if (!split) {
      const image = await page.screenshot({ type: "png", clip: { x, y, width, height } })
      // assets 模式
      if (config.basic.imageMode === 'assets' && ctx.assets) {
        try {
          // ★★★ 修复点：Buffer 转 Data URL ★★★
          const base64 = `data:image/png;base64,${image.toString('base64')}`
          const url = await ctx.assets.upload(base64, `rss-shot-${Date.now()}.png`)
          debug(config, `HTML截图 Assets 上传成功: ${url}`, 'assets', 'info')
          return h.image(url)
        } catch (error) {
          debug(config, `HTML截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
          // 降级到 base64
        }
      }
      return h.image(image, 'image/png')
    }

    debug(config, { height, width, split }, 'split img', 'details')

    const reduceY = (index: number) => Math.floor(height / split * index)
    const reduceHeight = (index: number) => Math.floor(height / split)

    let imgData = await Promise.all(
      Array.from({ length: split }, async (v, i) =>
        await page.screenshot({
          type: "png",
          clip: {
            x,
            y: reduceY(i) + y,
            width,
            height: reduceHeight(i)
          }
        })
      )
    )

    // assets 模式
    if (config.basic.imageMode === 'assets' && ctx.assets) {
      try {
        // ★★★ 修复点：Buffer 数组转 Data URL 数组 ★★★
        const urls = await Promise.all(imgData.map((buf, i) => {
          const base64 = `data:image/png;base64,${buf.toString('base64')}`
          return ctx.assets.upload(base64, `rss-split-${Date.now()}-${i}.png`)
        }))
        debug(config, `切割截图 Assets 上传成功: ${urls.length} 个文件`, 'assets', 'info')
        return urls.map(u => h.image(u)).join("")
      } catch (error) {
        debug(config, `切割截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
        // 降级到 base64
      }
    }

    return imgData.map(i => h.image(i, 'image/png')).join("")

  } finally {
    try { await page.close() } catch (e) { /* 忽略页面已关闭的错误 */ }
  }
}
