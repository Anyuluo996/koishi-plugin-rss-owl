import { Schema } from 'koishi'
// 导入接口时重命名为 ConfigType，避免与下方的常量名冲突
import { Config as ConfigType, BasicConfig, TemplateConfig, NetConfig, MsgConfig, AiConfig, SearchConfig, proxyAgent, SecurityConfig } from './types'

export const templateList = ['auto','content', 'only text', 'only media','only image', 'only video', 'proto', 'default', 'only description', 'custom','link'] as const

/**
 * 将扁平化的搜索配置转换为嵌套的 SearchConfig
 * 这个函数在运行时调用，将 WebUI 的扁平配置转换为代码使用的嵌套配置
 */
export function normalizeSearchConfig(flatConfig: any): SearchConfig {
  const searchConfig: SearchConfig = {
    enabled: flatConfig.enabled || false,
    engine: flatConfig.engine || 'tavily',
    maxResults: flatConfig.maxResults || 5,
    enginePriority: flatConfig.enginePriority || ['tavily', 'volcengine', 'searxng']
  }

  // Tavily 配置
  if (flatConfig.tavilyApiKey) {
    searchConfig.tavily = {
      apiKey: flatConfig.tavilyApiKey,
      searchDepth: flatConfig.tavilySearchDepth || 'basic',
      includeAnswer: flatConfig.tavilyIncludeAnswer !== false
    }
  }

  // SearXNG 配置
  if (flatConfig.searxngInstanceUrl) {
    searchConfig.searxng = {
      instanceUrl: flatConfig.searxngInstanceUrl,
      language: flatConfig.searxngLanguage || 'all',
      categories: ['general'] // 固定为 general
    }
  }

  // 火山引擎配置
  if (flatConfig.volcengineApiKey) {
    searchConfig.volcengine = {
      apiKey: flatConfig.volcengineApiKey,
      models: flatConfig.volcengineModels ? flatConfig.volcengineModels.split(',').map((m: string) => m.trim()) : [],
      useAiModel: flatConfig.volcengineUseAiModel !== false
    }
  }

  return searchConfig
}

