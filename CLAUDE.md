# Koishi Plugin RSS Owl - 项目开发规范

> 本文档为 Claude AI 和项目开发者提供统一的开发指南，确保代码风格一致性和项目可维护性。

---

## 📋 目录

- [项目概述](#项目概述)
- [代码规范](#代码规范)
- [项目结构](#项目结构)
- [函数复用指南](#函数复用指南)
- [开发工作流](#开发工作流)
- [测试要求](#测试要求)
- [文档规范](#文档规范)

---

## 📖 项目概述

### 基本信息
- **项目名称**: koishi-plugin-rss-owl
- **包名**: @anyul/koishi-plugin-rss
- **技术栈**: TypeScript + Koishi 4.x + Node.js
- **版本**: 5.3.4
- **许可证**: MIT
- **国际化定位**: **纯中文项目**。命令描述、配置 Schema、用户提示均为中文硬编码，不提供 i18n。如未来需要国际化，需另立 locales 专项。

### 核心功能
- RSS/Atom/JSON Feed 订阅
- HTML 网页监控（CSS选择器 + Puppeteer）
- AI 智能摘要
- 图片渲染（Puppeteer）
- 代理支持
- 内容审查（可选）

### 架构原则
- **模块化**: 核心功能独立，便于维护和测试
- **入口装配层最小化**: `src/index.ts` 只负责装配、生命周期和模块注册
- **命令按职责拆分**: 订阅创建、管理、编辑、网页监控分别位于独立命令模块
- **运行时依赖注入**: 命令共享能力统一经 `src/commands/runtime.ts` 提供
- **可配置**: 全局配置 + 订阅级配置覆盖
- **共享 helper 优先**: 代理、目标解析、模板渲染等公共逻辑优先复用已有 helper
- **模板/渲染链路收敛**: 模板选择、HTML 加载、图片回填逻辑优先集中在 `item-processor.ts`
- **可扩展**: 模板系统、快速链接、插件可选依赖
- **性能优化**: 请求队列、缓存、并行处理

---

## 🧩 Koishi 生态约定

本项目作为 Koishi 4.x 插件，遵循以下生态级约定（区别于通用 TS 风格）。

### 插件入口约定

- 入口导出 `name`、`using`、`apply(ctx, config)` 三件套。
- **必需服务**用 `export const using = ['database']` 声明（Koishi 4.11+，替代旧 `inject`）。
- **可选服务**（puppeteer/censor/assets/server/ffmpeg）**不**在 `using` 中声明，代码内统一用可选链访问（`ctx.puppeteer?.render()`），缺失时优雅降级。
- 生命周期：`ctx.on('ready', ...)` 启动后台任务，`ctx.on('dispose', ...)` 清理定时器/监听，**必须支持热重载**。

### 数据库类型约定（重要）

Koishi 数据库的表类型通过 `Tables` 接口扩展注册，**禁止**用 `as any` 绕过：

```typescript
// ✅ 在 src/types.ts 注册表名 -> 行类型
declare module 'koishi' {
  interface Tables {
    rssOwl: RssOwlRow
    rss_message_cache: RssMessageCacheRow
    rss_notification_queue: RssNotificationQueueRow
  }
}

// ✅ 之后所有调用自动带类型，无需 as any
ctx.model.extend('rssOwl', { ... })
const list = await ctx.database.get('rssOwl', { platform, guildId })
```

新增表必须：(1) 在 `types.ts` 定义行 interface 并注册到 `Tables`；(2) 在 `database.ts` 用 `model.extend` 建表。

### Koishi 服务使用清单

| 服务 | 注入方式 | 本项目用法 | 缺失时行为 |
|------|---------|-----------|-----------|
| database | `using: ['database']`（必需） | `ctx.model.extend` / `ctx.database.*` | 插件不加载 |
| puppeteer | 可选 | `ctx.puppeteer?.render/page` | 降级为纯文本/视频过滤 |
| censor | 可选 | `ctx.censor?.()` | 跳过内容审查 |
| assets | 可选 | `ctx.assets?.upload()` | 图片走 base64/File |
| ffmpeg | 可选 | `ctx.ffmpeg?.executable` | Telegram 大视频压缩不可用 |
| server | 可选 | `ctx.server?.get/post` | 消息缓存 HTTP 服务不注册 |

### 日志约定

- 日志统一走 Koishi 原生 `Logger` 实例，`config.debug` 同步到 `Logger.levels['rss-owl']`（`applyDebugLevel`），让 WebUI logger 插件 / 全局 levels 可控制本插件日志可见性。
- **敏感字段脱敏**（代理、密钥、Token）在 `utils/logger.ts` 内置，业务代码不得直接 `console.log` 敏感数据。

### 命令权限模型

项目有**两层权限**，需明确区分：
- **Koishi 原生**：`session.authority`（用户等级，1-5），由 Koishi 框架维护。
- **项目自定义**：`config.basic.authority` / `config.basic.advancedAuthority`（基础/高级命令门槛）。
- 命令权限检查统一经 `commands/utils.ts` 的 `checkAuthority()`，不散落手写比较。

---

## 📝 代码规范

### TypeScript 编码规范

#### 1. 文件组织

```typescript
// ✅ 正确的导入顺序
// 1. Node.js 内置模块
import { promises as fs } from 'fs'
import path from 'path'

// 2. 第三方依赖
import axios from 'axios'
import { Context, Schema } from 'koishi'

// 3. 项目内部模块（按层级：utils -> core -> 根目录）
import { debug } from './utils/logger'
import { getAiSummary } from './core/ai'
import { Config } from './types'
```

#### 2. 类型定义

```typescript
// ✅ 接口定义使用明确的类型注解
export interface rssArg {
  template?: TemplateType
  forceLength?: number
  timeout?: number
  type?: 'rss' | 'html'
  selector?: string
}

// ✅ 函数返回类型必须明确标注
export async function getRssData(
  ctx: Context,
  config: Config,
  $http: HttpFunction,
  url: string,
  arg: rssArg
): Promise<RssItem[]> {
  // 实现
}

// ✅ 使用类型别名简化复杂类型
type TemplateType = 'auto' | 'content' | 'default' | 'text' | 'media' | 'image' | 'video' | 'proto'
```

#### 3. 异步处理

```typescript
// ✅ 使用 async/await 而非 Promise 链
export async function processItems(items: RssItem[]) {
  // 并行处理（性能优先）
  const results = await Promise.all(
    items.map(item => processItem(item))
  )

  // 或使用 allSettled（容错优先）
  const results = await Promise.allSettled(
    items.map(item => processItem(item))
  )

  // 串行处理（顺序敏感）
  for (const item of items) {
    await processItem(item)
  }
}
```

#### 4. 错误处理

```typescript
// ✅ 具体的错误捕获和日志记录
export async function fetchWithRetry(url: string, retries = 3) {
  try {
    return await axios.get(url)
  } catch (error: any) {
    if (error.code === 'ETIMEDOUT' && retries > 0) {
      debug(config, `请求超时，剩余重试次数: ${retries}`, 'fetch', 'info')
      await sleep(1500)
      return fetchWithRetry(url, retries - 1)
    }
    throw error
  }
}

// ✅ 友好的错误提示
function getFriendlyErrorMessage(error: any): string {
  const errorMap = {
    'ENOTFOUND': '无法连接到服务器，请检查URL是否正确',
    'ETIMEDOUT': '连接超时，请稍后重试',
    'ECONNREFUSED': '连接被拒绝，服务器可能不可用',
    'SSRFFiltered': '该URL已被安全策略拦截'
  }
  return errorMap[error.code] || `未知错误: ${error.message}`
}
```

#### 5. 配置合并

```typescript
// ✅ 配置优先级明确（局部 > 全局 > 默认）
export function mixinArg(arg: any, config: Config): rssArg {
  return {
    ...config.basic,        // 1. 全局基础配置
    ...arg,                 // 2. 订阅级配置覆盖
    filter: [               // 3. 数组合并
      ...(config.msg?.keywordFilter || []),
      ...(arg?.filter || [])
    ],
    proxyAgent: mergeProxyAgent(  // 4. 深度合并
      arg?.proxyAgent,
      config.net?.proxyAgent,
      config
    )
  }
}
```

### 命名规范

```typescript
// ✅ 文件名：kebab-case
src/core/item-processor.ts
src/utils/fetcher.ts

// ✅ 类名：PascalCase
export class RequestManager { }
export class RssItemProcessor { }

// ✅ 函数/变量：camelCase
const getRssData = async () => { }
let requestManager: RequestManager

// ✅ 常量：SCREAMING_SNAKE_CASE
export const MAX_RETRIES = 3
export const DEFAULT_TIMEOUT = 60000

// ✅ 接口/类型：PascalCase
export interface Config { }
export type TemplateType = string

// ✅ 私有成员：前缀下划线
class MyClass {
  private _internalState: any
  private _helperFunction() { }
}
```

### 注释规范

```typescript
/**
 * 获取 RSS 数据并解析为统一格式
 *
 * @param ctx - Koishi 上下文对象
 * @param config - 插件配置
 * @param $http - HTTP 请求函数
 * @param url - RSS 源 URL
 * @param arg - 订阅参数（可覆盖全局配置）
 * @returns 解析后的 RSS 条目数组
 *
 * @throws {Error} 当 URL 无效或解析失败时抛出错误
 *
 * @example
 * ```typescript
 * const items = await getRssData(ctx, config, $http, 'https://example.com/rss', {})
 * ```
 */
export async function getRssData(
  ctx: Context,
  config: Config,
  $http: any,
  url: string,
  arg: rssArg
): Promise<RssItem[]> {
  // 实现
}

// ✅ 单行注释用于解释复杂逻辑
// 使用 Token Bucket 算法控制请求速率，避免被封禁
const requestManager = new RequestManager(3, 2, 10)
```

---

## 🏗️ 项目结构

### 目录组织

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
│   │   ├── feeder.ts      # RSS 订阅调度器
│   │   ├── item-processor.ts  # RSS 条目处理
│   │   ├── notification-queue.ts # 发送队列
│   │   ├── parser.ts      # RSS/HTML 解析
│   │   ├── renderer.ts    # Puppeteer 渲染
│   │   └── search.ts      # 联网搜索与外部 provider
│   ├── services/           # 对外服务注册
│   │   └── message-cache-service.ts
│   ├── utils/              # 工具函数与共享基础设施
│   │   ├── common.ts      # 通用工具函数
│   │   ├── error-tracker.ts # 错误追踪集成
│   │   ├── fetcher.ts     # HTTP 请求管理
│   │   ├── logger.ts      # 日志系统
│   │   ├── media.ts       # 媒体处理
│   │   ├── message-cache.ts # 消息缓存
│   │   ├── proxy.ts       # 代理配置 helper
│   │   ├── structured-logger.ts # 结构化日志
│   │   └── template.ts    # 模板系统
│   ├── config.ts          # 配置定义和 Schema
│   ├── constants.ts       # 常量定义
│   ├── database.ts        # 数据库模型
│   ├── types.ts           # TypeScript 类型定义
│   └── index.ts           # 插件入口
├── docs/                  # 开发文档与重大改动记录
│   ├── TEMPLATE.md
│   └── 2026-03-10-*.md
├── lib/                   # 编译输出（不提交）
├── tests/                 # 测试与手工验证文件
│   ├── unit/
│   ├── integration/
│   ├── manual/
│   ├── setup.ts
│   └── web-search.test.ts
├── .claude/              # Claude AI 配置
├── CLAUDE.md             # 本文档
├── README.md             # 用户文档
├── package.json
└── tsconfig.json
```

### 模块职责

#### `src/commands/` - 命令层与运行时依赖

| 文件 | 职责 | 说明 |
|------|------|------|
| `runtime.ts` | 命令共享依赖出口 | 统一封装 `parsePubDate()`、`getRssData()`、`parseRssItem()` 等运行时能力 |
| `subscription-create.ts` | 新增订阅命令 | 处理主订阅命令、快速链接、测试模式与跨群目标 |
| `subscription-management.ts` | 订阅管理命令 | 负责列表、删除、拉取、关注等管理类子命令 |
| `subscription-edit.ts` | 订阅编辑命令 | 负责标题、URL、模板、选择器、目标修改 |
| `web-monitor.ts` | 网页监控命令 | 负责网页监控命令注册与调用 AI 选择器能力 |
| `index.ts` | 命令聚合 | 统一导出各命令注册函数与管理命令 |

#### `src/core/` - 核心业务逻辑

| 文件 | 职责 | 导出函数 |
|------|------|----------|
| `ai.ts` | AI 功能（摘要、选择器生成） | `getAiSummary()`, `generateSelectorByAI()` |
| `feeder.ts` | RSS 调度器、定时轮询 | `startFeeder()`, `stopFeeder()`, `mixinArg()` |
| `item-processor.ts` | 条目处理、模板渲染 | `RssItemProcessor.parseRssItem()` |
| `subscription-store.ts` | `rssOwl` 订阅表仓储封装 | `SubscriptionStore`（findByGuild / create / update / remove） |
| `telegram-video-restore.ts` | Telegram "Video is too big" tdl 兜底恢复 | `restoreTelegramVideos()` |
| `notification-queue.ts` | 发送队列 | `NotificationQueueManager` |
| `parser.ts` | RSS/HTML/JSON 解析 | `getRssData()`, `parseRssData()` |
| `renderer.ts` | Puppeteer 渲染 | `renderHtml2Image()`, `preprocessHtmlImages()` |
| `search.ts` | 联网搜索能力 | 搜索 provider 调用、结果整理 |

#### `src/services/` - 服务注册层

| 文件 | 职责 | 导出函数 |
|------|------|----------|
| `message-cache-service.ts` | 消息缓存 HTTP/API 服务注册 | `registerMessageCacheService()` |

#### `src/utils/` - 工具函数

| 文件 | 职责 | 导出函数 |
|------|------|----------|
| `common.ts` | 通用工具 | `parsePubDate()`, `ensureUrlProtocol()`, `parseQuickUrl()` |
| `error-tracker.ts` | 错误追踪封装 | `initErrorTracker()`, `trackError()` |
| `fetcher.ts` | HTTP 请求管理 | `RequestManager`, `createHttpFunction()` |
| `logger.ts` | 日志系统 | `debug()` |
| `media.ts` | 媒体处理 | `getImageUrl()`, `getVideoUrl()`（支持 data:/file: 本地协议）, `writeCacheFile()` |
| `message-cache.ts` | 消息缓存管理 | `initMessageCache()`, `getMessageCache()` |
| `proxy.ts` | 统一代理 helper | `buildAxiosProxyConfig()`、`mergeProxyAgent()` |
| `structured-logger.ts` | 结构化日志辅助 | 日志上下文与指标辅助 |
| `tdl.ts` | Telegram tdl 兜底下载（外部 CLI） | `detectBinary()`, `parseTelegramLink()`, `detectVideoTooBig()`, `downloadWithTdl()` |
| `video-compress.ts` | ffmpeg 视频压缩（外部 CLI） | `shouldCompress()`, `compressVideoIfNeeded()` |
| `template.ts` | 模板处理 | `getDefaultTemplate()`, `parseTemplateContent()` |

### 当前结构约束

- `src/index.ts` 必须保持为**入口装配层**，禁止回填具体命令实现和复杂业务判断。
- 命令共享依赖优先进入 `src/commands/runtime.ts`，不要在多个命令文件重复拼装相同 helper。
- **命令层（`src/commands/`）禁止直接 `ctx.database.*` 访问业务表**：`rssOwl` 经 `SubscriptionStore`、
  `rss_message_cache` 经 `MessageCacheManager`、`rss_notification_queue` 经 `NotificationQueueStore`。
  命令层通过依赖注入拿到仓储实例，只复用核心函数，便于替换实现与单元测试。
  （`feeder` 位于 `core/`，直接读写 `rssOwl` 属核心层对自身数据的合法访问，不强制走仓储。）
- 模板解析、HTML 加载、图片资源回填优先收敛到 `src/core/item-processor.ts` / `src/core/renderer.ts`。
- 代理配置统一复用 `src/utils/proxy.ts`，避免在 `ai.ts`、`search.ts` 等模块重复构造。

---

## 🔄 函数复用指南

### 核心原则
- **DRY (Don't Repeat Yourself)**: 重复代码超过 2 次必须提取
- **单一职责**: 每个函数只做一件事
- **可测试性**: 函数应易于单元测试
- **纯函数优先**: 副作用函数应明确标注

### 复用层次

#### 1. 工具函数层 (`utils/`)

```typescript
// ✅ 纯函数，无副作用
export function parsePubDate(dateStr: string): Date {
  if (!dateStr) return new Date()

  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

export function ensureUrlProtocol(url: string): string {
  if (!url) return ''
  url = url.trim().split(/\s+/)[0]
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`
  }
  return url
}
```

#### 2. 核心功能层 (`core/`)

```typescript
// ✅ 组合工具函数，提供业务能力
export async function getRssData(
  ctx: Context,
  config: Config,
  $http: any,
  url: string,
  arg: rssArg
): Promise<RssItem[]> {
  url = ensureUrlProtocol(url)
  const rawData = await fetchRssRaw($http, url, arg)
  return parseRssData(rawData, url, arg)
}
```

#### 3. 命令层 (`index.ts`)

```typescript
// ✅ 复用核心功能，添加命令交互
ctx.guild().command('rsso <url:text>', '订阅RSS')
  .action(async ({ session }, url) => {
    url = parseQuickUrlLocal(url)
    const rssItemList = await getRssDataLocal(url, arg)
    // ... 命令逻辑
  })
```

### 依赖注入模式

```typescript
// ✅ 通过参数传递依赖，便于测试和复用
export async function renderHtml2Image(
  ctx: Context,      // Koishi 上下文（可选）
  config: Config,    // 配置（必需）
  $http: any,        // HTTP 函数（必需）
  htmlContent: string,
  arg?: rssArg
) {
  // 实现
}
```

### 避免反模式

```typescript
// ❌ 避免硬编码配置
const timeout = 60000

// ✅ 使用配置参数
const timeout = arg.timeout || config.basic.timeout || 60000

// ❌ 避免直接导入全局配置（降低可测试性）
import { config } from './index'

// ✅ 通过参数传递配置
export function myFunction(config: Config) { }
```

---

## 🚀 开发工作流

### 分支策略

```bash
main          # 稳定版本，只接受合并
├── develop   # 开发主分支
├── feature/* # 功能分支
├── fix/*     # 修复分支
└── refactor/* # 重构分支
```

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
feat: 添加 HTML 监控功能完整实现
fix: 修复代理配置合并逻辑错误
refactor: 重构命令模块，提取到独立文件
test: 添加 parser 单元测试
docs: 更新 CLAUDE.md 开发规范
perf: 优化图片下载并发策略
style: 统一代码格式
chore: 更新依赖版本
```

### 开发流程

1. **新建功能分支**
   ```bash
   git checkout -b feature/html-monitor
   ```

2. **开发和测试**
   ```bash
   npm run build  # 编译检查
   npm test       # 运行 Jest 回归
   npm run test:coverage  # 需要覆盖率时执行
   ```

3. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 添加功能描述"
   ```

4. **记录开发日志**
   ```bash
   # 重大结构或行为修改时，在 docs/ 目录创建开发日志
   # 小型修复和纯文档修订可不单独建文档
   ```

5. **合并到 develop**
   ```bash
   git checkout develop
   git merge feature/html-monitor
   ```

---

## 🧪 测试要求

### 测试层级

```
tests/
├── unit/           # 单元测试（核心工具、处理器、命令工具）
├── integration/    # 集成测试（模块间协作）
├── manual/         # 手工联调文件，不作为常规回归信号
├── setup.ts        # Jest 测试初始化
└── web-search.test.ts # 搜索相关专项测试
```

### 测试框架（当前）

```json
{
  "devDependencies": {
    "jest": "^30.2.0",
    "@types/jest": "^30.0.0",
    "ts-jest": "^29.4.6",
    "typescript": "^5.9.3"
  }
}
```

### 测试执行原则

- 优先补 **unit / integration** 测试，不为一次性验证额外创建零散脚本。
- `tests/manual/` 仅放手工联调文件，不作为常规自动化验证成功依据。
- 每次代码修改后至少执行 `diagnostics` 与最小必要的 `tsc` / Jest 回归。
- 回归范围遵循最小化原则：单测函数 → 单文件 → 相关 suite → 必要时全量。

### 测试示例

```typescript
// tests/unit/parser.test.ts
describe('parsePubDate', () => {
  it('should parse valid date string', () => {
    const result = parsePubDate('2024-01-15T10:30:00Z')
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThan(0)
  })

  it('should return current date for invalid input', () => {
    const result = parsePubDate('invalid-date')
    expect(result).toBeInstanceOf(Date)
  })

  it('should return current date for empty input', () => {
    const result = parsePubDate('')
    expect(result).toBeInstanceOf(Date)
  })
})
```

---

## 📚 文档规范

### 开发日志 (docs/*.md)

重大结构调整、行为变更或发布整理后，在 `docs/` 目录创建开发日志；小型修复不强制单独建文档：

**文件命名**: `YYYY-MM-DD-功能名称.md`

**必需内容**:
1. 开发概述
2. 实现细节
3. 修改的文件列表
4. 测试情况
5. 遇到的问题和解决方案
6. 后续优化建议

**模板**: 参考 `docs/TEMPLATE.md`

### 代码文档

- **TSDoc 注释**: 所有导出函数必须包含
- **README.md**: 用户文档，保持更新
- **CLAUDE.md**: 本文档，开发规范

### API 文档

```typescript
/**
 * 函数简述（一句话）
 *
 * 详细说明（多行，解释函数用途、注意事项）
 *
 * @param paramName - 参数说明
 * @returns 返回值说明
 *
 * @throws {ErrorType} 错误说明
 *
 * @example
 * ```typescript
 * // 使用示例
 * const result = functionName(args)
 * ```
 */
```

---

## 🎯 代码质量标准

### 性能要求

- **响应时间**: RSS 解析 < 2s
- **内存占用**: 单个订阅 < 50MB
- **并发控制**: 最多 3 个并发请求
- **错误率**: < 5%（连续 3 次失败标记为异常）

### 安全要求

- **日志脱敏**: 代理、密钥、Token 等敏感字段不得直接输出
- **权限控制**: 基于用户等级的命令权限
- **清理边界明确**: RSS 原始内容清理与最终模板 HTML 渲染必须分层处理

### 可维护性要求

- **函数长度**: 单个函数 < 100 行
- **文件长度**: 单个文件 < 500 行，入口文件必须保持装配层职责。横切关注层（`utils/` 下的 error-handler / logger / proxy 等单一职责收敛文件）上限放宽到 600 行，但仍应优先拆分而非堆砌。
- **圈复杂度**: 单个函数 < 10
- **注释覆盖**: 公共 API 100%
- **重复逻辑治理**: 同类模板/渲染/代理逻辑出现第 2 次时应评估提取共享 helper

---

## 🔧 开发工具

### 推荐配置

```json
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### VS Code 扩展

- Biome - 代码格式化
- TypeScript Vue Plugin - TS 支持
- Jest Runner - 测试运行

---

## 📞 联系方式

- **作者**: Anyuluo <anyul@email.com>
- **GitHub**: https://github.com/Anyuluo996/koishi-plugin-rss-owl
- **问题反馈**: GitHub Issues

---

**最后更新**: 2026-06-27
**文档版本**: 1.2.0（补充 Koishi 生态约定章节，订正版本号/目录清单）
