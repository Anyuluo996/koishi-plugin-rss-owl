/**
 * 性能监控指标系统
 * 收集和报告应用程序性能指标
 */

/**
 * 指标类型
 */
export enum MetricType {
  COUNTER = 'counter',      // 计数器（只增不减）
  GAUGE = 'gauge',          // 仪表盘（可增可减）
  HISTOGRAM = 'histogram',  // 直方图（分布统计）
  SUMMARY = 'summary'       // 摘要（统计信息）
}

/**
 * 指标数据点
 */
interface MetricDataPoint {
  value: number
  timestamp: number
  labels?: Record<string, string>
}

/**
 * 指标接口
 */
export interface Metric {
  name: string
  type: MetricType
  description: string
  data: MetricDataPoint[]
}

/**
 * 直方图桶
 */
interface HistogramBucket {
  le: number  // 小于等于
  count: number
}

/**
 * 直方图指标
 */
export class Histogram {
  private data: Map<string, HistogramBucket> = new Map()
  private sum: number = 0
  private count: number = 0

  constructor(
    public name: string,
    public description: string,
    private buckets: number[] = [10, 50, 100, 500, 1000, 5000, 10000]
  ) {
    // 初始化桶
    for (const value of buckets) {
      this.data.set(value.toString(), { le: value, count: 0 })
    }
    // 添加 +Inf 桶
    this.data.set('+Inf', { le: Infinity, count: 0 })
  }

  /**
   * 观察一个值
   */
  observe(value: number, labels?: Record<string, string>): void {
    this.sum += value
    this.count += 1

    // 更新桶计数
    for (const [key, bucket] of this.data) {
      if (value <= bucket.le) {
        bucket.count += 1
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    count: number
    sum: number
    avg: number
    buckets: Record<string, number>
  } {
    const buckets: Record<string, number> = {}
    for (const [key, bucket] of this.data) {
      buckets[key === '+Inf' ? 'Inf' : key] = bucket.count
    }

    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
      buckets
    }
  }

  /**
   * 重置
   */
  reset(): void {
    this.sum = 0
    this.count = 0
    for (const bucket of this.data.values()) {
      bucket.count = 0
    }
  }
}

/**
 * 计数器指标
 */
export class Counter {
  private value: number = 0

  constructor(
    public name: string,
    public description: string
  ) {}

  /**
   * 增加计数
   */
  inc(delta: number = 1, labels?: Record<string, string>): void {
    this.value += delta
  }

  /**
   * 获取当前值
   */
  get(): number {
    return this.value
  }

  /**
   * 重置
   */
  reset(): void {
    this.value = 0
  }
}

/**
 * 仪表盘指标
 */
export class Gauge {
  private value: number = 0

  constructor(
    public name: string,
    public description: string
  ) {}

  /**
   * 设置值
   */
  set(value: number, labels?: Record<string, string>): void {
    this.value = value
  }

  /**
   * 增加
   */
  inc(delta: number = 1, labels?: Record<string, string>): void {
    this.value += delta
  }

  /**
   * 减少
   */
  dec(delta: number = 1, labels?: Record<string, string>): void {
    this.value -= delta
  }

  /**
   * 获取当前值
   */
  get(): number {
    return this.value
  }

  /**
   * 重置
   */
  reset(): void {
    this.value = 0
  }
}

/**
 * 性能指标收集器
 */
export class MetricsCollector {
  private metrics: Map<string, Counter | Gauge | Histogram> = new Map()

  /**
   * 创建或获取计数器
   */
  getCounter(name: string, description: string): Counter {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Counter(name, description))
    }
    const metric = this.metrics.get(name)!
    if (!(metric instanceof Counter)) {
      throw new Error(`Metric ${name} is not a Counter`)
    }
    return metric
  }

  /**
   * 创建或获取仪表盘
   */
  getGauge(name: string, description: string): Gauge {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Gauge(name, description))
    }
    const metric = this.metrics.get(name)!
    if (!(metric instanceof Gauge)) {
      throw new Error(`Metric ${name} is not a Gauge`)
    }
    return metric
  }

  /**
   * 创建或获取直方图
   */
  getHistogram(name: string, description: string, buckets?: number[]): Histogram {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, new Histogram(name, description, buckets))
    }
    const metric = this.metrics.get(name)!
    if (!(metric instanceof Histogram)) {
      throw new Error(`Metric ${name} is not a Histogram`)
    }
    return metric
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Map<string, Counter | Gauge | Histogram> {
    return this.metrics
  }

  /**
   * 重置所有指标
   */
  resetAll(): void {
    for (const metric of this.metrics.values()) {
      metric.reset()
    }
  }

  /**
   * 生成指标报告
   */
  generateReport(): string {
    const lines: string[] = []
    lines.push('# Metrics Report')
    lines.push(`# Generated at: ${new Date().toISOString()}`)
    lines.push('')

    for (const [name, metric] of this.metrics) {
      lines.push(`# ${metric.description}`)
      lines.push(`# TYPE ${name} ${metric.constructor.name}`)

      if (metric instanceof Counter) {
        lines.push(`${name} ${metric.get()}`)
      } else if (metric instanceof Gauge) {
        lines.push(`${name} ${metric.get()}`)
      } else if (metric instanceof Histogram) {
        const stats = metric.getStats()
        lines.push(`${name}_count ${stats.count}`)
        lines.push(`${name}_sum ${stats.sum}`)
        for (const [bucket, count] of Object.entries(stats.buckets)) {
          lines.push(`${name}_bucket{le="${bucket}"} ${count}`)
        }
      }

      lines.push('')
    }

    return lines.join('\n')
  }
}

