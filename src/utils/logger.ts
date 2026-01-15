import { Logger } from 'koishi'
import { Config, debugLevel } from '../types'

const logger = new Logger('rss-owl')

export function debug(config: Config, message: any, name = '', type: "disable"|"error"|"info"|"details" = 'details') {
  const typeLevel = debugLevel.findIndex(i => i == type)
  if (typeLevel < 1) return
  if (typeLevel > debugLevel.findIndex(i => i == config.debug)) return

  // 格式化消息内容
  let formattedMessage: string
  if (typeof message === 'string') {
    formattedMessage = message
  } else if (message === null || message === undefined) {
    formattedMessage = String(message)
  } else {
    try {
      // 对于复杂对象，使用 JSON.stringify 并处理循环引用
      formattedMessage = JSON.stringify(message, (_, value) => {
        if (typeof value === 'function') return '[Function]'
        if (value instanceof Error) return value.message
        return value
      }, 2)
    } catch {
      formattedMessage = String(message)
    }
  }

  // 添加名称前缀（如果有）
  if (name) {
    formattedMessage = `[${name}] ${formattedMessage}`
  }

  logger.info(formattedMessage)
}

export { logger }
