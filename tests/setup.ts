/**
 * Jest 测试环境设置
 */

import { jest } from '@jest/globals'

// 设置测试超时
jest.setTimeout(10000)

// Mock console 方法以减少测试输出噪音
global.console = {
  ...console,
  // 保留 error 和 warn，其他可以 mock
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}

// Mock 环境变量
process.env.NODE_ENV = 'test'
