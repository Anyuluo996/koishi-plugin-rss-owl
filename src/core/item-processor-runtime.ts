import * as cheerio from 'cheerio'
import { Context, h } from 'koishi'
import { marked } from 'marked'

import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { getImageUrl, getVideoUrl, puppeteerToFile } from '../utils/media'
import { preprocessHtmlImages, renderHtml2Image } from './renderer'

export interface ItemProcessorRuntimeDeps {
  ctx: Context
  config: Config
  $http: any
}

interface RenderDescriptionOptions {
  contentStyle?: string
  dividerStyle?: string
  logImageMode?: boolean
}

function isImageRenderEnabled(config: Config): boolean {
  return config.basic?.imageMode === 'base64'
    || config.basic?.imageMode === 'File'
    || config.basic?.imageMode === 'assets'
}

function collectUniqueImageSources(html: cheerio.CheerioAPI): string[] {
  const imageSources: string[] = []
  html('img').each((_: any, element: any) => {
    const src = element.attribs?.src
    if (src) imageSources.push(src)
  })
  return [...new Set(imageSources)]
}

async function prependAiSummarySection(
  config: Config,
  htmlContent: string,
  item: any,
  options?: Omit<RenderDescriptionOptions, 'logImageMode'>,
): Promise<string> {
  const aiSummary = normalizeText(item?.aiSummary).trim()
  if (!aiSummary || !isImageRenderEnabled(config)) return htmlContent

  const aiSummaryHtml = await marked(aiSummary)
  const contentStyleAttr = options?.contentStyle ? ` style="${options.contentStyle}"` : ''
  const dividerAttr = options?.dividerStyle
    ? ` style="${options.dividerStyle}"`
    : ' class="border-t border-slate-100 my-6"'

  return `
      <div class="ai-summary-section mb-6">
        <div class="flex items-start gap-3 mb-3">
          <div class="mt-0.5 w-6 h-6 rounded-md bg-primary/10 flex flex-shrink-0 items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-primary">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <h3 class="text-sm font-bold text-slate-700">AI 摘要</h3>
        </div>
        <div class="pl-9 prose prose-slate prose-sm max-w-none"${contentStyleAttr}>
          ${aiSummaryHtml}
        </div>
      </div>
      <div${dividerAttr}></div>
    ` + htmlContent
}

async function prepareHtmlForRender(
  deps: ItemProcessorRuntimeDeps,
  html: cheerio.CheerioAPI,
  arg: rssArg,
  useXml = false,
): Promise<string> {
  if (arg?.proxyAgent?.enabled) {
    await Promise.all(html('img').map(async (_: any, element: any) => {
      const src = element.attribs?.src
      if (!src) return
      element.attribs.src = await getImageUrl(deps.ctx, deps.config, deps.$http, src, arg, true)
    }).get())
  }

  html('img').attr('style', 'object-fit:scale-down;max-width:100%;height:auto;')
  return useXml ? html.xml() : html.html()
}

/**
 * 标准化 RSS 字段内容，统一数组 / 空值 / 非字符串输入。
 */
export function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.join('')
  if (value === undefined || value === null) return ''
  return String(value)
}

/**
 * 解析并去重 HTML 中的图片资源，返回原图到最终地址的映射表。
 */
export async function buildResolvedImageMap(
  deps: ItemProcessorRuntimeDeps,
  html: cheerio.CheerioAPI,
  arg: rssArg,
): Promise<Record<string, string>> {
  const imageSources = collectUniqueImageSources(html)
  return Object.assign(
    {},
    ...(await Promise.all(imageSources.map(async (src) => ({
      [src]: await getImageUrl(deps.ctx, deps.config, deps.$http, src, arg),
    })))),
  )
}

/**
 * 将 HTML 中的唯一图片列表解析为消息图片串。
 */
export async function renderImageListFromHtml(
  deps: ItemProcessorRuntimeDeps,
  html: cheerio.CheerioAPI,
  arg: rssArg,
): Promise<string> {
  const imageSources = collectUniqueImageSources(html)
  const resolvedImages = await Promise.all(
    imageSources.map(async (src) => await getImageUrl(deps.ctx, deps.config, deps.$http, src, arg)),
  )

  return resolvedImages
    .filter(Boolean)
    .map(imageUrl => `<img src="${imageUrl}"/>`)
    .join('')
}

/**
 * 将已加载的 HTML 内容渲染为最终消息。
 */
