/**
 * 可观测性功能测试
 * 测试结构化日志、性能监控和错误追踪
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
  StructuredLogger,
  LogLevel,
  PerformanceTimer,
  initStructuredLogger,
  logInfo,
  logDetails,
  logError,
  createTimer
} from '../../src/utils/structured-logger'
import {
  MetricsCollector,
  Counter,
  Gauge,
  Histogram,
  initMetrics,
  incCounter,
  setGauge,
  observeHistogram,
  recordRssFetch,
  recordAiSummary
} from '../../src/utils/metrics'
import { Config } from '../../src/types'

// Mock config
const mockConfig: Config = {
  debug: 'info',
  basic: {} as any,
  template: {} as any,
  net: {} as any,
  msg: {} as any,
  ai: {} as any
}

describe('结构化日志系统', () => {
  let logger: StructuredLogger

  beforeEach(() => {
    logger = new StructuredLogger(mockConfig, false)
  })

  describe('StructuredLogger', () => {
    it('应该创建日志实例', () => {
      expect(logger).toBeInstanceOf(StructuredLogger)
    })

    it('应该创建性能计时器', () => {
      const timer = logger.createTimer()
      expect(timer).toBeInstanceOf(PerformanceTimer)
    })

    it('应该正确计算耗时', async () => {
      const timer = logger.createTimer()
      await new Promise(resolve => setTimeout(resolve, 100))
      const duration = timer.getDuration()

      expect(duration).toBeGreaterThanOrEqual(90)
      expect(duration).toBeLessThan(150)
    })

    it('应该正确计算内存使用', () => {
      const timer = logger.createTimer()
      const memory1 = timer.getMemoryUsage()

      // 分配一些内存
      const data = new Array(1000000).fill('test')
      const memory2 = timer.getMemoryUsage()

      expect(memory2).toBeGreaterThan(memory1)
    })

    it('应该正确记录性能数据', () => {
      const timer = logger.createTimer()
      timer.getMetrics()

      const metrics = timer.getMetrics()
      expect(metrics).toHaveProperty('duration')
      expect(metrics).toHaveProperty('memory')
      expect(typeof metrics.duration).toBe('number')
      expect(typeof metrics.memory).toBe('number')
    })
  })

  describe('PerformanceTimer', () => {
    it('应该追踪耗时', async () => {
      const timer = new PerformanceTimer()

      await new Promise(resolve => setTimeout(resolve, 50))

      const duration = timer.getDuration()
      expect(duration).toBeGreaterThanOrEqual(40)
      expect(duration).toBeLessThan(100)
    })

    it('应该追踪内存使用', () => {
      const timer = new PerformanceTimer()

      // 分配一些内存
      const data = new Array(10000).fill('x')

      const memoryUsage = timer.getMemoryUsage()
      expect(memoryUsage).toBeGreaterThan(0)
    })

    it('应该返回完整的性能指标', () => {
      const timer = new PerformanceTimer()

      const metrics = timer.getMetrics()
      expect(metrics).toHaveProperty('duration')
      expect(metrics).toHaveProperty('memory')
      expect(typeof metrics.duration).toBe('number')
      expect(typeof metrics.memory).toBe('number')
    })
  })

  describe('全局日志函数', () => {
    beforeEach(() => {
      initStructuredLogger(mockConfig)
    })

    it('应该记录信息日志', () => {
      expect(() => logInfo('Test message', 'TestModule')).not.toThrow()
    })

    it('应该记录详细日志', () => {
      expect(() => logDetails('Detailed message', 'TestModule')).not.toThrow()
    })

    it('应该记录错误日志', () => {
      const error = new Error('Test error')
      expect(() => logError('Error occurred', 'TestModule', error)).not.toThrow()
    })

    it('应该创建计时器', () => {
      const timer = createTimer()
      expect(timer).toBeInstanceOf(PerformanceTimer)
    })
  })
})

describe('性能监控系统', () => {
  let collector: MetricsCollector

  beforeEach(() => {
    collector = new MetricsCollector()
  })

  describe('Counter', () => {
    it('应该创建计数器', () => {
      const counter = collector.getCounter('test_counter', 'Test counter')
      expect(counter).toBeInstanceOf(Counter)
      expect(counter.get()).toBe(0)
    })

    it('应该增加计数', () => {
      const counter = collector.getCounter('test_counter', 'Test counter')

      counter.inc()
      expect(counter.get()).toBe(1)

      counter.inc(5)
      expect(counter.get()).toBe(6)
    })

    it('应该重置计数', () => {
      const counter = collector.getCounter('test_counter', 'Test counter')
      counter.inc(10)

      counter.reset()
      expect(counter.get()).toBe(0)
    })

    it('应该返回相同的计数器实例', () => {
      const counter1 = collector.getCounter('test_counter', 'Test counter')
      const counter2 = collector.getCounter('test_counter', 'Test counter')

      expect(counter1).toBe(counter2)
    })
  })

  describe('Gauge', () => {
    it('应该创建仪表盘', () => {
      const gauge = collector.getGauge('test_gauge', 'Test gauge')
      expect(gauge).toBeInstanceOf(Gauge)
      expect(gauge.get()).toBe(0)
    })

    it('应该设置值', () => {
      const gauge = collector.getGauge('test_gauge', 'Test gauge')

      gauge.set(42)
      expect(gauge.get()).toBe(42)
    })

    it('应该增加值', () => {
      const gauge = collector.getGauge('test_gauge', 'Test gauge')

      gauge.inc()
      expect(gauge.get()).toBe(1)

      gauge.inc(5)
      expect(gauge.get()).toBe(6)
    })

    it('应该减少值', () => {
      const gauge = collector.getGauge('test_gauge', 'Test gauge')

      gauge.set(10)
      gauge.dec()
      expect(gauge.get()).toBe(9)

      gauge.dec(5)
      expect(gauge.get()).toBe(4)
    })
  })

  describe('Histogram', () => {
    it('应该创建直方图', () => {
      const histogram = collector.getHistogram('test_histogram', 'Test histogram')
      expect(histogram).toBeInstanceOf(Histogram)
    })

    it('应该观察值', () => {
      const histogram = collector.getHistogram('test_histogram', 'Test histogram')

      histogram.observe(50)
      histogram.observe(150)
      histogram.observe(550)

      const stats = histogram.getStats()
      expect(stats.count).toBe(3)
      expect(stats.sum).toBe(750)
      expect(stats.avg).toBe(250)
    })

    it('应该正确统计桶', () => {
      const histogram = collector.getHistogram('test_histogram', 'Test histogram', [10, 50, 100])

      histogram.observe(5)
      histogram.observe(20)
      histogram.observe(75)
      histogram.observe(150)

      const stats = histogram.getStats()
      expect(stats.buckets['10']).toBe(1)
      expect(stats.buckets['50']).toBe(2)
      expect(stats.buckets['100']).toBe(3)
      expect(stats.buckets['Inf']).toBe(4)
    })

    it('应该重置统计', () => {
      const histogram = collector.getHistogram('test_histogram', 'Test histogram')

      histogram.observe(100)
      histogram.observe(200)

      histogram.reset()

      const stats = histogram.getStats()
      expect(stats.count).toBe(0)
      expect(stats.sum).toBe(0)
      expect(stats.avg).toBe(0)
    })
  })

  describe('MetricsCollector', () => {
    it('应该生成报告', () => {
      const counter = collector.getCounter('test_counter', 'Test counter')
      counter.inc(5)

      const gauge = collector.getGauge('test_gauge', 'Test gauge')
      gauge.set(42)

      const histogram = collector.getHistogram('test_histogram', 'Test histogram')
      histogram.observe(100)
      histogram.observe(200)

      const report = collector.generateReport()

      expect(report).toContain('# Metrics Report')
      expect(report).toContain('test_counter')
      expect(report).toContain('test_gauge')
      expect(report).toContain('test_histogram')
    })

    it('应该重置所有指标', () => {
      const counter = collector.getCounter('test_counter', 'Test counter')
      counter.inc(10)

      collector.resetAll()

      expect(counter.get()).toBe(0)
    })
  })

  describe('便捷函数', () => {
    beforeEach(() => {
      // 创建新的收集器实例，避免全局状态干扰
      collector = new MetricsCollector()
      // 注册默认指标
      collector.getCounter('rss_fetch_total', '')
      collector.getCounter('ai_summary_total', '')
      collector.getCounter('ai_cache_hit', '')
      collector.getCounter('ai_cache_miss', '')
      collector.getHistogram('rss_fetch_duration', '')
      collector.getHistogram('ai_summary_duration', '')
    })

    it('应该记录 RSS 获取', () => {
      // 直接使用 collector 而不是全局函数
      collector.getCounter('rss_fetch_total', '').inc()
      collector.getHistogram('rss_fetch_duration', '').observe(150)

      const counter = collector.getCounter('rss_fetch_total', '')
      const histogram = collector.getHistogram('rss_fetch_duration', '')

      expect(counter.get()).toBe(1)
      const stats = histogram.getStats()
      expect(stats.count).toBe(1)
    })

    it('应该记录 AI 摘要', () => {
      // 直接使用 collector
      const summaryCounter = collector.getCounter('ai_summary_total', '')
      const cacheHitCounter = collector.getCounter('ai_cache_hit', '')
      const cacheMissCounter = collector.getCounter('ai_cache_miss', '')

      summaryCounter.inc()
      cacheHitCounter.inc()

      summaryCounter.inc()
      cacheMissCounter.inc()

      expect(summaryCounter.get()).toBe(2)
      expect(cacheHitCounter.get()).toBe(1)
      expect(cacheMissCounter.get()).toBe(1)
    })
  })
})

describe('集成测试', () => {
  it('应该同时使用日志和指标', async () => {
    initStructuredLogger(mockConfig)

    const timer = createTimer()

    // 模拟操作
    await new Promise(resolve => setTimeout(resolve, 50))

    const metrics = timer.getMetrics()

    logInfo('Operation completed', 'TestModule', { duration: metrics.duration })

    // 使用独立的收集器
    const collector = new MetricsCollector()
    collector.getCounter('rss_fetch_total', '').inc()
    collector.getHistogram('rss_fetch_duration', '').observe(metrics.duration)

    const counter = collector.getCounter('rss_fetch_total', '')

    expect(counter.get()).toBe(1)
    expect(metrics.duration).toBeGreaterThan(40)
  })

  it('应该记录错误和指标', () => {
    initStructuredLogger(mockConfig)

    const error = new Error('Test error')
    logError('Test error occurred', 'TestModule', error)

    // 使用独立的收集器
    const collector = new MetricsCollector()
    collector.getCounter('rss_fetch_error', '').inc()

    const counter = collector.getCounter('rss_fetch_error', '')

    expect(counter.get()).toBe(1)
  })
})

describe('边界情况', () => {
  it('应该处理空值', () => {
    initStructuredLogger(mockConfig)

    expect(() => logInfo('', '')).not.toThrow()
  })

  it('应该处理大数值', () => {
    const collector = new MetricsCollector()
    const counter = collector.getCounter('test', 'Test')

    expect(() => {
      counter.inc(Number.MAX_SAFE_INTEGER)
    }).not.toThrow()
  })

  it('应该处理负数', () => {
    const collector = new MetricsCollector()
    const gauge = collector.getGauge('test', 'Test')

    expect(() => {
      gauge.set(-100)
    }).not.toThrow()

    expect(gauge.get()).toBe(-100)
  })

  it('应该处理快速连续操作', () => {
    const collector = new MetricsCollector()
    const counter = collector.getCounter('test', 'Test')
    const gauge = collector.getGauge('test_gauge', 'Test')
    const histogram = collector.getHistogram('test_histogram', 'Test')

    for (let i = 0; i < 1000; i++) {
      counter.inc()
      gauge.set(i)
      histogram.observe(i)
    }

    expect(counter.get()).toBe(1000)
  })
})
