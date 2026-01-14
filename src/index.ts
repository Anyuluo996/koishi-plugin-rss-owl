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
  deviceScaleFactor?: number
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
  filter?: Array<string>
  block?: Array<string>
  // customUrlEnable?: boolean


  split?:number

  nextUpdataTime?: number

  // HTML 监控相关字段
  type?: 'rss' | 'html'
  selector?: string
  textOnly?: boolean
  mode?: 'static' | 'puppeteer'
  waitFor?: number
  waitSelector?: string
}
export const usage = `
<details>
<summary>RSS-OWL 订阅器使用说明</summary>

## 基本命令:
  rsso &lt;url&gt;              - 订阅RSS链接
  rsso -l                 - 查看订阅列表
  rsso -l [id]            - 查看订阅详情
  rsso -r &lt;content&gt;       - 删除订阅(需要权限)
  rsso -T &lt;url&gt;           - 测试订阅
  rsso.ask &lt;url&gt; &lt;需求&gt;  - AI 智能订阅网页 (需要 AI 配置)
  rsso.watch &lt;url&gt; [关键词] - 简单网页监控 (关键词/整页)

## 常用选项:
  -i &lt;template&gt;          - 设置消息模板
      可选值: content(文字) | default(图片) | custom(自定义) | only text | only media 等
  -t &lt;title&gt;             - 自定义订阅标题
  -a &lt;arg&gt;               - 自定义配置 (格式: key:value,key2:value2)
      例如: -a timeout:30,merge:true

## 高级选项:
  -f &lt;content&gt;           - 关注订阅，更新时提醒
  -fAll &lt;content&gt;        - 全体关注(需要高级权限)
  -target &lt;groupId&gt;      - 跨群订阅(需要高级权限)
  -d &lt;time&gt;              - 定时推送 (格式: "HH:mm/数量" 或 "HH:mm")
      例如: -d "08:00/5" 表示每天8点推送5条
  -p &lt;id&gt;                - 手动拉取最新内容

## 快速订阅:
  rsso -q                - 查看快速订阅列表
  rsso -q [编号]         - 查看快速订阅详情
  rsso -T tg:channel_name  - 快速订阅Telegram频道

## Assets 图片/视频服务配置 (推荐):
  使用 assets 服务可以避免 Base64 超长问题
  1. 在插件市场安装 assets-xxx 插件 (如 assets-local, assets-s3, assets-smms 等)
  2. 在对应插件中配置存储信息 (AccessKey, Secret, Bucket 等)
  3. 在 RSS-Owl 基础设置中将 imageMode/videoMode 设置为 'assets'
  4. 插件会自动上传图片/视频到你的图床服务

## 配置示例:
  rsso -T -i content "https://example.com/rss"
  rsso "https://example.com/rss" -t "我的订阅" -a "timeout:60,merge:true"
  rsso -d "09:00/3" "https://example.com/rss"

</details>

<details>
<summary>网页监控 (rsso.html) - 监控任意网页元素变化</summary>

使用 CSS 选择器监控网页元素变化，支持静态网页和 SPA 动态页面。

## 基本用法:
  rsso.html &lt;url&gt; -s &lt;selector&gt;      - 监控符合选择器的元素

## 常用选项:
  -s, --selector &lt;选择器&gt;    CSS 选择器 (必填)，例如: .news-item、#price、div.list > li
  -t, --title &lt;标题&gt;         自定义订阅标题
  -i, --template &lt;模板&gt;      消息模板 (推荐 content)
  --text                     只提取纯文本 (默认提取 HTML)
  -T, --test                 测试模式，查看抓取预览

## Puppeteer 动态渲染 (解决 SPA/JS 动态内容):
  -P, --puppeteer            使用 Puppeteer 渲染页面 (需要安装 koishi-plugin-puppeteer)
  -w, --wait &lt;毫秒&gt;          渲染后等待时间
  -W, --waitSelector &lt;选择器&gt;  等待特定元素出现

</details>

<details>
<summary>AI 摘要 (ai) - 智能生成内容摘要</summary>

使用 OpenAI 兼容 API 为订阅内容生成 AI 摘要。

## 启用方法:
  1. 在插件配置中开启 AI 功能
  2. 填写 API Base URL、API Key 和模型名称

## 配置项:
  - placement           摘要位置: top (顶部) / bottom (底部)
  - separator          分割线样式
  - prompt             提示词模板 ({{title}} 标题, {{content}} 内容)
  - maxInputLength     最大输入长度 (默认 2000 字)
  - timeout            请求超时 (默认 30000 毫秒)


</details>
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
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{{title}}</title>
<!-- 引入 Tailwind CSS 和 Typography 插件 -->
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
<script>
    tailwind.config = {
    theme: {
        extend: {
        colors: {
            primary: "#3B82F6",
            "background-light": "#F8FAFC",
        },
        fontFamily: {
            display: ["Inter", "sans-serif"],
            mono: ["JetBrains Mono", "monospace"],
        },
        },
    },
    };
</script>
<style>
    body {
        margin: 0;
        /* 根据配置设置宽度和内边距 */
        width: ${bodyWidth || config.template.bodyWidth}px;
        padding: ${bodyPadding || config.template.bodyPadding}px;
        box-sizing: border-box;
        font-family: 'Inter', sans-serif;
        background-color: #F8FAFC;
    }

    /* 针对 RSS 内容 (HTML) 的样式修正 */
    .prose {
        max-width: none;
        color: #475569; /* slate-600 */
        ${bodyFontSize ? `font-size: ${bodyFontSize}px;` : ''}
    }
    .prose img {
        border-radius: 8px;
        margin-top: 1rem;
        margin-bottom: 1rem;
        max-width: 100%;
        height: auto;
    }
    .prose a {
        color: #3B82F6;
        text-decoration: none;
    }
    .prose p {
        margin-top: 0.5em;
        margin-bottom: 0.5em;
        line-height: 1.6;
    }
</style>
</head>
<body>
    <!-- 外部容器 -->
    <div class="relative group w-full">
        <!-- 背景光晕效果 -->
        <div class="absolute -inset-1 bg-gradient-to-r from-primary to-cyan-400 rounded-2xl blur opacity-10"></div>

        <!-- 卡片主体 -->
        <div class="relative bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            <!-- 左侧装饰条 -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>

            <!-- 右上角标签 (可选) -->
            <div class="absolute top-4 right-4 flex gap-2">
                <span class="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-500 border border-slate-200 rounded">
                    {{rss.channel.title}}
                </span>
            </div>

            <div class="p-8">
                <!-- 头部信息 -->
                <div class="mb-6">
                    <div class="flex items-start gap-3 mb-2">
                        <div class="mt-1 w-8 h-8 rounded-lg bg-primary/10 flex flex-shrink-0 items-center justify-center overflow-hidden">
                            <!-- RSS Feed Icon -->
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-primary">
                                <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9zM4 18c0 1.1.9 2 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/>
                            </svg>
                        </div>
                        <h2 class="text-xl font-bold text-slate-800 leading-tight">{{title}}</h2>
                    </div>
                    <div class="flex items-center text-slate-400 text-xs font-medium pl-11">
                        <!-- Calendar SVG Icon -->
                        <svg class="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" stroke-width="2"/>
                            <path d="M16 2v4M8 2v4" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
                            <path d="M3 10h18" stroke="#94A3B8" stroke-width="2"/>
                        </svg>
                        {{pubDate}}
                    </div>
                </div>

                <!-- 内容区域 (使用 prose 类处理 HTML 内容) -->
                <div class="pl-11 prose prose-slate">
                    {{description}}
                </div>

                <!-- 底部信息 -->
                <div class="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center text-xs text-slate-400 pl-11">
                        <!-- Link SVG Icon -->
                        <svg class="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        From: <span class="ml-1 text-primary font-mono">{{rss.channel.description}}</span>
                    </div>
                </div>
            </div>

            <!-- 角落装饰 -->
            <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/20 rounded-tl-lg"></div>
            <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/20 rounded-br-lg"></div>
        </div>
    </div>
</body>
</html>`
  const getDescriptionTemplate = (bodyWidth, bodyPadding,bodyFontSize:number|undefined) =>
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet"/>
<style>
body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
}
.card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-width: ${bodyWidth || config.template.bodyWidth}px;
    width: 100%;
    overflow: hidden;
}
.card-content {
    padding: ${bodyPadding || config.template.bodyPadding}px;
    color: #2d3748;
    line-height: 1.7;
    ${bodyFontSize ? `font-size: ${bodyFontSize}px;` : ''}
}
.card-content img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 12px 0;
}
</style>
</head>
<body>
<div class="card">
    <div class="card-content">{{description}}</div>
