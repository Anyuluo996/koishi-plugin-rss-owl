/**
 * Telegram 大视频占位恢复
 *
 * RSSHub 对 Telegram 超大视频会渲染：
 *   <blockquote><b>Video is too big</b><br><img src="...poster..."></blockquote>
 * 此时条目内没有任何 <video> 元素，processVideos() 会静默跳过。
 *
 * 本模块在模板渲染前介入：
 *   1. 检测到 "Video is too big" 占位
 *   2. 从 item.link 解析 Telegram 频道+消息ID
 *   3. 用 tdl 下载原始视频
 *   4. 超阈值则用 ffmpeg 压缩
 *   5. 把产物移动到插件缓存目录（避免发送队列异步消费时被清理）
 *   6. 把占位 blockquote 替换为真正的 <video src="file:///缓存路径">
 *
 * 任何环节失败都静默返回（不抛错、不阻塞），等价于"无视频"现状。
 *
 * 文件生命周期：产物落在 getCacheDir() 下，随 File 模式缓存清理周期
 * （feeder 定时器内 delCache）一起被回收，无需此处单独删。
 */

import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { getCacheDir } from '../utils/media'
import {
  detectVideoTooBig,
  downloadWithTdl,
  extractTooBigPosters,
  parseTelegramLink,
  safeRemoveDir,
} from '../utils/tdl'
import { compressVideoIfNeeded } from '../utils/video-compress'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'

/**
 * 尝试用 tdl 恢复 Telegram 大视频，原地改写 cheerio 文档。
 *
 * 多视频 album 场景：tdl --group 下载全部 N 个视频，按文件名排序与 N 个
 * "Video is too big" blockquote 按位置一一配对：
 *   - 第 i 个 blockquote ← 第 i 个视频（保留各自 poster）
 *   - blockquote 多于视频：多出保留原状（封面图占位）
 *   - 视频多于 blockquote：多出追加到文末
 *
 * @param html cheerio 实例（会被原地修改）
 * @param item RSS 条目（读取 item.link）
 * @param arg 订阅级参数（含代理）
 * @param config 全局配置
 * @param ffmpegExe ffmpeg 可执行路径（来自 ctx.ffmpeg.executable）；为空表示无 ffmpeg 服务
 * @returns 是否成功注入视频（true 表示 html 已被改写）
 */
export async function restoreTelegramVideos(
  html: any,
  item: any,
  arg: rssArg,
  config: Config,
  ffmpegExe?: string,
): Promise<boolean> {
  if (!config.tdl?.enabled) return false
  if (!detectVideoTooBig(html)) return false

  const link = normalizeText(item?.link)
  const linkInfo = parseTelegramLink(link)
  if (!linkInfo) {
    debug(config, `检测到 Video is too big 但 link 非 Telegram 消息链接，跳过: ${link}`, 'tg-restore', 'info')
    return false
  }

  debug(
    config,
    `检测到 Telegram 大视频占位，尝试 tdl 下载: ${link}（channel=${linkInfo.channel}, msgId=${linkInfo.messageId}）`,
    'tg-restore',
    'info',
  )

  const downloaded = await downloadWithTdl({
    config,
    link,
    proxyAgent: arg?.proxyAgent,
  })
  if (!downloaded || downloaded.length === 0) {
    debug(config, `tdl 未取回视频，保持占位现状: ${link}`, 'tg-restore', 'info')
    return false
  }

  // 逐个压缩 + 迁移到缓存目录；失败的跳过，成功的保留
  const finalVideoUrls: string[] = []
  for (const rawPath of downloaded) {
    const compressResult = await compressVideoIfNeeded(rawPath, config, ffmpegExe)
    if (!compressResult) {
      debug(config, `视频压缩环节返回 null（ffmpeg 缺失或失败），跳过该视频: ${rawPath}`, 'tg-restore', 'info')
      continue
    }
    let finalPath = compressResult.path
    try {
      finalPath = await moveToCacheDir(finalPath, config)
    } catch (err: any) {
      debug(config, `视频迁移到缓存目录失败，沿用 tdl 临时路径: ${err?.message || err}`, 'tg-restore', 'error')
    }
    finalVideoUrls.push(pathToFileURL(finalPath).href)
  }

  // 清理 tdl 下载临时目录（产物已迁出或跳过）
  await safeRemoveDir(path.dirname(downloaded[0]))

  if (finalVideoUrls.length === 0) {
    debug(config, `所有视频压缩均失败，保持占位现状: ${link}`, 'tg-restore', 'info')
    return false
  }

  debug(config, `Telegram 大视频已恢复（${finalVideoUrls.length} 个视频），开始按位置配对注入`, 'tg-restore', 'info')

  // 提取所有 too-big blockquote 的 poster（顺序与 blockquote 一致）
  const posters = extractTooBigPosters(html)

  // 配对替换：遍历 too-big blockquote，第 i 个 ← 第 i 个视频
  let videoIdx = 0
  let lastTooBigEl: any = null
  replaceTooBigBlockquotesIndexed(html, (i: number) => {
    if (videoIdx >= finalVideoUrls.length) {
      // 视频已用完，多出的 blockquote 保留原状
      return null
    }
    const url = finalVideoUrls[videoIdx]
    const poster = posters[i] || ''
    videoIdx++
    return buildVideoTag(url, poster)
  }, (el: any) => { lastTooBigEl = el })

  // 视频多于 blockquote：多出的追加到最后一个 too-big blockquote 之后
  while (videoIdx < finalVideoUrls.length) {
    const url = finalVideoUrls[videoIdx]
    const extra = buildVideoTag(url, '')
    if (lastTooBigEl) {
      try {
        html(lastTooBigEl).after(extra)
      } catch {
        // 追加失败则接到 body 末尾
        appendToBody(html, extra)
      }
    } else {
      appendToBody(html, extra)
    }
    videoIdx++
  }

  return true
}

