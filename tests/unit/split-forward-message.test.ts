/**
 * splitForwardMessage 纯函数单元测试
 */

import { describe, expect, it } from '@jest/globals'

import { splitForwardMessage } from '../../src/core/notification-queue-sender'

describe('splitForwardMessage - 合并转发分批拆分', () => {
  describe('不应拆分的场景', () => {
    it('非 forward 消息原样返回单元素数组', () => {
      const message = '<p>普通文本消息</p>'
      expect(splitForwardMessage(message, 4)).toEqual([message])
    })

    it('forward 子节点数 ≤ batchSize 时不拆分', () => {
      const message = '<message forward><author id="bot-1"/><message>子1</message><message>子2</message></message>'
      expect(splitForwardMessage(message, 4)).toEqual([message])
    })

    it('batchSize 未配置时不拆分', () => {
      const message = buildForward(11)
      expect(splitForwardMessage(message, undefined)).toEqual([message])
    })

    it('batchSize ≤ 0 时不拆分', () => {
      const message = buildForward(11)
      expect(splitForwardMessage(message, 0)).toEqual([message])
      expect(splitForwardMessage(message, -1)).toEqual([message])
    })
  })

  describe('应拆分的场景', () => {
    it('11 个子节点 batchSize=4 → 拆成 3 批 (4+4+3)', () => {
      const message = buildForward(11, 'bot-1')
      const batches = splitForwardMessage(message, 4)

      expect(batches).toHaveLength(3)

      // 每批都是独立的合法 forward
      for (const batch of batches) {
        expect(batch).toMatch(/^<message forward>/)
        expect(batch).toMatch(/<\/message>$/)
        // 每批都带 author
        expect(batch).toContain('<author id="bot-1"/>')
      }

      // 子节点总数守恒：11 个无丢失
      const totalChildren = batches.reduce(
        (sum, batch) => sum + (batch.match(/<message>子\d+<\/message>/g)?.length || 0),
        0,
      )
      expect(totalChildren).toBe(11)

      // 批次大小：4 + 4 + 3
      expect(batches[0].match(/<message>子\d+<\/message>/g)).toHaveLength(4)
      expect(batches[1].match(/<message>子\d+<\/message>/g)).toHaveLength(4)
      expect(batches[2].match(/<message>子\d+<\/message>/g)).toHaveLength(3)
    })

    it('9 个子节点 batchSize=4 → 拆成 3 批 (4+4+1)', () => {
      const message = buildForward(9)
      const batches = splitForwardMessage(message, 4)
      expect(batches).toHaveLength(3)
    })

    it('子节点数正好等于 batchSize → 不拆分', () => {
      const message = buildForward(4)
      expect(splitForwardMessage(message, 4)).toEqual([message])
    })

    it('子节点数正好是 batchSize 整数倍 → 整批无余', () => {
      const message = buildForward(8)
      const batches = splitForwardMessage(message, 4)
      expect(batches).toHaveLength(2)
    })

    it('无 author 的 forward 也能正常拆分', () => {
      const message = `<message forward>${buildChildNodes(9)}</message>`
      const batches = splitForwardMessage(message, 4)

      expect(batches).toHaveLength(3)
      for (const batch of batches) {
        expect(batch).not.toContain('<author')
        expect(batch).toMatch(/^<message forward>/)
      }
    })

    it('含子节点属性（如 userId）的 <message> 不被误吞', () => {
      const message = `<message forward><author id="bot-1"/><message userId="u1" nickname="A">内容A</message><message userId="u2" nickname="B">内容B</message></message>`
      // 2 个子节点 ≤ batchSize 4，不拆分
      expect(splitForwardMessage(message, 4)).toEqual([message])
    })
  })

  describe('followers 外部 at 提及', () => {
    it('forward 外部的 <message>at提及</message> 附加到最后一批', () => {
      const inner = buildChildNodes(6)
      const mention = '<message><at id="123"/></message>'
      const message = `<message forward><author id="bot-1"/>${inner}</message>${mention}`

      const batches = splitForwardMessage(message, 4)

      expect(batches).toHaveLength(2)
      // 第一批不含 at 提及
      expect(batches[0]).not.toContain('<at id="123"/>')
      // 最后一批尾部带 at 提及
      expect(batches[1]).toContain('<at id="123"/>')
      expect(batches[1]).toMatch(/<\/message><message><at id="123"\/><\/message>$/)
    })
  })
})

/** 构造含 n 个子 <message> 的完整 forward 字符串 */
function buildForward(n: number, authorId?: string): string {
  const author = authorId ? `<author id="${authorId}"/>` : ''
  return `<message forward>${author}${buildChildNodes(n)}</message>`
}

/** 构造 n 个子 <message>子i</message> */
function buildChildNodes(n: number): string {
  return Array.from({ length: n }, (_, i) => `<message>子${i + 1}</message>`).join('')
}
