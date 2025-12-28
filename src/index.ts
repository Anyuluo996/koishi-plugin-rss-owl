import { Context, Session, Logger, Schema, MessageEncoder, h, $, clone } from 'koishi'
import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as cheerio from 'cheerio';
import { } from 'koishi-plugin-puppeteer'
import { } from '@koishijs/censor'

// assets 服务类型声明
declare module 'koishi' {
  interface Context {
    assets?: {
      upload(dataUrl: string, filename: string): Promise<string>
    }
  }
}
const X2JS = require("x2js")
const x2js = new X2JS()
const logger = new Logger('rss-owl')
export const name = '@anyul/koishi-plugin-rss'
import { pathToFileURL } from 'url'
import * as fs from 'fs';
import * as path from 'path';
export const inject = { required: ["database"], optional: ["puppeteer", "censor", "assets"] }

declare module 'koishi' {
  interface rssOwl {
    id: string | number
    url: string
    platform: string
    guildId: string
    author: string
    rssId: number
    arg: rssArg,
    title: string
    lastPubDate: Date
  }
}

interface Config {
  basic?: BasicConfig
  template?: TemplateConfig
  net?: NetConfig
  msg?: MsgConfig
  ai?: AiConfig
  debug?: "disable"|"error"|"info"|"details"
}
const debugLevel = ["disable","error","info","details"]

interface BasicConfig {
  usePoster: boolean;
  margeVideo: boolean;
  defaultTemplate?: 'auto' | 'content' | 'only text' | 'only media' | 'only image' | 'proto' | 'default' | 'only description' | 'custom' | 'link'
  timeout?: number
  refresh?: number
  merge?: '不合并' | '有多条更新时合并' | '一直合并'
  maxRssItem?: number
  firstLoad?: boolean
  urlDeduplication?: boolean
  resendUpdataContent: 'disable'|'latest'|'all'
  imageMode?: 'base64' | 'File' | 'assets'
  videoMode?: 'filter'|'href'|'base64' | 'File' | 'assets'
  autoSplitImage?: boolean
  cacheDir?: string
  replaceDir?: string
  
  authority:number
  advancedAuthority:number
}

interface TemplateConfig {
  customRemark: string;
  bodyWidth?: number
  bodyPadding?: number
  bodyFontSize?: number
  content?: string
  custom?: string
  customTemplate:any[]

}

interface NetConfig {
  userAgent?: string
  proxyAgent?: proxyAgent
}
interface MsgConfig {
  censor?: boolean
  keywordFilter?: Array<string>
  keywordBlock?: Array<string>
  blockString?:string
  rssHubUrl?:string
}

interface AiConfig {
  enabled?: boolean
  baseUrl?: string
  apiKey?: string
  model?: string
  placement?: 'top' | 'bottom'
  separator?: string
  prompt?: string
  maxInputLength?: number
  timeout?: number
}

interface proxyAgent {
  enabled?: boolean
  autoUseProxy?: boolean
  protocol?: string
  host?: string,
  port?: number
  auth?: auth
}
interface auth {
  enabled: boolean
  username: string
  password: string
}

export interface rss {
  url: string
  id: string | number
  arg: rssArg,
  title: string
  author: string
  lastPubDate: Date
}
export interface rssArg {
  template?: 'auto' | 'content' | 'only text' | 'only media' | 'only image' | 'only video' | 'proto' | 'default' | 'only description' | 'custom' | 'link'
  content: string | never

  forceLength?: number
  timeout?: number
  interval?: number
  reverse?: boolean

  firstLoad?: boolean
  merge?: boolean
  maxRssItem?: number
  proxyAgent?: proxyAgent
  bodyWidth?: number
  bodyPadding?: number
  filter?: Array<string>
  block?: Array<string>
  // customUrlEnable?: boolean


  split?:number

  nextUpdataTime?: number
}
export const usage = `
RSS-OWL 订阅器使用说明

基本命令:
  rsso &lt;url&gt;              - 订阅RSS链接
  rsso -l                 - 查看订阅列表
  rsso -l [id]            - 查看订阅详情
  rsso -r &lt;content&gt;       - 删除订阅(需要权限)
  rsso -T &lt;url&gt;           - 测试订阅

常用选项:
  -i &lt;template&gt;          - 设置消息模板
      可选值: content(文字) | default(图片) | custom(自定义) | only text | only media 等
  -t &lt;title&gt;             - 自定义订阅标题
  -a &lt;arg&gt;               - 自定义配置 (格式: key:value,key2:value2)
      例如: -a timeout:30,merge:true

高级选项:
  -f &lt;content&gt;           - 关注订阅，更新时提醒
  -fAll &lt;content&gt;        - 全体关注(需要高级权限)
  -target &lt;groupId&gt;      - 跨群订阅(需要高级权限)
  -d &lt;time&gt;              - 定时推送 (格式: "HH:mm/数量" 或 "HH:mm")
      例如: -d "08:00/5" 表示每天8点推送5条
  -p &lt;id&gt;                - 手动拉取最新内容

快速订阅:
  rsso -q                - 查看快速订阅列表
  rsso -q [编号]         - 查看快速订阅详情
  rsso -T tg:channel_name  - 快速订阅Telegram频道

Assets 图片/视频服务配置 (推荐):
  使用 assets 服务可以避免 Base64 超长问题
  1. 在插件市场安装 assets-xxx 插件 (如 assets-local, assets-s3, assets-smms 等)
  2. 在对应插件中配置存储信息 (AccessKey, Secret, Bucket 等)
  3. 在 RSS-Owl 基础设置中将 imageMode/videoMode 设置为 'assets'
  4. 插件会自动上传图片/视频到你的图床服务

配置示例:
  rsso -T -i content "https://example.com/rss"
  rsso "https://example.com/rss" -t "我的订阅" -a "timeout:60,merge:true"
  rsso -d "09:00/3" "https://example.com/rss"

`
const templateList = ['auto','content', 'only text', 'only media','only image', 'only video', 'proto', 'default', 'only description', 'custom','link']

