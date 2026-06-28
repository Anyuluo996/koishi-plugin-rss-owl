import { Context } from 'koishi'
import { pathToFileURL, fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import { Config, rssArg } from '../types'
import { debug } from './logger'

/** 静默删除单个文件，文件为空或不存在/删除失败都不抛错 */
async function tryUnlink(filePath: string | null): Promise<void> {
  if (!filePath) return
  try {
    await fs.promises.unlink(filePath)
  } catch {
    // 忽略：文件可能已不存在或被并发清理
  }
}

export const getCacheDir = (config: Config) => {
  const dir = config.basic.cacheDir ? path.resolve('./', config.basic.cacheDir || "") : `${__dirname}/cache`
  const mkdir = (path: string, deep = 2) => {
    const dir = path.split("\\").splice(0, deep).join("\\")
    const dirDeep = path.split("\\").length
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    return dirDeep > deep && mkdir(path, deep + 1)
  }
  if (!fs.existsSync(dir)) {
    mkdir(dir)
  }
  return dir
}

export const writeCacheFile = async (fileUrl: string, config: Config): Promise<string> => {
  const cacheDir = getCacheDir(config)
  debug(config, cacheDir, 'cacheDir', 'details')
  const suffix = /(?<=^data:.+?\/).+?(?=;base64)/.exec(fileUrl)?.[0] || 'bin'

  // 使用时间戳 + 随机数生成唯一文件名，避免竞态条件
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${suffix}`

  const base64Data = fileUrl.replace(/^data:.+?;base64,/, "");
  const filePath = `${cacheDir}/${fileName}`
  fs.writeFileSync(filePath, base64Data, 'base64')
  if (config.basic.replaceDir) {
    return `file:///${config.basic.replaceDir}/${fileName}`
  } else {
    return pathToFileURL(filePath).href
  }
}

export const delCache = async (config: Config) => {
  const cacheDir = getCacheDir(config)
  const files = fs.readdirSync(cacheDir)

  // 并行删除文件
  await Promise.all(
    files
      .filter(file => !!path.extname(file)) // 只处理有扩展名的文件
      .map(file => {
        const filePath = path.join(cacheDir, file)
        return fs.promises.unlink(filePath) // 使用 promises API
      })
  )
}

