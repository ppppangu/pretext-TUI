// 补建说明：该文件为后续补建，用于定义 pretext-TUI 的终端 cell 宽度 profile 与 cache identity；当前进度：Task 3 首版，提供默认 profile 和显式覆盖入口。
export type AmbiguousWidthPolicy = 'narrow' | 'wide'
export type EmojiWidthPolicy = 'presentation-wide' | 'wide' | 'narrow'
export type RegionalIndicatorPolicy =
  | 'flag-pair-wide-single-wide'
  | 'flag-pair-wide-single-narrow'
export type ControlCharPolicy = 'reject' | 'zero-width' | 'replacement'

// 宿主宽度能力：将一个已净化的可见 grapheme cluster 计为整数终端 cell 宽度。
// Host width capability: price one sanitized visible grapheme cluster in integer
// terminal cells. The host injects its own terminal-tuned width truth so the engine
// reproduces it exactly. See createInjectedTerminalWidthProfile and
// docs/contracts/host-integration.md. The function only ever sees plain visible
// clusters — the control/bidi gate runs first.
export type TerminalGraphemeWidthFn = (grapheme: string) => number

export type InjectedTerminalWidthProfileInput = Readonly<{
  // Stable cache identity. MUST change whenever graphemeWidth behavior changes
  // (e.g. encode the host runtime / table version). Must not contain ';'.
  id: string
  graphemeWidth: TerminalGraphemeWidthFn
  controlChars?: ControlCharPolicy
  defaultTabSize?: number
}>

export type TerminalWidthProfile = Readonly<{
  kind: 'terminal-width-profile'
  name: string
  version: number | string
  unicodeVersion: string
  ambiguousWidth: AmbiguousWidthPolicy
  emojiWidth: EmojiWidthPolicy
  regionalIndicator: RegionalIndicatorPolicy
  controlChars: ControlCharPolicy
  ansiMode: 'plain-reject'
  defaultTabSize: number
  cacheKey: string
  // Present only for host-injected profiles. When set it overrides ALL built-in
  // width classification (combining / RI / emoji / wide / ambiguous) but never the
  // control/bidi safety gate, which runs first.
  graphemeWidth?: TerminalGraphemeWidthFn
}>

export type TerminalWidthProfileInput =
  | 'terminal-unicode-narrow@1'
  | Partial<Omit<TerminalWidthProfile, 'kind' | 'name' | 'version' | 'unicodeVersion' | 'cacheKey' | 'graphemeWidth'>>
  | TerminalWidthProfile
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

// Cache identity must follow the function's IDENTITY, not just `id`: two profiles
// with the same `id` but different functions would otherwise share — and poison —
// the engine's per-cacheKey width caches. `id` stays the human-readable / forced-
// invalidation handle; this per-function nonce is the safety net.
const injectedWidthFnNonces = new WeakMap<TerminalGraphemeWidthFn, number>()
let injectedWidthFnCounter = 0
function injectedWidthFnNonce(fn: TerminalGraphemeWidthFn): number {
  let nonce = injectedWidthFnNonces.get(fn)
  if (nonce === undefined) {
    nonce = ++injectedWidthFnCounter
    injectedWidthFnNonces.set(fn, nonce)
  }
  return nonce
}

// Build a host-injected width profile. The host supplies a per-grapheme width
// function (its own terminal-tuned truth) plus a stable `id` for cache identity.
// The resulting profile flows through `widthProfile` like any other; resolution
// passes it through unchanged so cache identity follows the `id` + function identity.
export function createInjectedTerminalWidthProfile(
  input: InjectedTerminalWidthProfileInput,
): TerminalWidthProfile {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new Error('Injected terminal width profile requires a non-empty id')
  }
  if (input.id.includes(';')) {
    throw new Error(`Injected terminal width profile id must not contain ';', got ${JSON.stringify(input.id)}`)
  }
  if (typeof input.graphemeWidth !== 'function') {
    throw new Error('Injected terminal width profile requires a graphemeWidth function')
  }
  const controlChars: ControlCharPolicy = input.controlChars ?? 'reject'
  const defaultTabSize = input.defaultTabSize ?? 8
  if (!Number.isInteger(defaultTabSize) || defaultTabSize <= 0) {
    throw new Error(`Injected terminal width profile tab size must be a positive integer, got ${defaultTabSize}`)
  }
  const profile = {
    kind: 'terminal-width-profile',
    name: 'terminal-injected',
    version: 1,
    unicodeVersion: 'host',
    // Enum policy fields are inert while graphemeWidth is present; record neutral defaults.
    ambiguousWidth: 'narrow',
    emojiWidth: 'presentation-wide',
    regionalIndicator: 'flag-pair-wide-single-wide',
    controlChars,
    ansiMode: 'plain-reject',
    defaultTabSize,
    graphemeWidth: input.graphemeWidth,
  } as const

  return Object.freeze({
    ...profile,
    cacheKey: [
      'terminal-width-profile',
      `name=${profile.name}@${profile.version}`,
      `id=${input.id}`,
      `fn=${injectedWidthFnNonce(input.graphemeWidth)}`,
      `controls=${profile.controlChars}`,
      `ansi=${profile.ansiMode}`,
      `tabDefault=${profile.defaultTabSize}`,
    ].join(';'),
  })
}

export function resolveTerminalWidthProfile(
  input?: TerminalWidthProfileInput,
): TerminalWidthProfile {
  if (input === undefined || input === 'terminal-unicode-narrow@1') {
    return TERMINAL_UNICODE_NARROW_PROFILE
  }
  // Resolution must be idempotent: already-resolved profiles are value-complete,
  // so rebuilding them per call would only churn allocations without changing
  // any field or the derived cacheKey.
  if (
    (input as { kind?: unknown }).kind === 'terminal-width-profile' &&
    typeof (input as { cacheKey?: unknown }).cacheKey === 'string'
  ) {
    return input as TerminalWidthProfile
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
