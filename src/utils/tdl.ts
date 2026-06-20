/**
 * tdl (Telegram Downloader) 集成模块
 *
 * tdl 是 iyear/tdl 提供的 Go 编写独立 CLI 工具，**不是 npm 包**。
 * 当 RSSHub 对 Telegram 超大视频返回 "Video is too big" 占位 blockquote 时，
 * 通过 tdl 直接从 Telegram 拉取原始视频，再由 video-compress 模块按需压缩。
 *
 * 设计原则：
 * - 所有外部调用都用 execFile（非 shell），参数数组化，避免注入。
 * - 任何失败都返回 null 并打 debug 日志，**绝不抛错、绝不阻塞主流程**。
 * - 二进制缺失走同一返回路径，上层无感知。
 */

import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

import { Config, proxyAgent } from '../types'
import { debug } from './logger'

const execFileAsync = promisify(execFile)

/** 进程内二进制探测结果缓存，避免每条 RSS 都 fork 探测 */
const binaryCache: Record<string, boolean> = {}

/**
 * 运行一个子进程，超时时强制杀死整个进程组。
 *
 * tdl 用 bolt 存储，进程被 SIGTERM 后有时不释放文件锁，导致后续所有 tdl
 * 调用报 "Current database is used by another process"。本函数用 detached
 * 模式 + 进程组 kill（POSIX：负 PID；Windows：taskkill /T）确保连子进程
 * 一起清理，不残留锁。
 *
 * @returns 进程正常结束返回 { stdout, stderr }
 * @throws 超时（会先强杀）、非 0 退出、启动失败
 */
export function runWithForcedKill(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; windowsHide?: boolean },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      detached: true,           // 新建进程组，便于整组 kill
      windowsHide: opts.windowsHide ?? true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const cleanup = () => {
      if (timer) { clearTimeout(timer); timer = null }
    }

    const forceKill = () => {
      try {
        if (child.pid == null) return
        if (process.platform === 'win32') {
          // Windows: taskkill /T /F 杀进程树
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        } else {
          // POSIX: 负 PID 杀整个进程组
          try { process.kill(-child.pid, 'SIGKILL') } catch {
            try { child.kill('SIGKILL') } catch { /* ignore */ }
          }
        }
      } catch {
        // ignore
      }
    }

    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`exit code ${code}${stderr ? ': ' + stderr.trim() : ''}`))
    })

    timer = setTimeout(() => {
      // 超时：先强杀整个进程组，再 reject
      forceKill()
      // 给系统一点时间回收进程，再 resolve reject
      setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`timeout after ${opts.timeoutMs}ms`))
        }
      }, 200)
    }, opts.timeoutMs)
  })
}

/**
 * 探测某个可执行文件是否存在于 PATH 中。
 *
 * @param name 二进制名称，如 'tdl' / 'ffmpeg'
 * @param testArgs 用于触发版本输出的参数，如 ['-v'] / ['-version']
 * @returns 存在返回 true，否则 false
 */
export async function detectBinary(name: string, testArgs: string[] = ['-v']): Promise<boolean> {
  if (binaryCache[name] !== undefined) return binaryCache[name]
  try {
    await execFileAsync(name, testArgs, { timeout: 10000, windowsHide: true })
    binaryCache[name] = true
    return true
  } catch {
    binaryCache[name] = false
    return false
  }
}

/**
 * 探测 tdl 是否可用：优先用配置的 binPath，否则从 PATH 探测。
 *
 * 注意：tdl 的版本命令是 `tdl version`（子命令），不是 `-v`，
 * 错误的 flag 会让探测误判为不存在。
 *
 * @param config 全局配置（读取 config.tdl.binPath）
 * @returns 可用的 tdl 可执行路径；不可用返回 null
 */
