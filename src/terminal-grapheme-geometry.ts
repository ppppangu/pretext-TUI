// 补建说明：该文件为后续补建，用于提供 prepared terminal segment 的内部 grapheme/source geometry sidecar；当前进度：Batch 6A.2 改为由 PreparedTerminalReader 驱动，统一缓存 UTF-16 grapheme 边界与非动态 cell width 前缀。
import type { SegmentBreakKind } from './analysis.js'
import type { LayoutCursor } from './layout.js'
import type { PreparedTerminalReader } from './terminal-prepared-reader.js'
import { terminalGraphemeWidth } from './terminal-string-width.js'
import {
  recordTerminalPerformanceCounter,
} from './terminal-performance-counters.js'

export type TerminalSegmentGeometry = Readonly<{
  cellWidthPrefixes: readonly number[] | null
  cellWidths: readonly number[] | null
  graphemes: readonly string[]
  localSourceOffsets: readonly number[]
}>

export type PreparedTerminalGeometry = {
  readonly reader: PreparedTerminalReader
  readonly segmentGeometries: Array<TerminalSegmentGeometry | undefined>
}

let sharedGraphemeSegmenter: Intl.Segmenter | null = null

export function createPreparedTerminalGeometry(
  reader: PreparedTerminalReader,
): PreparedTerminalGeometry {
  recordTerminalPerformanceCounter('preparedGeometryBuilds')
  return {
    reader,
    segmentGeometries: Array.from({ length: reader.segmentCount }),
  }
}

export function getTerminalSegmentGeometry(
  geometry: PreparedTerminalGeometry,
  segmentIndex: number,
): TerminalSegmentGeometry {
  const cached = geometry.segmentGeometries[segmentIndex]
  if (cached !== undefined) {
    recordTerminalPerformanceCounter('preparedGeometryCacheHits')
    return cached
  }

  const segment = geometry.reader.segmentText(segmentIndex)
  if (segment === undefined) {
    throw new Error(`Terminal segment geometry index out of range: ${segmentIndex}`)
  }

  const graphemes: string[] = []
  const localSourceOffsets = [0]
  let localOffset = 0
  for (const { segment: grapheme } of graphemeSegmenter().segment(segment)) {
    graphemes.push(grapheme)
    localOffset += grapheme.length
    localSourceOffsets.push(localOffset)
  }
  if (localSourceOffsets[localSourceOffsets.length - 1] !== segment.length) {
    localSourceOffsets.push(segment.length)
  }

  const kind = geometry.reader.segmentKind(segmentIndex)
  const cellWidths = shouldMeasurePreparedGraphemeWidths(kind)
    ? graphemes.map(grapheme => terminalGraphemeWidth(grapheme, geometry.reader.widthProfile))
    : null
  const widthPrefixes = cellWidths === null ? null : [0]
  if (cellWidths !== null && widthPrefixes !== null) {
    let width = 0
    for (const item of cellWidths) {
      width += item
      widthPrefixes.push(width)
    }
  }

  const built = Object.freeze({
    cellWidthPrefixes: widthPrefixes === null ? null : Object.freeze(widthPrefixes),
    cellWidths: cellWidths === null ? null : Object.freeze(cellWidths),
    graphemes: Object.freeze(graphemes),
    localSourceOffsets: Object.freeze(localSourceOffsets),
  })
  geometry.segmentGeometries[segmentIndex] = built
  recordTerminalPerformanceCounter('preparedGeometrySegments')
  recordTerminalPerformanceCounter('preparedGeometryGraphemes', graphemes.length)
  return built
}

export function getTerminalSegmentGraphemeCount(
  geometry: PreparedTerminalGeometry,
  segmentIndex: number,
): number {
  return getTerminalSegmentGeometry(geometry, segmentIndex).graphemes.length
}

export function getTerminalSegmentGrapheme(
  geometry: PreparedTerminalGeometry,
  segmentIndex: number,
  graphemeIndex: number,
): string {
  const segment = getTerminalSegmentGeometry(geometry, segmentIndex)
  const grapheme = segment.graphemes[graphemeIndex]
  if (grapheme === undefined) {
    throw new Error(`Terminal grapheme index out of range: ${segmentIndex}:${graphemeIndex}`)
  }
  return grapheme
}

export function getTerminalSegmentWidthAt(
  geometry: PreparedTerminalGeometry,
  segmentIndex: number,
  graphemeIndex: number,
): number | null {
  const segment = getTerminalSegmentGeometry(geometry, segmentIndex)
  const width = segment.cellWidths?.[graphemeIndex]
  return width ?? null
}

export function getTerminalSegmentWidthRange(
  geometry: PreparedTerminalGeometry,
  segmentIndex: number,
  startGraphemeIndex: number,
  endGraphemeIndex: number,
): number | null {
  const segment = getTerminalSegmentGeometry(geometry, segmentIndex)
  if (segment.cellWidthPrefixes === null) {
    recordTerminalPerformanceCounter('preparedGeometryWidthPrefixFallbacks')
    return null
  }
  const start = clampGraphemeIndex(startGraphemeIndex, segment.graphemes.length)
  const end = clampGraphemeIndex(endGraphemeIndex, segment.graphemes.length)
  recordTerminalPerformanceCounter('preparedGeometryWidthPrefixHits')
  return segment.cellWidthPrefixes[end]! - segment.cellWidthPrefixes[start]!
}

export function getTerminalCursorSourceOffset(
  geometry: PreparedTerminalGeometry,
  cursor: LayoutCursor,
): number {
  const reader = geometry.reader
  if (cursor.segmentIndex >= reader.segmentCount) return reader.sourceLength
  const segmentStart = reader.segmentSourceStart(cursor.segmentIndex)
  if (cursor.graphemeIndex <= 0) return segmentStart
  const segment = getTerminalSegmentGeometry(geometry, cursor.segmentIndex)
  const localOffset = segment.localSourceOffsets[cursor.graphemeIndex] ?? segment.localSourceOffsets[segment.localSourceOffsets.length - 1] ?? 0
  return Math.min(reader.sourceLength, segmentStart + localOffset)
}

function shouldMeasurePreparedGraphemeWidths(kind: SegmentBreakKind | undefined): boolean {
  return kind !== 'hard-break' && kind !== 'soft-hyphen' && kind !== 'tab' && kind !== 'zero-width-break'
}

function clampGraphemeIndex(value: number, max: number): number {
  if (value <= 0) return 0
  if (value >= max) return max
  return value
}

function graphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}