</div>
</body>
</html>`
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

  // --- AI 智能生成 CSS 选择器 ---
  const generateSelectorByAI = async (url: string, instruction: string, html: string) => {
    if (!config.ai.enabled || !config.ai.apiKey) throw new Error('需在配置中开启 AI 功能并填写 API Key')

    // 预处理 HTML
    const $ = cheerio.load(html)
    $('script, style, svg, path, link, meta, noscript').remove()
    $('*').contents().each((_, e) => { if (e.type === 'comment') $(e).remove() })

    // 限制长度节省 token
    let cleanHtml = $('body').html()?.replace(/\s+/g, ' ').trim().substring(0, 15000) || ''

    const prompt = `
    作为一名爬虫专家，请根据提供的 HTML 代码片段，为一个网页监控工具生成一个 CSS Selector。

    目标网页：${url}
    用户需求：${instruction}

    要求：
    1. 只返回 CSS Selector 字符串，不要包含任何解释、Markdown 标记或代码块符号。
    2. Selector 必须尽可能精确，通常用于提取列表中的一项或多项。
    3. 如果是列表，请确保 Selector 能选中列表项的容器。

    HTML片段：
    ${cleanHtml}
    `

    try {
      debug(`正在请求 AI 生成选择器: ${instruction}`, 'AI-Selector', 'info')

      const requestConfig: any = {
        headers: {
          'Authorization': `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000,
      }

      if (config.net.proxyAgent?.enabled) {
        const proxyUrl = `${config.net.proxyAgent.protocol}://${config.net.proxyAgent.host}:${config.net.proxyAgent.port}`
        requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
        requestConfig.proxy = false
      }

      const response = await axios.post(
        `${config.ai.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          model: config.ai.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        },
        requestConfig
      )

      let selector = response.data?.choices?.[0]?.message?.content?.trim()
      selector = selector?.replace(/`/g, '')?.replace(/^css/i, '')?.trim()

      debug(`AI 生成的选择器: ${selector}`, 'AI-Selector', 'info')
      return selector
    } catch (error) {
      debug(`AI 生成选择器失败: ${error.message}`, 'AI-Selector', 'error')
      throw error
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
    // puppeteer.render() 返回 Element 字符串，格式如: <img src="data:image/png;base64,..."/>
    // 提取 base64 数据
    let base64 = /(?<=src=").+?(?=")/.exec(puppeteer)?.[0]
    if (!base64) {
      debug(`puppeteer render 返回值格式异常: ${puppeteer}`, 'puppeteerToFile', 'error');
      return puppeteer;
    }

    // 检查 base64 格式是否正确（应该包含 data:image 前缀）
    if (!base64.startsWith('data:')) {
      debug(`提取的 src 不是 base64 格式: ${base64}`, 'puppeteerToFile', 'error');
      // 可能是网络图片 URL，直接返回原 Element
      return puppeteer;
    }

    const buffer = Buffer.from(base64.substring(base64.indexOf(',') + 1), 'base64');

    // assets 模式
    if (config.basic.imageMode === 'assets' && ctx.assets) {
      try {
        // 直接传递 base64 字符串给 upload
        const url = await ctx.assets.upload(base64, `rss-screenshot-${Date.now()}.png`)
        debug(`截图 Assets 上传成功: ${url}`, 'assets', 'info')
        return `<img src="${url}"/>`
      } catch (error) {
        debug(`截图 Assets 上传失败，降级为 File: ${error}`, 'assets error', 'error')
        // 降级到 File 模式
      }
    }

    // File 模式：转换为 <file src="..."/> 格式
    const MB = buffer.length / 1e+6
    debug("puppeteer 渲染图片大小: " + MB + ' MB', 'file size', 'details');
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

  // 预处理 HTML：下载所有图片并替换为 data URL，避免 Puppeteer 截图时加载外部图片超时
  const preprocessHtmlImages = async (htmlContent: string, arg?: rssArg): Promise<string> => {
    const $ = cheerio.load(htmlContent)
    const imgElements = $('img')
    const videoElements = $('video')

    const totalCount = imgElements.length + videoElements.length
    if (totalCount === 0) {
      return htmlContent
    }

    debug(`开始预处理 ${imgElements.length} 张图片和 ${videoElements.length} 个视频封面`, 'preprocess', 'info')

    // 使用 Promise.allSettled 而不是 Promise.all，确保单个图片失败不影响其他图片
    const imgResults = await Promise.allSettled(imgElements.map(async (_, i) => {
      const originalSrc = $(i).attr('src')
      if (!originalSrc || originalSrc.startsWith('data:')) {
        return { index: i, success: true, skipped: true }
      }

      try {
        // 使用 useBase64Mode=true 确保返回 data URL，设置 10 秒超时
        const dataUrl = await Promise.race([
          getImageUrl(originalSrc, arg, true),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('图片下载超时')), 10000)
          )
        ])
        if (dataUrl) {
          $(i).attr('src', dataUrl)
          debug(`图片替换成功: ${originalSrc.substring(0, 50)}...`, 'preprocess', 'details')
          return { index: i, success: true, src: originalSrc }
        } else {
          debug(`图片下载失败，保留原链接: ${originalSrc}`, 'preprocess', 'error')
          return { index: i, success: false, src: originalSrc }
        }
      } catch (error) {
        debug(`图片处理失败: ${error}`, 'preprocess', 'error')
        return { index: i, success: false, src: originalSrc }
      }
    }))

    // 统计图片处理结果
    const successCount = imgResults.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failCount = imgResults.length - successCount
    if (failCount > 0) {
      debug(`${failCount} 张图片下载失败，将使用原链接`, 'preprocess', 'error')
    }

    // 使用 Promise.allSettled 处理视频封面
    const videoResults = await Promise.allSettled(videoElements.map(async (_, i) => {
      const poster = $(i).attr('poster')
      if (!poster || poster.startsWith('data:')) {
        return { index: i, success: true, skipped: true }
      }

      try {
        // 设置 10 秒超时
        const dataUrl = await Promise.race([
          getImageUrl(poster, arg, true),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('视频封面下载超时')), 10000)
          )
        ])
        if (dataUrl) {
          $(i).attr('poster', dataUrl)
          debug(`视频封面替换成功: ${poster.substring(0, 50)}...`, 'preprocess', 'details')
          return { index: i, success: true, src: poster }
        } else {
          debug(`视频封面下载失败，保留原链接: ${poster}`, 'preprocess', 'error')
          return { index: i, success: false, src: poster }
        }
      } catch (error) {
        debug(`视频封面处理失败: ${error}`, 'preprocess', 'error')
        return { index: i, success: false, src: poster }
      }
    }))

    // 统计视频封面处理结果
    const videoSuccessCount = videoResults.filter(r => r.status === 'fulfilled' && r.value.success).length
    const videoFailCount = videoResults.length - videoSuccessCount
    if (videoFailCount > 0) {
      debug(`${videoFailCount} 个视频封面下载失败，将使用原链接`, 'preprocess', 'error')
    }

    return $.html()
  }

  const renderHtml2Image = async (htmlContent:string, arg?: rssArg)=>{
    let page = await ctx.puppeteer.page()
    try {
      debug(htmlContent,'htmlContent','details')

      // 预处理：下载所有图片并替换为 data URL，避免加载外部图片超时
      htmlContent = await preprocessHtmlImages(htmlContent, arg)

      // 设置 deviceScaleFactor 以控制截图清晰度（必须在 setContent 之前）
      // 保持 viewport 宽度与 bodyWidth 匹配，避免排版错乱
      const bodyWidth = config.template.bodyWidth || 600
      const bodyPadding = config.template.bodyPadding || 20
      const viewportWidth = bodyWidth + bodyPadding * 2 + 100  // 预留额外空间

      await page.setViewport({
        width: viewportWidth,
        height: 1200,
        deviceScaleFactor: config.template.deviceScaleFactor
      })
      debug(`设置截图清晰度: ${config.template.deviceScaleFactor}x, viewport: ${viewportWidth}x1200`, 'deviceScaleFactor', 'info')

      // 拦截视频请求，避免加载视频导致超时
      await page.setRequestInterception(true)
      page.on('request', (req) => {
        // 阻止视频和音频资源加载，只加载图片和样式
        if (req.resourceType() === 'media') {
          req.abort()
        } else {
          req.continue()
        }
      })

      // 使用 domcontentloaded 避免等待视频等慢速资源
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 })

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
      try { await page.close() } catch (e) { /* 忽略页面已关闭的错误 */ }
    }
  }

  // --- 辅助函数：确保 URL 包含协议并去除多余空格 ---
  const ensureUrlProtocol = (url: string) => {
    if (!url) return ''
    // 去除首尾空格，并只取第一个空格前的内容 (防止贪婪匹配导致的错误)
    url = url.trim().split(/\s+/)[0]

    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`
    }
    return url
  }

  // 修改 getRssData 函数的并发处理
  const getRssData = async (url, config: rssArg) => {
    try {
      // --- HTML 抓取预处理 START ---
      let rssData: any
      let contentType = ''

      if (config.type === 'html' && config.mode === 'puppeteer') {
        // Puppeteer 动态渲染模式
        if (!ctx.puppeteer) throw new Error('未安装 puppeteer 插件，无法使用动态渲染模式')

        const page = await ctx.puppeteer.page()
        try {
          debug(`Puppeteer抓取: ${url}`, 'html-scraping', 'info')

          // 设置 User-Agent (使用默认 UA)
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

          // 隐藏 webdriver
          await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false })
          })

          await page.setViewport({ width: 1920, height: 1080 })
          await page.goto(url, { waitUntil: 'networkidle2', timeout: (config.timeout || 30) * 1000 })

          // 等待特定元素或时间
          if (config.waitSelector) {
            try { await page.waitForSelector(config.waitSelector, { timeout: 5000 }) } catch (e) {}
          } else if (config.waitFor) {
            await new Promise(r => setTimeout(r, config.waitFor))
          }

          // 模拟滚动触发懒加载
          await page.evaluate(async () => {
            window.scrollBy(0, window.innerHeight)
          })
          await new Promise(r => setTimeout(r, 1000))

          rssData = await page.content()
          contentType = 'text/html'
        } finally {
          try { await page.close() } catch (e) { /* 忽略页面已关闭的错误 */ }
        }
      } else {
        // 静态模式：使用 axios
        const res = await $http(url, config)
        rssData = res.data
        contentType = res.headers['content-type'] || ''
      }
      // --- HTML 抓取预处理 END ---

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

      // --- HTML 抓取逻辑 START ---
      if (config.type === 'html' && config.selector) {
        debug(`HTML抓取: ${url} selector: ${config.selector}`, 'html-scraping', 'info');
        const $ = cheerio.load(rssData);
        const selected = $(config.selector);

        if (selected.length === 0) {
          debug('未找到符合 selector 的元素', 'html-scraping', 'info');
          return [];
        }

        // 构造伪 RSS Items
        const items = selected.map((i, el) => {
          const $el = $(el);

          // 1. 尝试提取标题
          let title = $el.attr('title') || $el.text().trim().replace(/\s+/g, ' ');
          if (title.length > 50) title = title.substring(0, 50) + '...';

          // 2. 尝试提取链接
          let link = $el.attr('href') || $el.find('a').attr('href') || url;
          if (link && !link.startsWith('http')) {
             try {
               link = new URL(link, url).href;
             } catch (e) {}
          }

          // 3. 提取内容
          const description = config.textOnly ? $el.text().trim() : ($el.html() || '').trim();

          // 4. 生成唯一标识
          const guid = link !== url ? link : description;

          // 5. 构造父级引用
          const rssMock = {
            channel: {
              title: $('title').text() || 'Web Monitor',
              description: url,
              link: url,
              image: { url: '' }
            }
          };

          return {
            title: title || 'No Title',
            description: description,
            link: link,
            guid: guid,
            pubDate: new Date(0), // 静态网页无时间戳，强制走内容对比
            author: 'Web Monitor',
            rss: rssMock
          };
        }).get();

        debug(items[0], 'Parsed HTML Item', 'details');
        return items;
      }
      // --- HTML 抓取逻辑 END ---

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
        msg = (await renderHtml2Image(html.html(), arg)).toString();
      } else if (config.basic.imageMode == 'File' || config.basic.imageMode == 'assets') {
        if (!ctx.puppeteer) {
          debug('未安装 puppeteer 插件，跳过图片渲染', 'puppeteer error', 'error');
          msg = html.html();
        } else {
          try {
            // 预处理：下载所有图片并替换为 data URL
            let processedHtml = await preprocessHtmlImages(html.html(), arg);
            // 如果需要自定义 deviceScaleFactor，使用自定义渲染
            if (config.template.deviceScaleFactor !== 1) {
              msg = (await renderHtml2Image(processedHtml, arg)).toString();
            } else {
              msg = await ctx.puppeteer.render(processedHtml);
            }
            msg = await puppeteerToFile(msg);
          } catch (error) {
            debug(`puppeteer render 失败: ${error}`, 'puppeteer error', 'error');
            // 降级：直接返回 HTML 文本
            msg = html.html();
          }
        }
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
      debug(`当前 imageMode: ${config.basic.imageMode}`, 'imageMode', 'info');
      if (config.basic.imageMode == 'base64') {
        debug('使用 base64 模式渲染', 'render mode', 'info');
        msg = (await renderHtml2Image(html.html(), arg)).toString();
      } else if (config.basic.imageMode == 'File' || config.basic.imageMode == 'assets') {
        debug(`使用 ${config.basic.imageMode} 模式渲染`, 'render mode', 'info');
        if (!ctx.puppeteer) {
          debug('未安装 puppeteer 插件，跳过图片渲染', 'puppeteer error', 'error');
          msg = html.html();
        } else {
          try {
            debug('开始调用 puppeteer.render()', 'puppeteer', 'info');
            // 预处理：下载所有图片并替换为 data URL，避免加载外部图片超时
            let processedHtml = await preprocessHtmlImages(html.html(), arg);
            // 如果需要自定义 deviceScaleFactor，使用自定义渲染
            if (config.template.deviceScaleFactor !== 1) {
              msg = (await renderHtml2Image(processedHtml, arg)).toString();
            } else {
              msg = await ctx.puppeteer.render(processedHtml);
            }
            debug(`puppeteer.render() 返回: ${msg.substring(0, 100)}...`, 'puppeteer result', 'info');
            msg = await puppeteerToFile(msg);
            debug(`puppeteerToFile 转换完成`, 'puppeteer', 'info');
          } catch (error) {
            debug(`puppeteer render 失败: ${error}`, 'puppeteer error', 'error');
            // 降级：直接返回 HTML 文本
            msg = html.html();
          }
        }
      }
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
        msg = (await renderHtml2Image(html.html(), arg)).toString();
      } else if (config.basic.imageMode == 'File' || config.basic.imageMode == 'assets') {
        if (!ctx.puppeteer) {
          debug('未安装 puppeteer 插件，跳过图片渲染', 'puppeteer error', 'error');
          msg = html.html();
        } else {
          try {
            // 预处理：下载所有图片并替换为 data URL
            let processedHtml = await preprocessHtmlImages(html.html(), arg);
            // 如果需要自定义 deviceScaleFactor，使用自定义渲染
            if (config.template.deviceScaleFactor !== 1) {
              msg = (await renderHtml2Image(processedHtml, arg)).toString();
            } else {
              msg = await ctx.puppeteer.render(processedHtml);
            }
            msg = await puppeteerToFile(msg);
          } catch (error) {
            debug(`puppeteer render 失败: ${error}`, 'puppeteer error', 'error');
            // 降级：直接返回 HTML 文本
            msg = html.html();
          }
        }
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
        msg = (await renderHtml2Image(html2.xml(), arg)).toString();
      } else if (config.basic.imageMode == 'File' || config.basic.imageMode == 'assets') {
        if (!ctx.puppeteer) {
          debug('未安装 puppeteer 插件，跳过图片渲染', 'puppeteer error', 'error');
          msg = html2.xml();
        } else {
          try {
            // 预处理：下载所有图片并替换为 data URL
            let processedHtml = await preprocessHtmlImages(html2.xml(), arg);
            // 如果需要自定义 deviceScaleFactor，使用自定义渲染
            if (config.template.deviceScaleFactor !== 1) {
              msg = (await renderHtml2Image(processedHtml, arg)).toString();
            } else {
              msg = await ctx.puppeteer.render(processedHtml);
            }
            msg = await puppeteerToFile(msg);
          } catch (error) {
            debug(`puppeteer render 失败: ${error}`, 'puppeteer error', 'error');
            // 降级：直接返回 HTML 文本
            msg = html2.xml();
          }
        }
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

  // --- 通用测试函数：封装了抓取、排序、解析和消息封装 ---
  const runTestSubscription = async (urlInput: string, arg: rssArg, authorId: string, mockTitle: string = '测试订阅') => {
    try {
      if (!urlInput) return '请输入URL'

      // 1. 处理 URL (支持 | 分隔，支持快速订阅前缀)
      const urlList = urlInput.split('|').map(parseQuickUrl)

      // 2. 获取订阅源数据
      let rssItemList
      try {
        rssItemList = await Promise.all(urlList.map(async url => await getRssData(url, arg)))
      } catch (error) {
        throw new Error(`订阅源请求失败: ${error.message || error}\nURL: ${urlInput}`)
      }

      // 扁平化数组
      const itemArray = rssItemList.flat(1)

      if (itemArray.length === 0) {
        return '未抓取到任何内容。请检查 URL、选择器或反爬策略。'
      }

      // 3. 排序
      itemArray.sort((a, b) => parsePubDate(b.pubDate).getTime() - parsePubDate(a.pubDate).getTime())

      // 4. 截取数量
      const limit = arg.forceLength || 1
      const rssItemArray = itemArray
        .filter((v, i) => i < limit)
        .filter((v, i) => arg.maxRssItem ? (i < arg.maxRssItem) : true)

      if (rssItemArray.length === 0) return '内容被过滤，无剩余条目显示。'

      // 5. 构造 Mock 订阅对象
      const mockSubscribe = {
        url: urlInput,
        title: mockTitle,
        platform: 'test',
        guildId: 'test',
        author: authorId,
        arg: arg
      }

      // 6. 解析并生成消息
      let messageList
      try {
        messageList = (await Promise.all(
          rssItemArray.reverse().map(async i => await parseRssItem(i, { ...mockSubscribe, ...arg }, authorId))
        )).flat(Infinity)
      } catch (error) {
        throw new Error(`内容解析失败: ${error}`)
      }

      // 7. 返回合并转发消息
      const successInfo = `✅ 抓取成功 (共 ${itemArray.length} 条，显示 ${messageList.length} 条)`
      return `<message forward>
        <message>${successInfo}</message>
        ${messageList.join('')}
      </message>`

    } catch (error) {
      return `❌ 测试失败: ${error.message || error}`
    }
  }

    // --- rssowl.html 命令：网页监控 ---
    ctx.guild()
      .command('rssowl.html <url:string>', '监控静态网页 (CSS Selector)')
      .alias('rsso.html')
      .usage(`
      使用 CSS 选择器监控网页元素变化。
      示例: rsso.html https://www.zhihu.com/billboard -s ".BillBoard-item:first-child"
      `)
      .option('selector', '-s <selector:string> CSS选择器 (必填)')
      .option('text', '只监控纯文本变化 (默认监控 HTML)')
      .option('title', '-t <content> 自定义订阅标题')
      .option('template', '-i <template> 消息模板 (推荐 content)')
      .option('puppeteer', '-P 使用 Puppeteer 渲染 (解决 SPA/JS 动态内容)')
      .option('wait', '-w <ms:number> Puppeteer 等待时间 (默认 0)')
      .option('waitSelector', '-W <selector:string> Puppeteer 等待元素出现')
      .option('test', '-T 测试抓取结果')
      .action(async ({ session, options }, url) => {
        if (!url) return '请输入 URL'
        if (!options.selector && !options.test) return '请使用 -s 指定 CSS 选择器 (例如: .news-item)'

        // 自动补全 URL 协议
        url = ensureUrlProtocol(url)

        const { id: guildId } = session.event.guild as any
        const { platform } = session.event as any
        const { id: author } = session.event.user as any

        // 构造参数
        const arg: rssArg = {
          type: 'html',
          selector: options.selector,
          textOnly: options.text || false,
          template: options.template || 'content',
          mode: options.puppeteer ? 'puppeteer' : 'static',
          waitFor: options.wait || 0,
          waitSelector: options.waitSelector,
          timeout: config.basic.timeout,
          merge: config.basic.merge === '有多条更新时合并' || config.basic.merge === '一直合并',
        }

        // 测试模式
        if (options.test) {
          if (!options.selector) return '测试模式也需要指定选择器 (-s)'
          await session.send('⏳ 正在抓取页面，请稍候...')
          // 调用通用测试函数
          return await runTestSubscription(url, arg, author, options.title || '网页监控测试')
        }

        // 入库逻辑
        const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })

        // 查重 (URL + selector 相同才算重复)
        if (config.basic.urlDeduplication) {
          const exists = rssList.find(i => i.url === url && i.arg?.selector === options.selector)
          if (exists) return '已存在相同的网页监控订阅。'
        }

        // 获取初始数据
        let initialItems = []
        try {
          initialItems = await getRssData(url, arg)
        } catch (e) {
          return `无法访问目标网页: ${e.message}`
        }

        if (initialItems.length === 0) {
          return '警告：当前选择器未匹配到任何内容，订阅可能无效。建议先使用 -T 测试。'
        }

        const subscribe = {
          url,
          platform,
          guildId,
          author,
          rssId: (+rssList.slice(-1)?.[0]?.rssId || 0) + 1,
          arg: { ...arg, title: undefined }, // 存入 type='html' 和 selector
          lastContent: {
            itemArray: config.basic.resendUpdataContent === 'all'
              ? initialItems.map(getLastContent)
              : [getLastContent(initialItems[0])]
          },
          title: options.title || initialItems[0]?.rss?.channel?.title || 'Web Monitor',
          lastPubDate: new Date(),
          followers: []
        }

        await ctx.database.create(('rssOwl' as any), subscribe)
        return `网页监控添加成功！\n标题: ${subscribe.title}\n选择器: ${options.selector}`
      })

    // --- rsso.ask: AI 智能订阅 ---
    ctx.guild()
      .command('rssowl.ask <url:string> <instruction:text>', 'AI 智能订阅网页')
      .alias('rsso.ask')
      .usage('例如: rsso.ask https://news.ycombinator.com "监控首页的前5条新闻标题"')
      .option('puppeteer', '-P 使用动态渲染 (SPA网页)')
      .option('test', '-T 测试模式 (只分析不订阅)')
      .action(async ({ session, options }, url, instruction) => {
        if (!url) return '请输入网址'

        // 1. 自动补全 URL 协议
        url = ensureUrlProtocol(url)

        const modeText = options.puppeteer ? 'Puppeteer 动态渲染' : 'Static 静态抓取'
        await session.send(`🔍 正在分析网页: ${url}\n(模式: ${modeText})`)

        // 2. 抓取网页内容
        let html = ''
        try {
          if (options.puppeteer) {
            if (!ctx.puppeteer) return '❌ 未安装 puppeteer 插件，无法使用动态渲染模式'

            const page = await ctx.puppeteer.page()
            try {
              await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
              await page.setViewport({ width: 1920, height: 1080 })
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
              await new Promise(r => setTimeout(r, 3000)) // 等待 JS 加载
              html = await page.content()
            } catch (err) {
              throw new Error(`Puppeteer 访问失败: ${err.message}`)
            } finally {
              try { await page.close() } catch (e) { /* 忽略页面已关闭的错误 */ }
            }
          } else {
            // 静态模式 (Axios)
            try {
              const res = await $http(url, { timeout: 30000 })
              html = res.data
            } catch (err) {
              // 区分 404 错误
              if (err.response?.status === 404) {
                throw new Error(`目标网页返回 404 Not Found。\n请检查网址是否正确，或尝试使用 -P 参数启用浏览器渲染。`)
              }
              throw new Error(`请求目标网页失败: ${err.message}`)
            }
          }
        } catch (e) {
          debug(e, 'Fetch Error', 'error')
          return `❌ 网页抓取失败: ${e.message}\n\n💡 建议:\n1. 检查网址是否正确\n2. 如果是动态网页或有反爬，请加上 -P 参数`
        }

        // 3. 调用 AI 生成 Selector
        let aiSelector = ''
        try {
          aiSelector = await generateSelectorByAI(url, instruction, html)
        } catch (e) {
          // 检查是否是 AI 接口 404
          if (e.message.includes('404')) {
            return `❌ AI 接口请求失败 (404)。\n请检查配置中的 ai.baseUrl 是否正确 (例如: https://api.openai.com/v1)`
          }
          return `❌ AI 分析失败: ${e.message}`
        }

        if (!aiSelector) return 'AI 未能生成有效的选择器，请尝试更详细的描述。'

        // --- 测试模式: 只分析不订阅 ---
        if (options.test) {
          const { id: author } = session.event.user as any

          // 构造完整的 arg，包含 AI 生成的选择器
          const testArg: rssArg = {
            type: 'html',
            selector: aiSelector,
            mode: options.puppeteer ? 'puppeteer' : 'static',
            waitFor: options.puppeteer ? 3000 : 0,
            template: 'content',
            timeout: config.basic.timeout
          }

          // 先提示用户 AI 的结果
          await session.send(`✅ AI 分析完成！\n🔧 生成选择器: ${aiSelector}\n⏳ 正在生成预览...`)

          // 调用通用测试函数
          return await runTestSubscription(url, testArg, author, `AI监控: ${instruction}`)
        }

        // 3. 验证选择器
        const { id: guildId } = session.event.guild as any
        const { platform } = session.event as any
        const { id: author } = session.event.user as any
        const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })

        const finalArg: rssArg = {
          type: 'html',
          selector: aiSelector,
          mode: options.puppeteer ? 'puppeteer' : 'static',
          waitFor: options.puppeteer ? 3000 : 0,
          template: 'content',
          timeout: config.basic.timeout,
        }

        try {
          const items = await getRssData(url, finalArg)
          if (items.length === 0) throw new Error('生成的选择器未匹配到内容')
        } catch (e) {
          return `AI 生成的选择器 (${aiSelector}) 验证失败，请重试或手动指定。`
        }

        // 4. 创建订阅
        const subscribe = {
          url,
          platform,
          guildId,
          author,
          rssId: (+rssList.slice(-1)?.[0]?.rssId || 0) + 1,
          arg: finalArg,
          lastContent: { itemArray: [] },
          title: `AI监控: ${instruction}`,
          lastPubDate: new Date(),
          followers: []
        }

        await ctx.database.create(('rssOwl' as any), subscribe)
        return `✅ 智能订阅成功！\n🎯 目标: ${instruction}\n🔧 AI生成的选择器: ${aiSelector}`
      })

    // --- rsso.watch: 简单网页监控 (关键词/整页) ---
    ctx.guild()
      .command('rssowl.watch <url:string> [keyword:text]', '简单网页监控')
      .alias('rsso.watch')
      .usage(`
      简单网页监控，无需选择器。
      示例:
        rsso.watch https://example.com                    - 监控整页变化
        rsso.watch https://example.com "缺货"             - 监控包含关键词的内容
        rsso.watch https://example.com "缺货" -P          - SPA 动态页面
        rsso.watch https://example.com "缺货" -T          - 测试模式 (只预览不订阅)
      `)
      .option('spa', '-P 监控动态网页(SPA)')
      .option('test', '-T 测试模式 (只预览不订阅)')
      .action(async ({ session, options }, url, keyword) => {
        if (!url) return '请输入 URL'

        // 自动补全 URL 协议
        url = ensureUrlProtocol(url)

        const { id: guildId } = session.event.guild as any
        const { platform } = session.event as any
        const { id: author } = session.event.user as any
        const rssList = await ctx.database.get(('rssOwl' as any), { platform, guildId })

        // 构造选择器：有关键词用 contains，无关键词监控整页 body
        let selector = 'body'
        if (keyword) {
          selector = `body:contains('${keyword}')`
        }

        const arg: rssArg = {
          type: 'html',
          selector: selector,
          mode: options.spa ? 'puppeteer' : 'static',
          textOnly: true,
          waitFor: options.spa ? 5000 : 0,
          template: 'content',
          timeout: config.basic.timeout,
        }

        // --- 测试模式: 只预览不订阅 ---
        if (options.test) {
          await session.send(`⏳ 正在测试监控... \n模式: ${options.spa ? 'Puppeteer' : 'Static'}\n关键词: ${keyword || '无 (整页监控)'}`)
          // 调用通用测试函数
          return await runTestSubscription(url, arg, author, keyword ? `监控: ${keyword}` : '整页变化监控')
        }

        // 查重
        if (config.basic.urlDeduplication) {
          const exists = rssList.find(i => i.url === url && i.arg?.selector === selector)
          if (exists) return '已存在相同的网页监控订阅。'
        }

        // 验证
        try {
          const items = await getRssData(url, arg)
          if (items.length === 0) {
            return keyword
              ? `❌ 未找到包含关键词 "${keyword}" 的内容`
              : `❌ 无法抓取页面内容，请检查 URL 是否正确，或尝试使用 -P 选项`
          }
        } catch (e) {
          return `❌ 验证失败: ${e.message}\n\n💡 建议: 如果是动态网页，请加上 -P 参数`
        }

        const subscribe = {
          url,
          platform,
          guildId,
          author,
          rssId: (+rssList.slice(-1)?.[0]?.rssId || 0) + 1,
          arg: arg,
          lastContent: { itemArray: [] },
          title: keyword ? `监控: ${keyword}` : '整页变化监控',
          lastPubDate: new Date(),
          followers: []
        }

        await ctx.database.create(('rssOwl' as any), subscribe)
        return `✅ 监控添加成功！\n${keyword ? `🔍 关键词: ${keyword}` : '📄 监控整页变化'}\n🌐 ${url}`
      })
}