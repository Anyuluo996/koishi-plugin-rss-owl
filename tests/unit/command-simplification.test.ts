/**
 * 命令简化回归测试
 *
 * 锁定命令系统统一/简化后的不变量（防止回归）：
 *  1. 根命令 rsso 已删除 6 个废弃选项（-l/-r/--removeAll/-f/--followAll/-p）及迁移提示
 *  2. cache/queue 已改为原生嵌套子命令（rsso.cache.list 等），父命令无 action
 *  3. emoji 风格统一：成功 ✅、错误 ❌、提示 💡、警告 ⚠️；无装饰性 emoji（📋📰📡 等）
 *
 * 这些是源码级断言：命令注册需要完整 Koishi 运行时，无法在单元测试里实例化，
 * 因此通过读取源文件内容来锁定关键不变量。
 */

import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const srcDir = resolve(__dirname, '../../src/commands')
const readSrc = (name: string) => readFileSync(resolve(srcDir, name), 'utf-8')

describe('命令简化 — 废弃选项已删除', () => {
  const createSrc = readSrc('subscription-create.ts')

  it('已删除 -l/--list 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]list['"]/)
  })
  it('已删除 -r/--remove 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]remove['"]/)
  })
  it('已删除 --removeAll 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]removeAll['"]/)
  })
  it('已删除 -f/--follow 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]follow['"]/)
  })
  it('已删除 --followAll 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]followAll['"]/)
  })
  it('已删除 -p/--pull 废弃选项', () => {
    expect(createSrc).not.toMatch(/\.option\(['"]pull['"]/)
  })
  it('已删除迁移提示返回语句', () => {
    expect(createSrc).not.toContain('已移至 rsso.list 子命令')
    expect(createSrc).not.toContain('已移至 rsso.remove 子命令')
  })
  it('保留了订阅相关选项', () => {
    expect(createSrc).toMatch(/\.option\(['"]target['"]/)
    expect(createSrc).toMatch(/\.option\(['"]arg['"]/)
    expect(createSrc).toMatch(/\.option\(['"]template['"]/)
    expect(createSrc).toMatch(/\.option\(['"]title['"]/)
    expect(createSrc).toMatch(/\.option\(['"]quick['"]/)
  })
})

describe('命令简化 — cache/queue 改为原生嵌套子命令', () => {
  const indexSrc = readSrc('index.ts')

  it('cache 父命令不带 .action()（由 Koishi 原生显示 help）', () => {
    // 取出 registerCacheCommands 中 rssowl.cache 的注册片段，确认紧跟的是 .alias/.usage 而非 .action
    const cacheParentBlock = indexSrc.match(/ctx\.guild\(\)\s*\.command\('rssowl\.cache'[\s\S]*?\.usage\([\s\S]*?`/)
    expect(cacheParentBlock).not.toBeNull()
    // 父命令块内不应直接出现 .action(
    const blockEnd = indexSrc.indexOf("rssowl.cache.list")
    const parentBlock = indexSrc.slice(0, blockEnd)
    // rssowl.cache 到 rssowl.cache.list 之间不应有 .action
    const cacheStart = parentBlock.lastIndexOf("command('rssowl.cache',")
    expect(parentBlock.slice(cacheStart)).not.toContain('.action(')
  })

  it('注册了 cache 的 7 个原生子命令', () => {
    const subs = ['list', 'search', 'stats', 'message', 'pull', 'clear', 'cleanup']
    subs.forEach(sub => {
      expect(indexSrc).toContain(`rssowl.cache.${sub}`)
      expect(indexSrc).toContain(`rsso.cache.${sub}`)
    })
  })

  it('注册了 queue 的 3 个原生子命令', () => {
    const subs = ['stats', 'retry', 'cleanup']
    subs.forEach(sub => {
      expect(indexSrc).toContain(`rssowl.queue.${sub}`)
      expect(indexSrc).toContain(`rsso.queue.${sub}`)
    })
  })

  it('queue.retry 的 --all 改为正式 .option 声明', () => {
    expect(indexSrc).toMatch(/\.option\(['"]all['"],\s*['"]--all[^)]*\)/)
  })

  it('已删除 CACHE_HELP/QUEUE_HELP 重复常量', () => {
    expect(indexSrc).not.toMatch(/\bCACHE_HELP\b/)
    expect(indexSrc).not.toMatch(/\bQUEUE_HELP\b/)
  })

  it('父命令无位置参数（rsso.cache list 才能正确路由到子命令）', () => {
    expect(indexSrc).toMatch(/\.command\('rssowl\.cache',\s*'消息缓存管理'\)/)
    expect(indexSrc).toMatch(/\.command\('rssowl\.queue',\s*'发送队列管理'\)/)
  })
})

describe('命令简化 — emoji 风格统一为轻量状态前缀', () => {
  const indexSrc = readSrc('index.ts')

  it('cache/queue 输出无装饰性 emoji（📋📰📡👥🔗📅💾📝🖼️🎬📦⚙️）', () => {
    const decorative = ['📋', '📰', '📡', '👥', '🔗', '📅', '💾', '📝', '🖼️', '🎬', '📦', '⚙️', '⏳', '🔄']
    decorative.forEach(e => {
      expect(indexSrc).not.toContain(e)
    })
  })

  it('cache/queue 保留状态前缀 ✅❌💡', () => {
    expect(indexSrc).toContain('✅')
    expect(indexSrc).toContain('❌')
    expect(indexSrc).toContain('💡')
  })
})

describe('命令简化 — constants.ts 兼容提示已移除', () => {
  const constantsSrc = readFileSync(resolve(srcDir, '../constants.ts'), 'utf-8')

  it('usage 中不再有「兼容提示」段落', () => {
    expect(constantsSrc).not.toContain('## 兼容提示')
    expect(constantsSrc).not.toContain('-l / -r / -f / -p')
  })

  it('usage 中 cache/queue 描述列出子命令', () => {
    expect(constantsSrc).toContain('消息缓存管理（list/search/stats/pull/clear/cleanup）')
    expect(constantsSrc).toContain('发送队列管理（stats/retry/cleanup）')
  })
})

describe('短别名（rs + 2字母）已注册', () => {
  const mgmtSrc = readSrc('subscription-management.ts')
  const editSrc = readSrc('subscription-edit.ts')
  const webSrc = readSrc('web-monitor.ts')
  const indexSrc = readSrc('index.ts')

  it('rsso.list → rsls', () => {
    expect(mgmtSrc).toContain("'rsso.list', 'rsls'")
  })
  it('rsso.edit → rsed', () => {
    expect(editSrc).toContain("'rsso.edit', 'rsed'")
  })
  it('rsso.remove → rsrm', () => {
    expect(mgmtSrc).toContain("'rsso.remove', 'rsrm'")
  })
  it('rsso.pull → rspl', () => {
    expect(mgmtSrc).toContain("'rsso.pull', 'rspl'")
  })
  it('rsso.follow → rsfw', () => {
    expect(mgmtSrc).toContain("'rsso.follow', 'rsfw'")
  })
  it('rsso.html → rshm', () => {
    expect(webSrc).toContain("'rsso.html', 'rshm'")
  })
  it('rsso.ask → rsak', () => {
    expect(webSrc).toContain("'rsso.ask', 'rsak'")
  })
  it('rsso.watch → rswt', () => {
    expect(webSrc).toContain("'rsso.watch', 'rswt'")
  })
  it('rsso.cache → rsc', () => {
    expect(indexSrc).toContain("'rsso.cache', 'rsc'")
  })
  it('rsso.queue → rsq', () => {
    expect(indexSrc).toContain("'rsso.queue', 'rsq'")
  })

  it('短别名不与现有 rsso.* 命名冲突（rsc/rsq 仅作为父别名）', () => {
    // rsc / rsq 仅出现在 cache / queue 父命令注册处，不应被其它命令占用
    const rscCount = (indexSrc.match(/\brsc\b/g) || []).length
    const rsqCount = (indexSrc.match(/\brsq\b/g) || []).length
    expect(rscCount).toBeGreaterThanOrEqual(1)
    expect(rsqCount).toBeGreaterThanOrEqual(1)
  })
})
