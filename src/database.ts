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
}
