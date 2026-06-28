// ESLint flat config (eslint 9 + typescript-eslint 8)
//
// 设计取向：温和、抓真问题。不做激进风格强制（不强制引号/分号/缩进），
// 避免一次性引入大量噪音。重点放在：未使用变量、隐式 any、类型错误倾向、
// 以及明显的 bug 模式（如 await 遗漏）。

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  // 基础推荐规则
  js.configs.recommended,
  // TypeScript 推荐规则（type-aware 关掉以保速度，纯语法规则为主）
  ...tseslint.configs.recommended,

  // 全局忽略
  {
    ignores: [
      'lib/**',          // 编译产物
      'node_modules/**',
      'coverage/**',
      'external/**',     // 外部子项目
      'tests/manual/**', // 手工测试，不作回归信号（CLAUDE.md 规范）
      '*.js',            // 配置文件本身（jest.config / eslint.config）
    ],
  },

  // 项目源码与测试
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // === 温和化：关闭噪音规则 ===
      '@typescript-eslint/no-explicit-any': 'off',        // 项目历史代码大量用 any，先不强制
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',     // 项目有合法 require（ts-node 节点场景）
      'no-undef': 'off',                                   // TS 文件由 tsc 负责未定义检查，no-undef 对 Node globals 误报
      'no-useless-escape': 'off',                          // 正则转义风格偏好，误报多于真问题，逐处改正则风险大
      '@typescript-eslint/no-non-null-assertion': 'off',   // ! 是 TS 合理特性（开发者确信非空时用）；强行改 24 处分散代码会引入行为变化（?. 静默返回 undefined 反而难查 bug），收益 < 风险
      'no-empty': ['error', { allowEmptyCatch: true }],

      // === 抓真问题 ===
      'no-unused-private-class-members': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],  // 允许 warn/error，普通 log 提醒
    },
  },

  // 测试文件放宽
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
