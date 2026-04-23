// 补建说明：该文件为后续补建，用于定义 pretext-TUI 的终端 cell 宽度 profile 与 cache identity；当前进度：Task 3 首版，提供默认 profile 和显式覆盖入口。
export type AmbiguousWidthPolicy = 'narrow' | 'wide'
export type EmojiWidthPolicy = 'presentation-wide' | 'wide' | 'narrow'
export type RegionalIndicatorPolicy =
  | 'flag-pair-wide-single-wide'
  | 'flag-pair-wide-single-narrow'
export type ControlCharPolicy = 'reject' | 'zero-width' | 'replacement'

export type TerminalWidthProfile = Readonly<{
  kind: 'terminal-width-profile'
  name: 'terminal-unicode-narrow'
  version: 1
  unicodeVersion: '17.0.0'
  ambiguousWidth: AmbiguousWidthPolicy
  emojiWidth: EmojiWidthPolicy
  regionalIndicator: RegionalIndicatorPolicy
  controlChars: ControlCharPolicy
  ansiMode: 'plain-reject'
  defaultTabSize: number
  cacheKey: string
}>

export type TerminalWidthProfileInput =
  | 'terminal-unicode-narrow@1'
  | Partial<Omit<TerminalWidthProfile, 'kind' | 'name' | 'version' | 'unicodeVersion' | 'cacheKey'>>
  | undefined

function createProfile(
  overrides: Partial<Omit<TerminalWidthProfile, 'kind' | 'name' | 'version' | 'unicodeVersion' | 'cacheKey'>> = {},
): TerminalWidthProfile {
  const profile = {
    kind: 'terminal-width-profile',
    name: 'terminal-unicode-narrow',
    version: 1,
    unicodeVersion: '17.0.0',
    ambiguousWidth: overrides.ambiguousWidth ?? 'narrow',
    emojiWidth: overrides.emojiWidth ?? 'presentation-wide',
    regionalIndicator: overrides.regionalIndicator ?? 'flag-pair-wide-single-wide',
    controlChars: overrides.controlChars ?? 'reject',
    ansiMode: 'plain-reject',
    defaultTabSize: overrides.defaultTabSize ?? 8,
  } as const

  return Object.freeze({
    ...profile,
    cacheKey: [
      'terminal-width-profile',
      `name=${profile.name}@${profile.version}`,
      `unicode=${profile.unicodeVersion}`,
      `ambiguous=${profile.ambiguousWidth}`,
      `emoji=${profile.emojiWidth}`,
      `ri=${profile.regionalIndicator}`,
      `controls=${profile.controlChars}`,
      `ansi=${profile.ansiMode}`,
      `tabDefault=${profile.defaultTabSize}`,
    ].join(';'),
  })
}

export const TERMINAL_UNICODE_NARROW_PROFILE: TerminalWidthProfile = createProfile()

export function resolveTerminalWidthProfile(
  input?: TerminalWidthProfileInput,
): TerminalWidthProfile {
  if (input === undefined || input === 'terminal-unicode-narrow@1') {
    return TERMINAL_UNICODE_NARROW_PROFILE
  }
  return createProfile(input)
}

export function getTerminalWidthProfileCacheKey(
  profile: TerminalWidthProfile,
): string {
  return profile.cacheKey
}

export function normalizeTerminalTabSize(
  tabSize: number | undefined,
  profile: TerminalWidthProfile = TERMINAL_UNICODE_NARROW_PROFILE,
): number {
  const value = tabSize ?? profile.defaultTabSize
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Terminal tab size must be a positive integer, got ${value}`)
  }
  return value
}
