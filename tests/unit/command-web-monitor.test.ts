/**
 * web-monitor 命令纯函数单元测试
 *
 * 回归覆盖（对应审查「web-monitor 零单元测试覆盖」）：
 *  - buildHtmlMonitorArg：默认值/字段映射/数值解析（waitFor）
 *  - buildWatchArg：关键词 → 选择器与 textOnly 的联动、无关键词回退 body
 */

import { describe, it, expect } from '@jest/globals'
import {
  buildHtmlMonitorArg,
  buildWatchArg,
} from '../../src/commands/web-monitor'

describe('buildHtmlMonitorArg — 字段映射与默认值', () => {
  it('空选项时使用合理默认值', () => {
    const arg = buildHtmlMonitorArg({})
    expect(arg).toMatchObject({
      type: 'html',
      template: 'content',
      textOnly: false,
      mode: 'static',
      waitFor: undefined,
      waitSelector: undefined,
      title: undefined,
    })
  })

  it('puppeteer 选项映射为 mode=puppeteer', () => {
    const arg = buildHtmlMonitorArg({ puppeteer: true })
    expect(arg.mode).toBe('puppeteer')
  })

  it('wait 选项被解析为整数 waitFor', () => {
    const arg = buildHtmlMonitorArg({ wait: '3000', selector: 'div.article', template: 'only image', text: true, waitSelector: '.ready', title: 'T' })
    expect(arg).toMatchObject({
      selector: 'div.article',
      template: 'only image',
      textOnly: true,
      waitFor: 3000,
      waitSelector: '.ready',
      title: 'T',
    })
  })

  it('保留显式 template，不被默认值覆盖', () => {
    expect(buildHtmlMonitorArg({ template: 'only video' }).template).toBe('only video')
    // 未提供时回落到 'content'
    expect(buildHtmlMonitorArg({}).template).toBe('content')
  })
})

describe('buildWatchArg — 关键词 → 选择器联动', () => {
  it('有关键词时生成 contains 选择器并开启 textOnly', () => {
    const arg = buildWatchArg('降价', { puppeteer: false })
    expect(arg.selector).toBe('*:contains("降价")')
    expect(arg.textOnly).toBe(true)
    expect(arg.type).toBe('html')
    expect(arg.template).toBe('content')
  })

  it('无关键词时回退到 body 选择器且 textOnly=false', () => {
    const arg = buildWatchArg(undefined, {})
    expect(arg.selector).toBe('body')
    expect(arg.textOnly).toBe(false)
  })

  it('空字符串关键词视为无关键词', () => {
    const arg = buildWatchArg('', {})
    expect(arg.selector).toBe('body')
    expect(arg.textOnly).toBe(false)
  })

  it('puppeteer 选项透传到 mode', () => {
    expect(buildWatchArg('x', { puppeteer: true }).mode).toBe('puppeteer')
    expect(buildWatchArg('x', { puppeteer: false }).mode).toBe('static')
  })
})
