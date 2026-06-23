import { Context } from 'koishi'

// assets 服务类型声明
declare module 'koishi' {
  interface Context {
    assets?: {
      upload(dataUrl: string, filename: string): Promise<string>
    }
  }
}

// ffmpeg 服务类型声明（由 koishi-plugin-ffmpeg 提供，可选注入）
// 仅用到 .executable（ffmpeg 二进制路径）；完整 FFmpeg 服务还有 builder 等能力
declare module 'koishi' {
  interface Context {
    ffmpeg?: {
      executable: string
    }
  }
}

declare module 'koishi' {
  interface rssOwl {
    id: string | number
    url: string
    platform: string
    guildId: string
    author: string
    rssId: string | number
    arg: rssArg,
    title: string
    lastPubDate: Date
  }

  interface rss_message_cache {
    id: number
    rssId: string
    guildId: string
    platform: string
    title: string
    content: string
    link: string
    pubDate: Date
    imageUrl: string
    videoUrl: string
    createdAt: Date
  }
}

export interface Config {
  basic?: BasicConfig
  template?: TemplateConfig
  net?: NetConfig
  msg?: MsgConfig
  ai?: AiConfig
  search?: SearchConfig
  cache?: CacheConfig
  queue?: QueueConfig
  security?: SecurityConfig
  debug?: "disable"|"error"|"info"|"details"
  logging?: LoggingConfig
  errorTracking?: ErrorTrackingConfig
  tdl?: TdlConfig
}

export const debugLevel = ["disable","error","info","details"]

export type TemplateType =
  | 'auto'
  | 'content'
  | 'only text'
  | 'only media'
  | 'only image'
  | 'only video'
  | 'proto'
  | 'default'
  | 'only description'
  | 'custom'
  | 'link'

export interface CustomTemplateItem {
  name: string
  pptr?: boolean
  content: string
  remark?: string
}

export interface BasicConfig {
  usePoster: boolean;
  mergeVideo?: boolean
  margeVideo?: boolean
  defaultTemplate?: TemplateType
  timeout?: number
  refresh?: number
  merge?: '不合并' | '有多条更新时合并' | '一直合并'
  maxRssItem?: number
  firstLoad?: boolean
  urlDeduplication?: boolean
  resendUpdatedContent?: 'disable'|'latest'|'all'
  resendUpdataContent?: 'disable'|'latest'|'all'
  imageMode?: 'base64' | 'File' | 'assets'
  videoMode?: 'filter'|'href'|'base64' | 'File' | 'assets'
  autoSplitImage?: boolean
  cacheDir?: string
  replaceDir?: string
  maxImageSize?: number  // 图片最大文件大小（MB）
  maxVideoSize?: number  // 视频最大文件大小（MB）

  authority:number
  advancedAuthority:number
}

export interface TemplateConfig {
  customRemark: string;
  bodyWidth?: number
  bodyPadding?: number
  bodyFontSize?: number
  deviceScaleFactor?: 0.5 | 1 | 1.5 | 2 | 3
  content?: string
  custom?: string
  customTemplate?: CustomTemplateItem[]
}

export interface NetConfig {
  userAgent?: string
  proxyAgent?: proxyAgent
}

export interface MsgConfig {
  censor?: boolean
  keywordFilter?: Array<string>
  keywordBlock?: Array<string>
  blockString?:string
  rssHubUrl?:string
}

export interface AiConfig {
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

export interface proxyAgent {
  enabled?: boolean
  autoUseProxy?: boolean
  protocol?: string
  host?: string,
  port?: number
  auth?: auth
}

export interface auth {
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
  template?: TemplateType
  content?: string

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
  bodyFontSize?: number
  filter?: Array<string>
  block?: Array<string>


  split?:number

  nextUpdateTime?: number
  nextUpdataTime?: number
  mergeVideo?: boolean
  margeVideo?: boolean
  resendUpdatedContent?: 'disable'|'latest'|'all'
  resendUpdataContent?: 'disable'|'latest'|'all'

