import type { TerminalWidthProfileInput } from '../unicode/terminal-width-profile.js'
import {
  resolveTerminalWidthProfile,
  type TerminalWidthProfile,
} from '../unicode/terminal-width-profile.js'
import {
  clearTerminalStringWidthCaches,
  terminalBreakableFitAdvances,
  terminalSegmentMetrics,
  type TerminalSegmentMetrics,
} from '../unicode/terminal-string-width.js'

export type BreakableFitMode = 'sum-graphemes' | 'segment-prefixes' | 'pair-context'

export type SegmentMetrics = TerminalSegmentMetrics & {
  breakableFitMode?: BreakableFitMode
  breakableFitAdvances?: number[] | null
}

const segmentMetricCaches = new Map<string, Map<string, SegmentMetrics>>()
const segmentMetricCacheProfiles = new WeakMap<Map<string, SegmentMetrics>, TerminalWidthProfile>()

export function getSegmentMetricCache(input?: TerminalWidthProfileInput): Map<string, SegmentMetrics> {
  const profile = resolveTerminalWidthProfile(input)
  let cache = segmentMetricCaches.get(profile.cacheKey)
  if (!cache) {
    cache = new Map()
    segmentMetricCaches.set(profile.cacheKey, cache)
    segmentMetricCacheProfiles.set(cache, profile)
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

export function getSegmentBreakableFitAdvances(
  seg: string,
  metrics: SegmentMetrics,
  cache: Map<string, SegmentMetrics>,
  mode: BreakableFitMode,
): number[] | null {
  if (metrics.breakableFitAdvances !== undefined && metrics.breakableFitMode === mode) {
    return metrics.breakableFitAdvances
  }
  metrics.breakableFitMode = mode
  metrics.breakableFitAdvances = terminalBreakableFitAdvances(seg, segmentMetricCacheProfiles.get(cache))
  return metrics.breakableFitAdvances
}

export function getTerminalMeasurementState(input?: TerminalWidthProfileInput): {
  cache: Map<string, SegmentMetrics>
  profile: TerminalWidthProfile
} {
  const profile = resolveTerminalWidthProfile(input)
  return {
    cache: getSegmentMetricCache(profile),
    profile,
  }
}

export function clearMeasurementCaches(): void {
  segmentMetricCaches.clear()
  clearTerminalStringWidthCaches()
}