/** 构造一个 <video> 标签字符串 */
function buildVideoTag(fileUrl: string, poster: string): string {
  const posterAttr = poster ? ` poster="${escapeAttr(poster)}"` : ''
  return `<video src="${escapeAttr(fileUrl)}"${posterAttr} controls="controls" style="width:100%"></video>`
}

/** 追加 HTML 到 body 末尾 */
function appendToBody(html: any, content: string): void {
  try {
    html('body').append(content)
  } catch {
    // ignore
  }
}

/**
 * 把文件移动到插件缓存目录（与 File 模式共用），返回新路径。
 *
 * 缓存目录由 getCacheDir 决定，会被 feeder 定时器统一清理。
 */
async function moveToCacheDir(srcPath: string, config: Config): Promise<string> {
  const cacheDir = getCacheDir(config)
  const ext = path.extname(srcPath) || '.mp4'
  const dest = path.join(cacheDir, `tg-tdl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`)

  // 优先尝试 rename（同卷快），失败则复制+删除
  try {
    await fs.promises.rename(srcPath, dest)
    return dest
  } catch {
    await fs.promises.copyFile(srcPath, dest)
    await fs.promises.unlink(srcPath).catch(() => { /* ignore */ })
    return dest
  }
}

/**
 * 遍历所有 "Video is too big" blockquote，按出现顺序逐个调用 builder 决定替换内容。
 *
 * @param builder 接收 blockquote 在 too-big 序列中的索引，返回替换 HTML；返回 null 表示不替换（保留原状）
 * @param onEach  每个被处理的 too-big blockquote 元素回调（用于记录最后一个，便于后续追加）
 */
function replaceTooBigBlockquotesIndexed(
  html: any,
  builder: (index: number) => string | null,
  onEach?: (el: any) => void,
): void {
  if (!html) return
  let tooBigIndex = 0
  try {
    html('blockquote').each((_: any, el: any) => {
      const $el = html(el)
      const text = $el.text() || ''
      if (!/video\s+is\s+too\s+big/i.test(text)) return

      const replacement = builder(tooBigIndex)
      onEach?.(el)
      if (replacement !== null) {
        $el.replaceWith(replacement)
      }
      tooBigIndex++
    })
  } catch {
    // ignore
  }
}

function escapeAttr(s: string): string {
  return String(s || '').replace(/"/g, '&quot;')
}

function normalizeText(v: unknown): string {
  if (Array.isArray(v)) return v.join('')
  if (v === undefined || v === null) return ''
  return String(v)
}
