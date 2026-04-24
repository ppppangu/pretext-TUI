// 补建说明：该文件为后续补建，用于提供无浏览器依赖的终端 cell 字符宽度计算；当前进度：Task 3 首版，覆盖核心 Unicode/CJK/emoji/control 宽度规则。
import {
  resolveTerminalWidthProfile,
  type TerminalWidthProfile,
  type TerminalWidthProfileInput,
} from './terminal-width-profile.js'
import { isTerminalBidiFormatControlCodePoint } from './terminal-control-policy.js'

export type TerminalSegmentMetrics = {
  width: number
  containsCJK: boolean
}

let sharedGraphemeSegmenter: Intl.Segmenter | null = null
const graphemeWidthCaches = new Map<string, Map<string, number>>()
const segmentMetricCaches = new Map<string, Map<string, TerminalSegmentMetrics>>()
const breakableAdvanceCaches = new Map<string, Map<string, number[] | null>>()

function getSharedGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

function cacheFor<T>(store: Map<string, Map<string, T>>, key: string): Map<string, T> {
  let cache = store.get(key)
  if (cache === undefined) {
    cache = new Map<string, T>()
    store.set(key, cache)
  }
  return cache
}

function firstCodePoint(s: string): number {
  return s.codePointAt(0) ?? 0
}

function eachCodePoint(s: string): number[] {
  const points: number[] = []
  for (const char of s) points.push(char.codePointAt(0)!)
  return points
}

function isControlCodePoint(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)
}

function isCombiningOrZeroWidth(cp: number): boolean {
  return (
    cp === 0x00ad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x180e ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x0483 && cp <= 0x0489) ||
    (cp >= 0x0591 && cp <= 0x05bd) ||
    cp === 0x05bf ||
    (cp >= 0x05c1 && cp <= 0x05c2) ||
    (cp >= 0x05c4 && cp <= 0x05c5) ||
    cp === 0x05c7 ||
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dd) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    (cp >= 0x06e7 && cp <= 0x06e8) ||
    (cp >= 0x06ea && cp <= 0x06ed) ||
    cp === 0x0711 ||
    (cp >= 0x0730 && cp <= 0x074a) ||
    (cp >= 0x07a6 && cp <= 0x07b0) ||
    (cp >= 0x07eb && cp <= 0x07f3) ||
    (cp >= 0x0816 && cp <= 0x0819) ||
    (cp >= 0x081b && cp <= 0x0823) ||
    (cp >= 0x0825 && cp <= 0x0827) ||
    (cp >= 0x0829 && cp <= 0x082d) ||
    (cp >= 0x0859 && cp <= 0x085b) ||
    (cp >= 0x08d3 && cp <= 0x08e1) ||
    (cp >= 0x08e3 && cp <= 0x0902) ||
    cp === 0x093a ||
    cp === 0x093c ||
    (cp >= 0x0941 && cp <= 0x0948) ||
    cp === 0x094d ||
    (cp >= 0x0951 && cp <= 0x0957) ||
    (cp >= 0x0962 && cp <= 0x0963) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  )
}

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

function isAmbiguousCodePoint(cp: number): boolean {
  return (
    cp === 0x00a1 ||
    cp === 0x00a4 ||
    (cp >= 0x00a7 && cp <= 0x00a8) ||
    cp === 0x00aa ||
    (cp >= 0x00ad && cp <= 0x00ae) ||
    (cp >= 0x00b0 && cp <= 0x00b4) ||
    (cp >= 0x00b6 && cp <= 0x00ba) ||
    (cp >= 0x00bc && cp <= 0x00bf) ||
    cp === 0x00c6 ||
    cp === 0x00d0 ||
    (cp >= 0x00d7 && cp <= 0x00d8) ||
    (cp >= 0x00de && cp <= 0x00e1) ||
    cp === 0x00e6 ||
    (cp >= 0x00e8 && cp <= 0x00ea) ||
    (cp >= 0x00ec && cp <= 0x00ed) ||
    cp === 0x00f0 ||
    (cp >= 0x00f2 && cp <= 0x00f3) ||
    (cp >= 0x00f7 && cp <= 0x00fa) ||
    cp === 0x00fc ||
    cp === 0x00fe ||
    cp === 0x0101 ||
    cp === 0x0111 ||
    cp === 0x0113 ||
    cp === 0x011b ||
    (cp >= 0x0126 && cp <= 0x0127) ||
    cp === 0x012b ||
    (cp >= 0x0131 && cp <= 0x0133) ||
    cp === 0x0138 ||
    (cp >= 0x013f && cp <= 0x0142) ||
    cp === 0x0144 ||
    (cp >= 0x0148 && cp <= 0x014b) ||
    cp === 0x014d ||
    (cp >= 0x0152 && cp <= 0x0153) ||
    (cp >= 0x0166 && cp <= 0x0167) ||
    cp === 0x016b ||
    cp === 0x01ce ||
    cp === 0x01d0 ||
    cp === 0x01d2 ||
    cp === 0x01d4 ||
    cp === 0x01d6 ||
    cp === 0x01d8 ||
    cp === 0x01da ||
    cp === 0x01dc ||
    cp === 0x0251 ||
    cp === 0x0261 ||
    cp === 0x02c4 ||
    cp === 0x02c7 ||
    (cp >= 0x02c9 && cp <= 0x02cb) ||
    cp === 0x02cd ||
    cp === 0x02d0 ||
    (cp >= 0x02d8 && cp <= 0x02db) ||
    cp === 0x02dd ||
    cp === 0x02df ||
    (cp >= 0x0391 && cp <= 0x03a1) ||
    (cp >= 0x03a3 && cp <= 0x03a9) ||
    (cp >= 0x03b1 && cp <= 0x03c1) ||
    (cp >= 0x03c3 && cp <= 0x03c9) ||
    (cp >= 0x2500 && cp <= 0x259f) ||
    (cp >= 0x25a0 && cp <= 0x25ff) ||
    (cp >= 0x2600 && cp <= 0x27bf)
  )
}

