# koishi-plugin-rss-owl

[![npm](https://img.shields.io/npm/v/@anyul/koishi-plugin-rss?style=flat-square)](https://www.npmjs.com/package/@anyul/koishi-plugin-rss)
![version](https://img.shields.io/badge/version-5.0.0--beta-orange)

> 功能强大的 Koishi RSS 订阅插件，支持多种订阅源、图片渲染、AI 摘要等高级功能

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

## 📁 项目结构

```
koishi-plugin-rss-owl/
├── src/
│   ├── commands/           # 命令定义
│   │   └── index.ts        # RSS 订阅命令
│   ├── core/               # 核心功能模块
│   │   ├── ai.ts          # AI 摘要功能
│   │   ├── feeder.ts      # RSS 订阅调度
│   │   ├── item-processor.ts  # RSS 条目处理
│   │   ├── parser.ts      # RSS/HTML 解析
│   │   └── renderer.ts    # 图片渲染
│   ├── utils/              # 工具函数
│   │   ├── common.ts      # 通用工具
│   │   ├── fetcher.ts     # HTTP 请求
│   │   ├── logger.ts      # 日志系统
│   │   ├── media.ts       # 媒体处理
│   │   └── template.ts    # 模板定义
│   ├── config.ts          # 配置定义
│   ├── constants.ts       # 常量定义
│   ├── database.ts        # 数据库模型
│   ├── types.ts           # TypeScript 类型
│   └── index.ts           # 插件入口
├── lib/                   # 编译输出
├── package.json
└── README.md
```

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
rsso -f 早报网

# 取消关注
rsso -f 早报网
```

### 立即拉取

```bash
# 立即拉取订阅最新内容
rsso -p 早报网
```

## 📋 命令说明

### 基础命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `rsso <url>` | 订阅 RSS | `rsso rss:qqorw` |
| `rsso -l [keyword]` | 查看订阅列表 | `rsso -l`, `rsso -l 早报` |
| `rsso -r <id\|keyword>` | 取消订阅 | `rsso -r 早报网` |
| `rsso -p <id\|keyword>` | 立即拉取 | `rsso -p 早报网` |
| `rsso -f <id\|keyword>` | 关注/取消关注 | `rsso -f 早报网` |
| `rsso -T <url>` | 测试链接 | `rsso -T rss:qqorw` |

### 高级选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-i <template>` | 指定模板 | `rsso -i default <url>` |
| `-t <title>` | 订阅名称 | `rsso -t 早报 <url>` |
| `-a <params>` | 局部参数 | `rsso -a merge:true <url>` |
| `-d <time/count>` | 定时推送 | `rsso -d 8:00/10 <url>` |
| `-q` | 查看快速链接 | `rsso -q` |

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

### 基础模板（直接发送）

| 模板 | 说明 | 内容 |
|------|------|------|
| `content` | 自定义基础模板 | 文字+图片+视频 |
| `text` | 纯文本 | 仅文字 |
| `media` | 媒体内容 | 图片+视频 |
| `image` | 仅图片 | 仅图片 |
| `video` | 仅视频 | 仅视频 |
| `proto` | 原始内容 | 未处理的 description |

### Puppeteer 模板（图片渲染）

| 模板 | 说明 | 特点 |
|------|------|------|
| `default` | 基础渲染模板 | 完整样式，包含标题、时间等 |
| `description` | 纯内容渲染 | 仅包含 description 内容 |
| `custom` | 自定义模板 | 高度可定制，支持自定义 HTML |
| `link` | 链接访问渲染 | 访问 description 中的第一个链接并渲染 |

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

## 🐛 调试指南

### 启用详细日志

```yaml
debug: "details"  # 显示所有调试信息
```

### 常见问题

**1. 订阅不更新**
- 检查刷新间隔设置
- 使用 `rsso -p <id>` 手动拉取测试
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

# 开发模式
npm run dev

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

本项目拥有完善的测试套件，包含 165+ 个测试用例，覆盖核心功能模块。

**测试覆盖率**：
- 语句覆盖率: 90.83%
- 分支覆盖率: 74.86%
- 函数覆盖率: 97.43%
- 行覆盖率: 90.21%

**测试范围**：
- ✅ 工具函数测试（日期解析、URL处理、内容清理）
- ✅ HTTP 请求测试（RequestManager、createHttpFunction）
- ✅ 错误处理测试（友好错误消息、错误类型识别）
- ✅ 日志系统测试（debug输出、级别过滤）
- ✅ 集成测试（真实HTTP请求、代理配置）

详见 [TESTING.md](./TESTING.md) 了解更多测试信息。

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