export async function resolveTdlBinary(config: Config): Promise<string | null> {
  // 1. 配置了显式路径，直接用它（不做 PATH 探测，但校验可执行）
  const configured = config.tdl?.binPath
  if (configured) {
    try {
      await execFileAsync(configured, ['version'], { timeout: 10000, windowsHide: true })
      return configured
    } catch {
      debug(config, `配置的 tdl.binPath 不可用: ${configured}`, 'tdl', 'error')
      return null
    }
  }

  // 2. PATH 探测（tdl 用 version 子命令而非 -v flag）
  const ok = await detectBinary('tdl', ['version'])
  return ok ? 'tdl' : null
}

/** 重置二进制缓存（仅测试用） */
export function _resetBinaryCacheForTest(): void {
  for (const k of Object.keys(binaryCache)) delete binaryCache[k]
}

export interface TelegramLinkInfo {
  /** 频道用户名或数字 ID（不带 -100 前缀） */
  channel: string
  /** 频道内消息 ID */
  messageId: number
}

/**
 * 从 Telegram 链接中解析频道与消息 ID。
 *
 * 支持形态：
 *   https://t.me/anyul996/28          -> { channel: 'anyul996', messageId: 28 }
 *   https://t.me/c/1234567890/28       -> { channel: 'c/1234567890', messageId: 28 }
 *   t.me/anyul996/28                   -> 同上
 *
 * @param link 原始链接
 * @returns 解析失败或非 Telegram 链接返回 null
 */
export function parseTelegramLink(link: string): TelegramLinkInfo | null {
  if (!link || typeof link !== 'string') return null
  const trimmed = link.trim()

  // t.me/<channel>/<msgId>，协议可选
  // 私有频道形如 t.me/c/1234567890/28，保留 c/<id> 段以便 tdl 直接消费
  const match = trimmed.match(/^(?:https?:\/\/)?t\.me\/(c\/\d+|[A-Za-z0-9_]+)\/(\d+)\/?$/i)
  if (!match) return null

  const messageId = parseInt(match[2], 10)
  if (!Number.isFinite(messageId) || messageId <= 0) return null

  return { channel: match[1], messageId }
}

/** "Video is too big" 占位文本的匹配正则（大小写不敏感） */
const VIDEO_TOO_BIG_PATTERN = /video\s+is\s+too\s+big/i

/**
 * 检测 cheerio 文档中是否包含 Telegram 大视频占位符。
 *
 * RSSHub 对超大视频会渲染 `<blockquote><b>Video is too big</b><br><img.../></blockquote>`，
 * 这里识别 blockquote 内是否含该文本。同时兜底检查全文，兼容个别 RSSHub 版本不包 blockquote 的情况。
 *
 * @param html cheerio 实例
 * @returns 命中返回 true
 */
export function detectVideoTooBig(html: any): boolean {
  if (!html) return false
  try {
    // 优先在 blockquote 内查找
    let hit = false
    html('blockquote').each((_: any, el: any) => {
      if (hit) return
      const text = html(el).text() || ''
      if (VIDEO_TOO_BIG_PATTERN.test(text)) hit = true
    })
    if (hit) return true

    // 兜底：全文（极少数 RSSHub 版本不包 blockquote）
    const fullText = html('body').text() || html.root().text() || ''
    return VIDEO_TOO_BIG_PATTERN.test(fullText)
  } catch {
    return false
  }
}

/**
 * 从 cheerio 文档里提取 "Video is too big" 占位 blockquote 内的海报图地址。
 *
 * 多视频 album 时，返回**第一个**匹配 blockquote 的 poster（向后兼容）。
 * 如需全部，用 extractTooBigPosters。
 *
 * @param html cheerio 实例
 * @returns 找到则返回图片 URL，否则空串
 */
export function extractTooBigPoster(html: any): string {
  return extractTooBigPosters(html)[0] || ''
}

/**
 * 提取所有 "Video is too big" 占位 blockquote 的海报图地址，按文档出现顺序返回。
 *
 * 多视频 album 场景：3 个 blockquote 各带一张 poster，
 * 返回顺序与 blockquote 顺序一致，用于按位置配对注入视频。
 *
 * @param html cheerio 实例
 * @returns poster URL 数组（无图位置返回空串占位，长度 = too-big blockquote 数）
 */
