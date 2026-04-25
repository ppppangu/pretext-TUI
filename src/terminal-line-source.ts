// 补建说明：该文件为后续补建，用于集中 terminal line 的内部 source boundary/source range materialization helper；当前进度：Batch 6A.2 将 range/source materialization helper 迁移到 PreparedTerminalReader + geometry 读取面，尚不作为公共 API 暴露。
import type {
  LayoutCursor,
  LayoutLineRange,
} from './layout.js'
import {
  getTerminalSegmentGeometry,
  getTerminalSegmentWidthAt,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'
import {
  getInternalPreparedTerminalGeometry,
  type PreparedTerminalReader,
  type PreparedTerminalText,
} from './terminal-prepared-reader.js'
import {
  terminalGraphemeWidth,
  terminalTabAdvance,
} from './terminal-string-width.js'
import type {
  TerminalCursor,
  TerminalLineRange,
} from './terminal.js'

function toLayoutCursor(cursor: TerminalCursor): LayoutCursor {
  return {
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  }
}

export function visibleStartCursorForRange(
  reader: PreparedTerminalReader,
  range: LayoutLineRange,
): LayoutCursor {
  if (range.start.graphemeIndex > 0) {
    return range.start
  }
  let segmentIndex = range.start.segmentIndex
  while (segmentIndex < range.end.segmentIndex) {
    const kind = reader.segmentKind(segmentIndex)
    if (kind !== 'space' && kind !== 'zero-width-break' && kind !== 'soft-hyphen') break
    segmentIndex++
  }
  return {
    segmentIndex,
    graphemeIndex: 0,
  }
}

function terminalExclusiveEndSegmentIndex(cursor: LayoutCursor): number {
  return cursor.graphemeIndex > 0 ? cursor.segmentIndex : cursor.segmentIndex - 1
}

export function selectedSoftHyphenSourceOffsetForRange(
  reader: PreparedTerminalReader,
  range: LayoutLineRange,
  sourceStart: number,
  sourceEnd: number,
): number | null {
  let selected: number | null = null
  const end = range.end
  const endSegmentIndex = terminalExclusiveEndSegmentIndex(end)
  for (let segmentIndex = range.start.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex < 0 || segmentIndex >= reader.segmentCount) continue
    if (reader.segmentKind(segmentIndex) !== 'soft-hyphen') continue
    const segment = reader.segmentText(segmentIndex) ?? ''
    const segmentStart = reader.segmentSourceStart(segmentIndex)
    let searchFrom = 0
    while (searchFrom < segment.length) {
      const localOffset = segment.indexOf('\u00AD', searchFrom)
      if (localOffset < 0) break
      const sourceOffset = segmentStart + localOffset
      if (sourceOffset >= sourceStart && sourceOffset < sourceEnd) {
        selected = sourceOffset
      }
      searchFrom = localOffset + 1
    }
  }
  return selected
}

export function materializePreparedTerminalSourceTextRange(
  reader: PreparedTerminalReader,
  sourceStart: number,
  sourceEnd: number,
): string {
  const clampedStart = Math.max(0, Math.min(reader.sourceLength, sourceStart))
  const clampedEnd = Math.max(clampedStart, Math.min(reader.sourceLength, sourceEnd))
  if (clampedStart === clampedEnd) return ''

  let text = ''
  for (
    let segmentIndex = firstSegmentIntersectingSourceOffset(reader, clampedStart);
    segmentIndex < reader.segmentCount;
    segmentIndex++
  ) {
    const segment = reader.segmentText(segmentIndex) ?? ''
    const segmentStart = reader.segmentSourceStart(segmentIndex)
    const segmentEnd = segmentStart + segment.length
    if (segmentEnd <= clampedStart) continue
    if (segmentStart >= clampedEnd) break
    text += segment.slice(
      Math.max(0, clampedStart - segmentStart),
      Math.min(segment.length, clampedEnd - segmentStart),
    )
  }
  return text
}

