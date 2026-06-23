/**
 * subscription-create / utils 纯函数单元测试
 *
 * 回归覆盖（对应审查「parseTargets 等纯函数零单元测试」+ #12 quickList 序号稳定性）：
 *  - parseTarget：合法/非法目标、中文冒号兼容
 *  - parseTargets：多目标分隔（中英文分号/逗号）、无效目标短路返回 invalidTarget
 *  - resolveQuickItem：prefix 稳定匹配（数组重排不漂移）、数字序号回退、非法输入
 */

import { describe, it, expect } from '@jest/globals'
import { parseTarget, parseTargets } from '../../src/commands/utils'
import { resolveQuickItem, type QuickListItem } from '../../src/commands/subscription-create'

describe('parseTarget — 单目标解析', () => {
  it('合法 platform:guildId', () => {
    expect(parseTarget('onebot:123456')).toEqual({ platform: 'onebot', guildId: '123456' })
  })

  it('兼容中文冒号', () => {
    expect(parseTarget('onebot：123456')).toEqual({ platform: 'onebot', guildId: '123456' })
  })

  it('缺少分隔符返回 null', () => {
    expect(parseTarget('onebot123')).toBeNull()
  })

  it('多段（>2）返回 null', () => {
    expect(parseTarget('a:b:c')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(parseTarget('')).toBeNull()
  })
})

describe('parseTargets — 多目标解析', () => {
  it('未提供输入返回空 targets', () => {
    expect(parseTargets(undefined)).toEqual({ targets: [] })
    expect(parseTargets('')).toEqual({ targets: [] })
  })

  it('英文逗号分隔多个合法目标', () => {
    const r = parseTargets('onebot:1,onebot:2')
    expect(r).toEqual({ targets: ['onebot:1', 'onebot:2'] })
  })

  it('中文逗号/分号/英文分号均可分隔', () => {
    expect(parseTargets('a:1，b:2；c:3;d:4').targets).toEqual(['a:1', 'b:2', 'c:3', 'd:4'])
  })

  it('去除前后空白与空段', () => {
    expect(parseTargets(' a:1 , , b:2 ').targets).toEqual(['a:1', 'b:2'])
  })

  it('遇到任一无效目标即短路返回 invalidTarget（不部分返回）', () => {
    const r = parseTargets('onebot:1,非法目标,onebot:2')
    expect(r.targets).toEqual([])
    expect(r.invalidTarget).toBe('非法目标')
  })

  it('单个无效目标返回 invalidTarget', () => {
    const r = parseTargets('noSeparator')
    expect(r.invalidTarget).toBe('noSeparator')
    expect(r.targets).toEqual([])
  })
})

describe('resolveQuickItem — quickList 序号稳定性（#12）', () => {
  // 模拟一个会被重排的列表
  const quickList: QuickListItem[] = [
    { prefix: 'rss', name: 'rsshub通用', detail: 'd', example: 'rss:qqorw', replace: '{{rsshub}}/{{route}}' },
    { prefix: 'tg', name: '电报频道', detail: 'd', example: 'tg:woshadiao', replace: '{{rsshub}}/telegram/channel/{{route}}' },
    { prefix: 'gh', name: 'github', detail: 'd', example: 'gh:issue/x/y/open', replace: '{{rsshub}}/github/{{route}}' },
  ]

  it('prefix 精确匹配返回对应项（不受顺序影响）', () => {
    const r = resolveQuickItem('tg', quickList)
    expect(r?.item.prefix).toBe('tg')
    expect(r?.matchedBy).toBe('prefix')
  })

  it('prefix 稳定：数组重排后仍指向同一项', () => {
    // 重排：gh 移到第 1 位，tg 移到第 3 位
    const reordered = [quickList[2], quickList[0], quickList[1]]
    // 用 prefix 'tg' 解析，无论顺序如何都得到 tg
    expect(resolveQuickItem('tg', reordered)?.item.prefix).toBe('tg')
    // 而用旧序号 '2' 解析会指向不同项（这正是序号不稳定、prefix 稳定的证明）
    const byIndex2 = resolveQuickItem('2', reordered)
    expect(byIndex2?.item.prefix).toBe('rss') // 重排后序号2指向rss，而非tg
  })

  it('数字序号回退（兼容历史用法）', () => {
    expect(resolveQuickItem('1', quickList)?.item.prefix).toBe('rss')
    expect(resolveQuickItem('3', quickList)?.item.prefix).toBe('gh')
  })

  it('越界序号返回 null', () => {
    expect(resolveQuickItem('0', quickList)).toBeNull()
    expect(resolveQuickItem('4', quickList)).toBeNull()
  })

  it('不存在的 prefix 且非数字返回 null', () => {
    expect(resolveQuickItem('unknown', quickList)).toBeNull()
    expect(resolveQuickItem('xyz', quickList)).toBeNull()
  })

  it('空输入返回 null', () => {
    expect(resolveQuickItem('', quickList)).toBeNull()
    expect(resolveQuickItem(undefined as any, quickList)).toBeNull()
  })

  it('index 匹配时标记 matchedBy=index（供 UI 提示改用 prefix）', () => {
    expect(resolveQuickItem('1', quickList)?.matchedBy).toBe('index')
  })
})
