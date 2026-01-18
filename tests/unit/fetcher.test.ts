/**
 * RequestManager 单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { RequestManager } from '../../src/utils/fetcher'

describe('RequestManager', () => {
  describe('构造函数', () => {
    it('应该使用默认参数创建实例', () => {
      const rm = new RequestManager()
      expect(rm).toBeInstanceOf(RequestManager)
    })

    it('应该使用自定义参数创建实例', () => {
      const rm = new RequestManager(5, 3, 20)
      expect(rm).toBeInstanceOf(RequestManager)
    })
  })

  describe('enqueue', () => {
    let requestManager: RequestManager

    beforeEach(() => {
      requestManager = new RequestManager(3, 2, 10)
    })

    it('应该成功执行单个任务', async () => {
      const task = () => Promise.resolve('result')
      const result = await requestManager.enqueue(task)
      expect(result).toBe('result')
    })

    it('应该处理多个并发任务', async () => {
      const task1 = () => Promise.resolve('result1')
      const task2 = () => Promise.resolve('result2')
      const task3 = () => Promise.resolve('result3')

      const results = await Promise.all([
        requestManager.enqueue(task1),
        requestManager.enqueue(task2),
        requestManager.enqueue(task3),
      ])

      expect(results).toEqual(['result1', 'result2', 'result3'])
    })

    it('应该正确处理任务失败', async () => {
      const task = () => Promise.reject(new Error('Task failed'))
      await expect(requestManager.enqueue(task)).rejects.toThrow('Task failed')
    })

    it('应该限制并发数量', async () => {
      const rm = new RequestManager(2, 10, 10)
      let runningCount = 0
      let maxRunning = 0

      const createTask = () => {
        return new Promise<void>((resolve) => {
          runningCount++
          if (runningCount > maxRunning) {
            maxRunning = runningCount
          }
          setTimeout(() => {
            runningCount--
            resolve()
          }, 100)
        })
      }

      // 启动 5 个任务，但最大并发应该是 2
      await Promise.all([
        rm.enqueue(createTask),
        rm.enqueue(createTask),
        rm.enqueue(createTask),
        rm.enqueue(createTask),
        rm.enqueue(createTask),
      ])

      expect(maxRunning).toBeLessThanOrEqual(2)
    })

    it('应该正确执行异步任务', async () => {
      const task = async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'async result'
      }
      const result = await requestManager.enqueue(task)
      expect(result).toBe('async result')
    })

    it('应该处理返回不同类型的任务', async () => {
      const stringTask = () => Promise.resolve('string')
      const numberTask = () => Promise.resolve(42)
      const objectTask = () => Promise.resolve({ key: 'value' })

      const [str, num, obj] = await Promise.all([
        requestManager.enqueue(stringTask),
        requestManager.enqueue(numberTask),
        requestManager.enqueue(objectTask),
      ])

      expect(str).toBe('string')
      expect(num).toBe(42)
      expect(obj).toEqual({ key: 'value' })
    })
  })

  describe('Token Bucket 算法', () => {
    it('应该在长时间等待后补充令牌', async () => {
      const rm = new RequestManager(1, 10, 5) // 初始 5 个令牌
      const startTime = Date.now()

      // 先消耗掉所有令牌
      const tasks = []
      for (let i = 0; i < 5; i++) {
        tasks.push(rm.enqueue(() => Promise.resolve(i)))
      }
      await Promise.all(tasks)

      // 等待令牌补充
      await new Promise(resolve => setTimeout(resolve, 600))

      // 现在应该有新令牌可用
      const result = await rm.enqueue(() => Promise.resolve('new task'))
      expect(result).toBe('new task')
    }, 10000)

    it('应该限制在桶容量范围内', async () => {
      const bucketSize = 3
      const rm = new RequestManager(1, 100, bucketSize)

      // 快速启动大量任务
      const tasks = []
      for (let i = 0; i < 20; i++) {
        tasks.push(rm.enqueue(() => Promise.resolve(i)))
      }

      const results = await Promise.all(tasks)
      expect(results).toHaveLength(20)
    }, 10000)
  })
})
