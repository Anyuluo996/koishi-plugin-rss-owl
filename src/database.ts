import { Context } from 'koishi'

export function setupDatabase(ctx: Context) {
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
  })
}