  // HTML 监控相关字段
  type?: 'rss' | 'html'
  selector?: string
  textOnly?: boolean
  mode?: 'static' | 'puppeteer'
  waitFor?: number
  waitSelector?: string
}

export interface CacheConfig {
  enabled?: boolean
  maxSize?: number  // 最大缓存条数，默认 100
}

export interface QueueConfig {
  batchSize?: number
  maxRetries?: number
  processInterval?: number
  cleanupHours?: number
}

export interface LoggingConfig {
  structured?: boolean  // 启用结构化日志（JSON格式）
  includeTimestamp?: boolean  // 包含时间戳
  includeLevel?: boolean  // 包含日志级别
  includeModule?: boolean  // 包含模块名
  includeContext?: boolean  // 包含额外上下文信息
  contextFields?: string[]  // 要包含的上下文字段
  sanitizeLogs?: boolean  // 是否自动脱敏日志中的敏感信息（默认 true）
}

export interface ErrorTrackingConfig {
  enabled?: boolean
  dsn?: string
  environment?: string
  release?: string
  tracesSampleRate?: number
  profilesSampleRate?: number
}

/**
 * 联网搜索配置
 */
/**
 * 安全配置
 */
export interface SecurityConfig {
  enabled?: boolean        // 是否启用安全检查（默认 false，不启用）
  whitelist?: string[]   // 白名单域名
  blacklist?: string[]   // 黑名单域名
  allowHttp?: boolean    // 是否允许 HTTP（默认 true）
  allowHttps?: boolean   // 是否允许 HTTPS（默认 true）
  allowInternalAccess?: boolean  // 是否允许访问内网 IP（默认 false）
  sanitizeHtml?: boolean // 是否启用 HTML 清理（默认 true）
  maxCacheSize?: number  // AI 缓存最大条数
}

export interface SearchConfig {
  enabled?: boolean  // 是否启用联网搜索
  engine?: 'tavily' | 'searxng' | 'volcengine' | 'auto'  // 搜索引擎选择，auto 表示自动选择
  maxResults?: number  // 最大结果数
  enginePriority?: Array<'tavily' | 'searxng' | 'volcengine'>  // 引擎优先级（当 engine 为 auto 时使用）
  tavily?: TavilyConfig  // Tavily 配置
  searxng?: SearxngConfig  // SearXNG 配置
  volcengine?: VolcengineConfig  // 火山引擎配置
}

/**
 * tdl（Telegram Downloader）配置
 *
 * tdl 是 iyear/tdl 提供的 Go 编写独立 CLI 工具，**不是 npm 包**。
 * 当 RSSHub 对 Telegram 超大视频返回 "Video is too big" 占位时，
 * 通过 tdl 直接从 Telegram 拉取原始视频，再按需用 ffmpeg 压缩后发送。
 *
 * 需用户在宿主机自行安装 tdl、ffmpeg 并完成 `tdl login`；
 * 插件运行时探测 PATH，缺失则跳过、绝不阻塞主流程。
 */
export interface TdlConfig {
  enabled?: boolean            // 是否启用 tdl 兜底下载（默认 false）
  timeout?: number             // tdl 单次下载超时（秒，默认 180）
  compressThreshold?: number   // 触发 ffmpeg 压缩的体积阈值（MB，默认沿用 basic.maxVideoSize=30）
  crf?: number                 // ffmpeg CRF 质量（18-32，越小质量越好体积越大，默认 30）
  proxyByEnv?: boolean         // 是否把订阅级代理透传给 tdl 子进程（默认 true）
  proxy?: string               // tdl/ffmpeg 子进程专用代理，形如 http://host:port；为空则用订阅级代理或全局代理
  storage?: string             // tdl 会话存储路径，如 /koishi/.tdl/data；登录与下载需一致，否则找不到会话
  binPath?: string             // tdl 二进制路径，默认从 PATH 探测；容器持久卷场景可指定如 /koishi/bin/tdl
  maxDownloadSize?: number     // 下载前预查的最大体积（MB）。超过则跳过整条不下载，省带宽。
                               // 通过 tdl chat export 读 Media.Size 实现。默认 200。
}

/**
 * Tavily 搜索配置
 */
export interface TavilyConfig {
  apiKey?: string  // Tavily API Key
  searchDepth?: 'basic' | 'advanced'  // 搜索深度
  includeAnswer?: boolean  // 是否包含 AI 生成的答案
}

/**
 * SearXNG 搜索配置
 */
export interface SearxngConfig {
  instanceUrl?: string  // SearXNG 实例 URL
  language?: string  // 搜索语言
  categories?: Array<'general' | 'news' | 'images' | 'videos'>  // 搜索类别
}

/**
 * 火山引擎搜索配置
 */
export interface VolcengineConfig {
  apiKey?: string  // 火山引擎 API Key（使用 AI 配置中的 baseUrl 和 model）
  models?: string[]  // 模型列表，支持轮询（默认使用 AI 配置中的 model）
  useAiModel?: boolean  // 是否使用 AI 配置中的 model（默认 true）
}
