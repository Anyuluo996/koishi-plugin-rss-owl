# Koishi 合规与重复造轮子审查报告

**审查范围**: src/ (9.6k 行, 47 文件) + tests/ (32 单测文件) + docs/
**版本基线**: 5.3.3 (refactor: 日志系统整改, 2026-06-26)
**审查日期**: 2026-06-26
**审查者**: Claude (Opus 4.8)
**结论**: 🟡 **总体良好, 但存在 5 处明显重复造轮子与 3 处 Koishi 原生能力未复用**
> ⚠️ 本报告经 2026-06-26 二次核查勘误, 见末尾 §9。原报告个别前提不成立 (§3.2/§4.2) 与引用失实 (§2.4 行号/§3.3 barrel 数), 已就地订正; 文件行数统计 (312/149/146 等) 经 `wc -l` 复核**无误**。

---

## 1. 审查概述

本次审查围绕三个核心问题:

1. 项目代码是否遵循 Koishi 4.x 的最佳实践(服务注入、类型扩展、依赖约定)
2. 是否存在"重复造轮子"——用自研代码覆盖 Koishi 自带能力或项目已有 helper
3. 文件内/文件间是否存在同一逻辑的重复实现

审查发现 (勘误后口径):

- **🔴 P0**: 4 处必须立即处理
- **🟠 P1**: 2 处强烈建议本迭代修复 (§3.2 已降级, 见 §9)
- **🟢 P2**: 4 处可观察待办 (§4.2 已删除, 见 §9)
- **✅ 亮点**: 5 处项目做得对的地方

---

## 2. P0 - 必须立即处理

### 2.1 🔴 命令层错误处理 2 份实现 + 1 份死代码

**事实** (经 2026-06-26 二次核查):

```
src/utils/error-handler.ts          (312 行) ← 真底层 (normalizeError / getErrorType / getFriendlyErrorMessage)
src/commands/error-handler.ts       (149 行) ← CommandError 类 + executeCommand, 内部又 import utils/error-handler
src/commands/utils.ts               (146 行) ← withCommandErrorHandling 又做一遍
```

- `commands/utils.ts:withCommandErrorHandling` 在整个 src/ 中 **0 次被引用**, 已成死代码。
- `commands/error-handler.ts:executeCommand` 在 src/ 业务代码中也**无任何命令文件调用** (仅 `tests/unit/command-error-handler.test.ts` 引用), 实际接近死代码。
- `executeCommand` 与 `withCommandErrorHandling` 功能 90% 重复 — 都是 try/catch + 调 `normalizeError` + 调 `debugError` + 返回友好消息。

> 勘误说明: 原报告标题为"3 份实现", 但活跃在 src/ 的命令错误处理实际只有"1 份底层 + 2 份未被业务调用"的并存, 叙事修正为"2 份实现 + 1 份死代码"。

**根因**: 分阶段重构(2026-03-10 phase-1/2/3 命令拆分)时未及时收敛, 新旧实现并存。

**修复方案**:

1. `commands/utils.ts` 删除 `withCommandErrorHandling`
2. `commands/error-handler.ts` 整文件并入 `utils/error-handler.ts`(`CommandError` 是通用类型, 不应放 commands 层); 同时让 src/ 命令文件真正接入 `executeCommand`, 把它从"接近死代码"转为唯一入口
3. 命令文件统一 `import { executeCommand } from '../utils/error-handler'`

**影响行数**: -200

---

### 2.2 🔴 `parseQuickUrl` 内嵌 `parseTemplateContent` 完整副本

**位置**: `src/utils/common.ts:88-123`

```typescript
export const parseQuickUrl = (url, rssHubUrl, quickList) => {
  // ...
  const parseContent = (template, item) => {  // ← 35 行
    return template.replace(/{{(.+?)}}/g, ...)  // 与 parseTemplateContent 函数体几乎一字不差
  }
  let rUrl = parseContent(correntQuickObj.replace, { rsshub: rssHubUrl, route })
}
```

同一文件 `parseTemplateContent` (line 59) 已是模块级导出, 这里又嵌套了一份。

**修复方案**: 直接调用 `parseTemplateContent(correntQuickObj.replace, { rsshub: rssHubUrl, route })`, 删除内嵌副本。

**影响行数**: -35

---

### 2.3 🔴 拼写错误字段双写 = 配置层污染

代码中并列存在三组拼写错误双写:

