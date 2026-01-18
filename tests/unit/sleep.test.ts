/**
 * sleep 函数单元测试
 */

import { describe, it, expect } from '@jest/globals'
import { sleep } from '../../src/utils/common'

describe('sleep', () => {
  it('should resolve after default delay of 1000ms', async () => {
    const start = Date.now()
    await sleep()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(1000)
    expect(elapsed).toBeLessThan(1100)
  })

  it('should resolve after custom delay', async () => {
    const start = Date.now()
    await sleep(100)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(100)
    expect(elapsed).toBeLessThan(200)
  })

  it('should resolve immediately with 0 delay', async () => {
    const start = Date.now()
    await sleep(0)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50)
  })

  it('should return undefined', async () => {
    const result = await sleep(10)
    expect(result).toBeUndefined()
  })
})