export const Config = Schema.object({
  basic: Schema.object({
    defaultTemplate: Schema.union(templateList).description('默认消息解析模板 <br> \`auto\` ★ 当文字长度小于`300`时使用content，否则custom<br> \`content\` ★ 可自定义的基础模板，适用于文字较少的订阅，无需puppeteer<br>\`only text\` 仅推送文字，无需puppeteer<br>\`only media\` 仅推送图片和视频，无需puppeteer<br>\`only image\` 仅推送图片，无需puppeteer<br>\`only video\` 仅推送视频，无需puppeteer<br>\`proto\` 推送原始内容，无需puppeteer<br>\`default\` ★ 内置基础puppeteer模板<br>\`only description\` 内置puppeteer模板，仅包含description内容<br>\`custom\` ★ 可自定义puppeteer模板，添加了护眼的背景色及订阅信息，见下方模板设置<br>\`link\` 特殊puppeteer模板，截图内容中首个a标签网址的页面<br>在订阅时使用自定义配置时无需only字段，例:`rsso -i text <url>`使用only text模板')
      .default('content'),
    timeout: Schema.number().description('请求数据的最长时间（秒）').default(60),
    refresh: Schema.number().description('刷新订阅源的时间间隔（秒）').default(600),
    authority: Schema.number().min(1).max(5).description('基础指令的权限等级(包括添加,删除订阅等在help中标注为*的行为)').default(1),
    advancedAuthority: Schema.number().min(1).max(5).description('高级指令的权限等级(包括跨群添加,全员提醒等在help中标注为**的行为)').default(4),
    merge: Schema.union(['不合并', '有多条更新时合并', '一直合并']).description('合并消息规则').default('有多条更新时合并'),
    maxRssItem: Schema.number().description('限制更新时的最大推送数量上限，超出上限时较早的更新会被忽略').default(10),
    firstLoad: Schema.boolean().description('首次订阅时是否发送最后的更新').default(true),
    urlDeduplication: Schema.boolean().description('同群组中不允许重复添加相同订阅').default(true),
    resendUpdataContent: Schema.union(['disable','latest','all']).description('当内容更新时再次发送').default('disable').experimental(),
    imageMode: Schema.union(['base64', 'File', 'assets']).description('图片发送模式<br>\`base64\` Base64格式（兼容性好但容易超长）<br>\`File\` 本地文件（不支持沙盒环境）<br>\`assets\` Assets服务（推荐，需安装assets-xxx插件并配置）').default('base64'),
    videoMode: Schema.union(['filter','href','base64', 'File', 'assets']).description('视频发送模式（iframe标签内的视频无法处理）<br>\`filter\` 过滤视频，含有视频的推送将不会被发送<br>\`href\` 使用视频网络地址直接发送<br>\`base64\` 下载后以base64格式发送<br>\`File\` 下载后以文件发送<br>\`assets\` 上传到assets服务（需安装assets-xxx插件并配置）').default('href'),
    margeVideo: Schema.boolean().default(false).description('以合并消息发送视频'),
    usePoster: Schema.boolean().default(false).description('加载视频封面'),
    autoSplitImage: Schema.boolean().description('垂直拆分大尺寸图片，解决部分适配器发不出长图的问题').default(true),
    cacheDir: Schema.string().description('File模式时使用的缓存路径').default('data/cache/rssOwl'),
    replaceDir: Schema.string().description('缓存替换路径，仅在使用docker部署时需要设置').default(''),
  }).description('基础设置'),
  template: Schema.object({
    bodyWidth: Schema.number().description('puppeteer图片的宽度(px)，较低的值可能导致排版错误，仅在非custom的模板生效').default(600),
    bodyPadding: Schema.number().description('puppeteer图片的内边距(px)仅在非custom的模板生效').default(20),
    bodyFontSize: Schema.number().description('puppeteer图片的字号(px)，0为默认值，仅在非custom的模板生效').default(0),
    content: Schema.string().role('textarea', { rows: [4, 2] }).default(`《{{title}}》\n{{description}}`).description('content模板的内容，使用插值载入推送内容'),
    custom: Schema.string().role('textarea', { rows: [4, 2] }).default(`<body style="width:600px;padding:20px;background:#F5ECCD;">
      <div style="display: flex;flex-direction: column;">
          <div style="backdrop-filter: blur(5px) brightness(0.7) grayscale(0.1);display: flex;align-items: center;flex-direction: column;border-radius: 10px;border: solid;overflow:hidden">
              <div style="display: flex;align-items: center;">
                  <img src="{{rss.channel.image.url}}" style="margin-right: 10px;object-fit: scale-down;max-height: 160px;max-width: 160px;" alt="" srcset="" />
                  <p style="font-size: 20px;font-weight: bold;color: white;">{{rss.channel.title}}</p>
              </div>
              <p style="color: white;font-size: 16px;">{{rss.channel.description}}</p>
          </div>
          <div style="font-weight: bold;">{{title}}</div>
          <div>{{pubDate}}</div>
          <div>{{description}}</div>
      </div>
  </body>`).description('custom模板的内容，使用插值载入推送内容。 [说明](https://github.com/borraken/koishi-plugin-rss-owl?tab=readme-ov-file#3-%E6%8F%92%E5%80%BC%E8%AF%B4%E6%98%8E)'),
    customRemark: Schema.string().role('textarea', { rows: [3, 2] }).default(`{{description}}\n{{link}}`).description('custom模板的文字补充，以custom图片作为description再次插值'),
    // customTemplate:Schema.array(Schema.object({
    //   name: Schema.string().description('模板名称'),
    //   pptr: Schema.boolean().description('是否pptr模板'),
    //   content: Schema.string().description('模板内容').default(`{{description}}`).role('textarea'),
    //   remark: Schema.string().description('模板补充内容').default(`{{description}}`).role('textarea'),
    // })).description('自定义新模板'),
  }).description('模板设置'),
  net: Schema.object({
    proxyAgent: Schema.intersect([
      Schema.object({ enabled: Schema.boolean().default(false).description('使用代理'), }),
      Schema.union([Schema.object({
        enabled: Schema.const(true).required(),
        autoUseProxy: Schema.boolean().default(false).description('新订阅自动判断代理').experimental(),
        protocol: Schema.union(['http', 'https', 'socks5']).default('http'),
        host: Schema.string().role('link').default('127.0.0.1'),
        port: Schema.number().default(7890),
        auth: Schema.intersect([
          Schema.object({ enabled: Schema.boolean().default(false), }),
          Schema.union([Schema.object({
            enabled: Schema.const(true).required(),
            username: Schema.string(),
            password: Schema.string(),
          }), Schema.object({}),]),
        ])
      }), Schema.object({}),]),
    ]),
    userAgent: Schema.string(),
  }).description('网络设置'),
  msg: Schema.object({
    rssHubUrl:Schema.string().role('link').description('使用快速订阅时rssHub的地址，你可以使用`rsso -q`检查可用的快速订阅').default('https://hub.slarker.me'),
    keywordFilter: Schema.array(Schema.string()).role('table').description('关键字过滤，使用正则检查title和description中的关键字，含有关键字的推送不会发出，不区分大小写').default([]),
    keywordBlock: Schema.array(Schema.string()).role('table').description('关键字屏蔽，内容中的正则关键字会被删除，不区分大小写').default([]),
    blockString:Schema.string().description('关键字屏蔽替换内容').default('*'),
    censor: Schema.boolean().description('消息审查，需要censor服务').default(false),
  }).description('消息处理'),
  ai: Schema.object({
    enabled: Schema.boolean().description('开启 AI 摘要生成').default(false),
    baseUrl: Schema.string().role('link').description('API Base URL (例如: https://api.openai.com/v1)').default('https://api.openai.com/v1'),
    apiKey: Schema.string().role('secret').description('API Key').required(),
    model: Schema.string().description('使用的模型名称').default('gpt-3.5-turbo'),
    placement: Schema.union(['top', 'bottom']).description('摘要位置（仅在模板未显式包含 {{aiSummary}} 时生效）').default('top'),
    separator: Schema.string().description('摘要与正文的分割线').default('----------------'),
    prompt: Schema.string().role('textarea').description('提示词 ({{title}} 代表标题, {{content}} 代表内容)').default('请简要总结以下新闻/文章的核心内容，要求语言简洁流畅：\n标题：{{title}}\n内容：{{content}}'),
    maxInputLength: Schema.number().description('发送给 AI 的最大字数限制').default(2000),
    timeout: Schema.number().description('AI 请求超时时间(毫秒)').default(30000),
  }).description('AI 摘要设置'),
  // customUrlEnable:Schema.boolean().description('开发中：允许使用自定义规则对网页进行提取，用于对非RSS链接抓取').default(false).experimental(),
  debug: Schema.union(debugLevel).default(debugLevel[0]),
})