| 规范字段 | 错误字段 | 位置 |
|----------|----------|------|
| `mergeVideo` | `margeVideo` | `types.ts:89-90, 196-197`, `config.ts:65` |
| `resendUpdatedContent` | `resendUpdataContent` | `types.ts:98-99, 198-199`, `config.ts:62` |
| `nextUpdateTime` | `nextUpdataTime` | `types.ts:194-195` |

`Updata` 本身就是 `Update` 的拼写错误, 从一开始就不该出现。

`utils/legacy-config.ts` 写了 3 个 `??` 双写兼容映射 + 同时把两个值都写回数据库, 让两层污染都进 schema。

**根因**: 2026-03-11 P0 报告 (`2026-03-11-p0-rss-mainline-hardening.md`) 引入了"规范命名优先 + 旧命名兼容"策略, 但只是叠了一层运行时兼容, 没有真正清理。

**修复方案**:

1. `legacy-config.ts` 加一次性 `migrateDBRow()`, 在 feeder 读取订阅时把 margeVideo→mergeVideo、updataTime→updateTime 写回 DB, 迁移窗口结束删除兼容层
2. 字段统一保留规范拼写, 双写字段标记 `@deprecated` + `console.warn`
3. 数据库模型阶段就拦截旧字段名
4. 测试代码 (`tests/unit/feeder.test.ts`) 已切到规范命名基线, 应全量跟进

**影响**: 一次性 +80/-50, 长期收益是消除配置层永久兼容债

---

### 2.4 🔴 `fetcher.ts` 自拼代理, 与 `proxy.ts` 重复

**位置**: `src/utils/fetcher.ts:114-143`