export function extractTooBigPosters(html: any): string[] {
  if (!html) return []
  const posters: string[] = []
  try {
    html('blockquote').each((_: any, el: any) => {
      const $el = html(el)
      const text = $el.text() || ''
      if (VIDEO_TOO_BIG_PATTERN.test(text)) {
        const img = $el.find('img').first().attr('src') || ''
        posters.push(img)
      }
    })
  } catch {
    return []
  }
  return posters
}

export interface DownloadWithTdlOptions {
  config: Config
  /** Telegram 消息链接，如 https://t.me/anyul996/28 */
  link: string
  /** 订阅级代理配置，启用且 config.tdl.proxyByEnv!=false 时透传给子进程 */
  proxyAgent?: proxyAgent
  /** 下载超时秒数（默认取 config.tdl.timeout 或 180） */
  timeoutSeconds?: number
  /** 工作目录（默认系统临时目录下随机子目录） */
  workDir?: string
}

/**
 * 调用 tdl 下载 Telegram 消息的视频（支持多视频 album）。
 *
 * 命令形态：`tdl [--storage ...] [--proxy ...] dl -u <link> -d <tmpDir> --group`
 * （全局 flag 必须在子命令 dl 之前；--group 自动检测相册/分组消息，下载全部媒体；
 *  对单视频无副作用——自动检测到 1 项）
 *
 * 代理与会话解析优先级：
 * - `--proxy`：config.tdl.proxy（专用）→ 订阅级代理（proxyByEnv != false）
 * - `--storage`：config.tdl.storage（登录与下载必须一致，否则找不到会话）
 *
 * @returns 成功返回视频绝对路径数组（按文件名排序 = 专辑顺序）；二进制缺失/未登录/超时/无产物时返回 null
 */
export async function downloadWithTdl(opts: DownloadWithTdlOptions): Promise<string[] | null> {
  const { config, link, proxyAgent } = opts
  const timeoutSeconds = opts.timeoutSeconds ?? config.tdl?.timeout ?? 180

  // 1. 解析 tdl 二进制（优先 binPath，否则 PATH 探测，用 version 子命令）
  const tdlBin = await resolveTdlBinary(config)
  if (!tdlBin) {
    debug(config, '未检测到可用的 tdl，跳过 Telegram 大视频下载（请安装 iyear/tdl 并执行 tdl login）', 'tdl', 'info')
    return null
  }

  // 2. 准备临时目录
  const workDir = opts.workDir || path.join(os.tmpdir(), `rss-owl-tdl-${crypto.randomBytes(6).toString('hex')}`)
  try {
    fs.mkdirSync(workDir, { recursive: true })
  } catch (err) {
    debug(config, `tdl 临时目录创建失败: ${err}`, 'tdl', 'error')
    return null
  }

  // 3. 解析代理（专用代理优先，其次订阅级代理）
  const proxyUrl = resolveProxyUrl(config, proxyAgent)

  // 4. 构造参数
  //    tdl 的全局 flag（--storage / --proxy / --debug 等）必须放在子命令 `dl` 之前，
  //    否则 cobra 会把它们当成 dl 的位置参数导致静默解析失败。
  //    dl 子命令的 flag（-u/-d）放在 dl 之后。
  //    注意：tdl 没有 force/no-confirm flag，-f 是 --file（导出文件），不要传。
  const args: string[] = []

  if (config.tdl?.storage) {
    args.push('--storage', `type=bolt,path=${config.tdl.storage}`)
  }

  if (proxyUrl) {
    args.push('--proxy', proxyUrl)
    debug(config, `tdl 使用代理: ${maskProxyUrl(proxyUrl)}`, 'tdl', 'details')
  }

  args.push('dl', '-u', link, '-d', workDir, '--group')

  const label = tdlBin === 'tdl' ? 'tdl' : tdlBin
  debug(config, `调用 tdl 下载: ${label} ${args.join(' ')}（超时 ${timeoutSeconds}s）`, 'tdl', 'info')

  try {
    // 用 runWithForcedKill：超时强制杀整个进程组，避免 tdl 残留进程占着 bolt 锁
    await runWithForcedKill(tdlBin, args, { timeoutMs: timeoutSeconds * 1000 })
  } catch (err: any) {
    const msg = err?.message || String(err)
    // 高亮锁冲突，便于用户定位残留进程
    if (/used by another process/i.test(msg)) {
      debug(config, `tdl 报 bolt 锁冲突（有残留 tdl 进程未退出）：${msg}。建议在容器内 \`pkill -9 tdl\` 后重试`, 'tdl', 'error')
    } else {
      debug(config, `tdl 下载失败: ${msg}（可能未登录 tdl login，或消息不含可下载媒体，或 storage 路径与登录不一致）`, 'tdl', 'error')
    }
    // 即便失败也清理临时目录
    await safeRemoveDir(workDir)
    return null
  }

  // 5. 扫描产物，收集全部视频文件（按文件名排序，对齐专辑顺序）
  const videoPaths = pickVideoFiles(workDir)
  if (videoPaths.length === 0) {
    debug(config, `tdl 下载完成但目录内未发现视频文件: ${workDir}`, 'tdl', 'info')
    await safeRemoveDir(workDir)
    return null
  }

  debug(config, `tdl 下载成功（${videoPaths.length} 个视频）: ${videoPaths.join(', ')}`, 'tdl', 'info')
  return videoPaths
}