export function apply(ctx: Context, config: Config) {
  ctx.model.extend(('rssOwl' as any), {
    id: "integer",
    url: "text",
    platform: "string",
    guildId: "string",
    author: "string",
    rssId: "integer",
    arg: "json",
    lastContent: "json",
    title: "string",
    followers: "list",
    lastPubDate: "timestamp",
  }, {
    autoInc: true
  }
  )
  const getDefaultTemplate = (bodyWidth, bodyPadding,bodyFontSize:number|undefined) => 
    `<body><h3>{{title}}</h3><h5>{{pubDate}}</h5><br><div>{{description}}<div></body>
    <style>*{${bodyFontSize?`font-size: ${bodyFontSize}px !important;`:''}body{width:${bodyWidth || config.template.bodyWidth}px;padding:${bodyPadding || config.template.bodyPadding}px;}}</style>`
  const getDescriptionTemplate = (bodyWidth, bodyPadding,bodyFontSize:number|undefined) => 
    `<body>{{description}}</body>
    <style>*{${bodyFontSize?`font-size: ${bodyFontSize}px !important;`:''}body{width:${bodyWidth || config.template.bodyWidth}px;padding:${bodyPadding || config.template.bodyPadding}px;}}</style>`
  let interval
  const debug = (message,name='',type:"disable"|"error"|"info"|"details"='details') =>{
    const typeLevel = debugLevel.findIndex(i=>i==type)
    if(typeLevel<1)return
    if(typeLevel > debugLevel.findIndex(i=>i==config.debug))return
    if(name)logger.info(`${type}:<<${name}>>`)
    logger.info(message)
  }

  // 安全的时间解析函数，处理各种格式
  const parsePubDate = (pubDate: any): Date => {
    if (!pubDate) return new Date(0)
    try {
      const date = new Date(pubDate)
      // 检查是否为有效日期
      if (isNaN(date.getTime())) {
        debug(`无效的日期格式: ${pubDate}`, 'date parse', 'error')
        return new Date(0)
      }
      return date
    } catch (error) {
      debug(`日期解析错误: ${pubDate}, ${error}`, 'date parse', 'error')
      return new Date(0)
    }
  }
  const getAiSummary = async (title: string, contentHtml: string) => {
    if (!config.ai.enabled || !config.ai.apiKey) return ''

    // 1. 清洗内容，只保留纯文本
    const $ = cheerio.load(contentHtml || '')
    // 移除脚本、样式、图片等无关标签，减少 token 消耗
    $('script').remove()
    $('style').remove()
    $('img').remove()
    $('video').remove()
    let plainText = $.text().replace(/\s+/g, ' ').trim()

    // 2. 截断超长文本
    if (plainText.length > config.ai.maxInputLength) {
      plainText = plainText.substring(0, config.ai.maxInputLength) + '...'
    }

    if (!plainText || plainText.length < 50) return '' // 内容太少不总结

    // 3. 构建 Prompt
    const prompt = config.ai.prompt
      .replace('{{title}}', title || '')
      .replace('{{content}}', plainText)

    try {
      debug(`正在生成摘要: ${title}`, 'AI', 'info')

      // 4. 构建请求配置（支持代理）
      const requestConfig: any = {
        headers: {
          'Authorization': `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: config.ai.timeout,
      }

      // 复用代理配置
      if (config.net.proxyAgent?.enabled) {
        const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
        requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
        requestConfig.proxy = false
      }

      // 5. 发送请求
      const response = await axios.post(
        `${config.ai.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          model: config.ai.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        },
        requestConfig
      )

      const summary = response.data?.choices?.[0]?.message?.content?.trim()
      debug(`摘要生成成功: ${summary?.substring(0, 20)}...`, 'AI', 'details')
      return summary || ''
    } catch (error) {
      debug(`AI 摘要生成失败: ${error.message}`, 'AI', 'error')
      return ''
    }
  }

  const getImageUrl = async (url, arg,useBase64Mode=false) => {
    debug('imgUrl:'+url,'','details')
    if(!url)return ''

    // 如果配置了 assets 且 ctx 中有该服务，优先处理
    if (config.basic.imageMode === 'assets' && ctx.assets && !useBase64Mode) {
      try {
        let res = await $http(url, arg, { responseType: 'arraybuffer', timeout: 30000 })
        let contentType = res.headers["content-type"] || 'image/jpeg' // 兜底 contentType
        let suffix = contentType?.split('/')[1] || 'jpg'

        // ★★★ 修复点：转为 Data URL 字符串再上传 ★★★
        const buffer = Buffer.from(res.data, 'binary')
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`

        let assetUrl = await ctx.assets.upload(base64, `rss-img-${Date.now()}.${suffix}`)
        debug(`Assets 上传成功: ${assetUrl}`, 'assets', 'info')
        return assetUrl
      } catch (error) {
        debug(`Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
        // 降级到 base64 模式（不设置 useBase64Mode 避免递归）
        // 这里直接使用 base64 逻辑
      }
    }

    let res
    try {
      res = await $http(url, arg, { responseType: 'arraybuffer', timeout: 30000 })
      debug(res.data,'img response','details')
    } catch (error) {
      debug(`图片请求失败: ${error}`, 'img error', 'error')
      return ''
    }
    let prefixList = ['png', 'jpeg', 'webp']
    let prefix = res.headers["content-type"] || ('image/' + (prefixList.find(i => new RegExp(i).test(url)) || 'jpeg'))
    let base64Prefix = `data:${prefix};base64,`
    let base64Data = base64Prefix + Buffer.from(res.data, 'binary').toString('base64')
    if (config.basic.imageMode == 'base64'||useBase64Mode || config.basic.imageMode === 'assets') {
      return base64Data
    } else if (config.basic.imageMode == 'File') {
      let fileUrl = await writeCacheFile(base64Data)
      return fileUrl
    }
  }
  const getVideoUrl = async (url, arg,useBase64Mode=false,dom) => {
    let src = dom.attribs.src || dom.children["0"].attribs.src
    let res
    if(config.basic.videoMode == "href"){
      return src
    }

    // assets 模式
    if (config.basic.videoMode === 'assets' && ctx.assets) {
      try {
        res = await $http(src, arg, { responseType: 'arraybuffer', timeout: 0 })
        let contentType = res.headers["content-type"] || 'video/mp4'
        let suffix = contentType?.split('/')[1] || 'mp4'

        // ★★★ 修复点：转为 Data URL 字符串再上传 ★★★
        const buffer = Buffer.from(res.data, 'binary')
        // 注意：视频 Base64 可能会非常长，部分 assets 插件可能处理较慢，但比 Buffer 兼容性好
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`

        let assetUrl = await ctx.assets.upload(base64, `rss-video-${Date.now()}.${suffix}`)
        debug(`视频 Assets 上传成功: ${assetUrl}`, 'assets', 'info')
        return assetUrl
      } catch (error) {
        debug(`视频 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
        // 降级到 base64 模式
      }
    }

    try {
      res = await $http(src, arg, { responseType: 'arraybuffer', timeout: 0 })
    } catch (error) {
      debug(`视频请求失败: ${error}`, 'video error', 'error')
      return ''
    }
    let prefix = res.headers["content-type"]
    let base64Prefix = `data:${prefix};base64,`
    let base64Data = base64Prefix + Buffer.from(res.data, 'binary').toString('base64')
    if (config.basic.videoMode == 'base64' || config.basic.videoMode === 'assets') {
      return base64Data
    } else if (config.basic.videoMode == 'File') {
      let fileUrl = await writeCacheFile(base64Data)
      return fileUrl
    }
  }
  const puppeteerToFile = async (puppeteer: string) => {
    let base64 = /(?<=src=").+?(?=")/.exec(puppeteer)?.[0]
    if (!base64) return puppeteer
    const buffer = Buffer.from(base64.substring(base64.indexOf(',') + 1), 'base64');

    // assets 模式
    if (config.basic.imageMode === 'assets' && ctx.assets) {
      try {
        // ★★★ 修复点：直接传递 base64 字符串给 upload，不要转 Buffer ★★★
        // base64 变量本身就是 "data:image/png;base64,..." 格式
        const url = await ctx.assets.upload(base64, `rss-screenshot-${Date.now()}.png`)
        debug(`截图 Assets 上传成功: ${url}`, 'assets', 'info')
        return `<img src="${url}"/>`
      } catch (error) {
        debug(`截图 Assets 上传失败，降级为 File: ${error}`, 'assets error', 'error')
        // 降级到 File 模式
      }
    }

    const MB = buffer.length / 1e+6
    debug("MB: " + MB,'file size','details');
    return `<file src="${await writeCacheFile(base64)}"/>`
  }
  const quickList = [
    {prefix:"rss",name:"rsshub通用订阅",detail:"rsshub通用快速订阅\nhttps://docs.rsshub.app/zh/routes/new-media#%E6%97%A9%E6%8A%A5%E7%BD%91",example:"rss:qqorw",replace:"{{rsshub}}/{{route}}"},
    {prefix:"tg",name:"rsshub电报频道订阅",detail:"输入电报频道信息中的链接地址最后部分，需要该频道启用网页预览\nhttps://docs.rsshub.app/zh/routes/social-media#telegram",example:"tg:woshadiao",replace:"{{rsshub}}/telegram/channel/{{route}}"},
    {prefix:"mp-tag",name:"rsshub微信公众平台话题TAG",detail:"一些公众号（如看理想）会在微信文章里添加 Tag，浏览器打开Tag文章列表，如 https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzA3MDM3NjE5NQ==&action=getalbum&album_id=1375870284640911361，输入其中biz和album_id\nhttps://docs.rsshub.app/zh/routes/new-media#%E5%85%AC%E4%BC%97%E5%8F%B7%E6%96%87%E7%AB%A0%E8%AF%9D%E9%A2%98-tag",example:"mp-tag:MzA3MDM3NjE5NQ==/1375870284640911361",replace:"{{rsshub}}/wechat/mp/msgalbum/{{route}}"},
    {prefix:"gh",name:"rsshub-github订阅",detail:"Repo Issue: gh:issue/[:user]/[:repo]/[:state?(open|closed|all)]/[:labels?(open|bug|...)]\nUser Activities: gh:activity/[:user]\nhttps://docs.rsshub.app/zh/routes/popular#github",example:"gh:issue/koishijs/koishi/open",replace:"{{rsshub}}/github/{{route}}"},
    {prefix:"github",name:"原生github订阅(含releases,commits,activity)",detail:"Repo Releases: github::[:owner]/[:repo]/releases\nRepo commits: github:[:owner]/[:repo]/commits\nUser activities:github:[:user]\n",example:"github:facebook/react/releases",replace:"https://github.com/{{route}}.atom"},
    // {prefix:"weibo",name:"微博博主",detail:"输入博主用户id\n公开订阅源对微博支持欠佳，建议自己部署并配置Cookie",example:"weibo:1195230310",replace:"{{rsshub}}/weibo/user/{{route}}"},
    {prefix:"koishi",name:"koishi论坛相关",detail:"最新话题: koishi:latest\n类别: koishi:c/plugin-publish (插件发布)\n话题 koishi:u/shigma/activity\n基于discourse论坛的feed订阅，更多见: https://meta.discourse.org/t/finding-discourse-rss-feeds/264134 或可尝试在网址后面加上 .rss ",example:"koishi:latest",replace:"https://forum.koishi.xyz/{{route}}.rss"},
  ]
  const parseQuickUrl = (url)=>{
    // const _quickList = [...quickList,...config.]
    let correntQuickObj = quickList.find(i=>new RegExp(`^${i.prefix}:`).test(url))
    if(!correntQuickObj)return url
    let rsshub = config.msg.rssHubUrl
    let route = url.match(new RegExp(`(?<=^${correntQuickObj.prefix}:).*`))[0]
    const parseContent = (template,item)=>template.replace(/{{(.+?)}}/g, i =>i.match(/^{{(.*)}}$/)[1].split("|").reduce((t,v)=>t||v.match(/^'(.*)'$/)?.[1]||v.split(".").reduce((t, v) => new RegExp("Date").test(v) ? new Date(t?.[v]).toLocaleString('zh-CN') : t?.[v] || "", item),''))
    let rUrl = parseContent(correntQuickObj.replace,{rsshub,route})
    return rUrl
  }
  const getCacheDir = () => {
    let dir = config.basic.cacheDir ? path.resolve('./', config.basic.cacheDir || "") : `${__dirname}/cache`
    let mkdir = (path,deep=2)=>{
      let dir = path.split("\\").splice(0,deep).join("\\")
      let dirDeep = path.split("\\").length
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      return dirDeep>deep && mkdir(path,deep+1)
    }
    if (!fs.existsSync(dir)) {
      mkdir(dir)
    }
    return dir
  }
  const writeCacheFile = async (fileUrl: string) => {
    const cacheDir = getCacheDir()
    debug(cacheDir,'cacheDir','details')
    let fileList = fs.readdirSync(cacheDir)
    let suffix = /(?<=^data:.+?\/).+?(?=;base64)/.exec(fileUrl)[0]
    let fileName = `${parseInt((Math.random() * 10000000).toString()).toString()}.${suffix}`
    while (fileList.find(i => i == fileName)) {
      fileName = `${parseInt((Math.random() * 10000000).toString()).toString()}.${suffix}`
    }
    let base64Data = fileUrl.replace(/^data:.+?;base64,/, "");
    let path = `${cacheDir}/${fileName}`
    fs.writeFileSync(path, base64Data, 'base64')
    if (config.basic.replaceDir) {
      return `file:///${config.basic.replaceDir}/${fileName}`
    } else {
      return pathToFileURL(path).href
    }
  }
  const delCache = async () => {
    const cacheDir = getCacheDir()
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
  const sleep = (delay = 1000) => new Promise(resolve => setTimeout(resolve, delay));

  // 添加请求队列管理器
  class RequestManager {
    private queue: Array<() => Promise<any>> = []
    private running = 0
    private maxConcurrent: number
    private tokenBucket: number
    private lastRefill: number
    private refillRate: number // 令牌产生速率(个/秒)
    private bucketSize: number

    constructor(maxConcurrent = 3, refillRate = 2, bucketSize = 10) {
      this.maxConcurrent = maxConcurrent
      this.tokenBucket = bucketSize
      this.bucketSize = bucketSize
      this.refillRate = refillRate
      this.lastRefill = Date.now()
    }

    private refillTokens() {
      const now = Date.now()
      const timePassed = now - this.lastRefill
      const newTokens = Math.floor((timePassed / 1000) * this.refillRate)
      this.tokenBucket = Math.min(this.bucketSize, this.tokenBucket + newTokens)
      this.lastRefill = now
    }

    private async processQueue() {
      if (this.running >= this.maxConcurrent || this.queue.length === 0) return

      this.refillTokens()
      if (this.tokenBucket <= 0) {
        setTimeout(() => this.processQueue(), 1000)
        return
      }

      const task = this.queue.shift()
      if (!task) return

      this.running++
      this.tokenBucket--

      try {
        await task()
      } catch (error) {
        debug(error, 'Request failed', 'error')
      } finally {
        this.running--
        this.processQueue()
      }
    }

    async enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        this.queue.push(async () => {
          try {
            const result = await task()
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })
        this.processQueue()
      })
    }
  }

  const requestManager = new RequestManager(3, 2, 10) // 最大并发3，每秒2个令牌，桶容量10

  // 修改 $http 函数
  const $http = async (url, arg, config = {}) => {
    const makeRequest = async () => {
      let requestConfig: any = {
        timeout: (arg.timeout || 0) * 1000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }

      if (arg?.proxyAgent?.enabled) {
        const proxyUrl = `${arg.proxyAgent.protocol}://${arg.proxyAgent.host}:${arg.proxyAgent.port}`
        const agent = new HttpsProxyAgent(proxyUrl)

        requestConfig.httpsAgent = agent
        requestConfig.proxy = false  // 禁用 axios 原生 proxy
        debug(`使用代理: ${proxyUrl}`, 'proxy', 'info')
      }

      if (arg.userAgent) {
        requestConfig.headers['User-Agent'] = arg.userAgent
      }

      debug(`${url} : ${JSON.stringify({ ...requestConfig, ...config })}`, 'request info', 'details')

      let retries = 3
      while (retries > 0) {
        try {
          return await axios.get(url, {
            ...requestConfig,
            ...config
          })
        } catch (error) {
          retries--
          if (retries <= 0) {
            throw error
          }
          await sleep(1000)
        }
      }
      throw new Error('Max retries reached')
    }

    return requestManager.enqueue(makeRequest)
  }

  const renderHtml2Image = async (htmlContent:string)=>{
    let page = await ctx.puppeteer.page()
    try {
      debug(htmlContent,'htmlContent','details')
      await page.setContent(htmlContent)

      if(!config.basic.autoSplitImage) {
        const image = await page.screenshot({type:"png"})
        // assets 模式
        if (config.basic.imageMode === 'assets' && ctx.assets) {
          try {
            // ★★★ 修复点：Buffer 转 Data URL ★★★
            const base64 = `data:image/png;base64,${image.toString('base64')}`
            const url = await ctx.assets.upload(base64, `rss-shot-${Date.now()}.png`)
            debug(`HTML截图 Assets 上传成功: ${url}`, 'assets', 'info')
            return h.image(url)
          } catch (error) {
            debug(`HTML截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
            // 降级到 base64
          }
        }
        return h.image(image,'image/png')
      }

      let [height,width,x,y] = await page.evaluate(()=>[
        document.body.offsetHeight,
        document.body.offsetWidth,
        parseInt(document.defaultView.getComputedStyle(document.body).marginLeft)||0,
        parseInt(document.defaultView.getComputedStyle(document.body).marginTop)||0
      ])

      let size = 10000
      debug([height,width,x,y],'pptr img size','details')
      const split = Math.ceil(height/size)

      if(!split) {
        const image = await page.screenshot({type:"png",clip:{x,y,width,height}})
        // assets 模式
        if (config.basic.imageMode === 'assets' && ctx.assets) {
          try {
            // ★★★ 修复点：Buffer 转 Data URL ★★★
            const base64 = `data:image/png;base64,${image.toString('base64')}`
            const url = await ctx.assets.upload(base64, `rss-shot-${Date.now()}.png`)
            debug(`HTML截图 Assets 上传成功: ${url}`, 'assets', 'info')
            return h.image(url)
          } catch (error) {
            debug(`HTML截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
            // 降级到 base64
          }
        }
        return h.image(image,'image/png')
      }

      debug({height,width,split},'split img','details')

      const reduceY = (index) => Math.floor(height/split*index)
      const reduceHeight = (index) => Math.floor(height/split)

      let imgData = await Promise.all(
        Array.from({length:split}, async(v,i) =>
          await page.screenshot({
            type:"png",
            clip:{
              x,
              y:reduceY(i)+y,
              width,
              height:reduceHeight(i)
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
          debug(`切割截图 Assets 上传成功: ${urls.length} 个文件`, 'assets', 'info')
          return urls.map(u => h.image(u)).join("")
        } catch (error) {
          debug(`切割截图 Assets 上传失败，降级为 Base64: ${error}`, 'assets error', 'error')
          // 降级到 base64
        }
      }

      return imgData.map(i=>h.image(i,'image/png')).join("")

    } finally {
      await page.close() // 确保页面被关闭
    }
  }

  // 修改 getRssData 函数的并发处理
  const getRssData = async (url, config: rssArg) => {
    try {
      const res = await $http(url, config)
      let rssData = res.data
      const contentType = res.headers['content-type'] || ''

      // 定义通用内容清洗函数 (保持原逻辑)
      let parseContent = (content, attr = undefined) => {
        debug(content, 'parseContent')
        if (!content) return undefined
        if (typeof content == 'string') return content
        if (attr && content?.[attr]) return parseContent(content?.[attr])
        if (content['__cdata']) return content['__cdata']?.join?.("") || content['__cdata']
        if (content['__text']) return content['__text']?.join?.("") || content['__text']

        if (Object.prototype.toString.call(content) === '[object Array]') {
          return parseContent(content[0], attr)
        } else if (Object.prototype.toString.call(content) === '[object Object]') {
          return Object.values(content).reduce((t: string, v: any) => {
            if (v && (typeof v == 'string' || v?.join)) {
              let text: string = v?.join("") || v
              return text.length > t.length ? text : t
            } else { return t }
          }, '')
        } else {
          return content
        }
      }

      // --- 新增：JSON 格式处理逻辑 (支持 ?format=json 等) ---
      let isJson = false;
      if (typeof rssData === 'object' && rssData !== null) {
        isJson = true;
      } else if (typeof rssData === 'string' && (rssData.trim().startsWith('{') || contentType.includes('json'))) {
        try {
          rssData = JSON.parse(rssData);
          isJson = true;
        } catch (e) { /* ignore */ }
      }

      if (isJson) {
        debug(rssData, 'JSON Feed Response', 'details');

        // 构造兼容 XML 结构的父级对象，以便模板使用 {{rss.channel.title}}
        const rssMock = {
          channel: {
            title: rssData.title || 'Unknown Title',
            description: rssData.description || rssData.home_page_url || '',
            link: rssData.home_page_url || url,
            image: { url: rssData.icon || rssData.favicon || '' }
          }
        };

        let items = [];
        // 标准 JSON Feed (v1/v1.1) 使用 'items'
        if (Array.isArray(rssData.items)) {
          items = rssData.items.map(item => ({
            title: item.title || '',
            // JSON Feed 优先使用 content_html，其次 content_text
            description: item.content_html || item.content_text || item.summary || '',
            link: item.url || item.id,
            guid: item.id || item.url,
            pubDate: item.date_published || item.date_modified,
            author: item.author?.name || rssData.author?.name || '',
            rss: rssMock // 注入父级引用
          }));
        }
        // 兼容 RSSHub ?format=debug.json 或其他类 JSON 结构
        else if (rssData.objects && Array.isArray(rssData.objects)) {
          // 针对 RSS3 UMS 或部分特定结构尝试解析
          items = rssData.objects.map(item => ({
             title: item.title || item.type || 'No Title',
             description: item.content || item.summary || JSON.stringify(item),
             link: item.link || item.url || url,
             guid: item.id || item.hash,
             pubDate: item.date_published || item.created_at || item.timestamp,
             rss: rssMock
          }));
        }

        debug(items[0], 'Parsed JSON Item', 'details');
        return items;
      }
      // --- JSON 处理结束 ---

      // --- 原有 XML 处理逻辑 ---
      const rssJson = x2js.xml2js(rssData)

      if (rssJson.rss) {
        // RSS 2.0
        rssJson.rss.channel.item = [rssJson.rss.channel.item].flat(Infinity)
        const rssItemList = rssJson.rss.channel.item.map(i => ({ ...i, guid: parseContent(i?.guid), rss: rssJson.rss }))
        return rssItemList
      } else if (rssJson.feed) {
        // Atom
        let rss = { channel: {} }
        let item = rssJson.feed.entry.map(i => ({
          ...i,
          title: parseContent(i.title),
          description: parseContent(i.content),
          link: parseContent(i.link, '_href'),
          guid: parseContent(i.id),
          pubDate: parseContent(i.updated),
          author: parseContent(i.author, 'name'),
        }))
        rss.channel = {
          title: rssJson.feed.title,
          link: rssJson.feed.link?.[0]?.href || rssJson.feed.link?.href,
          description: rssJson.feed.summary,
          generator: rssJson.feed.generator,
          language: rssJson.feed['@xml:lang'],
          item
        }
        item = item.map(i => ({ rss, ...i }))
        debug(item, 'atom item', 'details')
        return item
      } else {
        debug(rssJson, '未知rss格式，请提交issue', 'error')
        // 如果解析失败返回空数组，避免 crash
        return []
      }
    } catch (error) {
      debug(`Failed to fetch RSS from ${url}`, '', 'error')
      throw error
    }
  }
  const parseRssItem = async (item: any, arg: rssArg, authorId: string | number) => {
    debug(arg, 'rss arg', 'details');
    let template = arg.template;
    let msg = "";
    let html;
    let videoList = [];
    item.description = item.description?.join?.('') || item.description;

    // --- AI 逻辑 START ---
    let aiSummary = "";
    let formattedAiSummary = "";
    const hasCustomAiTemplate = config.template?.custom?.includes('{{aiSummary}}') ||
                                 config.template?.content?.includes('{{aiSummary}}');

    if (config.ai && config.ai.enabled) {
      const rawSummary = await getAiSummary(item.title, item.description);

      if (rawSummary) {
        const prefix = "🤖 AI摘要：\n";
        const sep = config.ai.separator || '----------------';

        // 带格式的摘要文本
        formattedAiSummary = `${prefix}${rawSummary}`;

        // 注入模板变量的纯文本
        aiSummary = rawSummary;
      }
    }
    // --- AI 逻辑 END ---

    //block
    arg.block?.forEach(blockWord => {
      item.description = item.description.replace(new RegExp(blockWord, 'gim'), i => Array(i.length).fill(config.msg.blockString).join(""));
      item.title = item.title.replace(new RegExp(blockWord, 'gim'), i => Array(i.length).fill(config.msg.blockString).join(""));
    });

    debug(template, 'template');
    // 通用内容解析
    const parseContent = (template: string, item: any) => template.replace(/{{(.+?)}}/g, (i: string) => i.match(/^{{(.*)}}$/)[1].split("|").reduce((t: any, v: string) => t || v.match(/^'(.*)'$/)?.[1] || v.split(".").reduce((t: any, v: string) => new RegExp("Date").test(v) ? new Date(t?.[v]).toLocaleString('zh-CN') : t?.[v] || "", { ...item, aiSummary }), ''));

    if (config.basic.videoMode === 'filter') {
      html = cheerio.load(item.description);
      if (html('video').length > 0) return '';
    }

    html = cheerio.load(item.description);
    if (template == 'auto') {
      let stringLength = html.text().length;
      template = stringLength < 300 ? 'content' : 'custom';
    }

    if (template == "custom") {
      item.description = parseContent(config.template.custom, { ...item, arg });
      debug(item.description, 'description');
      html = cheerio.load(item.description);
      if (arg?.proxyAgent?.enabled) {
        await Promise.all(html('img').map(async (v: any, i: any) => i.attribs.src = await getImageUrl(i.attribs.src, arg, true)));
      }
      html('img').attr('style', 'object-fit:scale-down;max-width:100%;');
      if (config.basic.imageMode == 'base64') {
        msg = (await renderHtml2Image(html.html())).toString();
      } else if (config.basic.imageMode == 'File') {
        msg = await ctx.puppeteer.render(html.html());
        msg = await puppeteerToFile(msg);
      }
      msg = parseContent(config.template.customRemark, { ...item, arg, description: msg });
      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤掉没有 src 的视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
    }
    else if (template == "content") {
      html = cheerio.load(item.description);
      let imgList: string[] = [];
      html('img').map((key: any, i: any) => imgList.push(i.attribs.src));
      imgList = [...new Set(imgList)];
      // 获取所有图片链接
      let imgBufferList = Object.assign({}, ...(await Promise.all(imgList.map(async (src: string) => ({ [src]: await getImageUrl(src, arg) })))));

      // 占位符替换
      html('img').replaceWith((key: any, Dom: any) => `<p>$img{{${imgList[key]}}}</p>`);
      msg = html.text();

      // ★★★ 修复点：如果 finalUrl 为空，返回空字符串，不要生成 <img src=""/> ★★★
      item.description = msg.replace(/\$img\{\{(.*?)\}\}/g, (match: string) => {
        let src = match.match(/\$img\{\{(.*?)\}\}/)[1];
        let finalUrl = imgBufferList[src];
        return finalUrl ? `<img src="${finalUrl}"/>` : '';
      });

      msg = parseContent(config.template.content, { ...item, arg });

      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤掉没有 src 的视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
      // ★★★ 修复点：过滤掉没有 src 的视频封面图 ★★★
      msg += videoList.filter(([src, poster]) => poster).map(([src, poster]) => h('img', { src: poster })).join("");
    }
    else if (template == "only text") {
      html = cheerio.load(item.description);
      msg = html.text();
    }
    else if (template == "only media") {
      html = cheerio.load(item.description);
      let imgList: string[] = [];
      html('img').map((key: any, i: any) => imgList.push(i.attribs.src));
      imgList = await Promise.all([...new Set(imgList)].map(async (src: string) => await getImageUrl(src, arg)));

      // ★★★ 修复点：过滤空图片 ★★★
      msg = imgList.filter(Boolean).map(img => `<img src="${img}"/>`).join("");

      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤空视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
    }
    else if (template == "only image") {
      html = cheerio.load(item.description);
      let imgList: string[] = [];
      html('img').map((key: any, i: any) => imgList.push(i.attribs.src));
      imgList = await Promise.all([...new Set(imgList)].map(async (src: string) => await getImageUrl(src, arg)));

      // ★★★ 修复点：过滤空图片 ★★★
      msg = imgList.filter(Boolean).map(img => `<img src="${img}"/>`).join("");
    }
    else if (template == "only video") {
      html = cheerio.load(item.description);
      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤掉没有 src 的视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
    }
    else if (template == "proto") {
      msg = item.description;
    }
    else if (template == "default") {
      item.description = parseContent(getDefaultTemplate(config.template.bodyWidth, config.template.bodyPadding, config.template.bodyFontSize), { ...item, arg });
      debug(item.description, 'description');
      html = cheerio.load(item.description);
      if (arg?.proxyAgent?.enabled) {
        await Promise.all(html('img').map(async (v: any, i: any) => i.attribs.src = await getImageUrl(i.attribs.src, arg, true)));
      }
      html('img').attr('style', 'object-fit:scale-down;max-width:100%;');
      if (config.basic.imageMode == 'base64') {
        msg = (await renderHtml2Image(html.html())).toString();
      } else if (config.basic.imageMode == 'File') {
        msg = await ctx.puppeteer.render(html.html());
        msg = await puppeteerToFile(msg);
      }
      if (config.basic.imageMode == 'File') msg = await puppeteerToFile(msg);
      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤掉没有 src 的视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
    }
    else if (template == "only description") {
      item.description = parseContent(getDescriptionTemplate(config.template.bodyWidth, config.template.bodyPadding, config.template.bodyFontSize), { ...item, arg });
      html = cheerio.load(item.description);
      if (arg?.proxyAgent?.enabled) {
        await Promise.all(html('img').map(async (v: any, i: any) => i.attribs.src = await getImageUrl(i.attribs.src, arg, true)));
      }
      html('img').attr('style', 'object-fit:scale-down;max-width:100%;');
      if (config.basic.imageMode == 'base64') {
        msg = (await renderHtml2Image(html.html())).toString();
      } else if (config.basic.imageMode == 'File') {
        msg = await ctx.puppeteer.render(html.html());
        msg = await puppeteerToFile(msg);
      }
      await Promise.all(html('video').map(async (v: any, i: any) => videoList.push([await getVideoUrl(i.attribs.src, arg, true, i), (i.attribs.poster && config.basic.usePoster) ? await getImageUrl(i.attribs.poster, arg, true) : ""])));

      // ★★★ 修复点：过滤掉没有 src 的视频 ★★★
      msg += videoList.filter(([src]) => src).map(([src, poster]) => h('video', { src, poster })).join("");
    }
    else if (template == "link") {
      html = cheerio.load(item.description);
      let src = html('a')[0].attribs.href;
      debug(src, 'link src', 'info');
      let html2 = cheerio.load((await $http(src, arg)).data);
      if (arg?.proxyAgent?.enabled) {
        await Promise.all(html2('img').map(async (v: any, i: any) => i.attribs.src = await getImageUrl(i.attribs.src, arg, true)));
      }
      html2('img').attr('style', 'object-fit:scale-down;max-width:100%;');
      html2('body').attr('style', `width:${config.template.bodyWidth}px;padding:${config.template.bodyPadding}px;`);
      if (config.basic.imageMode == 'base64') {
        msg = (await renderHtml2Image(html2.xml())).toString();
      } else if (config.basic.imageMode == 'File') {
        msg = await ctx.puppeteer.render(html2.xml());
        msg = await puppeteerToFile(msg);
      }
    }

    if (config.msg.censor) {
      msg = `<censor>${msg}</censor>`;
    }

    // --- AI 自动拼接逻辑 START ---
    // 如果生成了摘要，且用户使用的模板里没有显式包含 {{aiSummary}}，则自动拼接
    if (formattedAiSummary && !hasCustomAiTemplate && config.ai) {
      const sep = config.ai.separator || '----------------';
      if (config.ai.placement === 'bottom') {
        // 底部：正文 + 分割线 + 摘要
        msg = msg + `\n${sep}\n` + formattedAiSummary;
      } else {
        // 顶部：摘要 + 分割线 + 正文
        msg = formattedAiSummary + `\n${sep}\n` + msg;
      }
    }
    // --- AI 自动拼接逻辑 END ---

    debug(msg, "parse:msg", 'info');
    return msg;
  }
  const findRssItem = (rssList:any[],keyword:number|string)=>{
    let index = ((rssList.findIndex(i => i.rssId === +keyword) + 1) ||
      (rssList.findIndex(i => i.url == keyword) + 1) ||
      (rssList.findIndex(i => i.url.indexOf(keyword) + 1) + 1) ||
      (rssList.findIndex(i => i.title.indexOf(keyword) + 1) + 1)) - 1
    return rssList[index]
  }
  const getLastContent = (item)=>{
    let arr = ['title','description','link','guid']
    let obj = Object.assign({},...arr.map(i=>clone(item?.[i]?{[i]:item[i]}:{})))
    return {...obj,description:String(obj?.description).replaceAll(/\s/g,'')}
  }
  const feeder = async () => {
    debug("feeder");
    const rssList = await ctx.database.get(('rssOwl' as any), {})
    debug(rssList,'rssList','info');
    
    for (const rssItem of rssList) {
      try {
        let arg: rssArg = mixinArg(rssItem.arg || {})
        debug(arg,'arg','details')
        debug(rssItem.arg,'originalArg','details')
        let originalArg = clone(rssItem.arg || {})
        
        if (rssItem.arg.interval) {
          if (arg.nextUpdataTime > +new Date()) continue
          originalArg.nextUpdataTime = arg.nextUpdataTime + arg.interval*Math.ceil((+new Date() - arg.nextUpdataTime)/arg.interval)
        }
        try {
          let rssItemList = (await Promise.all(rssItem.url.split("|")
            .map(i=>parseQuickUrl(i))
            .map(async url => await getRssData(url, arg)))).flat(1)
          let itemArray = rssItemList.sort((a, b) => parsePubDate(b.pubDate).getTime() - parsePubDate(a.pubDate).getTime())
            .filter(item => !arg.filter?.some(keyword => {
              let isFilter = new RegExp(keyword, 'im').test(item.title) || new RegExp(keyword, 'im').test(item.description)
              if(isFilter){
                debug(`filter:${keyword}`,'','info')
                debug(item,'filter rss item','info')
                return true
              }else{return false}
            }))
          
          let lastContent = {itemArray:config.basic.resendUpdataContent==='all'?itemArray.map(getLastContent):config.basic.resendUpdataContent==='latest'? [getLastContent(itemArray[0])] :[]}
          
          let lastPubDate = parsePubDate(itemArray[0].pubDate)
          if (arg.reverse) {
            itemArray = itemArray.reverse()
          }
          debug(itemArray[0],'first rss response','details');
          let messageList, rssItemArray
          if (rssItem.arg.forceLength) {
            // debug("forceLength");
            debug(`forceLength:${rssItem.arg.forceLength}`,'','details');
            rssItemArray = itemArray.filter((v, i) => i < arg.forceLength)
            debug(rssItemArray.map(i => i.title),'','info');
            messageList = await Promise.all(itemArray.filter((v, i) => i < arg.forceLength).map(async i => await parseRssItem(i, {...rssItem,...arg}, rssItem.author)))
          } else {
            // 【修复 2】: 这里逻辑全部重写，去除有 Bug 的时间容错，改为严格大于
            rssItemArray = itemArray.filter((v, i) => {
              const currentPubDate = parsePubDate(v.pubDate).getTime();
              const lastPubDateVal = rssItem.lastPubDate?.getTime?.() || new Date(rssItem.lastPubDate).getTime();

              // 关键修复：改为严格大于。 移除 -5000 缓冲区，避免死循环。
              const isNewTime = currentPubDate > lastPubDateVal;

              return isNewTime || rssItem.lastContent?.itemArray?.some(oldRssItem => {
                if (config.basic.resendUpdataContent === 'disable') return false
                let newItem = getLastContent(v)
                let isSame = newItem.guid ? newItem.guid === oldRssItem.guid : (newItem.link === oldRssItem.link && newItem.title === oldRssItem.title)
                if (!isSame) return false
                debug(JSON.stringify(oldRssItem.description), 'oldRssItem', 'details')
                debug(JSON.stringify(newItem.description), 'newItem', 'details')
                return JSON.stringify(oldRssItem.description) !== JSON.stringify(newItem.description)
              })
            }).filter((v, i) => !arg.maxRssItem || i < arg.maxRssItem)
            if (!rssItemArray.length) continue
            debug(`${JSON.stringify(rssItem)}:共${rssItemArray.length}条新信息`,'','info');
            debug(rssItemArray.map(i => i.title),'','info');
            messageList = await Promise.all(rssItemArray.reverse().map(async i => await parseRssItem(i, {...rssItem,...arg}, rssItem.author)))
          }
          let message
          if(!messageList.join("")){
            // 如果解析不出内容，也应该更新时间，防止反复解析空内容
            await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { lastPubDate, arg:originalArg, lastContent })
            continue
          }
          if (arg.merge===true) {
            message = `<message forward><author id="${rssItem.author}"/>${messageList.join("")}</message>`
          } else if (arg.merge === false) {
            message = messageList.join("")
          } else if (config.basic.margeVideo&&messageList.some(msg=>(/<video.*>/).test(msg))) {
            message = `<message forward><author id="${rssItem.author}"/>${messageList.map(i=>`<message>${i}</message>`).join("")}</message>`
          } else if (config.basic.merge == "一直合并") {
            message = `<message forward><author id="${rssItem.author}"/>${messageList.map(i=>`<message>${i}</message>`).join("")}</message>`
          } else if (config.basic.merge == "不合并") {
            message = messageList.join("")
          } else if (config.basic.merge == "有多条更新时合并") {
            message = messageList.length > 1 ? `<message forward><author id="${rssItem.author}"/>${messageList.map(i=>`<message>${i}</message>`).join("")}</message>` : messageList.join("")
          }
          debug(`更新内容采集完成:${rssItem.title}`,'','info')
          if(rssItem.followers.length){
            message += `<message>${rssItem.followers.map(followId=>`<at ${followId=='all'?'type':'id'}='${followId}'/>` )}</message>`
          }

          // 发送逻辑改进：捕获发送错误，防止死循环
          try {
            const broadcast = await ctx.broadcast([`${rssItem.platform}:${rssItem.guildId}`], message)
            if(!broadcast.length) {
              logger.warn(`RSS [${rssItem.title}] 消息生成成功但未发送给任何目标 (可能群不存在或Bot被禁言)`)
            } else {
              debug(`更新成功:${rssItem.title}`,'','info')
            }
          } catch (sendError) {
            logger.error(`RSS推送失败 [${rssItem.title}]: ${sendError.message}`)
            logger.warn(`已跳过该条 RSS 更新以防止无限重试循环。`)
          }

          // 关键：无论发送成功还是失败，都更新数据库状态，防止死循环
          try {
            await ctx.database.set(('rssOwl' as any), { id: rssItem.id }, { lastPubDate, arg:originalArg, lastContent })
          } catch (dbError) {
            logger.error(`数据库更新失败: ${dbError}`)
          }
        } catch (error) {
          debug(error,`更新失败:${JSON.stringify({...rssItem,lastContent:"..."})}`,'error')
        }
        
      } catch (error) {
        debug(error,'','error')
      }
    }
  }
  const formatArg = (options): rssArg => {
    let { arg, template, daily } = options
    let json = Object.assign({}, ...(arg?.split(',')?.map(i => ({ [i.split(":")[0]]: i.split(":")[1] })) || []))
    let key = ["forceLength", "reverse", "timeout", "interval", "merge", "maxRssItem", "firstLoad", "bodyWidth", "bodyPadding", "proxyAgent", "auth"]
    let booleanKey = ['firstLoad',"reverse", 'merge']
    let numberKey = ['forceLength', "timeout",'interval','maxRssItem','bodyWidth','bodyPadding']
    let falseContent = ['false', 'null', '']

    json = Object.assign({}, ...Object.keys(json).filter(i => key.some(key => key == i)).map(key => ({ [key]: booleanKey.some(bkey => bkey == key) ? falseContent.some(c => c == json[key]) : numberKey.some(nkey => nkey == key)?(+json[key]):json[key] })))


    // if (rssItem) {
    //   json['rssItem'] = rssItem.split(',')
    // }
    if (template && templateList.find(i => new RegExp(template).test(i))) {
      json['template'] = templateList.find(i => new RegExp(template).test(i))
    }
    if (daily) {
      json['interval'] = 1440
      let [hour = 8, minutes = 0] = daily.split("/")[0].split(":").map(i => parseInt(i))
      minutes = minutes > 60 ? 0 : minutes < 0 ? 0 : minutes
      let date = new Date()
      date.setHours(hour,minutes,0,0)
      if(+new Date()>+date){date.setDate(date.getDate()+1)}
      json.nextUpdataTime = +date
      
      let forceLength = parseInt(options.daily.split("/")?.[1])
      if (forceLength) {
        json.forceLength = forceLength
      }
    }
    if (json.interval) {
      json.interval = json.interval ? (parseInt(json.interval) * 1000) : 0
      // json.nextUpdataTime = +new Date() + json.interval
    }
    if (json.forceLength) {
      json.forceLength = parseInt(json.forceLength)
    }
    if (json.filter) {
      json.filter = json.filter.split("/")
    }
    if (json.block) {
      json.block = json.block.split("/")
    }
    if (json.proxyAgent) {
      if (json.proxyAgent == 'false' || json.proxyAgent == 'none' || json.proxyAgent === '') {
        json.proxyAgent = { enabled: false }
      } else {
        let protocolMatch = json.proxyAgent.match(/^(http|https|socks5)/)
        let protocol = protocolMatch ? protocolMatch[1] : 'http'
        let hostMatch = json.proxyAgent.match(/:\/\/([^:\/]+)/)
        let host = hostMatch ? hostMatch[1] : ''
        let portMatch = json.proxyAgent.match(/:(\d+)/)
        let port = portMatch ? parseInt(portMatch[1]) : 7890
        let proxyAgent = { enabled: true, protocol, host, port }
        json.proxyAgent = proxyAgent
        if (json.auth) {
          let username = json.auth.split("/")[0]
          let password = json.auth.split("/")[1]
          let auth = { username, password }
          json.proxyAgent.auth = auth
        }
      }
    }
    debug(json,'formatArg','details')
    return json
  }
  const mixinArg = (arg):rssArg => ({
    ...Object.assign({}, ...Object.entries(config).map(([key,value])=>typeof value === 'object'?value:{[key]:value})),
    ...arg,
    filter:[...config.msg.keywordFilter,...(arg?.filter||[])],
    block:[...config.msg.keywordBlock,...(arg?.block||[])],
    template: arg.template ?? config.basic.defaultTemplate,
    proxyAgent: arg?.proxyAgent ? (
      arg.proxyAgent?.enabled ? (
        arg.proxyAgent?.host ? arg.proxyAgent :
        {
          ...config.net.proxyAgent,
          auth: config.net.proxyAgent?.auth?.enabled ? config.net.proxyAgent.auth : undefined
        }
      ) : { enabled: false }
    ) : (config.net.proxyAgent?.enabled ? {
      ...config.net.proxyAgent,
      auth: config.net.proxyAgent?.auth?.enabled ? config.net.proxyAgent.auth : undefined
    } : {})
  })
  ctx.on('ready', async () => {
    // await ctx.broadcast([`sandbox:rdbvu1xb9nn:#`], '123')
    // await sendMessageToChannel(ctx,{platform:"sandbox:rdbvu1xb9nn",guildId:"#"},"123")
    feeder()
    interval = setInterval(async () => {
      // 先清理缓存,再执行 feeder
      if(config.basic.imageMode=='File') {
        await delCache()
      }
      await feeder()
    }, config.basic.refresh * 1000)
  })
  ctx.on('dispose', async () => {
    clearInterval(interval)
    if(config.basic.imageMode=='File')delCache()
  })
  ctx.guild()
    .command('rssowl <url:text>', '*订阅 RSS 链接*')
    .alias('rsso')
    .usage(usage)
    .option('list', '-l [content] 查看订阅列表(详情)')
    .option('remove', '-r <content> [订阅id|关键字] *删除订阅*')
    .option('removeAll', '*删除全部订阅*')
    .option('follow', '-f <content> [订阅id|关键字] 关注订阅，在该订阅更新时提醒你')
    .option('followAll', '<content> [订阅id|关键字] **在该订阅更新时提醒所有人**')
    .option('target', '<content> [群组id] **跨群订阅**')
    .option('arg', '-a <content> 自定义配置')
    .option('template', '-i <content> 消息模板[content(文字模板)|default(图片模板)],更多见readme')
    .option('title', '-t <content> 自定义命名')
    .option('pull', '-p <content> [订阅id|关键字]拉取订阅id最后更新')
    .option('force', '强行写入')
    // .option('rule', '-u <ruleObject:object> 订阅规则，用于对非RSS链接的内容提取') 
    .option('daily', '-d <content>')
    .option('test', '-T 测试')
    .option('quick', '-q [content] 查询快速订阅列表')
    .example('rsso https://hub.slarker.me/qqorw')
    .action(async ({ session, options }, url) => {
      debug(options,'options','info')
      
      const { id: guildId } = session.event.guild as any
      const { platform } = session.event as any
      const { id: author } = session.event.user as any
      const { authority } = session.user as any
      
      debug(`${platform}:${author}:${guildId}`,'','info')
      if (options?.quick==='') {
        return '输入 rsso -q [id] 查询详情\n'+quickList.map((v,i)=>`${i+1}.${v.name}`).join('\n')
      }
      if (options?.quick) {
        let correntQuickObj = quickList[parseInt(options?.quick)-1]
        return `${correntQuickObj.name}\n${correntQuickObj.detail}\n例:rsso -T ${correntQuickObj.example}\n(${parseQuickUrl(correntQuickObj.example)})`
      }
      if ((platform.indexOf("sandbox") + 1) && !options.test && url) {
        session.send('沙盒中无法推送更新，但RSS依然会被订阅，建议使用 -T 选项进行测试')
      }
      // session.send(__filename)
      const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })
      
      if (options?.list==='') {
        debug(rssList,'rssList','info')
        if (!rssList.length) return '未订阅任何链接。'
        return "使用'rsso -l [id]'以查询详情 \nid:标题(最后更新)\n" + rssList.map(i => `${i.rssId}:${i.title || i.url} (${new Date(i.lastPubDate).toLocaleString('zh-CN')})`).join('\n')
      }
      if (options?.list) {
        let rssObj = findRssItem(rssList,options.list)
        if (!rssObj) {
          return `未找到${options.list}`
        }
        if(!rssObj)return '未找到订阅。请输入"rsso -l"查询列表或"rsso -l [订阅id]"查询订阅详情'
        const showArgNameList = ['rssId','title','url','template','platform','guildId','author','merge','timeout','interval','forceLength','nextUpdataTime','maxRssItem','lastPubDate']
        const _rssArg = Object.assign(rssObj.arg,rssObj)
        return showArgNameList.map(argName=>{
          if(!_rssArg?.[argName])return ''
          let text = ''
          if(argName==='url'){
            text = _rssArg?.[argName].split("|").map(i=>` ${parseQuickUrl(i)} ${i==parseQuickUrl(i)?'':`(${i})`}`).join(" | ")
          }else if(argName.includes('Date')||argName.includes('Time')){
            text = new Date(_rssArg?.[argName]).toLocaleString('zh-CN')
          }else{
            text = typeof _rssArg?.[argName] ==='object'? JSON.stringify(_rssArg?.[argName]):_rssArg?.[argName]
          }
          return `${argName}:${text}`
        }).filter(Boolean).join('\n')
         
      }
      if (options.remove) {
        if(authority<config.basic.authority){
          return `权限不足，请联系管理员提权\n平台名:${platform}\n帐号:${author}\n当前权限等级:${authority}`
        }
        debug(`remove:${options.remove}`,'','info')
        
        let removeItem = findRssItem(rssList,options.remove)
        if (!removeItem) {
          return `未找到${options.remove}`
        }
        debug(`remove:${removeItem}`,'','info')
        ctx.database.remove(('rssOwl' as any), { id: removeItem.id })
        return `已取消订阅：${removeItem.title}`
      }
      if (options?.removeAll != undefined) {
        if(authority<config.basic.authority){
          return `权限不足，请联系管理员提权\n平台名:${platform}\n帐号:${author}\n当前权限等级:${authority}\n需求权限等级:${config.basic.authority}`
        }
        // debug(`removeAll:${rssList.length}`)
        debug(rssList,'','info')
        let rssLength = rssList.length
        await ctx.database.remove(('rssOwl' as any), { platform, guildId })
        return `已删除${rssLength}条`
      }
      if (options.follow) {
        debug(`follow:${options.follow}`,'','info')
        let followItem = findRssItem(rssList,options.follow)
        if (!followItem) {
          return `未找到${options.follow}`
        }
        let followers:any[] = followItem.followers
        let followIndex = followers.findIndex(followId=>followId == author)
        if(followIndex>-1){
          followers.splice(followIndex,1)
          await ctx.database.set(('rssOwl' as any), { id: followItem.id }, { followers })
          return `取消关注：${followItem.title}`
        }else{
          followers.push(author)
          await ctx.database.set(('rssOwl' as any), { id: followItem.id }, { followers })
          return `关注订阅：${followItem.title}`
        }
      }
      if (options?.followAll) {
        if(authority<config.basic.advancedAuthority){
          return `权限不足，请联系管理员提权\n平台名:${platform}\n帐号:${author}\n当前权限等级:${authority}\n需求权限等级:${config.basic.advancedAuthority}`
        }
        debug(`follow:${options.followAll}`,'','info')
        let followItem = findRssItem(rssList,options.followAll)
        if (!followItem) {
          return `未找到${options.followAll}`
        }
        let followers:any[] = followItem.followers
        let followIndex = followers.findIndex(followId=>followId == 'all')
        if(followIndex>-1){
          followers.splice(followIndex,1)
          await ctx.database.set(('rssOwl' as any), { id: followItem.id }, { followers })
          return `取消全体关注：${followItem.title}`
        }else{
          followers.push('all')
          await ctx.database.set(('rssOwl' as any), { id: followItem.id }, { followers })
          return `全体关注订阅：${followItem.title}`
        }
      }

      if (options.pull) {
        let item = rssList.find(i => i.rssId === +options.pull) ||
          rssList.find(i => i.url == options.pull) ||
          rssList.find(i => i.url.indexOf(options.pull) + 1) ||
          rssList.find(i => i.title.indexOf(options.pull) + 1)
        if (item == -1) {
          return `未找到${options.pull}`
        }
        debug(`pull:${item.title}`,'','info')
        let { url, author, arg } = item
        arg = mixinArg(arg)
        //
        let rssItemList = await Promise.all(url.split("|")
          .map(i=>parseQuickUrl(i))
          .map(async url => await getRssData(url, arg)))
        let itemArray = rssItemList.flat(1)
          .sort((a, b) => parsePubDate(b.pubDate).getTime() - parsePubDate(a.pubDate).getTime())
        debug(itemArray,'itemArray','info');
        let rssItemArray = itemArray.filter((v, i) => arg.forceLength ? (i < arg.forceLength) : (i < 1)).filter((v, i) => arg.maxRssItem ? (i < arg.maxRssItem) : true)
        debug(rssItemArray,"rssItemArray",'info');
        let messageList = (await Promise.all(rssItemArray.reverse().map(async i => await parseRssItem(i, {...item,...arg}, author)))).flat(Infinity)
        // debug("mergeItem");
        debug(messageList,"mergeItem",'info')
        return `<message forward>${messageList.join('')}</message>`
      }
      let item
      let optionArg = formatArg(options)
      let arg = mixinArg(optionArg)
      let urlList = url?.split('|')?.map(i=>parseQuickUrl(i))
      const subscribe = {
        url,
        platform,
        guildId,
        author,
        rssId: (+rssList.slice(-1)?.[0]?.rssId || 0) + 1,
        arg: optionArg,
        lastContent:{itemArray:[]},
        title: options.title || (urlList.length > 1 && `订阅组:${new Date().toLocaleString('zh-CN')}`) || "",
        lastPubDate: new Date()
      }
      if(options.target){
        if(authority<config.basic.advancedAuthority){
          return `权限不足，请联系管理员提权\n平台名:${platform}\n帐号:${author}\n当前权限等级:${authority}\n需求权限等级:${config.basic.advancedAuthority}`
        }
        let targetGuildId = +options.target
        if(!targetGuildId){
          return "请输入群ID"
        }
        
        subscribe.guildId = targetGuildId
        const _rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId:targetGuildId })
        subscribe.rssId = (+_rssList.slice(-1)?.[0]?.rssId || 0) + 1

      }

      if(authority<config.basic.authority){
        return `权限不足，请联系管理员提权\n平台名:${platform}\n帐号:${author}\n当前权限等级:${authority}\n需求权限等级:${config.basic.authority}`
      }
      if (options.test) {
        debug(`test:${url}`,'','info')
        debug({ guildId, platform, author, arg, optionArg },'','info')
        try {
          if (!url) return '请输入URL'
          let rssItemList
          try {
            rssItemList = await Promise.all(urlList
              .map(async url => await getRssData(url, arg)))
          } catch (error) {
            throw new Error(`订阅源请求失败:${error}\n请检查url是否可用:${urlList.map(i=>parseQuickUrl(i)).join()}`)
          }
          let itemArray = rssItemList
            .flat(1)
            .sort((a, b) => parsePubDate(b.pubDate).getTime() - parsePubDate(a.pubDate).getTime())
          let rssItemArray = itemArray.filter((v, i) => arg.forceLength ? (i < arg.forceLength) : (i < 1)).filter((v, i) => arg.maxRssItem ? (i < arg.maxRssItem) : true)
          let messageList
          try {
            messageList = (await Promise.all(rssItemArray.reverse().map(async i => await parseRssItem(i, {...subscribe,...arg}, author)))).flat(Infinity)
          } catch (error) {
            throw new Error(`订阅内容请求失败:${error}`)
          }
          return `<message forward>${messageList.join('')}</message>`
        } catch (error) {
          return `error:${error}`
        }
      }
      if (config.basic.urlDeduplication && (rssList.findIndex(i => i.url == url) + 1)) {
        return '已订阅此链接。'
      }
      debug(url,'','info')
      if (!url) {
        return '未输入url'
      }
      debug(subscribe,"subscribe",'info');
      if (options.force) {
        await ctx.database.create(('rssOwl' as any), subscribe)
        return '添加订阅成功'
      }
      try {
        if (!url) return '请输入URL'
        let rssItemList
        if(config.net.proxyAgent.autoUseProxy&&optionArg?.proxyAgent?.enabled===undefined){
          try {
            rssItemList = await Promise.all(urlList.map(async url => await getRssData(url, {...arg,proxyAgent:{enabled:false}})))
          } catch (error) {
            optionArg.proxyAgent = {enabled:true}
            rssItemList = await Promise.all(urlList.map(async url => await getRssData(url, arg)))
          }
        }else{
          rssItemList = await Promise.all(urlList.map(async url => await getRssData(url, arg)))
        }
        let itemArray = rssItemList.flat(1).sort((a, b) => parsePubDate(b.pubDate).getTime() - parsePubDate(a.pubDate).getTime())
        .filter((v, i) => arg.forceLength ? (i < arg.forceLength) : (i < 1))
        .filter((v, i) => arg.maxRssItem ? (i < arg.maxRssItem) : true)
        if(urlList.length === 1)subscribe.title = subscribe.title || itemArray[0].rss.channel.title
        item = itemArray[0]
        if (!(item.pubDate || optionArg.forceLength)) {
          return "RSS中未找到可用的pubDate，这将导致无法取得更新时间，请使用forceLength属性强制在每次更新时取得最新的订阅内容"
        }
        
        subscribe.rssId =  (+(await ctx.database.get(('rssOwl' as any), { platform, guildId })).slice(-1)?.[0]?.rssId || 0) + 1
        subscribe.lastPubDate =  parsePubDate(item.pubDate)
        
        subscribe.lastContent = {itemArray:config.basic.resendUpdataContent==='all'?rssItemList.flat(1).map(getLastContent):config.basic.resendUpdataContent==='latest'? [getLastContent(itemArray[0])] :[]}
        itemArray = arg.forceLength?itemArray:[itemArray[0]]
        let messageList
        if(config.net.proxyAgent.autoUseProxy&&optionArg?.proxyAgent?.enabled===undefined&&!optionArg.proxyAgent){
          try {
            messageList = await Promise.all(itemArray.map(async () => await parseRssItem(item, {...subscribe,...arg,proxyAgent:{enabled:false}}, item.author)))
            optionArg.proxyAgent = {enabled:false}
          } catch (error) {
            messageList = await Promise.all(itemArray.map(async () => await parseRssItem(item, {...subscribe,...arg}, item.author)))
            optionArg.proxyAgent = {enabled:true}
          }
          subscribe.arg= optionArg
        }else{
          messageList = await Promise.all(itemArray.map(async () => await parseRssItem(item, {...subscribe,...arg}, item.author)))
        }
        ctx.database.create(('rssOwl' as any), subscribe)
        return arg.firstLoad?(`<message>添加订阅成功</message>${arg.merge ? `<message forward><author id="${item.author}"/>${messageList.join("")}</message>` : messageList.join("")}`):'添加订阅成功'
      } catch (error) {
        debug(error,'添加失败','error')
        return `添加失败:${error}`
      }
    })
}