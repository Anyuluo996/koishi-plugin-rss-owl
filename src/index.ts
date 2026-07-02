import { Context } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { } from '@koishijs/censor'

// Export types and config
export { Config } from './config'
export * from './types'
export { templateList } from './config'

import type { Config } from './types'

export const name = '@anyul/koishi-plugin-rss'

import { createHttpFunction, RequestManager } from './utils/fetcher'
import { delCache } from './utils/media'
import { resolveTdlBinary } from './utils/tdl'
import { debug as debugLog, applyDebugLevel } from './utils/logger'
import {
  createCommandRuntimeDeps,
  registerManagementCommands,
  registerSubscriptionCreateCommand,
  registerSubscriptionEditCommand,
  registerSubscriptionManagementCommands,
  registerWebMonitorCommands,
} from './commands'

// Import core modules
import { RssItemProcessor } from './core/item-processor'
import { startFeeder, stopFeeder } from './core/feeder'
import { SubscriptionStore } from './core/subscription-store'
import { initMessageCache, disposeMessageCache } from './utils/message-cache'
import { registerMessageCacheService } from './services/message-cache-service'
import { NotificationQueueManager } from './core/notification-queue'

// Import database and constants
import { setupDatabase } from './database'
import { usage, quickList } from './constants'

// Koishi 4.11+ / cordis 3.x：服务声明用 inject 对象形式。
// - required：缺失则插件不加载（database 必需）。
// - optional：缺失仍加载，且抑制「property X is not registered」警告。
//   关键：cordis 的 Context 是 Proxy，读取未声明的服务属性（哪怕仅判空
//   `if (!ctx.server)` 或可选链 `ctx.server?.x()`）都会触发警告；只有声明进
//   inject/using，Proxy 才会经 internal/inject 事件短路 checkInject。
//   详见 @cordisjs/core index.cjs:271,284,866。
export const inject = {
  required: ['database'],
  optional: ['assets', 'ffmpeg', 'puppeteer', 'server'],
}

export function apply(ctx: Context, config: Config) {
  // Setup database
  setupDatabase(ctx)

  // 把 config.debug 同步到 Koishi 原生日志分级（Logger.levels['rss-owl']），
  // 让 WebUI 的 logger 插件 / 全局 levels 都能控制本插件日志可见性。
  applyDebugLevel(config)

  // 启用时探测 tdl 外部二进制可用性，并报告 Koishi ffmpeg 服务注入状态，便于用户排查
  // 探测异步进行、失败仅打日志，不阻塞插件加载
  // 注意：tdl 的版本命令是 `version` 子命令，不是 `-v` flag
  if (config.tdl?.enabled) {
    resolveTdlBinary(config).then((tdlBin) => {
      const hasTdl = !!tdlBin
      const tdlLoc = tdlBin ? ` (${tdlBin === 'tdl' ? 'PATH' : tdlBin})` : ''
      const ffmpegStatus = ctx.ffmpeg?.executable
        ? `✓ (${ctx.ffmpeg.executable})`
        : '✗（请安装 koishi-plugin-ffmpeg 插件）'
      debugLog(config, `Telegram 大视频工具探测：tdl=${hasTdl ? '✓' + tdlLoc : '✗（请安装 iyear/tdl 并 tdl login）'}，ffmpeg=${ffmpegStatus}`, 'tdl', 'info')
    }).catch(() => { /* 探测失败忽略 */ })
  }

  // Initialize request manager and HTTP function
  const requestManager = new RequestManager(3, 2, 10)
  const $http = createHttpFunction(ctx, config, requestManager)

  // Initialize RSS item processor
  const processor = new RssItemProcessor(ctx, config, $http)
  const commandRuntime = createCommandRuntimeDeps(ctx, config, $http, processor)

  // Initialize notification queue manager
  const queueManager = new NotificationQueueManager(ctx, config)

  // Initialize subscription repository (rssOwl 表的唯一封装)
  const subscriptionStore = new SubscriptionStore(ctx)

  // Initialize message cache
  if (config.cache?.enabled) {
    initMessageCache(ctx, config, config.cache.maxSize || 100)
    // Register HTTP API service
    registerMessageCacheService(ctx)
  }

  // Lifecycle management
  ctx.on('ready', async () => {
    startFeeder(ctx, config, $http, processor, queueManager)
  })

  ctx.on('dispose', async () => {
    stopFeeder(config)
    // 销毁消息缓存单例：避免热重载后复用持有旧 ctx 的实例（P1-2）
    if (config.cache?.enabled) {
      disposeMessageCache()
    }
    if (config.basic?.imageMode === 'File') {
      await delCache(config)
    }
  })

  // ============================================
  // 子命令：订阅管理
  // ============================================

  registerSubscriptionManagementCommands({
    ctx,
    config,
    store: subscriptionStore,
    parsePubDate: commandRuntime.parsePubDate,
    parseQuickUrl: commandRuntime.parseQuickUrl,
    getRssData: commandRuntime.getRssData,
    parseRssItem: commandRuntime.parseRssItem,
    mixinArg: commandRuntime.mixinArg,
  })

  registerSubscriptionCreateCommand({
    ctx,
    config,
    store: subscriptionStore,
    usage,
    quickList,
    parseQuickUrl: commandRuntime.parseQuickUrl,
    parsePubDate: commandRuntime.parsePubDate,
    getRssData: commandRuntime.getRssData,
    parseRssItem: commandRuntime.parseRssItem,
    formatArg: commandRuntime.formatArg,
    mixinArg: commandRuntime.mixinArg,
    debug: commandRuntime.debug,
  })

  registerWebMonitorCommands({
    ctx,
    config,
    store: subscriptionStore,
    debug: commandRuntime.debug,
    mixinArg: commandRuntime.mixinArg,
    getRssData: commandRuntime.getRssData,
    parseRssItem: commandRuntime.parseRssItem,
    generateSelectorByAI: commandRuntime.generateSelectorByAI,
    fetchUrl: commandRuntime.fetchUrl,
  })

  registerSubscriptionEditCommand({
    ctx,
    config,
    store: subscriptionStore,
  })

  registerManagementCommands({
    ctx,
    config,
    queueManager,
  })
}
