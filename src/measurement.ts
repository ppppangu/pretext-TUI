import type { TerminalWidthProfileInput } from './terminal-width-profile.js'
import {
  getTerminalWidthProfileCacheKey,
  resolveTerminalWidthProfile,
  type TerminalWidthProfile,
} from './terminal-width-profile.js'
import {
  clearTerminalStringWidthCaches,
  terminalBreakableFitAdvances,
  terminalSegmentMetrics,
  type TerminalSegmentMetrics,
} from './terminal-string-width.js'

export type BreakableFitMode = 'sum-graphemes' | 'segment-prefixes' | 'pair-context'

export type SegmentMetrics = TerminalSegmentMetrics & {
  breakableFitMode?: BreakableFitMode
  breakableFitAdvances?: number[] | null
}

const segmentMetricCaches = new Map<string, Map<string, SegmentMetrics>>()
const segmentMetricCacheProfiles = new WeakMap<Map<string, SegmentMetrics>, TerminalWidthProfile>()

function cacheKeyFor(input?: TerminalWidthProfileInput): string {
  return getTerminalWidthProfileCacheKey(resolveTerminalWidthProfile(input))
}

export function getSegmentMetricCache(input?: TerminalWidthProfileInput): Map<string, SegmentMetrics> {
  const key = cacheKeyFor(input)
  let cache = segmentMetricCaches.get(key)
  if (!cache) {
    cache = new Map()
    segmentMetricCaches.set(key, cache)
    segmentMetricCacheProfiles.set(cache, resolveTerminalWidthProfile(input))
  }
  return cache
}

export function getSegmentMetrics(seg: string, cache: Map<string, SegmentMetrics>): SegmentMetrics {
  let metrics = cache.get(seg)
  if (metrics === undefined) {
    metrics = terminalSegmentMetrics(seg, segmentMetricCacheProfiles.get(cache))
    cache.set(seg, metrics)
  }
  return metrics
}

export function getCorrectedSegmentWidth(
  _seg: string,
  metrics: SegmentMetrics,
  _emojiCorrection: number,
): number {
  return metrics.width
}

export function getSegmentGraphemeWidths(
  seg: string,
  _cache: Map<string, SegmentMetrics>,
  _emojiCorrection: number,
): number[] | null {
  return terminalBreakableFitAdvances(seg)
}

export function getSegmentBreakableFitAdvances(
  seg: string,
  metrics: SegmentMetrics,
  _cache: Map<string, SegmentMetrics>,
  _emojiCorrection: number,
  mode: BreakableFitMode,
): number[] | null {
  if (metrics.breakableFitAdvances !== undefined && metrics.breakableFitMode === mode) {
    return metrics.breakableFitAdvances
  }
  metrics.breakableFitMode = mode
  metrics.breakableFitAdvances = terminalBreakableFitAdvances(seg, segmentMetricCacheProfiles.get(_cache))
  return metrics.breakableFitAdvances
}

export function getTerminalMeasurementState(input?: TerminalWidthProfileInput): {
  cache: Map<string, SegmentMetrics>
  emojiCorrection: 0
  profile: TerminalWidthProfile
} {
  const profile = resolveTerminalWidthProfile(input)
  return {
    cache: getSegmentMetricCache(profile),
    emojiCorrection: 0,
    profile,
  }
}

export function getFontMeasurementState(_font: string): {
  cache: Map<string, SegmentMetrics>
  fontSize: number
  emojiCorrection: 0
} {
  return {
    cache: getSegmentMetricCache(),
    fontSize: 1,
    emojiCorrection: 0,
  }
}

export function textMayContainEmoji(text: string): boolean {
  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u.test(text)
}

export function clearMeasurementCaches(): void {
  segmentMetricCaches.clear()
  clearTerminalStringWidthCaches()
}
