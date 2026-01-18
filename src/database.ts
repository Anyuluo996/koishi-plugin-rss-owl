import { Context } from 'koishi'

export function setupDatabase(ctx: Context) {
  ctx.model.extend(('rssOwl' as any), {
    id: "integer",
    url: "text",
    platform: "string",
    guildId: "string",
    author: "string",
    rssId: "string", // 修复：改为string类型，存储订阅标题
    arg: "json",
    lastContent: "json",
    title: "string",
    followers: "list",
    lastPubDate: "timestamp",
  }, {
    autoInc: true
  })

  // 消息缓存表
  ctx.model.extend(('rss_message_cache' as any), {
    id: "integer",
    rssId: "string",
    guildId: "string",
    platform: "string",
    title: "string",
    content: "text",
    link: "string",
    pubDate: "timestamp",
    imageUrl: "string",
    videoUrl: "string",
    finalMessage: "text", // 最终发送的消息
    createdAt: "timestamp",
  }, {
    autoInc: true
  })

  // 消息发送队列表 - 用于可靠的消息推送
  ctx.model.extend(('rss_notification_queue' as any), {
    id: "integer",
    subscribeId: "string",      // 关联的订阅ID（rssOwl表的id）
    rssId: "string",            // 订阅源标识（用于显示）
    uid: "string",              // 消息唯一标识 (guid 或 link)
    guildId: "string",          // 目标群组
    platform: "string",         // 目标平台
    content: "json",            // 序列化后的消息内容
    status: "string",           // 状态: PENDING | RETRY | FAILED | SUCCESS
    retryCount: "integer",      // 当前重试次数 (默认0)
    nextRetryTime: "timestamp", // 下次重试时间
    createdAt: "timestamp",     // 创建时间
    updatedAt: "timestamp",     // 最后更新时间
    failReason: "text",         // 失败原因
  }, {
    autoInc: true
  })
}
