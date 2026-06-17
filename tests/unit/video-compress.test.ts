/**
 * video-compress 工具模块单元测试
 *
 * 覆盖纯判断逻辑 shouldCompress；真实 ffmpeg 调用不在此验证。
 */

import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { shouldCompress } from '../../src/utils/video-compress'

const makeConfig = (compressThreshold?: number, maxVideoSize?: number) => ({
  debug: 'disable',
  basic: { maxVideoSize } as any,
  tdl: { compressThreshold } as any,
} as any)

/** 创建指定大小的临时文件，返回路径 */
function makeTempFile(sizeBytes: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-test-'))
  const file = path.join(dir, 'sample.mp4')
  // 写入指定字节（不关心内容，只关心大小判断）
  const buf = Buffer.alloc(sizeBytes, 0)
  fs.writeFileSync(file, buf)
  return file
}

function cleanup(p: string) {
  try { fs.rmSync(path.dirname(p), { recursive: true, force: true }) } catch { /* ignore */ }
}

describe('shouldCompress', () => {
  it('文件小于阈值时返回 false', () => {
    const file = makeTempFile(10 * 1024 * 1024) // 10MB
    try {
      expect(shouldCompress(file, makeConfig(30))).toBe(false)
    } finally { cleanup(file) }
  })

  it('文件大于阈值时返回 true', () => {
    const file = makeTempFile(40 * 1024 * 1024) // 40MB
    try {
      expect(shouldCompress(file, makeConfig(30))).toBe(true)
    } finally { cleanup(file) }
  })

  it('阈值默认回退到 basic.maxVideoSize', () => {
    const file = makeTempFile(40 * 1024 * 1024) // 40MB
    try {
      // 未配 tdl.compressThreshold，回退 maxVideoSize=30
      expect(shouldCompress(file, makeConfig(undefined, 30))).toBe(true)
    } finally { cleanup(file) }
  })

  it('阈值默认回退到 30MB', () => {
    const file = makeTempFile(35 * 1024 * 1024) // 35MB
    try {
      // 既无 tdl.compressThreshold 也无 basic.maxVideoSize
      expect(shouldCompress(file, { debug: 'disable' } as any)).toBe(true)
    } finally { cleanup(file) }
  })

  it('文件恰好等于阈值时返回 false（> 才触发）', () => {
    const file = makeTempFile(30 * 1024 * 1024) // 30MB
    try {
      expect(shouldCompress(file, makeConfig(30))).toBe(false)
    } finally { cleanup(file) }
  })

  it('文件不存在时返回 false（size=0）', () => {
    expect(shouldCompress('/path/does/not/exist.mp4', makeConfig(30))).toBe(false)
  })
})
