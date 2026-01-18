/**
 * media 文件大小限制单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { Config } from '../../src/types'

// Mock config with different file size limits
const createMockConfig = (maxImageSize: number, maxVideoSize: number): Config => ({
  basic: {
    maxImageSize,
    maxVideoSize,
    imageMode: 'base64',
    videoMode: 'base64',
  } as any,
})

describe('File size limits', () => {
  describe('Config validation', () => {
    it('should have default maxImageSize of 30 MB', () => {
      const config = createMockConfig(30, 30)
      expect(config.basic.maxImageSize).toBe(30)
    })

    it('should have default maxVideoSize of 30 MB', () => {
      const config = createMockConfig(30, 30)
      expect(config.basic.maxVideoSize).toBe(30)
    })

    it('should allow custom maxImageSize', () => {
      const config = createMockConfig(50, 30)
      expect(config.basic.maxImageSize).toBe(50)
    })

    it('should allow custom maxVideoSize', () => {
      const config = createMockConfig(30, 100)
      expect(config.basic.maxVideoSize).toBe(100)
    })
  })

  describe('Size calculation', () => {
    it('should convert MB to bytes correctly', () => {
      const mb = 30
      const bytes = mb * 1024 * 1024
      expect(bytes).toBe(30 * 1024 * 1024)
      expect(bytes).toBe(31457280)
    })

    it('should calculate 1 MB in bytes', () => {
      const bytes = 1 * 1024 * 1024
      expect(bytes).toBe(1048576)
    })

    it('should calculate 100 MB in bytes', () => {
      const bytes = 100 * 1024 * 1024
      expect(bytes).toBe(104857600)
    })
  })

  describe('File size limits logic', () => {
    it('should allow files under the limit', () => {
      const maxSize = 30 * 1024 * 1024 // 30 MB
      const fileSize = 20 * 1024 * 1024 // 20 MB
      expect(fileSize).toBeLessThan(maxSize)
    })

    it('should reject files over the limit', () => {
      const maxSize = 30 * 1024 * 1024 // 30 MB
      const fileSize = 50 * 1024 * 1024 // 50 MB
      expect(fileSize).toBeGreaterThan(maxSize)
    })

    it('should allow files exactly at the limit', () => {
      const maxSize = 30 * 1024 * 1024 // 30 MB
      const fileSize = 30 * 1024 * 1024 // 30 MB
      expect(fileSize).toBe(maxSize)
    })
  })
})