function isEmojiLikeGrapheme(grapheme: string): boolean {
  const hasEmojiBase =
    /\p{Emoji_Presentation}/u.test(grapheme) ||
    /\p{Extended_Pictographic}/u.test(grapheme) ||
    /^\p{Regional_Indicator}{2}$/u.test(grapheme) ||
    /^[0-9#*]\uFE0F?\u20E3$/u.test(grapheme)
  if (
    grapheme.includes('\uFE0E') &&
    !grapheme.includes('\uFE0F') &&
    !grapheme.includes('\u200D')
  ) {
    return false
  }
  return (
    hasEmojiBase ||
    (grapheme.includes('\uFE0F') && hasEmojiBase) ||
    (grapheme.includes('\u200D') && hasEmojiBase)
  )
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

function handleControlWidth(cp: number, profile: TerminalWidthProfile): number {
  if (profile.controlChars === 'zero-width') return 0
  if (profile.controlChars === 'replacement') return 1
  throw new Error(`Control character U+${cp.toString(16).toUpperCase()} is not valid visible terminal text`)
}

export function terminalGraphemeWidth(
  grapheme: string,
  input?: TerminalWidthProfileInput,
): number {
  const profile = resolveTerminalWidthProfile(input)
  const cache = cacheFor(graphemeWidthCaches, profile.cacheKey)
  const cached = cache.get(grapheme)
  if (cached !== undefined) return cached

  const points = eachCodePoint(grapheme)
  let width: number
  if (points.length === 0) {
    width = 0
  } else if (points.some(isControlCodePoint)) {
    width = handleControlWidth(points.find(isControlCodePoint)!, profile)
  } else if (points.some(isTerminalBidiFormatControlCodePoint)) {
    throw new Error('Bidi format control is not valid visible terminal text')
  } else if (points.every(isCombiningOrZeroWidth)) {
    width = 0
  } else if (points.every(isRegionalIndicator)) {
    width = points.length >= 2 || profile.regionalIndicator === 'flag-pair-wide-single-wide'
      ? 2
      : 1
  } else if (isEmojiLikeGrapheme(grapheme)) {
    width = profile.emojiWidth === 'narrow' ? 1 : 2
  } else {
    const first = firstCodePoint(grapheme)
    if (isWideCodePoint(first)) {
      width = 2
    } else if (profile.ambiguousWidth === 'wide' && isAmbiguousCodePoint(first)) {
      width = 2
    } else {
      width = 1
    }
  }

  cache.set(grapheme, width)
  return width
}

export function terminalGraphemeWidths(
  text: string,
  input?: TerminalWidthProfileInput,
): number[] | null {
  const widths: number[] = []
  const segmenter = getSharedGraphemeSegmenter()
  for (const { segment } of segmenter.segment(text)) {
    widths.push(terminalGraphemeWidth(segment, input))
  }
  return widths.length > 1 ? widths : null
}

export function terminalStringWidth(
  text: string,
  input?: TerminalWidthProfileInput,
): number {
  let width = 0
  const segmenter = getSharedGraphemeSegmenter()
  for (const { segment } of segmenter.segment(text)) {
    width += terminalGraphemeWidth(segment, input)
  }
  return width
}

export function terminalSegmentMetrics(
  text: string,
  input?: TerminalWidthProfileInput,
): TerminalSegmentMetrics {
  const profile = resolveTerminalWidthProfile(input)
  const cache = cacheFor(segmentMetricCaches, profile.cacheKey)
  const cached = cache.get(text)
  if (cached !== undefined) return cached

  let containsCJK = false
  for (const char of text) {
    if (isWideCodePoint(char.codePointAt(0)!)) {
      containsCJK = true
      break
    }
  }
  const metrics = {
    width: terminalStringWidth(text, profile),
    containsCJK,
  }
  cache.set(text, metrics)
  return metrics
}

export function terminalBreakableFitAdvances(
  text: string,
  input?: TerminalWidthProfileInput,
): number[] | null {
  const profile = resolveTerminalWidthProfile(input)
  const cache = cacheFor(breakableAdvanceCaches, profile.cacheKey)
  const cached = cache.get(text)
  if (cached !== undefined) return cached

  const advances = terminalGraphemeWidths(text, profile)
  cache.set(text, advances)
  return advances
}

export function terminalTabAdvance(currentColumn: number, tabSize: number): number {
  if (!Number.isInteger(currentColumn) || currentColumn < 0) {
    throw new Error(`Terminal tab current column must be a non-negative integer, got ${currentColumn}`)
  }
  if (!Number.isInteger(tabSize) || tabSize <= 0) {
    throw new Error(`Terminal tab size must be a positive integer, got ${tabSize}`)
  }
  const remainder = currentColumn % tabSize
  return remainder === 0 ? tabSize : tabSize - remainder
}

export function clearTerminalStringWidthCaches(): void {
  graphemeWidthCaches.clear()
  segmentMetricCaches.clear()
  breakableAdvanceCaches.clear()
  sharedGraphemeSegmenter = null
}