export function materializePreparedTerminalSourceRange(
  geometry: PreparedTerminalGeometry,
  line: TerminalLineRange,
  sourceStart: number,
  sourceEnd: number,
  startColumn: number,
): { text: string; width: number } {
  const reader = geometry.reader
  const visibleStart = visibleStartCursorForRange(reader, line)
  const end = toLayoutCursor(line.end)
  const endSegmentIndex = terminalExclusiveEndSegmentIndex(end)
  const clampedStart = Math.max(line.sourceStart, Math.min(line.sourceEnd, sourceStart))
  const clampedEnd = Math.max(clampedStart, Math.min(line.sourceEnd, sourceEnd))
  const selectedSoftHyphenOffset = line.break.kind === 'soft-hyphen'
    ? selectedSoftHyphenSourceOffsetForRange(reader, line, line.sourceStart, line.sourceEnd)
    : null
  let text = ''
  let column = startColumn

  for (let segmentIndex = visibleStart.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex >= reader.segmentCount) break
    const kind = reader.segmentKind(segmentIndex)
    if (kind === 'hard-break') continue
    const segmentStart = reader.segmentSourceStart(segmentIndex)
    const segmentGeometry = getTerminalSegmentGeometry(geometry, segmentIndex)
    const graphemeCount = segmentGeometry.graphemes.length
    const startGrapheme = segmentIndex === visibleStart.segmentIndex ? visibleStart.graphemeIndex : 0
    const endGrapheme = segmentIndex === end.segmentIndex && end.graphemeIndex > 0
      ? end.graphemeIndex
      : graphemeCount

    for (let graphemeIndex = startGrapheme; graphemeIndex < endGrapheme; graphemeIndex++) {
      const localStart = segmentGeometry.localSourceOffsets[graphemeIndex] ?? 0
      const localEnd = segmentGeometry.localSourceOffsets[graphemeIndex + 1] ?? localStart
      const absoluteStart = segmentStart + localStart
      const absoluteEnd = segmentStart + localEnd
      if (absoluteEnd <= clampedStart || absoluteStart >= clampedEnd) continue

      const grapheme = segmentGeometry.graphemes[graphemeIndex] ?? ''
      if (kind === 'tab' || grapheme === '\t') {
        const advance = terminalTabAdvance(column, reader.tabStopAdvance)
        text += ' '.repeat(advance)
        column += advance
        continue
      }
      if (kind === 'soft-hyphen' || grapheme === '\u00AD') {
        if (
          selectedSoftHyphenOffset !== null &&
          absoluteStart <= selectedSoftHyphenOffset &&
          selectedSoftHyphenOffset < absoluteEnd
        ) {
          text += '-'
          column += 1
        }
        continue
      }
      if (
        kind === 'zero-width-break' ||
        grapheme === '\u200B' ||
        grapheme === '\u2060' ||
        grapheme === '\uFEFF'
      ) {
        continue
      }

      text += grapheme
      const width = getTerminalSegmentWidthAt(geometry, segmentIndex, graphemeIndex)
      column += width ?? terminalGraphemeWidth(grapheme, reader.widthProfile)
    }
  }

  return { text, width: column - startColumn }
}

export function materializeTerminalLineSourceRange(
  prepared: PreparedTerminalText,
  line: TerminalLineRange,
  sourceStart: number,
  sourceEnd: number,
  startColumn?: number,
): { text: string; width: number } {
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const effectiveStartColumn = startColumn ?? terminalColumnForLineSourceOffset(
    geometry,
    line,
    sourceStart,
  )
  return materializePreparedTerminalSourceRange(
    geometry,
    line,
    sourceStart,
    sourceEnd,
    effectiveStartColumn,
  )
}

function terminalColumnForLineSourceOffset(
  geometry: PreparedTerminalGeometry,
  line: TerminalLineRange,
  sourceOffset: number,
): number {
  if (sourceOffset <= line.sourceStart) return line.startColumn
  const prefix = materializePreparedTerminalSourceRange(
    geometry,
    line,
    line.sourceStart,
    sourceOffset,
    line.startColumn,
  )
  return line.startColumn + prefix.width
}

export function getTerminalLineSourceBoundaryOffsets(
  prepared: PreparedTerminalText,
  line: TerminalLineRange,
): readonly number[] {
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const reader = geometry.reader
  const visibleStart = visibleStartCursorForRange(reader, line)
  const end = toLayoutCursor(line.end)
  const endSegmentIndex = terminalExclusiveEndSegmentIndex(end)
  const boundaries = new Set<number>([line.sourceStart, line.sourceEnd])

  for (let segmentIndex = visibleStart.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex >= reader.segmentCount) break
    const segmentStart = reader.segmentSourceStart(segmentIndex)
    const segmentGeometry = getTerminalSegmentGeometry(geometry, segmentIndex)
    const graphemeCount = segmentGeometry.graphemes.length
    const startGrapheme = segmentIndex === visibleStart.segmentIndex ? visibleStart.graphemeIndex : 0
    const endGrapheme = segmentIndex === end.segmentIndex && end.graphemeIndex > 0
      ? end.graphemeIndex
      : graphemeCount

    for (let graphemeIndex = startGrapheme; graphemeIndex <= endGrapheme; graphemeIndex++) {
      const localOffset = segmentGeometry.localSourceOffsets[graphemeIndex]
      if (localOffset === undefined) continue
      const sourceOffset = segmentStart + localOffset
      if (sourceOffset >= line.sourceStart && sourceOffset <= line.sourceEnd) {
        boundaries.add(sourceOffset)
      }
    }
  }

  return Object.freeze([...boundaries].sort((a, b) => a - b))
}

function firstSegmentIntersectingSourceOffset(
  reader: PreparedTerminalReader,
  sourceOffset: number,
): number {
  let lo = 0
  let hi = reader.segmentCount
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const segment = reader.segmentText(mid) ?? ''
    const segmentEnd = reader.segmentSourceStart(mid) + segment.length
    if (segmentEnd <= sourceOffset) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}
