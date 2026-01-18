import { Context } from 'koishi'
import { pathToFileURL } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import { Config, rssArg } from '../types'
import { debug } from './logger'

export const getCacheDir = (config: Config) => {
  let dir = config.basic.cacheDir ? path.resolve('./', config.basic.cacheDir || "") : `${__dirname}/cache`
  let mkdir = (path: string, deep = 2) => {
    let dir = path.split("\\").splice(0, deep).join("\\")
    let dirDeep = path.split("\\").length
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
  let fileList = fs.readdirSync(cacheDir)
  let suffix = /(?<=^data:.+?\/).+?(?=;base64)/.exec(fileUrl)![0]
  let fileName = `${parseInt((Math.random() * 10000000).toString()).toString()}.${suffix}`
  while (fileList.find(i => i == fileName)) {
    fileName = `${parseInt((Math.random() * 10000000).toString()).toString()}.${suffix}`
  }
  let base64Data = fileUrl.replace(/^data:.+?;base64,/, "");
  let filePath = `${cacheDir}/${fileName}`
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

  let contentType = res.headers["content-type"] || 'image/jpeg'
  let suffix = contentType?.split('/')[1] || 'jpg'
  let base64Prefix = `data:${contentType};base64,`
  let base64Data = base64Prefix + Buffer.from(res.data, 'binary').toString('base64')

  // 根据发送模式处理
  const imageMode = config.basic.imageMode

  // base64 模式：直接返回 base64
  if (imageMode == 'base64' || useBase64Mode) {
    return base64Data
  }

  // File 模式：下载到本地，返回 file:// URL
  if (imageMode == 'File') {
    let fileUrl = await writeCacheFile(base64Data, config)
    return fileUrl
  }

  // assets 模式：下载到本地，上传到 assets，返回 assets URL
  if (imageMode === 'assets' && ctx.assets) {
    try {
      let assetUrl = await ctx.assets.upload(base64Data, `rss-img-${Date.now()}.${suffix}`)
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
  let src = dom.attribs.src || dom.children["0"].attribs.src

  // href 模式：直接返回视频链接
  if (config.basic.videoMode == "href") {
    return src
  }

  // 显示代理状态
  const proxyStatus = arg?.proxyAgent?.enabled
    ? `代理: ${arg.proxyAgent.protocol}://${arg.proxyAgent.host}:${arg.proxyAgent.port}`
    : '直连'
  debug(config, `[DEBUG_PROXY] media getVideoUrl arg.proxyAgent: ${JSON.stringify(arg?.proxyAgent)}`, 'video proxy', 'details')
  debug(config, `视频下载模式: ${proxyStatus}`, 'video proxy', 'details')

  let res
  try {
    // 视频文件可能较大，增加超时时间到 120 秒
    res = await $http(src, arg, { responseType: 'arraybuffer', timeout: 120000 })

    // 检查文件大小限制
    const maxSize = (config.basic.maxVideoSize || 30) * 1024 * 1024 // 转换为字节
    const contentLength = res.data.length
    const sizeMB = (contentLength / 1024 / 1024).toFixed(2)

    if (contentLength > maxSize) {
      debug(config, `视频文件过大 (${sizeMB} MB)，超过限制 ${config.basic.maxVideoSize} MB，跳过该视频`, 'video size', 'info')
      return ''
    }

    debug(config, `视频下载成功，大小: ${sizeMB} MB`, 'video download', 'details')
  } catch (error) {
    debug(config, `视频请求失败: ${error}`, 'video error', 'error')
    return ''
  }

  let contentType = res.headers["content-type"] || 'video/mp4'
  let suffix = contentType?.split('/')[1] || 'mp4'
  let base64Prefix = `data:${contentType};base64,`
  let base64Data = base64Prefix + Buffer.from(res.data, 'binary').toString('base64')

  // 根据发送模式处理
  const videoMode = config.basic.videoMode

  // base64 模式：直接返回 base64（注意：视频 base64 可能非常长）
  if (videoMode == 'base64' || useBase64Mode) {
    return base64Data
  }

  // File 模式：下载到本地，返回 file:// URL
  if (videoMode == "File") {
    let fileUrl = await writeCacheFile(base64Data, config)
    return fileUrl
  }

  // assets 模式：下载到本地，上传到 assets，返回 assets URL
  if (videoMode === 'assets' && ctx.assets) {
    try {
      // 注意：大型视频的 base64 字符串可能很长，某些 assets 插件可能处理较慢
      let assetUrl = await ctx.assets.upload(base64Data, `rss-video-${Date.now()}.${suffix}`)
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
  let base64 = /(?<=src=").+?(?=")/.exec(puppeteer)?.[0]
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
