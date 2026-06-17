/**
 * 视频压缩模块（基于 ffmpeg）
 *
 * 仅在 tdl 下载产物超过阈值时触发，调用 ffmpeg 重新编码以降低体积，
 * 便于通过 OneBot / Telegram 等适配器发送。
 *
 * ffmpeg 路径来源：Koishi 的 ffmpeg 服务（ctx.ffmpeg.executable），
 * 由 koishi-plugin-ffmpeg 插件提供。按用户决策：
 * - ffmpeg 服务缺失 → 整条视频跳过（返回 null），上游按"无视频"处理。
 * - 压缩失败 → 同样返回 null。
 *
 * 所有外部调用使用 execFile（非 shell），参数数组化。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

import { Config } from '../types'
import { debug } from './logger'
import { safeRemoveDir } from './tdl'

const execFileAsync = promisify(execFile)

const DEFAULT_COMPRESS_THRESHOLD_MB = 30
const DEFAULT_CRF = 30
/** ffmpeg 单次压缩超时（ms） */
const COMPRESS_TIMEOUT_MS = 5 * 60 * 1000

export interface CompressVideoResult {
  /** 最终可发送的视频绝对路径（原始或压缩后） */
  path: string
  /** 是否真的执行了压缩 */
  compressed: boolean
  /** 原始字节数 */
  originalSize: number
  /** 最终字节数 */
  finalSize: number
}

/**
 * 读取文件字节数，失败返回 0。
 */
function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

/**
 * 判断是否需要压缩：体积超过阈值即触发。
 *
 * @param config 全局配置
 */
export function shouldCompress(filePath: string, config: Config): boolean {
  const thresholdMB = config.tdl?.compressThreshold ?? config.basic?.maxVideoSize ?? DEFAULT_COMPRESS_THRESHOLD_MB
  const thresholdBytes = thresholdMB * 1024 * 1024
  const size = fileSize(filePath)
  return size > thresholdBytes
}

/**
 * 调用 ffmpeg 压缩单个视频文件。
 *
 * 编码参数：libx264 + CRF(默认30) + veryfast + AAC 96k + faststart
 * 产物落在原文件同目录，文件名加 `.cmp` 后缀，避免覆盖原文件。
 *
 * @param ffmpegExe ffmpeg 可执行路径（来自 ctx.ffmpeg.executable）
 * @returns 压缩成功返回新文件路径；失败返回 null
 */
async function runFfmpegCompress(inputPath: string, config: Config, ffmpegExe: string): Promise<string | null> {
  const crf = clampCrf(config.tdl?.crf ?? DEFAULT_CRF)
  const parsed = path.parse(inputPath)
  const outputPath = path.join(parsed.dir, `${parsed.name}.cmp${parsed.ext}`)

  // 清理可能残留的输出文件
  try { fs.rmSync(outputPath, { force: true }) } catch { /* ignore */ }

  const args = [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    outputPath,
  ]

  debug(config, `调用 ffmpeg 压缩: ${ffmpegExe} ${args.join(' ')}（CRF=${crf}）`, 'compress', 'info')

  try {
    await execFileAsync(ffmpegExe, args, {
      timeout: COMPRESS_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (err: any) {
    debug(config, `ffmpeg 压缩失败: ${err?.message || err}`, 'compress', 'error')
    try { fs.rmSync(outputPath, { force: true }) } catch { /* ignore */ }
    return null
  }

  if (!fs.existsSync(outputPath) || fileSize(outputPath) === 0) {
    debug(config, 'ffmpeg 压缩完成但产物无效（空文件或不存在）', 'compress', 'error')
    try { fs.rmSync(outputPath, { force: true }) } catch { /* ignore */ }
    return null
  }

  return outputPath
}

/**
 * 按需压缩：体积超过阈值则压缩，否则原样返回。
 *
 * 调用方负责在发送完成后清理临时文件（含原始下载目录）。
 *
 * @param ffmpegExe ffmpeg 可执行路径（来自 ctx.ffmpeg.executable）；为空表示无 ffmpeg 服务
 * @returns 成功（压缩或无需压缩）返回结果对象；ffmpeg 缺失/失败导致整条跳过时返回 null
 */
export async function compressVideoIfNeeded(
  inputPath: string,
  config: Config,
  ffmpegExe?: string,
): Promise<CompressVideoResult | null> {
  const originalSize = fileSize(inputPath)
  if (originalSize === 0) {
    debug(config, `待处理的视频文件为空或不存在: ${inputPath}`, 'compress', 'error')
    return null
  }

  if (!shouldCompress(inputPath, config)) {
    debug(config, `视频体积 ${(originalSize / 1024 / 1024).toFixed(2)} MB 未超阈值，无需压缩`, 'compress', 'details')
    return { path: inputPath, compressed: false, originalSize, finalSize: originalSize }
  }

  // ffmpeg 服务未注入 → 按用户策略跳过整条大视频
  if (!ffmpegExe) {
    debug(config, '未注入 Koishi ffmpeg 服务（请安装 koishi-plugin-ffmpeg），按策略跳过整条大视频', 'compress', 'info')
    return null
  }

  const compressedPath = await runFfmpegCompress(inputPath, config, ffmpegExe)
  if (!compressedPath) {
    // 压缩失败 → 按用户策略跳过整条视频
    return null
  }

  const finalSize = fileSize(compressedPath)
  const ratio = originalSize > 0 ? ((1 - finalSize / originalSize) * 100).toFixed(1) : '0'
  debug(
    config,
    `视频压缩完成: ${(originalSize / 1024 / 1024).toFixed(2)} MB -> ${(finalSize / 1024 / 1024).toFixed(2)} MB（节省 ${ratio}%）`,
    'compress',
    'info',
  )

  return { path: compressedPath, compressed: true, originalSize, finalSize }
}

/**
 * 把 CRF 限定到合理区间 [18, 32]。
 *
 * 18 接近视觉无损、体积大；32 体积小但质量下降明显。
 */
function clampCrf(crf: number): number {
  if (!Number.isFinite(crf)) return DEFAULT_CRF
  return Math.min(32, Math.max(18, Math.round(crf)))
}

/**
 * 清理一次 tdl+压缩流程产生的临时文件。
 *
 * - 若 finalPath 与 originalDir 不在同目录（压缩后产物在原目录内），则只需删 originalDir。
 * - 调用方传入 tdl 下载目录与最终发送路径即可。
 */
export async function cleanupTdlArtifacts(downloadDir: string, finalPath?: string): Promise<void> {
  // 删除整个下载目录（压缩产物也在其内）
  await safeRemoveDir(downloadDir)
  // finalPath 无需单独删，因为它就在 downloadDir 内
  void finalPath
}