// 将 ConfigSchema 重命名为 Config，并指定泛型为 ConfigType
export const Config: Schema<ConfigType> = Schema.object({
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
    maxImageSize: Schema.number().description('图片最大文件大小限制（MB），超出限制的图片将被跳过').default(30),
    maxVideoSize: Schema.number().description('视频最大文件大小限制（MB），超出限制的视频将被跳过').default(30),
  }).description('基础设置'),
  template: Schema.object({
    bodyWidth: Schema.number().description('puppeteer图片的宽度(px)，较低的值可能导致排版错误，仅在非custom的模板生效').default(600),
    bodyPadding: Schema.number().description('puppeteer图片的内边距(px)仅在非custom的模板生效').default(20),
    bodyFontSize: Schema.number().description('puppeteer图片的字号(px)，0为默认值，仅在非custom的模板生效').default(0),
    deviceScaleFactor: Schema.union([0.5, 1, 1.5, 2, 3]).description('截图清晰度倍数，越大越清晰但文件也越大').default(1),
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
    prompt: Schema.string().role('textarea').description('提示词 ({{title}} 代表标题, {{content}} 代表内容)').default(`你是一位资深、严谨的新闻编辑。你的任务是基于【RSS原始内容】生成一份核心内容摘要。

【⚠️ 处理逻辑与纪律】
1. 锚定核心：摘要的核心事实（主角是谁、发生了什么事、当前时间点）**必须且只能以【RSS原始内容】为绝对基准**。
2. 智能补全：只有当【RSS原始内容】极短、残缺（如只有一句话导语）时，才从下方的"联网搜索结果"中提取相关细节进行拼图式补全。
3. 隔离噪音：联网搜索结果中常常包含历史事件、相似新闻或其他无关背景。绝不可将搜索结果中的"旧时间"、"次要人物"当作当前新闻的主体。
4. 冲突处理：如果搜索结果与原始内容发生矛盾（例如时间点不同），以【RSS原始内容】为最高真理。
5. 输出要求：直接输出摘要正文，语言要求简洁、流畅、直击要害，不要包含任何多余的废话。

【新闻标题】：{{title}}

【RSS原始内容】：
{{content}}

（请注意：系统稍后会在下方自动追加联网搜索内容，请你务必牢记上述【处理逻辑与纪律】，不受干扰地完成摘要撰写。）`),
    maxInputLength: Schema.number().description('发送给 AI 的最大字数限制').default(2000),
    timeout: Schema.number().description('AI 请求超时时间(毫秒)').default(30000),
  }).description('AI 摘要设置'),
  search: Schema.object({
    enabled: Schema.boolean().description('启用联网搜索增强 AI 摘要').default(false),
    engine: Schema.union(['tavily', 'searxng', 'volcengine', 'auto'] as const).description('搜索引擎选择').default('tavily'),
    maxResults: Schema.number().description('最大搜索结果数').default(5).min(1).max(10),
    enginePriority: Schema.array(Schema.union(['tavily', 'searxng', 'volcengine'] as const)).description('引擎优先级（当 engine 为 auto 时使用）').default(['tavily', 'volcengine', 'searxng']),
    tavilyApiKey: Schema.string().role('secret').description('Tavily API Key（获取地址: https://tavily.com）').default(''),
    tavilySearchDepth: Schema.union(['basic', 'advanced'] as const).description('Tavily 搜索深度').default('basic'),
    tavilyIncludeAnswer: Schema.boolean().description('Tavily 是否包含 AI 生成的答案').default(true),
    searxngInstanceUrl: Schema.string().role('link').description('SearXNG 实例 URL（自建或公共实例）').default(''),
    searxngLanguage: Schema.string().description('SearXNG 搜索语言').default('all'),
    volcengineApiKey: Schema.string().role('secret').description('火山引擎 API Key（与 AI 配置中的 API Key 相同，或单独配置）').default(''),
    volcengineModels: Schema.string().description('火山引擎模型列表（用逗号分隔，例如: doubao-seed-1-6-lite-251015,doubao-seed-1-6-flash-250828）').default(''),
    volcengineUseAiModel: Schema.boolean().description('火山引擎是否使用 AI 配置中的 model').default(true),
  }).description('联网搜索设置（AI 摘要增强）'),
  cache: Schema.object({
    enabled: Schema.boolean().description('启用消息缓存').default(true),
    maxSize: Schema.number().description('最大缓存消息条数').default(100),
  }).description('消息缓存设置'),
  queue: Schema.object({
    batchSize: Schema.number().min(1).max(50).description('每次处理发送队列的最大任务数').default(10),
    maxRetries: Schema.number().min(0).max(20).description('临时错误的最大重试次数，超过后转为失败').default(5),
    processInterval: Schema.number().min(5).max(3600).description('发送队列处理间隔（秒）').default(30),
    cleanupHours: Schema.number().min(1).max(720).description('队列清理命令默认保留成功任务的小时数').default(24),
  }).description('发送队列设置'),
  security: Schema.object({
    enabled: Schema.boolean().description('启用安全检查（建议开启）').default(false),
    allowInternalAccess: Schema.boolean().description('允许访问内网 IP 地址（如本地部署的 RSSHub）').default(false),
    whitelist: Schema.array(Schema.string()).description('URL 白名单域名').default([]),
    blacklist: Schema.array(Schema.string()).description('URL 黑名单域名').default([]),
    allowHttp: Schema.boolean().description('允许 HTTP 协议').default(true),
    allowHttps: Schema.boolean().description('允许 HTTPS 协议').default(true),
    sanitizeHtml: Schema.boolean().description('启用 RSS 原始 HTML 内容清理').default(true),
    maxCacheSize: Schema.number().description('AI 摘要缓存最大条数').default(1000),
  }).description('安全设置'),
  // customUrlEnable:Schema.boolean().description('开发中：允许使用自定义规则对网页进行提取，用于对非RSS链接抓取').default(false).experimental(),
  debug: Schema.union(["disable","error","info","details"] as const).default("disable").description('调试级别'),
  logging: Schema.object({
    structured: Schema.boolean().description('启用结构化日志（JSON格式）').default(false),
    includeTimestamp: Schema.boolean().description('包含时间戳').default(true),
    includeLevel: Schema.boolean().description('包含日志级别').default(true),
    includeModule: Schema.boolean().description('包含模块名').default(true),
    includeContext: Schema.boolean().description('包含额外上下文信息').default(false),
    contextFields: Schema.array(Schema.string()).description('要包含的上下文字段（如 guildId, platform 等）').default([]),
    sanitizeLogs: Schema.boolean().description('自动脱敏日志中的敏感信息').default(true),
  }).description('日志设置'),
  errorTracking: Schema.object({
    enabled: Schema.boolean().description('启用错误追踪').default(false),
    dsn: Schema.string().role('secret').description('Sentry DSN').default(''),
    environment: Schema.string().description('错误追踪环境').default('production'),
    release: Schema.string().description('错误追踪版本号').default('5.2.48'),
    tracesSampleRate: Schema.number().min(0).max(1).description('性能追踪采样率').default(0.1),
    profilesSampleRate: Schema.number().min(0).max(1).description('性能分析采样率').default(0.1),
  }).description('错误追踪设置'),
  tdl: Schema.object({
    enabled: Schema.boolean().description('启用 Telegram 大视频 tdl 兜底下载<br>当 RSSHub 返回 "Video is too big" 占位时，调用外部 tdl 直接从 Telegram 拉取原始视频。<br><b>需宿主机自行安装</b>: `go install github.com/iyear/tdl@latest` 或下载 [Release](https://github.com/iyear/tdl/releases)，并执行 `tdl login` 完成登录。<br>插件运行时探测 PATH，缺失则跳过、不阻塞主流程。').default(false),
    binPath: Schema.string().description('tdl 二进制路径，默认从 PATH 探测<br>Docker/容器场景下若 tdl 装在持久卷（如 /koishi/bin/tdl），在此指定可避免依赖容器 PATH').default(''),
    storage: Schema.string().description('tdl 会话存储路径（bolt 存储的 data 目录）<br>登录与下载必须指向同一路径，否则下载时找不到会话<br>容器持久卷示例: /koishi/.tdl/data').default(''),
    proxy: Schema.string().role('link').description('tdl/ffmpeg 子进程专用代理，形如 http://host:port 或 socks5://host:port<br>为空则回退到订阅级代理').default(''),
    timeout: Schema.number().min(30).max(1800).description('tdl 单次下载超时（秒）').default(180),
    compressThreshold: Schema.number().min(1).description('触发 ffmpeg 压缩的体积阈值（MB），默认沿用基础设置中的视频最大体积').default(30),
    crf: Schema.number().min(18).max(32).description('ffmpeg 压缩质量 CRF（18 接近无损体积大，32 体积小质量差）。ffmpeg 路径来自 Koishi 的 ffmpeg 服务（koishi-plugin-ffmpeg），未安装该服务则大视频会被跳过').default(30),
    proxyByEnv: Schema.boolean().description('是否把订阅级代理通过 --proxy 透传给 tdl 子进程（当上方 proxy 为空时生效）').default(true),
  }).description('Telegram 大视频（tdl）设置'),
})

// 导出 ConfigType 作为类型别名，供其他模块使用
export type { Config as ConfigType } from './types'
