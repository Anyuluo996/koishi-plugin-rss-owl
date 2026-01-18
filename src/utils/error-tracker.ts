/**
 * 错误追踪系统
 * 集成 Sentry 进行错误监控和报告
 *
 * 注意：需要安装 @sentry/node 才能使用此功能
 * npm install @sentry/node
 */

// 动态导入 Sentry，避免未安装时编译失败
let Sentry: any = null

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('@sentry/node')
} catch {
  // Sentry 未安装，功能将被禁用
  console.warn('Sentry not installed. Error tracking will be disabled.')
  console.warn('To enable error tracking, install: npm install @sentry/node')
}

// 类型定义
type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

/**
 * Sentry 配置接口
 */
export interface SentryConfig {
  enabled: boolean
  dsn: string
  environment?: string
  release?: string
  tracesSampleRate?: number
  profilesSampleRate?: number
}

/**
 * 错误上下文
 */
export interface ErrorContext {
  platform?: string
  guildId?: string
  userId?: string
  rssId?: string
  url?: string
  command?: string
  [key: string]: any
}

/**
 * 错误追踪器类
 */
export class ErrorTracker {
  private config: SentryConfig
  private initialized: boolean = false

  constructor(config: SentryConfig) {
    this.config = config
  }

  /**
   * 初始化 Sentry
   */
  init(): void {
    if (!this.config.enabled || !this.config.dsn || !Sentry) {
      return
    }

    try {
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment || 'production',
        release: this.config.release || '5.0.0-beta',
        tracesSampleRate: this.config.tracesSampleRate || 0.1,
        profilesSampleRate: this.config.profilesSampleRate || 0.1,

        // 集成之前已有的错误处理器
        beforeSend(event, hint) {
          // 可以在这里修改或过滤事件
          return event
        },

        // 集成性能监控
        integrations: [
          // 添加默认集成
          ...(Sentry.defaultIntegrations || []),
        ],

        // 设置面包屑
        beforeBreadcrumb(breadcrumb, hint) {
          // 可以在这里过滤或修改面包屑
          return breadcrumb
        }
      })

      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize Sentry:', error)
    }
  }

  /**
   * 捕获异常
   */
  captureException(error: Error, context?: ErrorContext): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.withScope((scope: any) => {
      // 添加上下文
      if (context) {
        scope.setContext('custom_context', context)
        scope.setUser({
          id: context.userId,
          platform: context.platform
        })
        scope.setTag('guild_id', context.guildId)
        scope.setTag('rss_id', context.rssId)
        scope.setTag('url', context.url)
        scope.setTag('command', context.command)
      }

      // 发送错误
      Sentry.captureException(error)
    })
  }

  /**
   * 捕获消息
   */
  captureMessage(message: string, level: SeverityLevel = 'info', context?: ErrorContext): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.withScope((scope: any) => {
      // 添加上下文
      if (context) {
        scope.setContext('custom_context', context)
        scope.setUser({
          id: context.userId,
          platform: context.platform
        })
        scope.setTag('guild_id', context.guildId)
        scope.setTag('rss_id', context.rssId)
        scope.setTag('url', context.url)
        scope.setTag('command', context.command)
      }

      // 发送消息
      Sentry.captureMessage(message, level)
    })
  }

  /**
   * 添加面包屑
   */
  addBreadcrumb(message: string, category: string = 'custom', level: SeverityLevel = 'info', data?: Record<string, any>): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data
    })
  }

  /**
   * 设置用户
   */
  setUser(user: { id: string; platform?: string; [key: string]: any }): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.setUser(user)
  }

  /**
   * 设置标签
   */
  setTag(key: string, value: string): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.setTag(key, value)
  }

  /**
   * 设置上下文
   */
  setContext(key: string, context: Record<string, any>): void {
    if (!this.initialized || !Sentry) {
      return
    }

    Sentry.setContext(key, context)
  }

  /**
   * 开始性能追踪
   */
  startTransaction(name: string, op: string): any {
    if (!this.initialized || !Sentry) {
      return undefined
    }

    return Sentry.startInactiveSpan({
      name,
      op
    })
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// 全局错误追踪器实例
let globalErrorTracker: ErrorTracker | null = null

/**
 * 初始化全局错误追踪器
 */
export function initErrorTracker(config: SentryConfig): ErrorTracker {
  if (!globalErrorTracker) {
    globalErrorTracker = new ErrorTracker(config)
    globalErrorTracker.init()
  }

  return globalErrorTracker
}

/**
 * 获取全局错误追踪器
 */
export function getErrorTracker(): ErrorTracker | null {
  return globalErrorTracker
}

/**
 * 便捷方法：捕获异常
 */
export function trackError(error: Error, context?: ErrorContext): void {
  if (globalErrorTracker) {
    globalErrorTracker.captureException(error, context)
  }
}

/**
 * 便捷方法：捕获消息
 */
export function trackMessage(message: string, level?: SeverityLevel, context?: ErrorContext): void {
  if (globalErrorTracker) {
    globalErrorTracker.captureMessage(message, level, context)
  }
}

/**
 * 便捷方法：添加面包屑
 */
export function addBreadcrumb(message: string, category?: string, level?: SeverityLevel, data?: Record<string, any>): void {
  if (globalErrorTracker) {
    globalErrorTracker.addBreadcrumb(message, category, level, data)
  }
}

/**
 * 便捷方法：设置标签
 */
export function setTag(key: string, value: string): void {
  if (globalErrorTracker) {
    globalErrorTracker.setTag(key, value)
  }
}

/**
 * 便捷方法：设置上下文
 */
export function setContext(key: string, context: Record<string, any>): void {
  if (globalErrorTracker) {
    globalErrorTracker.setContext(key, context)
  }
}

/**
 * 便捷方法：设置用户
 */
export function setUser(user: { id: string; platform?: string }): void {
  if (globalErrorTracker) {
    globalErrorTracker.setUser(user)
  }
}

/**
 * 性能追踪装饰器
 */
export function TracePerformance(name?: string, op?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const transactionName = name || `${target.constructor.name}.${propertyKey}`
      const transactionOp = op || 'function'

      let span: any

      if (globalErrorTracker && globalErrorTracker.isInitialized()) {
        span = globalErrorTracker.startTransaction(transactionName, transactionOp)
      }

      try {
        const result = await originalMethod.apply(this, args)
        if (span) {
          span.end()
        }
        return result
      } catch (error) {
        if (span) {
          span.setStatus({
            code: 2, // Internal error
            message: error instanceof Error ? error.message : 'Unknown error'
          })
          span.end()
        }
        throw error
      }
    }

    return descriptor
  }
}

/**
 * 包装异步函数以追踪性能
 */
export function wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string,
  op: string = 'function'
): T {
  return (async (...args: any[]) => {
    let span: any

    if (globalErrorTracker && globalErrorTracker.isInitialized()) {
      span = globalErrorTracker.startTransaction(name, op)
    }

    try {
      const result = await fn(...args)
      if (span) {
        span.end()
      }
      return result
    } catch (error) {
      if (span) {
        span.setStatus({
          code: 2,
          message: error instanceof Error ? error.message : 'Unknown error'
        })
        span.end()
      }
      throw error
    }
  }) as T
}

/**
 * 错误处理包装器
 */
export function withErrorTracking<T extends (...args: any[]) => any>(
  fn: T,
  context?: ErrorContext,
  errorMessage?: string
): T {
  return ((...args: any[]) => {
    try {
      const result = fn(...args)

      // 处理 Promise
      if (result instanceof Promise) {
        return result.catch((error) => {
          trackError(error, context)
          throw error
        })
      }

      return result
    } catch (error) {
      trackError(error as Error, context)
      throw error
    }
  }) as T
}
