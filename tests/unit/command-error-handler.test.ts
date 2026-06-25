/**
 * 命令错误处理测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import {
  CommandError,
  CommandErrorType,
  executeCommand,
  permissionDenied,
  invalidArgument,
  notFound,
  alreadyExists
} from '../../src/commands/error-handler'
import * as loggerModule from '../../src/utils/logger'
import { Config } from '../../src/types'

describe('CommandError', () => {
  it('应该创建权限错误', () => {
    const error = new CommandError(
      CommandErrorType.PERMISSION_DENIED,
      '权限不足'
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.type).toBe(CommandErrorType.PERMISSION_DENIED)
    expect(error.message).toBe('权限不足')
    expect(error.name).toBe('CommandError')
  })

  it('应该创建参数错误', () => {
    const error = new CommandError(
      CommandErrorType.INVALID_ARGUMENT,
      '参数格式错误'
    )

    expect(error.type).toBe(CommandErrorType.INVALID_ARGUMENT)
    expect(error.message).toBe('参数格式错误')
  })

  it('应该支持额外的详细信息', () => {
    const details = { field: 'url', value: 'invalid' }
    const error = new CommandError(
      CommandErrorType.INVALID_ARGUMENT,
      'URL 格式错误',
      details
    )

    expect(error.details).toEqual(details)
  })
})

describe('错误工厂函数', () => {
  it('应该创建权限拒绝错误', () => {
    const error = permissionDenied()
    expect(error.type).toBe(CommandErrorType.PERMISSION_DENIED)
    expect(error.message).toBe('权限不足')
  })

  it('应该创建自定义消息的权限拒绝错误', () => {
    const error = permissionDenied('需要管理员权限')
    expect(error.message).toBe('需要管理员权限')
  })

  it('应该创建参数错误', () => {
    const error = invalidArgument('URL 不能为空')
    expect(error.type).toBe(CommandErrorType.INVALID_ARGUMENT)
    expect(error.message).toBe('URL 不能为空')
  })

  it('应该创建未找到错误', () => {
    const error = notFound('订阅')
    expect(error.type).toBe(CommandErrorType.NOT_FOUND)
    expect(error.message).toBe('订阅')
  })

  it('应该创建已存在错误', () => {
    const error = alreadyExists('订阅')
    expect(error.type).toBe(CommandErrorType.ALREADY_EXISTS)
    expect(error.message).toBe('订阅')
  })
})

describe('错误类型验证', () => {
  it('应该支持所有错误类型', () => {
    expect(CommandErrorType.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    expect(CommandErrorType.INVALID_ARGUMENT).toBe('INVALID_ARGUMENT')
    expect(CommandErrorType.NOT_FOUND).toBe('NOT_FOUND')
    expect(CommandErrorType.ALREADY_EXISTS).toBe('ALREADY_EXISTS')
    expect(CommandErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(CommandErrorType.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
  })
})

describe('executeCommand', () => {
  let config: Config
  let debugErrorSpy: jest.SpiedFunction<typeof loggerModule.debugError>

  beforeEach(() => {
    config = {
      debug: 'error',
      logging: {},
    } as any

    debugErrorSpy = jest.spyOn(loggerModule, 'debugError').mockImplementation(() => undefined as any)
  })

  afterEach(() => {
    debugErrorSpy.mockRestore()
  })

  it('应该返回成功结果', async () => {
    const result = await executeCommand({} as any, config, '测试操作', async () => 'ok')

    expect(result).toBe('ok')
    expect(debugErrorSpy).not.toHaveBeenCalled()
  })

  it('应该格式化 CommandError 并记录日志', async () => {
    const error = invalidArgument('URL 不能为空')

    const result = await executeCommand({} as any, config, '测试操作', async () => {
      throw error
    })

    expect(result).toBe('参数错误: URL 不能为空')
    expect(debugErrorSpy).toHaveBeenCalledWith(config, error, '测试操作 error', {
      command: '测试操作',
      commandErrorType: CommandErrorType.INVALID_ARGUMENT,
    })
  })

  it('应该返回友好错误消息并记录普通异常', async () => {
    const error = new Error('boom')

    const result = await executeCommand({} as any, config, '测试操作', async () => {
      throw error
    })

    expect(result).toContain('测试操作失败:')
    expect(debugErrorSpy).toHaveBeenCalledWith(config, error, '测试操作 error', {
      command: '测试操作',
    })
  })
})

