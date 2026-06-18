# koishi-plugin-rss-owl

[![npm](https://img.shields.io/npm/v/@anyul/koishi-plugin-rss?style=flat-square)](https://www.npmjs.com/package/@anyul/koishi-plugin-rss)
![version](https://img.shields.io/badge/version-5.2.3-brightgreen)

> 功能强大的 Koishi RSS 订阅插件，支持多种订阅源、图片渲染、AI 摘要等高级功能

当前文档基于 `v5.2.3`，已同步命令模块化、入口装配层收敛与最新模板名称。

## ✨ 功能特性

### 🚀 核心功能
- **多源订阅** - 支持 RSS/Atom 订阅、RSSHub 快速链接、网页监控
- **多种模板** - 提供多种消息模板，支持自定义 HTML 样式
- **图片渲染** - 使用 Puppeteer 将订阅内容渲染为精美图片
- **视频支持** - 支持视频下载和转发，多种处理模式
- **智能过滤** - 关键词过滤和屏蔽，内容自定义处理

### 🎨 高级功能
- **AI 摘要** - 集成 OpenAI API，自动生成内容摘要并渲染到图片中
- **Markdown 渲染** - AI 摘要支持完整的 Markdown 语法
- **代理支持** - 全局/订阅级代理配置，支持 HTTP/HTTPS/SOCKS5
- **多群管理** - 支持多群订阅、关注机制、权限管理
- **定时更新** - 灵活的刷新策略，支持定时推送

### 🔧 技术特性
- **队列管理** - 智能请求队列，避免被封禁
- **重试机制** - 自动重试失败请求
- **内容缓存** - 文件缓存管理，支持多种存储模式
- **调试模式** - 详细的调试日志，方便问题排查

## 📌 当前稳定性边界

- 当前版本优先保障 **RSS / Atom / RSSHub 快速订阅主链路** 的可用性与回归覆盖。
- **HTML / 网页监控** 目前仍属于基础能力，暂不作为当前版本的成熟度承诺重点。
- 为保持兼容，运行时已支持规范命名 `mergeVideo` / `resendUpdatedContent` / `nextUpdateTime`。
- 当前 **Koishi WebUI / Schema** 仍显示历史字段名 `margeVideo` / `resendUpdataContent`，这是兼容保留，不代表推荐命名方向。

## 📁 项目结构

```
koishi-plugin-rss-owl/
├── src/
│   ├── commands/           # 命令模块与运行时依赖
│   │   ├── index.ts
│   │   ├── runtime.ts
│   │   ├── subscription-create.ts
│   │   ├── subscription-edit.ts
│   │   ├── subscription-management.ts
│   │   └── web-monitor.ts
│   ├── core/               # 核心功能模块
│   │   ├── ai.ts          # AI 摘要功能
│   │   ├── feeder.ts      # RSS 订阅调度
│   │   ├── item-processor.ts  # RSS 条目处理
│   │   ├── notification-queue.ts # 发送队列
│   │   ├── parser.ts      # RSS/HTML 解析
│   │   ├── renderer.ts    # 图片渲染
│   │   └── search.ts      # 联网搜索
│   ├── services/           # 服务注册
│   │   └── message-cache-service.ts
│   ├── utils/              # 工具函数与共享基础设施
│   │   ├── common.ts      # 通用工具
│   │   ├── error-tracker.ts # 错误追踪
│   │   ├── fetcher.ts     # HTTP 请求
│   │   ├── logger.ts      # 日志系统
│   │   ├── media.ts       # 媒体处理
│   │   ├── message-cache.ts # 消息缓存
│   │   ├── proxy.ts       # 代理配置 helper
│   │   └── template.ts    # 模板定义
│   ├── config.ts          # 配置定义
│   ├── constants.ts       # 常量定义
│   ├── database.ts        # 数据库模型
│   ├── types.ts           # TypeScript 类型
│   └── index.ts           # 插件入口
├── lib/                   # 编译输出
├── tests/                 # Jest 测试与手工联调文件
│   ├── unit/
│   ├── integration/
│   ├── manual/
│   ├── setup.ts
│   └── web-search.test.ts
├── docs/                  # 开发记录与专题文档
├── package.json
└── README.md
```

### 当前架构概览

- `src/index.ts` 现在只保留**插件装配与生命周期管理**。
- `src/commands/*` 已按职责拆分为创建、管理、编辑、网页监控等独立模块。
- `src/commands/runtime.ts` 统一提供命令共享依赖，减少命令文件间重复拼装。
- `src/core/item-processor.ts` 统一模板选择、HTML 加载与图片资源回填逻辑。
- `src/utils/proxy.ts` 统一 AI / 搜索等模块的代理配置。

### 配置插件

在 Koishi 配置文件中添加：

```yaml
plugins:
  rss-owl:
    # 基础配置
    $type: config
    authority: 1              # 使用权限
    advancedAuthority: 4      # 高级功能权限

    # 网络配置
    net:
      userAgent: "Mozilla/5.0 ..."
      rssHubUrl: "https://hub.slarker.me"
      proxyAgent:
        enabled: true
        protocol: "socks5"
        host: "127.0.0.1"
        port: 17890
        auth:
          enabled: false
          username: ""
          password: ""

    # 消息处理
    msg:
      censor: false
      keywordFilter: []
      keywordBlock: []
      blockString: "*"
      rssHubUrl: "https://hub.slarker.me"

    # 模板配置
    template:
      custom: ""
      customRemark: ""
      bodyWidth: 600
      bodyPadding: 20
      bodyFontSize: 16
      deviceScaleFactor: 2
      content: ""

    # AI 配置
    ai:
      enabled: false
      baseUrl: "https://api.openai.com/v1"
      apiKey: ""
      model: "gpt-3.5-turbo"
      placement: "top"
      separator: "────────"
      prompt: "请为以下内容生成简短摘要：\n\n标题：{{title}}\n\n内容：{{content}}\n\n摘要："
      maxInputLength: 2000
      timeout: 30000

    # 调试配置
    debug: "info"  # disable | error | info | details
```

## 🚀 快速开始

### 基础订阅

```bash
# 订阅每日60秒早报（使用 default 模板）
rsso -i default rss:qqorw

# 订阅 Telegram 频道（使用 content 模板）
rsso -i content tg:woshadiao

# 订阅 GitHub 仓库
rsso -i content gh:issue/koishijs/koishi
```

### 使用 AI 摘要

1. 首先在配置中启用 AI 功能并配置 API：
```yaml
ai:
  enabled: true
  baseUrl: "https://api.openai.com/v1"
  apiKey: "your-api-key"
  model: "gpt-3.5-turbo"
```

2. 订阅时会自动生成 AI 摘要并渲染到图片中

### 关注订阅

```bash
# 关注订阅，更新时 @你
rsso.follow 1

# 取消关注
rsso.follow 1
```

### 立即拉取

```bash
# 立即拉取订阅最新内容
rsso.pull 1
```

## 📋 命令说明

### 主命令（添加订阅）

| 命令 | 说明 | 示例 |
|------|------|------|
| `rsso <url>` | 订阅 RSS/源 | `rsso rss:qqorw` |
| `rsso <url> -t <title>` | 自定义标题订阅 | `rsso rss:qqorw -t 早报` |
| `rsso <url> -i <template>` | 指定模板订阅 | `rsso rss:qqorw -i default` |
| `rsso <url> --target <p:gid>` | 跨群订阅 | `rsso rss:qqorw --target onebot:123456` |
| `rsso <url> --test` | 测试订阅 | `rsso rss:qqorw --test` |

### 管理子命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `rsso.list [id]` | 查看订阅列表 | `rsso.list`, `rsso.list 1` |
| `rsso.remove <id>` | 删除订阅 | `rsso.remove 1` |
| `rsso.remove --all` | 删除全部订阅 | `rsso.remove --all` |
| `rsso.edit <id>` | 修改订阅 | `rsso.edit 1 -t 新标题` |
| `rsso.pull <id>` | 拉取最新内容 | `rsso.pull 1` |
| `rsso.follow <id>` | 关注订阅 | `rsso.follow 1` |
| `rsso.follow <id> --all` | 全员提醒 | `rsso.follow 1 --all` |

### 运行管理命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `rsso.cache list [页数]` | 查看消息缓存列表 | `rsso.cache list`, `rsso.cache list 2` |
| `rsso.cache pull <序号>` | 重新推送缓存消息 | `rsso.cache pull 1` |
| `rsso.queue stats` | 查看发送队列统计 | `rsso.queue stats` |

### 修改订阅选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-t <title>` | 修改标题 | `rsso.edit 1 -t 新标题` |
| `-u <url>` | 修改URL | `rsso.edit 1 -u https://...` |
| `-i <template>` | 修改模板 | `rsso.edit 1 -i custom` |
| `-s <selector>` | 修改选择器 | `rsso.edit 1 -s ".item"` |
| `--test` | 测试修改 | `rsso.edit 1 -t 新标题 --test` |

### 兼容性说明（旧命令）

旧命令选项仍然可用，但建议迁移到新子命令：

| 旧命令 | 新命令 | 说明 |
|--------|--------|------|
| `rsso -l` | `rsso.list` | 查看订阅列表 |
| `rsso -l 1` | `rsso.list 1` | 查看订阅详情 |
| `rsso -r 1` | `rsso.remove 1` | 删除订阅 |
| `rsso --removeAll` | `rsso.remove --all` | 删除全部 |
| `rsso -p 1` | `rsso.pull 1` | 拉取更新 |
| `rsso -f 1` | `rsso.follow 1` | 关注订阅 |

### 局部参数（arg）

支持在订阅时覆盖全局配置：

```bash
# 强制合并消息
rsso -a merge:true <url>

# 使用代理
rsso -a proxyAgent:socks5//127.0.0.1/7890 <url>

# 定时刷新（每1440分钟推送10条）
rsso -a forceLength:10,refresh:1440 <url>

# 禁用代理
rsso -a proxyAgent:false <url>
```

支持的参数：
- `merge` - 消息合并模式
- `forceLength` - 强制返回条目数
- `reverse` - 反向排序
- `timeout` - 超时时间
- `refresh` - 刷新间隔（分钟）
- `maxRssItem` - 最大条目数
- `firstLoad` - 首次加载行为
- `bodyWidth` - 渲染宽度
- `bodyPadding` - 渲染内边距
- `proxyAgent` - 代理配置

## 🎨 模板说明

### 当前模板类型

| 内部模板名 | 常用命令简写 | 说明 |
|-----------|--------------|------|
| `auto` | `auto` | 自动在轻量模板与渲染模板间选择 |
| `content` | `content` | 基础内容模板，适合文字较少的订阅 |
| `only text` | `text` | 仅发送文字 |
| `only media` | `media` | 仅发送图片和视频 |
| `only image` | `image` | 仅发送图片 |
| `only video` | `video` | 仅发送视频 |
| `proto` | `proto` | 直接输出原始 description |
| `default` | `default` | 内置 Puppeteer 渲染模板 |
| `only description` | `description` | 仅渲染 description 内容 |
| `custom` | `custom` | 自定义 HTML 模板 |
| `link` | `link` | 访问内容中的首个链接并渲染页面 |

> 说明：配置项与内部类型以 `only text / only media / only image / only video / only description` 为准，命令行中仍可使用 `text / media / image / video / description` 简写。

### 模板切换

```bash
# 使用 default 模板订阅
rsso -i default rss:qqorw

# 使用 content 模板订阅
rsso -i content tg:woshadiao

# 使用 custom 模板订阅
rsso -i custom <url>
```

### 自定义模板

在配置文件的 `template.custom` 中编写 HTML：

```html
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px;">
  <h1>{{title}}</h1>
  <p>{{description}}</p>
  <p>发布时间：{{pubDate}}</p>
</div>
```

支持的插值变量见下文「插值说明」。

## 📝 插值说明

### 基本语法

```
{{变量1|变量2|变量3|'默认值'}}
```

如果变量1未找到，则尝试变量2，以此类推。可用单引号设置默认值。

### 可用变量

#### Item 元素（直接使用）

| 变量 | 说明 | 示例 |
|------|------|------|
| `title` | 标题 | `10月29日，星期二，在这里每天60秒读懂世界！` |
| `description` | 内容 | RSS 条目内容 |
| `link` | 链接 | `https://www.qqorw.cn/mrzb/657.html` |
| `guid` | 唯一标识 | `https://www.qqorw.cn/mrzb/657.html` |
| `pubDate` | 更新时间 | `Tue, 29 Oct 2024 00:50:29 GMT` |
| `author` | 作者 | `早报网` |
| `category` | 类别 | `每日早报` |

#### Channel 元素（加前缀 `rss.channel.`）

| 变量 | 说明 | 示例 |
|------|------|------|
| `rss.channel.title` | 频道标题 | `早报网` |
| `rss.channel.link` | 频道链接 | `https://qqorw.cn/` |
| `rss.channel.description` | 频道描述 | `每天更新15条简语早报...` |
| `rss.channel.image.url` | 频道图像 | `https://qqorw.cn/static/...` |

#### Arg 元素（插件配置）

| 变量 | 说明 |
|------|------|
| `arg.title` | 订阅标题 |
| `arg.url` | 订阅链接 |
| `arg.author` | 订阅用户 ID |
| `arg.rssId` | 订阅 ID |
| `arg.template` | 订阅模板 |
| `arg.proxyAgent.host` | 代理地址 |

#### AI 元素

| 变量 | 说明 |
|------|------|
| `aiSummary` | AI 生成的内容摘要（Markdown 格式） |

### 使用示例

```html
<!-- 带默认值的插值 -->
<h1>{{title|'无标题'}}</h1>

<!-- AI 摘要（如果在模板中使用会自动渲染） -->
<div class="ai-summary">{{aiSummary}}</div>

<!-- 多层级联 -->
<p>{{rss.channel.description|arg.title|'未知来源'}}</p>
```

## 🔗 快速链接说明

对于 RSSHub 订阅，可使用快速链接简化输入：

```bash
# 完整链接
https://hub.slarker.me/telegram/channel/woshadiao

# 快速链接
tg:woshadiao
```

### 常用快速链接

```bash
# Telegram 频道
tg:<频道名>

# GitHub
gh:issue/<用户>/<仓库>
gh:release/<用户>/<仓库>

# 豆瓣
douban/group/<ID>

# 微信公众号
mp-tag:<AppID>/<TagID>
```

查看所有快速链接：
```bash
rsso -q
```

切换 RSSHub 实例（在配置中）：
```yaml
msg:
  rssHubUrl: "https://hub.slarker.me"
```

## 🌐 代理配置

### 全局代理

在配置文件中设置：

```yaml
net:
  proxyAgent:
    enabled: true
    protocol: "socks5"  # http, https, socks5
    host: "127.0.0.1"
    port: 17890
    auth:
      enabled: true
      username: "user"
      password: "pass"
```

### 订阅级代理

```bash
# 使用代理订阅
rsso -a proxyAgent:socks5//127.0.0.1/7890 <url>

# 禁用代理（即使全局已启用）
rsso -a proxyAgent:false <url>

# 使用带认证的代理
rsso -a proxyAgent:http//user:pass@127.0.0.1/8080 <url>
```

### 代理优先级

1. 订阅级代理（arg.proxyAgent）
2. 全局代理（config.net.proxyAgent）
3. 直连

## 🤖 AI 摘要功能

### 配置 AI

```yaml
ai:
  enabled: true
  baseUrl: "https://api.openai.com/v1"  # 或兼容的 API
  apiKey: "sk-..."
  model: "gpt-3.5-turbo"
  placement: "top"           # top | bottom
  separator: "────────"       # 分隔符
  maxInputLength: 2000       # 最大输入长度
  timeout: 30000             # 超时时间（毫秒）
```

### 自定义 Prompt

```yaml
ai:
  prompt: "请为以下内容生成简洁的要点摘要：\n\n标题：{{title}}\n\n内容：{{content}}\n\n摘要："
```

### 效果

AI 摘要会：
- 自动渲染到图片中（使用图片渲染模板时）
- 支持 Markdown 格式（列表、粗体、链接等）
- 使用与模板一致的样式
- 可以通过 `{{aiSummary}}` 在自定义模板中使用

## 📊 图片渲染配置

### 渲染模式

| 模式 | 说明 | 配置 |
|------|------|------|
| `base64` | Base64 编码 | `imageMode: base64` |
| `File` | 本地文件 | `imageMode: File` |
| `assets` | Assets 服务 | `imageMode: assets` |

### 渲染参数

```yaml
template:
  bodyWidth: 600          # 宽度（像素）
  bodyPadding: 20         # 内边距（像素）
  bodyFontSize: 16        # 字体大小（像素）
  deviceScaleFactor: 2    # 清晰度倍数（0.5-3）
```

### 视频处理

```yaml
basic:
  videoMode: "filter"     # filter | href | base64 | File | assets
  usePoster: true         # 使用视频封面
```

### Telegram 大视频兼容（tdl 兜底）

订阅 Telegram 频道时，RSSHub 对超大视频会返回 `Video is too big` 占位（仅一张封面图），插件原本拿不到视频链接。开启 tdl 兜底后，插件会用外部工具 [iyear/tdl](https://github.com/iyear/tdl) 直接从 Telegram 拉取原始视频，超过阈值再用 ffmpeg 压缩后发送。

**前置准备（宿主机一次性操作）：**

1. 安装 tdl（Go 编写的独立 CLI，**不是 npm 包**）：
   ```bash
   # 方式一：Go 安装
   go install github.com/iyear/tdl@latest
   # 方式二：下载 Release 二进制
   # https://github.com/iyear/tdl/releases
   ```
2. 安装 ffmpeg 服务（用于压缩，缺失则大视频会被跳过）：
   推荐通过 Koishi 插件市场安装 `koishi-plugin-ffmpeg`（提供 `ctx.ffmpeg.executable`），
   无需在宿主机手动装 ffmpeg。也可在容器内 `apt install ffmpeg`。
3. 完成 tdl 登录（二维码或手机号）：
   ```bash
   tdl login
   ```

**配置：**

```yaml
tdl:
  enabled: true              # 启用兜底下载（默认 false）
  timeout: 180               # 单次下载超时（秒）
  compressThreshold: 30      # 触发压缩的体积阈值（MB）
  crf: 30                    # ffmpeg 质量 18-32，越小越清晰体积越大
  proxyByEnv: true           # 把订阅级代理透传给 tdl 子进程
```

**行为说明：**
- tdl **缺失时自动跳过**，不报错、不阻塞其它订阅推送。
- ffmpeg 通过 Koishi 的 `ffmpeg` 服务（`koishi-plugin-ffmpeg`）提供路径；服务未注入时大视频会被跳过。
- 下载与压缩产物落在插件缓存目录（`basic.cacheDir`），随定时器统一清理。
- 发送方式复用 `basic.videoMode`，与普通视频一致。
- 开启后启动日志会打印 tdl/ffmpeg 探测结果（`✓`/`✗`），便于排查。

## 🔐 权限说明

### 权限等级

| 权限 | 说明 | 默认配置 |
|------|------|----------|
| `authority` | 基础使用权限 | 1 |
| `advancedAuthority` | 高级功能权限 | 4 |

### 提升权限

#### 方式一：使用 change-auth-callme 插件

```bash
# 安装插件
plugin install change-auth-callme

# 提升权限到 5
changeauth 5
```

#### 方式二：使用 auth 插件

```bash
# 绑定账号
auth:bind

# 提升权限
auth:assign @user 5
```

### 功能权限要求

- **基础订阅**：需要 `authority` 权限
- **关注全体**：需要 `advancedAuthority` 权限
- **Bot 主人**：拥有所有权限

## 🛠️ 配置项说明

### 完整配置示例

```yaml
plugins:
  rss-owl:
    # === 基础配置 ===
    $type: config
    authority: 1              # 基础权限等级
    advancedAuthority: 4      # 高级功能权限等级

    # === 网络配置 ===
    net:
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      rssHubUrl: "https://hub.slarker.me"
      proxyAgent:
        enabled: false
        protocol: "socks5"
        host: "127.0.0.1"
        port: 17890
        auth:
          enabled: false
          username: ""
          password: ""

    # === 消息处理 ===
    msg:
      censor: false                    # 内容审查
      keywordFilter: []                # 关键词过滤
      keywordBlock: []                 # 关键词屏蔽
      blockString: "*"                 # 屏蔽替换字符
      rssHubUrl: "https://hub.slarker.me"

    # === 模板配置 ===
    template:
      custom: ""                       # 自定义模板 HTML
      customRemark: ""                 # 自定义备注
      bodyWidth: 600                   # 渲染宽度
      bodyPadding: 20                  # 渲染内边距
      bodyFontSize: 16                 # 字体大小
      deviceScaleFactor: 2             # 清晰度倍数
      content: ""                      # content 模板内容

    # === 基础配置 ===
    # 当前 WebUI / Schema 里仍显示历史字段名，下面示例保持与配置界面一致
    basic:
      usePoster: false                 # 使用视频封面
      margeVideo: false                # 合并视频
      defaultTemplate: "auto"          # 默认模板
      timeout: 60                      # 请求超时（秒）
      refresh: 5                       # 刷新间隔（分钟）
      merge: "不合并"                  # 消息合并策略
      maxRssItem: 10                   # 最大条目数
      firstLoad: true                  # 首次加载行为
      urlDeduplication: false          # URL 去重
      resendUpdataContent: "disable"   # 重发内容策略
      imageMode: "base64"              # 图片模式
      videoMode: "filter"              # 视频模式
      autoSplitImage: false            # 自动分割图片
      cacheDir: "./data/cache"         # 缓存目录
      replaceDir: "./data/replace"     # 替换目录

    # === AI 配置 ===
    ai:
      enabled: false                   # 启用 AI
      baseUrl: "https://api.openai.com/v1"
      apiKey: ""
      model: "gpt-3.5-turbo"
      placement: "top"                 # top | bottom
      separator: "────────"
      prompt: "请为以下内容生成简短摘要：\n\n标题：{{title}}\n\n内容：{{content}}\n\n摘要："
      maxInputLength: 2000
      timeout: 30000

    # === 调试配置 ===
    debug: "info"                      # disable | error | info | details
```

> 兼容说明：运行时内部已兼容 `mergeVideo` / `resendUpdatedContent` / `nextUpdateTime`；但当前 Koishi 配置 Schema 与 WebUI 仍展示历史字段名 `margeVideo` / `resendUpdataContent`，因此配置界面示例暂保持旧命名，避免和实际 UI 脱节。

## 🐛 调试指南

### 启用详细日志

```yaml
debug: "details"  # 显示所有调试信息
```

### 常见问题

**1. 订阅不更新**
- 检查刷新间隔设置
- 使用 `rsso.pull <id>` 手动拉取测试
- 查看日志确认是否有错误

**2. 图片不显示**
- 检查是否安装了 `puppeteer` 插件
- 确认 `imageMode` 配置正确
- 查看日志中的渲染错误

**3. AI 摘要不生成**
- 确认 AI 功能已启用
- 检查 API 配置是否正确
- 查看日志中的 API 请求错误

**4. 代理不生效**
- 确认代理配置正确
- 检查代理服务器是否可用
- 使用 `debug: details` 查看代理日志

## 📜 更新日志

### 5.2.47 (2026-06-18)

#### 代码审查修复（健壮性 + 性能）

- 🔴 **修复 tdl 超时残留进程占锁** - tdl 用 bolt 存储，SIGTERM 后有时不释放文件锁导致后续调用永久失败。改用 `spawn` + `detached`，超时强杀整个进程组（POSIX 负 PID / Windows taskkill /T）；锁冲突日志高亮提示 `pkill -9 tdl`
- 🔴 **修复 file:// 同步阻塞** - `getVideoUrl` 读本地视频改用 `fs.promises.readFile` 异步读，避免几十 MB 视频 `readFileSync` 阻塞事件循环
- 🔴 **压缩音频容错** - ffmpeg 完整压缩（视频+音频）失败时，自动降级为丢弃音频只压视频（`-an`），应对 Telegram 无声流/异常音频编码；ffmpeg 也改用 `runWithForcedKill` 保证超时不残留
- 🟡 **减少缓存堆积** - tdl 源视频读入内存后立即删本地文件（base64/File/assets 都基于内存数据），避免大视频在缓存目录长期堆积
- 🟢 注释澄清：data: 分支当前未被 tdl 流程使用（预留）；proxyByEnv 字段名沿用历史，实际走 --proxy flag

### 5.2.46 (2026-06-18)

#### 修复源标签与标题重叠

- 🐛 **修复右上角源标签重叠** - 频道名标签原用 `absolute top-4 right-4` 浮动定位，标题较长或频道名较长时会与标题文字重叠
- 🎨 **改为文档流布局** - 源标签移入头部信息区，单独成行右对齐；加 `truncate` 防止过长频道名撑破布局
- ✅ **渲染验证** - 用 puppeteer 渲染测试卡片确认无重叠

### 5.2.45 (2026-06-18)

#### 修复 tdl 下载命令（实测验证）

- 🐛 **修复 tdl 参数顺序** - 全局 flag（`--storage`/`--proxy`）必须放在子命令 `dl` 之前，否则 cobra 把它们当位置参数导致静默解析失败（之前下载会卡死无输出）
- 🐛 **移除错误的 -f flag** - tdl 没有 force/no-confirm，`-f` 实为 `--file`（导出文件）会要参数报错
- ✅ **实测通过** - 容器内用 `tdl --storage ... --proxy ... dl -u <link> -d <dir>` 成功下载 4MB 视频，1.66 MB/s

### 5.2.44 (2026-06-18)

#### 改用 Koishi ffmpeg 服务

- 🔌 **复用 ffmpeg 服务** - 压缩不再自己探测 PATH，改为注入 Koishi 的 `ffmpeg` 服务（`ctx.ffmpeg.executable`，由 `koishi-plugin-ffmpeg` 提供），与其它视频插件（如 video-to-gif）共用同一 ffmpeg 安装
- 🧩 **可选注入** - `ffmpeg` 加入 `inject.optional`，未装该服务时优雅跳过大视频、不报错
- 🧹 **移除 detectBinary('ffmpeg')** - 避免与 ffmpeg 服务双路径探测的歧义

### 5.2.43 (2026-06-18)

#### 容器部署适配修复

- 🐛 **修复 tdl 版本探测** - tdl 用 `version` 子命令而非 `-v` flag，旧实现会让 detectBinary 误判 tdl 不存在
- 📁 **新增 tdl 配置项** - `binPath`（指定二进制路径，适配容器持久卷如 `/koishi/bin/tdl`）、`storage`（会话存储路径，登录与下载须一致）、`proxy`（专用代理）
- 🔧 **会话持久化** - 下载时透传 `--storage` 与 `--proxy`，确保容器环境下会话从持久卷读取、走指定代理
- 🎯 **探测逻辑优化** - `resolveTdlBinary` 优先用 binPath，启动日志显示 tdl 实际路径（PATH / 绝对路径）

### 5.2.42 (2026-06-18)

#### Telegram 大视频 tdl 兜底

- 🎬 **Telegram 大视频兼容** - 订阅 Telegram 频道时，RSSHub 对超大视频返回的 `Video is too big` 占位，现可通过外部 [iyear/tdl](https://github.com/iyear/tdl) 直接从 Telegram 拉取原始视频
- 📦 **ffmpeg 自动压缩** - 下载产物超阈值（默认 30MB）自动用 ffmpeg 压缩后再发送，降低带宽占用
- 🔌 **外部二进制探测** - tdl/ffmpeg 为外部 CLI（非 npm 包），运行时探测 PATH，缺失自动跳过、不阻塞主流程
- ♻️ **videoMode 复用** - 兜底视频走既有 `videoMode` 链路（base64/File/assets），行为与普通视频一致
- 🧪 **新增单元测试** - 覆盖 `parseTelegramLink`、`detectVideoTooBig`、`shouldCompress` 等纯函数

### 5.2.3 (2026-03-10)

#### 结构收敛与文档同步

- 🧩 **入口装配层收敛** - `src/index.ts` 进一步压缩为装配层，命令注册与生命周期更清晰
- 🗂️ **命令模块继续拆分** - 补齐 `runtime`、订阅创建、网页监控等命令模块结构
- 🎨 **模板/渲染逻辑复用** - 统一模板处理与图片资源回填，减少重复分支
- 🌐 **代理配置统一** - AI 与搜索模块改为共享代理 helper
- 📚 **文档同步** - 更新模板名称、目录结构、开发与测试说明

### 5.0.4 (2026-02-17)

#### 🎉 重大更新 - 命令系统重构

**新增功能**：
- ✨ **子命令系统** - 新增 `rsso.list`, `rsso.remove`, `rsso.edit`, `rsso.pull`, `rsso.follow` 子命令
- ✨ **修改订阅功能** - 支持直接修改订阅配置，无需删除后重新添加
- 🔐 **权限系统修复** - 修复权限检查逻辑，权限等级等于要求值时可以执行
- 🌐 **跨群订阅增强** - 添加测试模式，可验证目标群组是否可访问

**命令变更**：
| 旧命令 | 新命令 |
|--------|--------|
| `rsso -l` | `rsso.list` |
| `rsso -r 1` | `rsso.remove 1` |
| `rsso -p 1` | `rsso.pull 1` |
| `rsso -f 1` | `rsso.follow 1` |

**权限改进**：
- 修复：删除订阅权限检查 `authority >` → `authority >=`
- 改进：权限提示信息显示当前权限等级和要求权限等级
- 新增：修改订阅功能需要基础权限

**跨群订阅改进**：
- 新增：`rsso <url> --target <platform:guildId> --test` 测试模式
- 改进：详细的错误提示，帮助排查群组访问问题

**兼容性**：
- 保留：旧命令选项仍可使用（会提示迁移到新命令）
- 数据库：无需变更
- 配置：无需修改

### 5.0.3 (2025-01-16)

#### 功能改进
- 🔧 **修复权限系统** - 统一权限检查逻辑
- 🐛 **修复跨群订阅** - 确保消息发送到目标群组
- 📝 **改进错误提示** - 提供更详细的错误信息

### 5.0.0-beta (2025-01-15)

#### 新增功能
- ✨ **AI 摘要功能** - 集成 OpenAI API，自动生成内容摘要
- 🎨 **AI 摘要渲染** - AI 摘要完美集成到图片渲染中
- 📝 **Markdown 支持** - AI 摘要支持完整的 Markdown 语法
- 🎯 **统一样式** - AI 摘要使用与模板一致的设计风格

#### 功能改进
- 🔧 **优化日志系统** - 调试信息分级管理，默认不显示技术细节
- 📊 **改进代理配置** - 更灵活的代理配置和优先级处理
- 🎨 **优化模板样式** - 使用 Tailwind CSS，提升视觉效果
- ⚡ **性能优化** - 图片预处理、并行下载等性能提升

#### 技术更新
- 📦 **添加依赖** - 引入 `marked` 库用于 Markdown 解析
- 🏗️ **代码重构** - 优化模块结构，提升可维护性
- 📚 **完善文档** - 更新 README，添加详细的功能说明

### 4.8.16 及更早版本

详见 [GitHub Releases](https://github.com/Anyuluo996/koishi-plugin-rss-owl/releases)

## 🔜 TODO

- [ ] 网页监控功能增强
- [ ] 更多 AI 功能集成
- [ ] 自定义 AI 模型支持
- [ ] 内容过滤规则增强
- [ ] 订阅分组管理
- [ ] 数据统计面板

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发

```bash
# 克隆项目
git clone https://github.com/Anyuluo996/koishi-plugin-rss-owl.git

# 安装依赖
cd koishi-plugin-rss-owl
npm install --legacy-peer-deps

# 构建
npm run build

# 运行测试
npm test

# 生成覆盖率报告
npm run test:coverage

# 监听模式（开发时使用）
npm run test:watch
```

### 测试

当前仓库包含 `unit`、`integration`、`manual` 三类测试/验证文件。

**推荐验证方式**：
- `npm test`：运行默认 Jest 测试集
- `npm run test:watch`：开发中持续回归
- `npm run test:coverage`：需要覆盖率报告时执行
- `npm run build`：执行 TypeScript 编译检查

**测试范围**：
- ✅ 工具函数测试（日期解析、URL处理、内容清理）
- ✅ HTTP 请求测试（RequestManager、createHttpFunction）
- ✅ 错误处理测试（友好错误消息、错误类型识别）
- ✅ 日志系统测试（debug输出、级别过滤）
- ✅ 处理器/渲染逻辑测试（模板分支、图片回填、渲染边界）
- ✅ 命令工具与代理配置测试

`tests/manual/` 中的文件主要用于手工联调，不作为默认自动化回归通过信号。

详见 [docs/TESTING.md](./docs/TESTING.md) 了解更多测试信息。

## 💬 致谢

本项目基于以下优秀的开源项目：

- [koishi-plugin-rss](https://github.com/koishijs/koishi-plugin-rss) - Koishi 官方 RSS 插件
- [koishi-plugin-rss-discourse](https://github.com/MirrorCY/koishi-plugin-rss) - 功能完善的 RSS 插件
- [koishi-plugin-rss-cat](https://github.com/jexjws/koishi-plugin-rss-cat) - RSS 订阅管理插件
- [koishi-plugin-rss](https://github.com/borraken/koishi-plugin-rss-owl) - 原库

感谢 Koishi 社区的支持和贡献！

## 📄 许可证

[MIT License](LICENSE)

---

**Made with ❤️ by Anyuluo**