export async function renderLoadedHtml(
  deps: ItemProcessorRuntimeDeps,
  html: cheerio.CheerioAPI,
  arg: rssArg,
  useXml = false,
): Promise<string> {
  const htmlContent = await prepareHtmlForRender(deps, html, arg, useXml)
  return await renderImage(htmlContent, deps, arg)
}

/**
 * 渲染模板描述正文，并在图片模式下按需注入 AI 摘要。
 */
export async function renderTemplatedDescription(
  deps: ItemProcessorRuntimeDeps,
  item: any,
  arg: rssArg,
  description: string,
  options?: RenderDescriptionOptions,
): Promise<string> {
  item.description = description
  debug(deps.config, item.description, 'description')

  item.description = await prependAiSummarySection(deps.config, item.description, item, {
    contentStyle: options?.contentStyle,
    dividerStyle: options?.dividerStyle,
  })

  const html = cheerio.load(item.description)
  if (options?.logImageMode) {
    debug(deps.config, `当前 imageMode: ${deps.config.basic?.imageMode}`, 'imageMode', 'info')
  }

  return await renderLoadedHtml(deps, html, arg)
}

/**
 * 提取 HTML 中的视频资源，并按配置补齐 poster 图。
 *
 * 视频的发送方式由 config.basic.videoMode 决定（assets/File/base64/href/filter）。
 * 仅在 videoMode === 'base64' 时强制内联 base64；其它模式交给 getVideoUrl 内部
 * 按 videoMode 走 file:// / assets / href / filter 分支。
 * （历史代码曾对所有视频硬编码 useBase64Mode=true，导致 videoMode 配置失效。）
 */
export async function processVideos(
  deps: ItemProcessorRuntimeDeps,
  html: cheerio.CheerioAPI,
  arg: rssArg,
  videoList: Array<[string, string]>,
): Promise<void> {
  const videoMode = deps.config.basic?.videoMode
  const useVideoBase64 = videoMode === 'base64'
  await Promise.all(html('video').map(async (_: any, element: any) => {
    videoList.push([
      await getVideoUrl(deps.ctx, deps.config, deps.$http, element.attribs.src, arg, useVideoBase64, element),
      (element.attribs.poster && deps.config.basic?.usePoster)
        ? await getImageUrl(deps.ctx, deps.config, deps.$http, element.attribs.poster, arg, true)
        : '',
    ])
  }).get())
}

/**
 * 将视频列表格式化为最终消息片段。
 */
export function formatVideoList(videoList: Array<[string, string]>): string {
  return videoList.filter(([src]) => src).map(([src, poster]) => {
    if (src.startsWith('__VIDEO_LINK__:')) {
      const videoUrl = src.replace('__VIDEO_LINK__:', '')
      return `\n🎬 视频: ${videoUrl}\n`
    }
    return h('video', { src, poster })
  }).join('')
}

/**
 * 统一执行图片渲染，兼容 base64 / File / assets / HTML 回退。
 */
export async function renderImage(
  htmlContent: string,
  deps: ItemProcessorRuntimeDeps,
  arg: rssArg,
): Promise<string> {
  const imageMode = deps.config.basic?.imageMode

  if (imageMode === 'base64') {
    debug(deps.config, '使用 base64 模式渲染', 'render mode', 'info')
    return (await renderHtml2Image(deps.ctx, deps.config, deps.$http, htmlContent, arg)).toString()
  }

  if (imageMode === 'File' || imageMode === 'assets') {
    if (!deps.ctx.puppeteer) {
      debug(deps.config, '未安装 puppeteer 插件，跳过图片渲染', 'puppeteer error', 'error')
      return htmlContent
    }

    try {
      debug(deps.config, `使用 ${imageMode} 模式渲染`, 'render mode', 'info')
      const processedHtml = await preprocessHtmlImages(deps.ctx, deps.config, deps.$http, htmlContent, arg)

      let msg: string
      if ((deps.config.template?.deviceScaleFactor ?? 1) !== 1) {
        msg = (await renderHtml2Image(deps.ctx, deps.config, deps.$http, processedHtml, arg)).toString()
      } else {
        msg = await deps.ctx.puppeteer.render(processedHtml)
      }

      msg = await puppeteerToFile(deps.ctx, deps.config, msg)
      debug(deps.config, 'puppeteer 渲染完成', 'render success', 'info')
      return msg
    } catch (error) {
      debug(deps.config, `puppeteer render 失败: ${error}`, 'puppeteer error', 'error')
      return htmlContent
    }
  }

  debug(deps.config, `未知的 imageMode: ${imageMode}，回退到 HTML`, 'render warning', 'error')
  return htmlContent
}