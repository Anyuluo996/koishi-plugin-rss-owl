import { BasicConfig, Config, rssArg } from '../types'

export type ResendUpdatedContentMode = NonNullable<BasicConfig['resendUpdatedContent'] | BasicConfig['resendUpdataContent']>

type BasicAliasShape = Partial<BasicConfig> & Record<string, any>
type ArgAliasShape = Partial<rssArg> & Record<string, any>

export function normalizeBasicConfig<T extends BasicAliasShape | undefined>(basic?: T): T & BasicAliasShape {
  const normalized = { ...(basic || {}) } as BasicAliasShape
  // 读取归一：typo（旧拼写）优先。理由——schema 会为声明的规范名注入默认值
  // （如 mergeVideo:false），若用 `correct ?? typo` 会被默认值短路，吞掉老用户
  // 真实意图（margeVideo:true）。typo 存在则必来自历史用户数据，应优先采纳。
  // 写入仍双写两个键（保持运行时兼容，下游直接读 margeVideo 仍可拿到值）。
  const mergeVideo = normalized.margeVideo ?? normalized.mergeVideo
  const resendUpdatedContent = normalized.resendUpdataContent ?? normalized.resendUpdatedContent

  if (mergeVideo !== undefined) {
    normalized.mergeVideo = mergeVideo
    normalized.margeVideo = mergeVideo
  }

  if (resendUpdatedContent !== undefined) {
    normalized.resendUpdatedContent = resendUpdatedContent
    normalized.resendUpdataContent = resendUpdatedContent
  }

  return normalized as T & BasicAliasShape
}

export function normalizeSubscriptionArg<T extends ArgAliasShape | undefined>(arg?: T): T & ArgAliasShape {
  const normalized = { ...(arg || {}) } as ArgAliasShape
  const nextUpdateTime = getNextUpdateTime(normalized)

  if (nextUpdateTime !== undefined) {
    setNextUpdateTime(normalized, nextUpdateTime)
  }

  return normalized as T & ArgAliasShape
}

export function getRuntimeBasicConfig(config: Config): BasicAliasShape {
  return normalizeBasicConfig(config.basic)
}

export function getResendUpdatedContent(config: Config): ResendUpdatedContentMode {
  const basic = getRuntimeBasicConfig(config)
  return basic.resendUpdatedContent ?? 'disable'
}

export function shouldMergeVideo(config: Config): boolean {
  const basic = getRuntimeBasicConfig(config)
  return basic.mergeVideo === true
}

export function getNextUpdateTime(arg?: ArgAliasShape): number | undefined {
  const value = arg?.nextUpdateTime ?? arg?.nextUpdataTime
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function setNextUpdateTime(target: ArgAliasShape, nextUpdateTime?: number): void {
  if (nextUpdateTime === undefined) {
    // 清理时双删：删规范名的同时顺手清掉残留的旧拼写名（老数据可能仍有）
    delete target.nextUpdateTime
    delete target.nextUpdataTime
    return
  }

  // 只写规范名：不再回写 nextUpdataTime，让旧拼写从数据中自然淘汰。
  // 读取侧 getNextUpdateTime 已用 `nextUpdateTime ?? nextUpdataTime` 兜底老数据。
  target.nextUpdateTime = nextUpdateTime
}