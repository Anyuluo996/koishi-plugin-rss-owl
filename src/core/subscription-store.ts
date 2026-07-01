import { Context } from 'koishi'

import type { RssOwlRow } from '../types'

/**
 * 订阅数据访问仓储（Repository）。
 *
 * 设计目的：`rssOwl` 是订阅核心表，原本被命令层（subscription-create /
 * subscription-edit / subscription-management / web-monitor）的 15 处
 * 直接 `ctx.database.*('rssOwl', ...)` 调用散落访问，违反「命令层只复用
 * 核心函数」的分层约定。本类作为该表的唯一封装，命令层通过依赖注入拿到
 * 实例，不再直接触碰 `ctx.database`，与 `NotificationQueueStore` /
 * `MessageCacheManager` 的既有分层保持一致。
 *
 * 注意：feeder（`core/feeder.ts`）也在核心层直接读写 `rssOwl`，那是核心层
 * 对自身数据的合法访问，不强制走本仓储；强制收口会破坏 feeder 作为纯函数
 * 的可测试性（见 5.3.8 的 disposed 评估取舍）。
 */
export class SubscriptionStore {
  constructor(private ctx: Context) { }

  /**
   * 按群组查询订阅列表（命令层最常用的读取入口）。
   */
  async findByGuild(platform: string, guildId: string): Promise<RssOwlRow[]> {
    return this.ctx.database.get('rssOwl', { platform, guildId })
  }

  /**
   * 按 群组 + URL 查询（用于编辑推送目标时判断目标群是否已有同源订阅）。
   */
  async findByGuildAndUrl(platform: string, guildId: string, url: string): Promise<RssOwlRow[]> {
    return this.ctx.database.get('rssOwl', { platform, guildId, url })
  }

  /**
   * 创建一条订阅，返回含生成主键的完整行。
   */
  async create(data: Partial<RssOwlRow>): Promise<RssOwlRow> {
    return this.ctx.database.create('rssOwl', data)
  }

  /**
   * 按主键更新任意字段。
   */
  async update(id: number, patch: Partial<RssOwlRow>): Promise<void> {
    await this.ctx.database.set('rssOwl', id, patch)
  }

  /**
   * 按主键删除单条订阅。
   */
  async remove(id: number): Promise<void> {
    await this.ctx.database.remove('rssOwl', { id })
  }

  /**
   * 删除某个群组的全部订阅（rsso.remove --all）。
   */
  async removeAllByGuild(platform: string, guildId: string): Promise<void> {
    await this.ctx.database.remove('rssOwl', { platform, guildId })
  }
}