/** 在目录中挑选全部视频文件，按文件名升序排列。
 *
 *  tdl --group 下文件名形如 `{dialogID}_{msgID}_{name}.mp4`，msgID 递增 = 专辑顺序，
 *  按文件名排序即可对齐 RSS 描述里 blockquote 的出现顺序。
 *  过滤掉 tdl 同时下载的配图(.jpg)、描述(.json)；跳过 0 字节半成品。 */
function pickVideoFiles(dir: string): string[] {
  const videoExts = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v'])
  const found: { path: string; name: string }[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!videoExts.has(ext)) continue
      // 校验非空文件（跳过 0 字节半成品）
      try {
        const stat = fs.statSync(path.join(dir, entry.name))
        if (stat.size === 0) continue
      } catch {
        continue
      }
      found.push({ path: path.join(dir, entry.name), name: entry.name })
    }
  } catch {
    return []
  }
  // 按文件名升序，保证多视频与 blockquote 顺序一致
  found.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return found.map(f => f.path)
}

/** 静默删除目录，失败不抛错 */
export async function safeRemoveDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch {
    // 忽略清理失败
  }
}

/**
 * 解析传给 tdl --proxy 的代理 URL。
 *
 * 优先级：config.tdl.proxy（专用）> 订阅级 proxyAgent（proxyByEnv != false 时）
 *
 * @returns 形如 http://host:port 的代理 URL；无可用代理返回空串
 */
function resolveProxyUrl(config: Config, proxyAgent?: proxyAgent): string {
  // 1. 专用代理
  if (config.tdl?.proxy) return config.tdl.proxy

  // 2. 订阅级代理（仅当 proxyByEnv != false；字段名沿用历史命名，
  //    实际现在通过 --proxy flag 透传而非环境变量）
  const proxyByEnv = config.tdl?.proxyByEnv !== false
  if (proxyByEnv && proxyAgent?.enabled && proxyAgent.host && proxyAgent.port) {
    const auth = proxyAgent.auth?.enabled
      ? `${encodeURIComponent(proxyAgent.auth.username)}:${encodeURIComponent(proxyAgent.auth.password)}@`
      : ''
    return `${proxyAgent.protocol || 'http'}://${auth}${proxyAgent.host}:${proxyAgent.port}`
  }

  return ''
}

/** 日志脱敏：隐藏代理用户名密码 */
function maskProxyUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@')
}
