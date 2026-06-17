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
import { initErrorTracker } from './utils/error-tracker'
import { resolveTdlBinary } from './utils/tdl'
import { debug as debugLog } from './utils/logger'
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
import { initMessageCache } from './utils/message-cache'
import { registerMessageCacheService } from './services/message-cache-service'
import { NotificationQueueManager } from './core/notification-queue'

// Import database and constants
import { setupDatabase } from './database'
import { usage, quickList } from './constants'

export const inject = { required: ["database"], optional: ["puppeteer", "censor", "assets", "server", "ffmpeg"] }

export function apply(ctx: Context, config: Config) {
  // Setup database
  setupDatabase(ctx)

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

  if (config.errorTracking?.enabled) {
    initErrorTracker({
      enabled: config.errorTracking.enabled ?? false,
      dsn: config.errorTracking.dsn || '',
      environment: config.errorTracking.environment,
      release: config.errorTracking.release,
      tracesSampleRate: config.errorTracking.tracesSampleRate,
      profilesSampleRate: config.errorTracking.profilesSampleRate,
    })
  }

  // Initialize request manager and HTTP function
  const requestManager = new RequestManager(3, 2, 10)
  const $http = createHttpFunction(ctx, config, requestManager)

  // Initialize RSS item processor
  const processor = new RssItemProcessor(ctx, config, $http)
  const commandRuntime = createCommandRuntimeDeps(ctx, config, $http, processor)

  // Initialize notification queue manager
  const queueManager = new NotificationQueueManager(ctx, config)

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
    if (config.basic.imageMode === 'File') {
      delCache(config)
    }
  })

  // ============================================
  // 子命令：订阅管理
  // ============================================

  registerSubscriptionManagementCommands({
    ctx,
    config,
    parsePubDate: commandRuntime.parsePubDate,
    parseQuickUrl: commandRuntime.parseQuickUrl,
    getRssData: commandRuntime.getRssData,
    parseRssItem: commandRuntime.parseRssItem,
    mixinArg: commandRuntime.mixinArg,
  })

  registerSubscriptionCreateCommand({
    ctx,
    config,
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
  })

  registerManagementCommands({
    ctx,
    config,
    queueManager,
  })
}
