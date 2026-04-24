// 补建说明：该文件为后续补建，用于提供 terminal text kernel 的显式验证 instrumentation；当前进度：Task 5B 修订为默认关闭，仅供测试/benchmark 主动启用，不进入公共 API。
export type TerminalPerformanceCounterName =
  | 'lineTextGraphemeSegmentations'
  | 'preparedGeometryBuilds'
  | 'preparedGeometryCacheHits'
  | 'preparedGeometryGraphemes'
  | 'preparedGeometrySegments'
  | 'preparedGeometryWidthPrefixFallbacks'
  | 'preparedGeometryWidthPrefixHits'
  | 'richBoundaryGraphemeSegmentations'
  | 'richFragmentGraphemeSegmentations'
  | 'richFragmentWidthMeasurements'
  | 'terminalMaterializeGraphemeSegmentations'

export type TerminalPerformanceCounterSnapshot = Readonly<Record<TerminalPerformanceCounterName, number>>

const counterNames: readonly TerminalPerformanceCounterName[] = [
  'lineTextGraphemeSegmentations',
  'preparedGeometryBuilds',
  'preparedGeometryCacheHits',
  'preparedGeometryGraphemes',
  'preparedGeometrySegments',
  'preparedGeometryWidthPrefixFallbacks',
  'preparedGeometryWidthPrefixHits',
  'richBoundaryGraphemeSegmentations',
  'richFragmentGraphemeSegmentations',
  'richFragmentWidthMeasurements',
  'terminalMaterializeGraphemeSegmentations',
]

let activeCounters: Record<TerminalPerformanceCounterName, number> | null = null

export function disableTerminalPerformanceCounters(): void {
  activeCounters = null
}

export function resetTerminalPerformanceCounters(): void {
  activeCounters = createEmptyCounterSnapshot()
}

export function snapshotTerminalPerformanceCounters(): TerminalPerformanceCounterSnapshot {
  return Object.freeze({ ...(activeCounters ?? createEmptyCounterSnapshot()) })
}

export function recordTerminalPerformanceCounter(
  name: TerminalPerformanceCounterName,
  delta = 1,
): void {
  if (activeCounters === null) return
  activeCounters[name] += delta
}

function createEmptyCounterSnapshot(): Record<TerminalPerformanceCounterName, number> {
  return Object.fromEntries(counterNames.map(name => [name, 0])) as Record<TerminalPerformanceCounterName, number>
}