export const getImageUrl = async (
  ctx: Context,
  config: Config,
  $http: any,
  url: string,
  arg: rssArg,
  useBase64Mode = false
): Promise<string> => {
  debug(config, 'imgUrl:' + url, '', 'details')
  if (!url) return ''

  // 显示代理状态
  const proxyStatus = arg?.proxyAgent?.enabled
    ? `代理: ${arg.proxyAgent.protocol}://${arg.proxyAgent.host}:${arg.proxyAgent.port}`
    : '直连'
  debug(config, `图片下载模式: ${proxyStatus}`, 'img proxy', 'details')

  let res
  try {
    res = await $http(url, arg, { responseType: 'arraybuffer', timeout: 60000 })

    // 检查文件大小限制
    const maxSize = (config.basic.maxImageSize || 30) * 1024 * 1024 // 转换为字节
    const contentLength = res.data.length
    const sizeMB = (contentLength / 1024 / 1024).toFixed(2)

    if (contentLength > maxSize) {
      debug(config, `图片文件过大 (${sizeMB} MB)，超过限制 ${config.basic.maxImageSize} MB，跳过该图片`, 'img size', 'info')
      return ''
    }

    debug(config, `图片下载成功，大小: ${sizeMB} MB`, 'img download', 'details')
  } catch (error) {
    debug(config, `图片请求失败: ${error}`, 'img error', 'error')
    return ''
  }

  const contentType = res.headers["content-type"] || 'image/jpeg'
  const suffix = contentType?.split('/')[1] || 'jpg'
  const base64Prefix = `data:${contentType};base64,`
  const base64Data = base64Prefix + Buffer.from(res.data, 'binary').toString('base64')

  // 根据发送模式处理
  const imageMode = config.basic.imageMode

  // base64 模式：直接返回 base64
  if (imageMode == 'base64' || useBase64Mode) {
    return base64Data
  }

  // File 模式：下载到本地，返回 file:// URL
  if (imageMode == 'File') {
    const fileUrl = await writeCacheFile(base64Data, config)
    return fileUrl
  }

  // assets 模式：下载到本地，上传到 assets，返回 assets URL
  if (imageMode === 'assets' && ctx.assets) {
    try {
      const assetUrl = await ctx.assets.upload(base64Data, `rss-img-${Date.now()}.${suffix}`)
      debug(config, `图片 Assets 上传成功: ${assetUrl}`, 'assets', 'info')
      return assetUrl
    } catch (error) {
      debug(config, `图片 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
      return base64Data
    }
  }

  // 兜底：返回 base64
  return base64Data
}

export const getVideoUrl = async (
  ctx: Context,
  config: Config,
  $http: any,
  url: string,
  arg: rssArg,
  useBase64Mode = false,
  dom: any
): Promise<string> => {
  const src = dom.attribs.src || dom.children["0"].attribs.src

  // 根据发送模式处理
  const videoMode = config.basic.videoMode

  // filter 模式：过滤掉所有视频
  if (videoMode === 'filter') {
    debug(config, `视频已过滤 (videoMode=filter)`, 'video filter', 'details')
    return ''
  }

  // href 模式：返回特殊标记，不创建 video 元素
  if (videoMode === 'href') {
    return `__VIDEO_LINK__:${src}`
  }

  // 显示代理状态
  const proxyStatus = arg?.proxyAgent?.enabled
    ? `代理: ${arg.proxyAgent.protocol}://${arg.proxyAgent.host}:${arg.proxyAgent.port}`
    : '直连'
  debug(config, `[DEBUG_PROXY] media getVideoUrl arg.proxyAgent: ${JSON.stringify(arg?.proxyAgent)}`, 'video proxy', 'details')
  debug(config, `视频下载模式: ${proxyStatus}`, 'video proxy', 'details')

  // 获取视频字节与 content-type：
  // - data:/file: 本地协议直接读取，跳过 $http 与代理（用于 tdl 兜底下载的视频）
  // - 其它走 HTTP 下载
  let bufferData: Buffer
  let contentType: string
  // 若 src 是 file://（tdl 流程注入），读入内存后可删源文件，避免缓存目录堆积大视频
  let localSourcePath: string | null = null
  try {
    if (src.startsWith('data:')) {
      // data URL 直接解析（当前 tdl 流程注入的是 file://，这里保留 data: 解析以备其它来源）
      const match = src.match(/^data:([^;]+)?;base64,(.*)$/s)
      if (!match) {
        debug(config, `data URL 格式无效，跳过该视频`, 'video error', 'error')
        return ''
      }
      contentType = match[1] || 'video/mp4'
      bufferData = Buffer.from(match[2], 'base64')
      debug(config, `视频来自 data URL（本地），大小: ${(bufferData.length / 1024 / 1024).toFixed(2)} MB`, 'video download', 'details')
    } else if (/^file:/i.test(src)) {
      // file:// 直接读取本地文件（tdl 流程已注入）
      // 用异步 readFile 避免阻塞事件循环（视频可能几十 MB）
      const filePath = fileURLToPath(src)
      bufferData = await fs.promises.readFile(filePath)
      contentType = 'video/mp4'
      localSourcePath = filePath // 标记：读入内存后即可删，避免缓存堆积
      debug(config, `视频来自本地文件: ${filePath}，大小: ${(bufferData.length / 1024 / 1024).toFixed(2)} MB`, 'video download', 'details')
    } else {
      const res = await $http(src, arg, { responseType: 'arraybuffer', timeout: 120000 })
      bufferData = Buffer.from(res.data, 'binary')
      contentType = res.headers["content-type"] || 'video/mp4'
      debug(config, `视频下载成功，大小: ${(bufferData.length / 1024 / 1024).toFixed(2)} MB`, 'video download', 'details')
    }

    // 检查文件大小限制（统一适用于本地与远程）
    const maxSize = (config.basic.maxVideoSize || 30) * 1024 * 1024 // 转换为字节
    const contentLength = bufferData.length
    const sizeMB = (contentLength / 1024 / 1024).toFixed(2)

    if (contentLength > maxSize) {
      debug(config, `视频文件过大 (${sizeMB} MB)，超过限制 ${config.basic.maxVideoSize} MB，跳过该视频`, 'video size', 'info')
      // 体积超限：删除 tdl 源文件，避免大文件堆积
      await tryUnlink(localSourcePath)
      return ''
    }
  } catch (error) {
    debug(config, `视频获取失败: ${error}`, 'video error', 'error')
    return ''
  }

  // file:// 已读入内存（bufferData），后续 base64/File/assets 都基于内存数据，
  // 源文件不再需要 —— 立即删，避免几十 MB 视频在缓存目录堆积
  await tryUnlink(localSourcePath)

  const suffix = contentType?.split('/')[1] || 'mp4'
  const base64Prefix = `data:${contentType};base64,`
  const base64Data = base64Prefix + bufferData.toString('base64')

  // base64 模式：直接返回 base64（注意：视频 base64 可能非常长）
  if (videoMode === 'base64' || useBase64Mode) {
    return base64Data
  }

  // File 模式：下载到本地，返回 file:// URL
  if (videoMode === 'File') {
    const fileUrl = await writeCacheFile(base64Data, config)
    return fileUrl
  }

  // assets 模式：下载到本地，上传到 assets，返回 assets URL
  if (videoMode === 'assets' && ctx.assets) {
    try {
      // 注意：大型视频的 base64 字符串可能很长，某些 assets 插件可能处理较慢
      const assetUrl = await ctx.assets.upload(base64Data, `rss-video-${Date.now()}.${suffix}`)
      debug(config, `视频 Assets 上传成功: ${assetUrl}`, 'assets', 'info')
      return assetUrl
    } catch (error) {
      debug(config, `视频 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
      return base64Data
    }
  }

  // 兜底：返回空字符串（不发送视频）
  return ''
}

export const puppeteerToFile = async (ctx: Context, config: Config, puppeteer: string): Promise<string> => {
  // puppeteer.render() 返回 Element 字符串，格式如: <img src="data:image/png;base64,..."/> 或 <img src="https://..."/>
  // 提取 src 属性
  const base64 = /(?<=src=").+?(?=")/.exec(puppeteer)?.[0]
  if (!base64) {
    debug(config, `puppeteer render 返回值格式异常: ${puppeteer}`, 'puppeteerToFile', 'error');
    return puppeteer;
  }

  // 检查 base64 格式是否正确（应该包含 data:image 前缀）
  if (!base64.startsWith('data:')) {
    // 不是 base64 格式，可能是已经上传的 assets URL 或网络 URL
    debug(config, `puppeteer 已返回 URL 格式，直接使用: ${base64.substring(0, 50)}...`, 'puppeteerToFile', 'info');
    // 直接返回原始的 <img> 标签
    return puppeteer;
  }

  const buffer = Buffer.from(base64.substring(base64.indexOf(',') + 1), 'base64');

  // assets 模式
  if (config.basic.imageMode === 'assets' && ctx.assets) {
    try {
      // 直接传递 base64 字符串给 upload
      const url = await ctx.assets.upload(base64, `rss-screenshot-${Date.now()}.png`)
      debug(config, `截图 Assets 上传成功: ${url}`, 'assets', 'info')
      return `<img src="${url}"/>`
    } catch (error) {
      debug(config, `截图 Assets 上传失败，降级为 File: ${error}`, 'assets error', 'error')
      // 降级到 File 模式
    }
  }

  // File 模式：转换为 <file src="..."/> 格式
  const MB = buffer.length / 1e+6
  debug(config, "puppeteer 渲染图片大小: " + MB + ' MB', 'file size', 'details');
  return `<file src="${await writeCacheFile(base64, config)}"/>`
}
