import { Context, h } from 'koishi'
import * as cheerio from 'cheerio'
import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { getImageUrl } from '../utils/media'

export interface RenderContentMetrics {
  bodyScrollHeight: number
  bodyOffsetHeight: number
  documentScrollHeight: number
  contentRangeHeight: number
  maxElementBottom: number
  paddingTop: number
  paddingBottom: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  bodyWidth: number
  viewportHeight: number
}

export function calculateContentHeight(metrics: RenderContentMetrics): number {
  const intrinsicHeight = Math.ceil(
    Math.max(metrics.contentRangeHeight, metrics.maxElementBottom, 0)
    + metrics.paddingTop
    + metrics.paddingBottom
    + metrics.marginTop
    + metrics.marginBottom
  )
  const domMeasuredHeight = Math.max(
    metrics.bodyScrollHeight,
    metrics.bodyOffsetHeight,
    metrics.documentScrollHeight,
    0
  )

  if (intrinsicHeight > 0) {
    if (domMeasuredHeight > intrinsicHeight && domMeasuredHeight - intrinsicHeight <= 64) {
      return Math.max(domMeasuredHeight, 100)
    }
    return Math.max(intrinsicHeight, 100)
  }

  if (metrics.viewportHeight > 0 && domMeasuredHeight >= metrics.viewportHeight) {
    return 100
  }

  return Math.max(domMeasuredHeight, 100)
}

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
  const page = await ctx.puppeteer.page()
  try {
    debug(config, htmlContent, 'htmlContent', 'details')
    const initialViewportHeight = 2000

    // 预处理：下载所有图片并替换为 data URL，避免加载外部图片超时
    htmlContent = await preprocessHtmlImages(ctx, config, $http, htmlContent, arg)

    // 设置 deviceScaleFactor 以控制截图清晰度（必须在 setContent 之前）
    // 保持 viewport 宽度与 bodyWidth 匹配，避免排版错乱
    // 优先使用 arg 参数，其次使用全局配置
    const bodyWidth = arg?.bodyWidth ?? config.template.bodyWidth ?? 600
    const bodyPadding = arg?.bodyPadding ?? config.template.bodyPadding ?? 20
    const viewportWidth = bodyWidth + bodyPadding * 2 + 100  // 预留额外空间

    // 先用较大的初始 viewport 加载页面（高度设大一些确保内容能完整渲染）
    await page.setViewport({
      width: viewportWidth,
      height: initialViewportHeight,
      deviceScaleFactor: config.template.deviceScaleFactor
    })
    debug(config, `设置截图清晰度: ${config.template.deviceScaleFactor}x, 初始 viewport: ${viewportWidth}x${initialViewportHeight}`, 'deviceScaleFactor', 'info')

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

    // 等待一小段时间让 CSS 和内容完全渲染
    await new Promise(resolve => setTimeout(resolve, 500))

    // 获取实际内容尺寸，根据渲染内容边界动态调整 viewport
    let contentMetrics: RenderContentMetrics = {
      bodyScrollHeight: 0,
      bodyOffsetHeight: 0,
      documentScrollHeight: 0,
      contentRangeHeight: 0,
      maxElementBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      bodyWidth: 0,
      viewportHeight: initialViewportHeight,
    }
    try {
      contentMetrics = await page.evaluate(() => {
        const body = document.body
        const documentElement = document.documentElement
        if (!body || !documentElement) {
          return {
            bodyScrollHeight: 0,
            bodyOffsetHeight: 0,
            documentScrollHeight: 0,
            contentRangeHeight: 0,
            maxElementBottom: 0,
            paddingTop: 0,
            paddingBottom: 0,
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            bodyWidth: 0,
            viewportHeight: window.innerHeight || 0,
          }
        }

        const computedStyle = document.defaultView?.getComputedStyle(body)
        const bodyRect = body.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(body)
        const rangeRect = range.getBoundingClientRect()
        const maxElementBottom = Array.from(body.querySelectorAll('*')).reduce((max, element) => {
          const rect = element.getBoundingClientRect()
          return Math.max(max, rect.bottom - bodyRect.top)
        }, 0)

        return {
          bodyScrollHeight: body.scrollHeight || 0,
          bodyOffsetHeight: body.offsetHeight || 0,
          documentScrollHeight: documentElement.scrollHeight || 0,
          contentRangeHeight: Math.ceil(rangeRect.height || 0),
          maxElementBottom: Math.ceil(maxElementBottom),
          paddingTop: parseFloat(computedStyle?.paddingTop || '0') || 0,
          paddingBottom: parseFloat(computedStyle?.paddingBottom || '0') || 0,
          marginTop: parseFloat(computedStyle?.marginTop || '0') || 0,
          marginBottom: parseFloat(computedStyle?.marginBottom || '0') || 0,
          marginLeft: parseFloat(computedStyle?.marginLeft || '0') || 0,
          bodyWidth: Math.ceil(body.offsetWidth || bodyRect.width || 0),
          viewportHeight: window.innerHeight || 0,
        }
      })
    } catch (e) {
      debug(config, `获取内容尺寸失败: ${e}`, 'height error', 'error')
    }

    const actualHeight = calculateContentHeight(contentMetrics)
    const viewportHeight = Math.max(actualHeight, 100)
    const clipWidth = Math.max(contentMetrics.bodyWidth || bodyWidth, 1)
    const clipX = Math.max(Math.floor(contentMetrics.marginLeft), 0)
    const clipY = Math.max(Math.floor(contentMetrics.marginTop), 0)

    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: config.template.deviceScaleFactor
    })
    debug(config, `根据内容高度动态设置 viewport: ${viewportWidth}x${viewportHeight}`, 'deviceScaleFactor', 'info')

    if (!config.basic.autoSplitImage) {
      // 使用 fullPage: true 让截图高度自适应实际内容
      const image = await page.screenshot({ type: "png", fullPage: true })
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

    let height = actualHeight
    const width = clipWidth
    const x = clipX
    const y = clipY

    // 保守处理：如果高度异常，使用更小的值
    if (height > 5000) {
      debug(config, `检测到异常高度 ${height}，进行裁剪`, 'height warn', 'info')
      height = Math.min(height, 2000)
    }

    const size = 10000
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
    // 最后一份使用完整高度减去前面所有份的高度，确保覆盖全部内容
    const reduceHeight = (index: number) => index === split - 1 ? height - reduceY(index) : Math.floor(height / split)

    const imgData = await Promise.all(
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
    try { await page.close() } catch { /* 忽略页面已关闭的错误 */ }
  }
}
