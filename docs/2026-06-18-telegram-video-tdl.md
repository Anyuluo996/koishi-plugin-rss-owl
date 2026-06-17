# Telegram 大视频 tdl 兜底下载

## 1. 开发概述

RSSHub 对 Telegram 频道中体积超过阈值的视频，会返回占位文本而非真实视频链接：

```html
<blockquote><b>Video is too big</b><br><img src="...poster..."></blockquote>
```

此前插件的 `processVideos()` 仅遍历 `<video>` 标签，遇到这种占位条目会**静默跳过**——既拿不到视频链接，也不报错，用户只看到一张封面图。

本次增强引入外部工具 [iyear/tdl](https://github.com/iyear/tdl) 作为兜底：检测到占位时，用 tdl 直接从 Telegram 拉取原始视频，超阈值则用 ffmpeg 压缩，最终复用既有 `videoMode` 链路发送。

## 2. 实现细节

### 2.1 关键决策：tdl / ffmpeg 是外部二进制，非 npm 包

调研确认：
- `tdl` 是 Go 编写的独立 CLI（iyear/tdl），**不在 npm registry**。
- `ffmpeg` 同为系统二进制。

因此**package.json 不新增任何依赖**，改为运行时探测 PATH：
- 二进制存在 → 正常调用
- 二进制缺失 → 跳过、打日志、**绝不阻塞主流程**
- 用户需自行安装并在宿主机执行 `tdl login`

### 2.2 新增模块

- **`src/utils/tdl.ts`**：纯函数模块
  - `detectBinary(name, testArgs)`：探测 PATH，进程内缓存结果
  - `parseTelegramLink(link)`：解析 `t.me/<channel>/<msgId>`（公开/私有频道、协议可选）
  - `detectVideoTooBig(html)`：识别 `<blockquote>Video is too big</blockquote>` 占位（含全文兜底）
  - `extractTooBigPoster(html)`：提取占位 blockquote 内的海报图
  - `downloadWithTdl(opts)`：`tdl dl -u <link> -d <tmpDir> -f`，用 `execFile`（非 shell）防注入；任何失败返回 null
  - 代理透传：订阅级代理启用时，通过 `HTTPS_PROXY` 环境变量传给 tdl 子进程

- **`src/utils/video-compress.ts`**：ffmpeg 压缩
  - `shouldCompress(filePath, config)`：体积 > 阈值才触发（默认 30MB，回退 `basic.maxVideoSize`）
  - `compressVideoIfNeeded(input, config)`：调用 `ffmpeg -c:v libx264 -crf 30 -preset veryfast -c:a aac -b:a 96k -movflags +faststart`
  - **ffmpeg 缺失 → 整条视频跳过**（按用户决策，返回 null）
  - 压缩失败 → 同样返回 null，上游按"无视频"处理

- **`src/core/telegram-video-restore.ts`**：编排层 `restoreTelegramVideos(html, item, arg, config)`
  1. 检测占位 → 解析 link → tdl 下载 → 按需压缩
  2. 产物**移动到插件缓存目录**（`getCacheDir`），由 feeder 定时器统一清理，避免异步发送队列消费前被删
  3. 把占位 blockquote 改写为 `<video src="file:///缓存路径" poster="...">`
  4. 任何环节失败静默返回 false，等价于现状

### 2.3 既有模块改动

- **`src/utils/media.ts` — `getVideoUrl`**：新增 `data:` / `file:` 本地协议分支
  - `data:` → 直接 base64 解码（tdl 流程未走此路，但保留兼容）
  - `file:` → `fileURLToPath` 后 `readFileSync`，跳过 `$http` 与代理
  - 远程 URL 维持原 `$http` 路径不变
  - 统一在获取字节后做 `maxVideoSize` 体积检查
  - 复用既有 `videoMode`（base64/File/assets）分支，**行为一致**

- **`src/core/item-processor.ts`**：在 `cheerio.load(item.description)` 后、模板处理前，调用 `restoreTelegramVideos` 改写 DOM。try/catch 包裹，异常仅日志不抛出

- **`src/types.ts`**：新增 `TdlConfig` 接口（enabled / timeout / compressThreshold / crf / proxyByEnv），加入 `Config.tdl`

- **`src/config.ts`**：新增 `tdl` Schema 块，含中文安装说明，默认关闭

- **`src/index.ts`**：`tdl.enabled` 时启动异步探测 tdl/ffmpeg 可用性，打 info 日志，不阻塞加载

## 3. 修改文件列表

新增：
- `src/utils/tdl.ts`
- `src/utils/video-compress.ts`
- `src/core/telegram-video-restore.ts`
- `tests/unit/tdl.test.ts`
- `tests/unit/video-compress.test.ts`

修改：
- `src/types.ts`（新增 TdlConfig）
- `src/config.ts`（新增 tdl Schema）
- `src/utils/media.ts`（getVideoUrl 支持 data:/file:）
- `src/core/item-processor.ts`（注入 restoreTelegramVideos）
- `src/index.ts`（启动探测日志）

## 4. 测试情况

1. `npx tsc -p tsconfig.json --noEmit`：`EXIT:0`
2. `npx jest tests/unit/tdl.test.ts tests/unit/video-compress.test.ts`：`23/23` 通过
   - parseTelegramLink：公开/私有频道、协议可选、非法 ID、空输入
   - detectVideoTooBig：标准占位、大小写、全文兜底、正常 video
   - extractTooBigPoster：有/无 img
   - detectBinary：缓存命中、不存在命令
   - shouldCompress：阈值边界、默认回退、文件不存在
3. `npx jest tests/unit/`：`403/404` 通过（唯一失败为 `observability.test.ts` 的 `getMemoryUsage` GC 时序 flaky，与本次改动无关，单独运行通过）

## 5. 遇到的问题和解决方案

### 问题 1：file:// URL 与异步发送队列的生命周期冲突

最初设计是 tdl 下载到临时目录、注入 `file://` URL，由 `parseRssItem` 调用后清理临时目录。但 `parseRssItem` 返回后消息进入 `NotificationQueue` 异步广播，此时若已清理文件就会发送失败。

**解决方案：** `restoreTelegramVideos` 把最终产物**移动到插件持久缓存目录**（`getCacheDir`，与 File 模式共用），由 feeder 定时器的 `delCache` 周期统一回收，彻底避免竞态。

### 问题 2：getVideoUrl 走 $http 不支持 file:///

原 `getVideoUrl` 无条件调用 `$http(src)`（axios），既不支持 `file://` 协议，也会被安全校验拦截。

**解决方案：** 在 `getVideoUrl` 内增加协议分支：`data:` 直接解码、`file:` 直接读盘，跳过 `$http` 与代理；远程 URL 行为不变。这样既复用全部 `videoMode` 分支（base64/File/assets），又保持向后兼容。

### 问题 3：tdl 的 CLI 用法与登录态

tdl 需要预先登录（`tdl login`，二维码或手机号），bot 环境交互受限。

**解决方案：** 插件不处理登录，由用户在宿主机外部完成。配置项 description 明确写出安装与登录步骤。

## 6. 后续优化建议

- 当前 `tdl dl` 每次创建临时目录，可考虑复用单一工作目录减少 IO
- 可选：把 tdl 下载产物按消息 ID 做短期去重缓存，避免重复订阅触发重复下载
- ffmpeg CRF/preset 可考虑按源分辨率自适应
