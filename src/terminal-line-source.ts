// 补建说明：该文件为后续补建，用于集中 terminal line 的内部 source boundary/source range materialization helper；当前进度：Task 3 worker A 首版，从 terminal.ts 拆出 rich inline 所需的 internal-only helper，尚不作为公共 API 暴露。
import type {
  LayoutCursor,
  LayoutLineRange,
  PreparedTextWithSegments,
} from './layout.js'
import {
  getTerminalSegmentGeometry,
  getTerminalSegmentWidthAt,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'
import {
  getInternalPreparedTerminalGeometry,
  getInternalPreparedTerminalText,
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
  prepared: PreparedTextWithSegments,
  range: LayoutLineRange,
): LayoutCursor {
  if (range.start.graphemeIndex > 0) {
    return range.start
  }
  let segmentIndex = range.start.segmentIndex
  while (segmentIndex < range.end.segmentIndex) {
    const kind = prepared.kinds[segmentIndex]
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

export function materializePreparedTerminalSourceRange(
  prepared: PreparedTextWithSegments,
  geometry: PreparedTerminalGeometry,
  line: TerminalLineRange,
  sourceStart: number,
  sourceEnd: number,
  startColumn: number,
): { text: string; width: number } {
  const visibleStart = visibleStartCursorForRange(prepared, line)
  const end = toLayoutCursor(line.end)
  const endSegmentIndex = terminalExclusiveEndSegmentIndex(end)
  const clampedStart = Math.max(line.sourceStart, Math.min(line.sourceEnd, sourceStart))
  const clampedEnd = Math.max(clampedStart, Math.min(line.sourceEnd, sourceEnd))
  const selectedSoftHyphenOffset = line.break.kind === 'soft-hyphen'
    ? line.sourceStart + prepared.sourceText.slice(line.sourceStart, line.sourceEnd).lastIndexOf('\u00AD')
    : null
  let text = ''
  let column = startColumn

  for (let segmentIndex = visibleStart.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex >= prepared.segments.length) break
    const kind = prepared.kinds[segmentIndex]
    if (kind === 'hard-break') continue
    const segmentStart = prepared.sourceStarts[segmentIndex] ?? prepared.sourceText.length
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
        const advance = terminalTabAdvance(column, prepared.tabStopAdvance)
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
      column += width ?? terminalGraphemeWidth(grapheme, prepared.widthProfile)
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
  const internal = getInternalPreparedTerminalText(prepared)
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const effectiveStartColumn = startColumn ?? terminalColumnForLineSourceOffset(
    internal,
    geometry,
    line,
    sourceStart,
  )
  return materializePreparedTerminalSourceRange(
    internal,
    geometry,
    line,
    sourceStart,
    sourceEnd,
    effectiveStartColumn,
  )
}

function terminalColumnForLineSourceOffset(
  prepared: PreparedTextWithSegments,
  geometry: PreparedTerminalGeometry,
  line: TerminalLineRange,
  sourceOffset: number,
): number {
  if (sourceOffset <= line.sourceStart) return line.startColumn
  const prefix = materializePreparedTerminalSourceRange(
    prepared,
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
  const internal = getInternalPreparedTerminalText(prepared)
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const visibleStart = visibleStartCursorForRange(internal, line)
  const end = toLayoutCursor(line.end)
  const endSegmentIndex = terminalExclusiveEndSegmentIndex(end)
  const boundaries = new Set<number>([line.sourceStart, line.sourceEnd])

  for (let segmentIndex = visibleStart.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex >= internal.segments.length) break
    const segmentStart = internal.sourceStarts[segmentIndex] ?? internal.sourceText.length
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
