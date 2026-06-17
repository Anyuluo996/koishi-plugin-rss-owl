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
  extractTooBigPoster,
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

  const poster = extractTooBigPoster(html)
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
  if (!downloaded) {
    debug(config, `tdl 未取回视频，保持占位现状: ${link}`, 'tg-restore', 'info')
    return false
  }

  const compressResult = await compressVideoIfNeeded(downloaded, config, ffmpegExe)
  if (!compressResult) {
    debug(config, `视频压缩环节返回 null（ffmpeg 缺失或失败），按策略跳过该视频: ${link}`, 'tg-restore', 'info')
    // 清理 tdl 下载目录
    await safeRemoveDir(path.dirname(downloaded))
    return false
  }

  // 把最终产物移动到插件缓存目录，避免被异步发送队列提前清理
  let finalPath = compressResult.path
  try {
    finalPath = await moveToCacheDir(finalPath, config)
  } catch (err: any) {
    debug(config, `视频迁移到缓存目录失败，沿用 tdl 临时路径: ${err?.message || err}`, 'tg-restore', 'error')
    // 沿用临时路径（风险：发送前被清理），但仍尝试发送
  }

  const fileUrl = pathToFileURL(finalPath).href
  debug(config, `Telegram 大视频已恢复，注入 <video src="${fileUrl}">（最终大小 ${(compressResult.finalSize / 1024 / 1024).toFixed(2)} MB）`, 'tg-restore', 'info')

  // 把 "Video is too big" blockquote 替换为真 <video>
  // 保留 poster（若有），便于 usePoster 模式显示封面
  const posterAttr = poster ? ` poster="${escapeAttr(poster)}"` : ''
  const replacement = `<video src="${escapeAttr(fileUrl)}"${posterAttr} controls="controls" style="width:100%"></video>`
  replaceTooBigBlockquotes(html, replacement)

  return true
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
 * 把所有 "Video is too big" blockquote 替换为给定 HTML 字符串。
 */
function replaceTooBigBlockquotes(html: any, replacement: string): void {
  if (!html) return
  try {
    html('blockquote').each((_: any, el: any) => {
      const $el = html(el)
      const text = $el.text() || ''
      if (/video\s+is\s+too\s+big/i.test(text)) {
        $el.replaceWith(replacement)
      }
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