```typescript
// fetcher.ts 第 114-143 行, 30 行
if (!currentProxyAgent || ...) {
  if (config.net?.proxyAgent?.enabled) { currentProxyAgent = { ... } }  // 防御性补全局配置
}
const proxyEnabled = Boolean(currentProxyAgent?.enabled)
let proxyUrl = ''
if (proxyEnabled && currentProxyAgent.host) {
  proxyUrl = `${currentProxyAgent.protocol}://${currentProxyAgent.host}:${currentProxyAgent.port}`
  const agent = new HttpsProxyAgent(proxyUrl)
  configObj.httpsAgent = agent
  configObj.proxy = false
}
```

而 `src/utils/proxy.ts:6-15` 已有干净的 15 行实现:

```typescript
export function buildAxiosProxyConfig(config: Config) {
  if (!config.net?.proxyAgent?.enabled) return {}
  const proxyUrl = `${...host}:${...port}`
  return {
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false,
  }
}
```

`ai-client.ts` 和 `search-providers.ts` 都正确用了 `buildAxiosProxyConfig`, 只有 `fetcher.ts` 自己又造了一遍。

CLAUDE.md 第 346 行明确写了"代理配置统一复用 `src/utils/proxy.ts`,避免在 `ai.ts`、`search.ts` 等模块重复构造"——但 `fetcher.ts` 自己违反了自己定的规范。

> 勘误说明: 原报告称"CLAUDE.md 第 56 行", 实际在 **第 346 行**; 第 56 行是 `import axios` 示例。

**修复方案**: `fetcher.ts` 改 `currentProxyAgent = mergeProxyAgent(arg?.proxyAgent, config.net?.proxyAgent, config)` 后调用 `buildAxiosProxyConfig({ net: { proxyAgent: currentProxyAgent } })`, 30 行变 3 行。

**影响行数**: -30

---

## 3. P1 - 强烈建议本迭代修复

### 3.1 🟠 自研限流器 vs Koishi `ctx.http`

**位置**: `src/utils/fetcher.ts:11-71` 的 `RequestManager`, 71 行令牌桶 + 队列

**事实**:

- Koishi `ctx.http('GET', url, { timeout, headers, ... })` 内部已封装 axios + 限流 + 重试
- 项目又造了一份 `createHttpFunction` 包装层套在 axios 外面
- 全代码 0 次使用 `ctx.http`(`grep "ctx\.http|http\.get|http\.post"` 零命中)

**修复方案**: `createHttpFunction` 直接 `return (url, arg, cfg) => ctx.http('GET', url, { timeout, headers, ... })`; `RequestManager` 整文件删除; 代理走 `httpsAgent` 参数即可。

**影响行数**: -71

---

### 3.2 ✅ logger.ts 自研敏感信息脱敏 — **已降级为"合理扩展, 保留"**

**位置**: `src/utils/logger.ts:80-193`, 113 行 `SENSITIVE_PATTERNS` 正则 + `sanitizeLogMessage` + `sanitizeObject`

**勘误结论 (2026-06-26 二次核查)**: 原报告断言"Koishi Logger 在 reggol 0.10+ 已支持 `sanitize`", **经核实为不实**。Koishi 4.18.10 依赖的 reggol **没有原生 sanitize 能力**, 不存在可委托的官方实现。这 113 行是项目针对"代理/密钥/Token 等敏感字段不得直接输出"(CLAUDE.md:620)的合理自研扩展, **不构成重复造轮子**。

**结论**: 从 P1 列表移除, 列为亮点(见 §5)。无需替换。

**影响行数**: 0 (保留)

---

### 3.3 🟠 AI / Search 模块过度切片

```
src/core/ai.ts              9 行 re-export
src/core/ai-cache.ts        162 行
src/core/ai-client.ts        96 行
src/core/ai-selector.ts      55 行
src/core/ai-summary.ts       99 行
src/core/ai-utils.ts        97 行
src/core/search.ts           8 行 re-export
src/core/search-format.ts    42 行
src/core/search-providers.ts 225 行
src/core/search-rotation.ts  84 行
src/core/search-service.ts   147 行
src/core/search-types.ts     41 行
```

12 个文件, 1065 行, 加 2 个 entry-point barrel (`ai.ts`、`search.ts`)。

> 勘误说明: 原报告称"7 个 entry-point barrel", 实际仅 **2 个**。

`notification-queue` 同病: `notification-queue-{retry,sender,store,types}.ts` 4 个 entry-point + 主文件 260 行。

CLAUDE.md 写"200-400 行典型, 800 max"——实际拆得过细, 每个 import 要跨多个文件, 可读性反而下降。

**修复方案**:

- 合并 `ai-{client,selector,summary,utils}.ts` → `ai.ts` (420 行, 合规)
- 合并 `search-{format,providers,service,types,rotation}.ts` → `search.ts` (450 行)
- `notification-queue-*.ts` 5 个 → `notification-queue.ts` + `notification-queue-store.ts` (DB 部分独立, 其它合回)

**影响行数**: -400

---

## 4. P2 - 可观察待办

### 4.1 🟢 `normalizeText` 3 份副本

- `src/core/item-processor-runtime.ts:91-95` (导出)
- `src/core/telegram-video-restore.ts:245-249` (私有副本)
- `src/core/notification-queue-sender.ts` (间接引用)

**修复**: 移到 `utils/common.ts` 一份, 所有模块 import。

**影响行数**: -15

---

### 4.2 ❌ ~~错误分类在 `error-handler.ts` 与 `notification-queue-retry.ts` 两份~~ — **条目作废**

**勘误结论 (2026-06-26 二次核查)**: 原报告称 queue 模块重写了 `getErrorType` 的 HTTP/Node 映射, **不成立**。

`notification-queue-retry.ts:44-67` 的 `isFatalQueueError` / `isQueueDowngradeError` 只检查 OneBot 适配器业务码 (`UnknownGroup` / `GROUP_NOT_FOUND` / `UserBlock` / `BANNED` / `PermissionDenied` / `1200`)。这些码**既不在 `HTTP_STATUS_CODE_MAP`, 也不在 `NODE_ERROR_CODE_MAP`** 中——`utils/error-handler.ts` 根本不覆盖适配器层 retcode。因此 queue 模块**没有**重写底层映射, 二者职责不同。

**结论**: 本条作废, 不构成重复造轮子。

- `utils/error-handler.ts:107-118` HTTP_STATUS_CODE_MAP (通用)
- `core/notification-queue-retry.ts:44-67` 独立 `isFatalQueueError` / `isQueueDowngradeError` (业务特化)

`utils/error-handler.ts` 已提供 `getErrorType(error)` 一站式分类。queue 模块应调用 `getErrorType(error)` 再做业务判断 (1200/fatal 等), 不应重写 HTTP/Node 错误码映射。

**修复**: `isFatalQueueError` 改为基于 `getErrorType(error)` 的特化判断, 共享底层映射。

---

### 4.3 🟢 `extractSessionInfo` 的 `as any` 透传

`session.event.guild as any` / `session.event as any` / `session.event.user as any` / `session.user as any` 在 `src/commands/utils.ts:39-42` 与 `src/commands/index.ts:454-456, 485-486` 共 **2 个文件**出现。

Koishi 4.x `Session` 上 `session.guildId` / `session.platform` / `session.userId` / `session.authority` 都是顶层属性, 直接读即可, `as any` 透传应消失。

**修复**: 简化为 5 行 helper, 不再 `as any`。

---

### 4.4 🟢 `parseTargets` 自实现与 `parseTarget` 重复

`commands/utils.ts:114-134` 实现了 `,;；` 切分, 与 `parseTarget` 紧邻。规模不大, 应合并到 `utils/common.ts` 作为单一 `parseTargets(target: string): string[]`。

---

### 4.5 🟢 `database.ts` 3 张表都用 `as any` 强转

`ctx.model.extend(('rssOwl' as any), ...)`——Koishi 4 的 `Model.extend` 支持泛型, 应 `extend<'rssOwl', RssRow>(...)`。

反映整体对 Koishi 类型系统不熟。

---

## 5. ✅ 亮点 - 项目做得对的地方

### 5.1 Koishi 原生能力正确使用

- `@koishijs/censor` (`ctx.censor` 注入)
- `assets` (`ctx.assets.upload`)
- `puppeteer` (`ctx.puppeteer.render/page`)
- `ffmpeg` (`ctx.ffmpeg.executable`)
- `server` (`ctx.server.get/post`)
- `clone` (`koishi.clone`)
- `Logger` (Logger.levels 同步, 5.3.3 commit 修复)

都按 Koishi 的可选服务注入约定做, `inject = { required: ["database"], optional: ["puppeteer", "censor", "assets", "server", "ffmpeg"] }` 写法正确。

### 5.2 tdl 子进程强杀是真功夫

`src/utils/tdl.ts:40-108` 的 `runWithForcedKill` 用 detached 模式 + 进程组 kill (POSIX 负 PID; Windows `taskkill /T /F`), 双平台兼容。

tdl 用 bolt 存储, SIGTERM 后有时不释放文件锁, 这个强杀逻辑是 Koishi 没有的领域能力, 不是重复造轮子。

### 5.3 Telegram 大视频占位恢复是真实痛点解决方案

`telegram-video-restore.ts` 249 行处理:
- 检测 "Video is too big" 占位
- 用 tdl 下载原始视频
- 超阈值用 ffmpeg 压缩
- 多视频 album 按位置配对注入

复杂业务逻辑, 封装合理。

### 5.4 Schema 校验在局部做对了

`notification-queue-retry.ts:25-31` 的 `clampInteger` 比直接 `?? fallback` 更安全:

```typescript
return Math.min(max, Math.max(min, Math.floor(value!)))
```

### 5.5 文档体系清晰

30 个 docs 文件, 每个改动记录 why (`2026-03-11-p0-rss-mainline-hardening.md` 等), 比纯代码评审信息密度高。

### 5.6 logger.ts 自研敏感信息脱敏 (从 P1 降级, 见 §3.2 勘误)

113 行 `SENSITIVE_PATTERNS` + `sanitizeLogMessage` + `sanitizeObject`, 兑现 CLAUDE.md:620 "敏感字段不得直接输出"。Koishi/reggol 无原生 sanitize, 属合理自研扩展。

---

## 6. 优先修复建议 (按 ROI 排序)

| 顺位 | 任务 | 影响行数 | 收益 |
|------|------|---------|------|
| 1 | 删除 `commands/utils.ts:withCommandErrorHandling` + 收编 `executeCommand` | -200 | 命令层少 200 行, 消除死代码 |
| 2 | `parseQuickUrl` 内嵌 `parseTemplateContent` 删掉 | -35 | 消重复 |
| 3 | `normalizeText` 合并到 utils | -15 | 消重复 |
| 4 | `fetcher.ts` 改用 `buildAxiosProxyConfig` | -30 | 收敛代理 (CLAUDE.md:346 已规范) |
| 5 | `RequestManager` 改用 `ctx.http` 简化 | -71 | 减限流器, 用 Koishi 原生 |
| 6 | 字段双写加 deprecation + 数据迁移 | +80/-50 | 消除配置层永久兼容债 |
| 7 | ai/search/notification-queue 重新合并 | -400 | 提可读性 |
| 8 | `extractSessionInfo` `as any` 替换为 Koishi Session 顶层字段 | -10 | 类型安全 |
| ~~9~~ | ~~logger.ts 自研脱敏 → Koishi reggol~~ | ~~0~~ | **勘误作废** (§3.2: reggol 无原生 sanitize) |

**净结果 (勘误后)**: src/ 由 9.6k 行降到 ~9.0k 行 (-约 660 行), 把"代理/错误处理/限流"3 类横切关注点收敛到单一来源 (原"4 类含脱敏", 脱敏项作废)。

---

## 7. 质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⭐⭐⭐⭐⭐ | RSS/HTML/AI/tdl 全栈覆盖 |
| Koishi 规范遵循 | ⭐⭐⭐⭐ | 多数模块正确, 仅限流一项重复造轮子 (脱敏属合理扩展) |
| 模块化设计 | ⭐⭐⭐ | 入口装配层做对了, 但中层过度切片 |
| 代码复用 (DRY) | ⭐⭐⭐ | 4 处 P0 重复造轮子, 但 §4.2 不成立 |
| 类型安全 | ⭐⭐⭐ | `as any` 透传过多, 模型未用泛型 |
| 测试覆盖 | ⭐⭐⭐ | 三大模块有覆盖, 关键分支漏测 |
| 文档 | ⭐⭐⭐⭐⭐ | 30 个 docs, 改动追踪清晰 |

**综合**: ⭐⭐⭐⭐ (3.5/5) — 有意识遵循 Koishi 规范, 中层(命令 + 部分 core)有"自造轮子 + 过度拆分"区段, 但比原报告 (3/5) 略好。

---

## 8. 后续行动

### 8.1 立即行动 (本迭代内)

- [x] 处理 §2.1 P0 命令层错误处理去重 (2026-06-26 完成:`commands/error-handler.ts` 并入 `utils/error-handler.ts`,删 `withCommandErrorHandling` 死代码)
- [x] 处理 §2.2 P0 `parseQuickUrl` 内嵌副本 (2026-06-26 完成:删除内嵌 `parseContent`,改调 `parseTemplateContent`)
- [x] 处理 §2.3 P0 字段拼写错误双写迁移（2026-07-02 完成：方案 A 单向收敛——schema 新增规范名 + 错误名 `.hidden().deprecated()`；`legacy-config.ts` 读取改为 typo 优先避免 schema 默认值 shadowing；`setNextUpdateTime` 只写规范名；老数据 `??` 兜底兼容，零用户风险）
- [x] 处理 §2.4 P0 `fetcher.ts` 代理实现收敛 (2026-06-26 完成:`mergeProxyAgent` 提升至 `proxy.ts`,`fetcher.ts` 改用 `buildAxiosProxyConfig`)

### 8.2 下个迭代

- [ ] §3.1 P1 `RequestManager` → `ctx.http`
- [ ] §3.3 P1 ai/search/notification-queue 重新合并
- [~~] §3.2 ~~logger.ts 脱敏~~ **勘误作废** (见 §9)

### 8.3 长期观察

- [ ] §4.x P2 系列观察待办

---

**审查完成时间**: 2026-06-26
**下次审查建议**: 处理完 P0 后再做一轮

---

## 9. 勘误记录 (2026-06-26 二次核查)

原报告经逐条代码核查后的订正:

| 位置 | 原报告 | 勘误后 | 处理 |
|------|--------|--------|------|
| 标题结论 | "6 处重复造轮子 + 4 处未复用" | "5 处 + 3 处" | 已订正 |
| §2.1 | "3 份实现" | 2 份实现 + 1 份死代码 (`executeCommand` 在 src/ 也未被业务调用) | 已订正 |
| §2.4 | "CLAUDE.md 第 56 行" | 第 **346** 行 (56 行是 `import axios`) | 已订正 |
| §3.2 | reggol 0.10+ 原生 sanitize | **reggol 无原生 sanitize**, 自研脱敏属合理扩展 | **降级, 从 P1 移除** |
| §3.3 | "7 个 entry-point barrel" | 实际 **2 个** (`ai.ts`、`search.ts`) | 已订正 |
| §4.2 | queue 重写 HTTP/Node 映射 | OneBot 业务码不在底层映射中, **不构成重复** | **条目作废** |
| §4.3 | "7 个文件" | 实际 **2 个文件** (`commands/utils.ts`、`commands/index.ts`) | 已订正 |
| §6/§7 | 净降 ~1k 行, 综合 3/5 | 净降 ~660 行, 综合 3.5/5 | 已订正 |

**文件行数统计复核**: `utils/error-handler.ts` (312)、`commands/error-handler.ts` (149)、`commands/utils.ts` (146) 经 `wc -l` 复核**与原报告一致**, 无误。

**核查方法**: `Grep` 全量引用追踪 + 逐文件 `Read` 交叉验证 + `package.json` 依赖版本核对。