// 全局指标收集器实例
let globalMetricsCollector: MetricsCollector | null = null

/**
 * 初始化全局指标收集器
 */
export function initMetrics(): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector()

    // 注册默认指标
    registerDefaultMetrics(globalMetricsCollector)
  }

  return globalMetricsCollector
}

/**
 * 注册默认指标
 */
function registerDefaultMetrics(collector: MetricsCollector): void {
  // RSS 订阅相关
  collector.getCounter('rss_fetch_total', 'RSS fetch total count')
  collector.getCounter('rss_fetch_success', 'RSS fetch success count')
  collector.getCounter('rss_fetch_error', 'RSS fetch error count')
  collector.getHistogram('rss_fetch_duration', 'RSS fetch duration (ms)')

  // HTML 监控相关
  collector.getCounter('html_monitor_total', 'HTML monitor total count')
  collector.getCounter('html_monitor_success', 'HTML monitor success count')
  collector.getCounter('html_monitor_error', 'HTML monitor error count')
  collector.getHistogram('html_monitor_duration', 'HTML monitor duration (ms)')

  // AI 相关
  collector.getCounter('ai_summary_total', 'AI summary total count')
  collector.getCounter('ai_summary_success', 'AI summary success count')
  collector.getCounter('ai_summary_error', 'AI summary error count')
  collector.getCounter('ai_cache_hit', 'AI cache hit count')
  collector.getCounter('ai_cache_miss', 'AI cache miss count')
  collector.getHistogram('ai_summary_duration', 'AI summary duration (ms)')

  // 消息推送相关
  collector.getCounter('message_send_total', 'Message send total count')
  collector.getCounter('message_send_success', 'Message send success count')
  collector.getCounter('message_send_error', 'Message send error count')

  // 性能相关
  collector.getGauge('memory_usage', 'Memory usage (MB)')
  collector.getGauge('active_subscriptions', 'Active subscriptions count')
  collector.getGauge('queue_size', 'Queue size')

  // Puppeteer 相关
  collector.getCounter('puppeteer_render_total', 'Puppeteer render total count')
  collector.getCounter('puppeteer_render_success', 'Puppeteer render success count')
  collector.getCounter('puppeteer_render_error', 'Puppeteer render error count')
  collector.getHistogram('puppeteer_render_duration', 'Puppeteer render duration (ms)')
}

/**
 * 获取全局指标收集器
 */
export function getMetricsCollector(): MetricsCollector | null {
  return globalMetricsCollector
}

/**
 * 便捷函数：增加计数器
 */
export function incCounter(name: string, delta: number = 1): void {
  if (globalMetricsCollector) {
    try {
      globalMetricsCollector.getCounter(name, '').inc(delta)
    } catch {
      // 指标不存在，忽略
    }
  }
}

/**
 * 便捷函数：设置仪表盘
 */
export function setGauge(name: string, value: number): void {
  if (globalMetricsCollector) {
    try {
      globalMetricsCollector.getGauge(name, '').set(value)
    } catch {
      // 指标不存在，忽略
    }
  }
}

/**
 * 便捷函数：观察直方图
 */
export function observeHistogram(name: string, value: number): void {
  if (globalMetricsCollector) {
    try {
      globalMetricsCollector.getHistogram(name, '').observe(value)
    } catch {
      // 指标不存在，忽略
    }
  }
}

/**
 * 便捷函数：记录 RSS 获取成功
 */
export function recordRssFetch(duration: number): void {
  incCounter('rss_fetch_total')
  incCounter('rss_fetch_success')
  observeHistogram('rss_fetch_duration', duration)
}

/**
 * 便捷函数：记录 RSS 获取失败
 */
export function recordRssFetchError(): void {
  incCounter('rss_fetch_total')
  incCounter('rss_fetch_error')
}

/**
 * 便捷函数：记录 AI 摘要成功
 */
export function recordAiSummary(duration: number, cached: boolean): void {
  incCounter('ai_summary_total')
  incCounter('ai_summary_success')
  observeHistogram('ai_summary_duration', duration)
  if (cached) {
    incCounter('ai_cache_hit')
  } else {
    incCounter('ai_cache_miss')
  }
}

/**
 * 便捷函数：记录 AI 摘要失败
 */
export function recordAiSummaryError(): void {
  incCounter('ai_summary_total')
  incCounter('ai_summary_error')
}

/**
 * 便捷函数：记录消息发送
 */
export function recordMessageSend(success: boolean): void {
  incCounter('message_send_total')
  if (success) {
    incCounter('message_send_success')
  } else {
    incCounter('message_send_error')
  }
}

/**
 * 更新内存使用指标
 */
export function updateMemoryUsage(): void {
  const memoryUsage = process.memoryUsage()
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024
  setGauge('memory_usage', heapUsedMB)
}
