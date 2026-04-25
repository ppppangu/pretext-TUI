// 补建说明：该文件为后续补建，用于提供 host-neutral terminal row/column 与 source/cursor projection；当前进度：Task 4 runtime 首版，复用现有 line/source indexes 且不 materialize 行文本。
import type { PreparedTextWithSegments } from './layout.js'
import type {
  PreparedTerminalText,
  TerminalCursor,
  TerminalLineRange,
} from './terminal.js'
import {
  getInternalPreparedTerminalGeometry,
  getInternalPreparedTerminalText,
} from './terminal-prepared-reader.js'
import {
  getTerminalSegmentGeometry,
  getTerminalSegmentGrapheme,
  getTerminalSegmentWidthAt,
  getTerminalSegmentWidthRange,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'
import {
  getTerminalLineRangeAtRow,
  getTerminalLineRangeForCursor,
  type TerminalLineIndex,
} from './terminal-line-index.js'
import {
  getTerminalCursorForSourceOffset,
  getTerminalSourceOffsetForCursor,
  type TerminalSourceOffsetBias,
  type TerminalSourceOffsetIndex,
} from './terminal-source-offset-index.js'
import {
  terminalGraphemeWidth,
  terminalTabAdvance,
} from './terminal-string-width.js'

export type TerminalProjectionIndexes = Readonly<{
  lineIndex: TerminalLineIndex
  sourceIndex: TerminalSourceOffsetIndex
}>

export type TerminalCellCoordinate = Readonly<{
  column: number
  row: number
}>

export type TerminalSourceProjectionOptions = Readonly<{
  bias?: TerminalSourceOffsetBias
}>

export type TerminalSourceProjection = Readonly<{
  kind: 'terminal-coordinate-projection@1'
  atEnd: boolean
  column: number
  coordinate: TerminalCellCoordinate
  cursor: TerminalCursor
  exact: boolean
  line: TerminalLineRange | null
  requestedSourceOffset: number | null
  row: number
  sourceOffset: number
}>

export type TerminalCoordinateProjection = TerminalSourceProjection

export type TerminalRowProjection = Readonly<{
  kind: 'terminal-row-projection@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  startColumn: number
  sourceEnd: number
  sourceStart: number
}>

export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  sourceOffset: number,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  sourceOffset: number,
  bias?: TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
  lineIndexOrSourceOffset: TerminalLineIndex | number,
  sourceOffsetOrOptions?: number | TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
  biasOrOptions?: TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  const args = resolveSourceOffsetProjectionArgs(
    indexesOrSourceIndex,
    lineIndexOrSourceOffset,
    sourceOffsetOrOptions,
    biasOrOptions,
  )
  return projectTerminalSourceOffsetWithIndexes(
    prepared,
    args.indexes,
    args.sourceOffset,
    args.options,
  )
}

function projectTerminalSourceOffsetWithIndexes(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  sourceOffset: number,
  options: TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  getInternalPreparedTerminalText(prepared)
  const lookup = getTerminalCursorForSourceOffset(
    prepared,
    indexes.sourceIndex,
    sourceOffset,
    options.bias,
  )
  return projectResolvedTerminalCursor(
    prepared,
    indexes,
    lookup.cursor,
    lookup.requestedSourceOffset,
    lookup.sourceOffset,
    lookup.exact,
  )
}

export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
  lineIndexOrCursor: TerminalLineIndex | TerminalCursor,
  cursorOrOptions?: TerminalCursor | TerminalSourceProjectionOptions,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  const args = resolveCursorProjectionArgs(
    indexesOrSourceIndex,
    lineIndexOrCursor,
    cursorOrOptions,
    options,
  )
  return projectTerminalCursorWithIndexes(
    prepared,
    args.indexes,
    args.cursor,
    args.options,
  )
}

function projectTerminalCursorWithIndexes(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  cursor: TerminalCursor,
  options: TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  getInternalPreparedTerminalText(prepared)
  const sourceOffset = getTerminalSourceOffsetForCursor(prepared, cursor, indexes.sourceIndex)
  if (options.bias !== undefined) {
    const lookup = getTerminalCursorForSourceOffset(
      prepared,
      indexes.sourceIndex,
      sourceOffset,
      options.bias,
    )
    return projectResolvedTerminalCursor(
      prepared,
      indexes,
      lookup.cursor,
      null,
      lookup.sourceOffset,
      lookup.exact,
    )
  }

  return projectResolvedTerminalCursor(
    prepared,
    indexes,
    cursor,
    null,
    sourceOffset,
    true,
  )
}

export function projectTerminalRow(
  prepared: PreparedTerminalText,
  lineIndex: TerminalLineIndex,
  row: number,
): TerminalRowProjection | null {
  const line = getTerminalLineRangeAtRow(prepared, lineIndex, row)
  if (line === null) return null
  return {
    kind: 'terminal-row-projection@1',
    row,
    line,
    startColumn: line.startColumn,
    endColumn: line.startColumn + line.width,
    sourceStart: line.sourceStart,
    sourceEnd: line.sourceEnd,
  }
}

type ResolvedSourceOffsetProjectionArgs = {
  indexes: TerminalProjectionIndexes
  options: TerminalSourceProjectionOptions
  sourceOffset: number
}

type ResolvedCursorProjectionArgs = {
  cursor: TerminalCursor
  indexes: TerminalProjectionIndexes
  options: TerminalSourceProjectionOptions
}

function resolveSourceOffsetProjectionArgs(
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
  lineIndexOrSourceOffset: TerminalLineIndex | number,
  sourceOffsetOrOptions: number | TerminalSourceOffsetBias | TerminalSourceProjectionOptions | undefined,
  biasOrOptions: TerminalSourceOffsetBias | TerminalSourceProjectionOptions | undefined,
): ResolvedSourceOffsetProjectionArgs {
  if (isProjectionIndexes(indexesOrSourceIndex)) {
    return {
      indexes: indexesOrSourceIndex,
      sourceOffset: lineIndexOrSourceOffset as number,
      options: normalizeProjectionOptions(sourceOffsetOrOptions),
    }
  }

  return {
    indexes: {
      sourceIndex: indexesOrSourceIndex,
      lineIndex: lineIndexOrSourceOffset as TerminalLineIndex,
    },
    sourceOffset: sourceOffsetOrOptions as number,
    options: normalizeProjectionOptions(biasOrOptions),
  }
}

function resolveCursorProjectionArgs(
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
  lineIndexOrCursor: TerminalLineIndex | TerminalCursor,
  cursorOrOptions: TerminalCursor | TerminalSourceProjectionOptions | undefined,
  options: TerminalSourceProjectionOptions | undefined,
): ResolvedCursorProjectionArgs {
  if (isProjectionIndexes(indexesOrSourceIndex)) {
    return {
      indexes: indexesOrSourceIndex,
      cursor: lineIndexOrCursor as TerminalCursor,
      options: normalizeProjectionOptions(cursorOrOptions),
    }
  }

  return {
    indexes: {
      sourceIndex: indexesOrSourceIndex,
      lineIndex: lineIndexOrCursor as TerminalLineIndex,
    },
    cursor: cursorOrOptions as TerminalCursor,
    options: normalizeProjectionOptions(options),
  }
}

function normalizeProjectionOptions(
  options: TerminalSourceOffsetBias | TerminalSourceProjectionOptions | TerminalCursor | number | undefined,
): TerminalSourceProjectionOptions {
  if (options === undefined) return {}
  if (typeof options === 'string') return { bias: options }
  if (typeof options !== 'object' || options === null) return { bias: options as never }
  if (isTerminalCursor(options)) return {}
  return options
}

function isProjectionIndexes(
  value: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
): value is TerminalProjectionIndexes {
  return 'lineIndex' in value && 'sourceIndex' in value
}

function isTerminalCursor(value: unknown): value is TerminalCursor {
  return typeof value === 'object' &&
    value !== null &&
    'segmentIndex' in value &&
    'graphemeIndex' in value
}

function projectResolvedTerminalCursor(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  cursor: TerminalCursor,
  requestedSourceOffset: number | null,
  sourceOffset: number,
  exact: boolean,
): TerminalSourceProjection {
  const rowProjection = getTerminalLineRangeForCursor(
    prepared,
    indexes.lineIndex,
    cursor,
    sourceOffset,
  )
  if (rowProjection === null) {
    return {
      kind: 'terminal-coordinate-projection@1',
      atEnd: true,
      row: 0,
      column: 0,
      coordinate: { row: 0, column: 0 },
      cursor: copyTerminalCursor(cursor),
      line: null,
      requestedSourceOffset,
      sourceOffset,
      exact,
    }
  }
  const terminalEndpoint = projectFinalHardBreakEndpoint(prepared, rowProjection, sourceOffset)
  if (terminalEndpoint !== null) {
    return {
      kind: 'terminal-coordinate-projection@1',
      atEnd: true,
      row: terminalEndpoint.row,
      column: 0,
      coordinate: terminalEndpoint,
      cursor: copyTerminalCursor(cursor),
      line: null,
      requestedSourceOffset,
      sourceOffset,
      exact,
    }
  }

  const column = projectTerminalColumn(prepared, rowProjection.line, cursor)
  const atEnd = compareTerminalCursors(cursor, rowProjection.line.end) >= 0 ||
    isTerminalSourceEnd(prepared, sourceOffset)
  return {
    kind: 'terminal-coordinate-projection@1',
    atEnd,
    row: rowProjection.row,
    column,
    coordinate: {
      row: rowProjection.row,
      column,
    },
    cursor: copyTerminalCursor(cursor),
    line: rowProjection.line,
    requestedSourceOffset,
    sourceOffset,
    exact,
  }
}

function isTerminalSourceEnd(prepared: PreparedTerminalText, sourceOffset: number): boolean {
  return sourceOffset === getInternalPreparedTerminalText(prepared).sourceText.length
}

function projectFinalHardBreakEndpoint(
  prepared: PreparedTerminalText,
  rowProjection: { line: TerminalLineRange, row: number },
  sourceOffset: number,
): TerminalCellCoordinate | null {
  const internal = getInternalPreparedTerminalText(prepared)
  if (sourceOffset !== internal.sourceText.length) return null
  if (!internal.sourceText.endsWith('\n')) return null
  if (rowProjection.line.break.kind !== 'hard') return null
  return {
    row: rowProjection.row + 1,
    column: 0,
  }
}

function projectTerminalColumn(
  prepared: PreparedTerminalText,
  line: TerminalLineRange,
  cursor: TerminalCursor,
): number {
  if (compareTerminalCursors(cursor, line.start) <= 0) return line.startColumn
  if (compareTerminalCursors(cursor, line.end) >= 0) return line.startColumn + line.width

  const internal = getInternalPreparedTerminalText(prepared)
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const selectedSoftHyphenSegmentIndex = selectedSoftHyphenSegment(internal, line)
  const width = terminalWidthBetweenCursors(
    internal,
    geometry,
    line,
    cursor,
    selectedSoftHyphenSegmentIndex,
  )
  return line.startColumn + Math.min(line.width, Math.max(0, width))
}

function terminalWidthBetweenCursors(
  prepared: PreparedTextWithSegments,
  geometry: PreparedTerminalGeometry,
  line: TerminalLineRange,
  cursor: TerminalCursor,
  selectedSoftHyphenSegmentIndex: number | null,
): number {
  let width = 0
  const endSegmentIndex = cursor.graphemeIndex > 0
    ? cursor.segmentIndex
    : cursor.segmentIndex - 1

  for (let segmentIndex = line.start.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (segmentIndex < 0 || segmentIndex >= prepared.segments.length) continue
    const segmentGeometry = getTerminalSegmentGeometry(geometry, segmentIndex)
    const startGraphemeIndex = segmentIndex === line.start.segmentIndex
      ? clampGraphemeIndex(line.start.graphemeIndex, segmentGeometry.graphemes.length)
      : 0
    const endGraphemeIndex = segmentIndex === cursor.segmentIndex
      ? clampGraphemeIndex(cursor.graphemeIndex, segmentGeometry.graphemes.length)
      : segmentGeometry.graphemes.length
    if (endGraphemeIndex <= startGraphemeIndex) continue

    const kind = prepared.kinds[segmentIndex]
    if (kind === 'hard-break' || kind === 'zero-width-break') continue
    if (kind === 'soft-hyphen') {
      if (selectedSoftHyphenSegmentIndex === segmentIndex) width += 1
      continue
    }
    if (kind === 'tab') {
      width += terminalTabAdvance(line.startColumn + width, prepared.tabStopAdvance)
      continue
    }

    const rangeWidth = getTerminalSegmentWidthRange(
      geometry,
      segmentIndex,
      startGraphemeIndex,
      endGraphemeIndex,
    )
    if (rangeWidth !== null) {
      width += rangeWidth
      continue
    }

    for (let graphemeIndex = startGraphemeIndex; graphemeIndex < endGraphemeIndex; graphemeIndex++) {
      const measured = getTerminalSegmentWidthAt(geometry, segmentIndex, graphemeIndex)
      width += measured ?? terminalGraphemeWidth(
        getTerminalSegmentGrapheme(geometry, segmentIndex, graphemeIndex),
        prepared.widthProfile,
      )
    }
  }

  return width
}

function selectedSoftHyphenSegment(
  prepared: PreparedTextWithSegments,
  line: TerminalLineRange,
): number | null {
  if (line.break.kind !== 'soft-hyphen') return null
  let selected: number | null = null
  const endSegmentIndex = line.end.graphemeIndex > 0
    ? line.end.segmentIndex
    : line.end.segmentIndex - 1
  for (let segmentIndex = line.start.segmentIndex; segmentIndex <= endSegmentIndex; segmentIndex++) {
    if (prepared.kinds[segmentIndex] !== 'soft-hyphen') continue
    const sourceStart = prepared.sourceStarts[segmentIndex] ?? prepared.sourceText.length
    if (sourceStart >= line.sourceStart && sourceStart < line.sourceEnd) {
      selected = segmentIndex
    }
  }
  return selected
}

function compareTerminalCursors(a: TerminalCursor, b: TerminalCursor): number {
  if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex
  return a.graphemeIndex - b.graphemeIndex
}

function clampGraphemeIndex(value: number, max: number): number {
  if (value <= 0) return 0
  if (value >= max) return max
  return value
}

function copyTerminalCursor(cursor: TerminalCursor): TerminalCursor {
  return Object.freeze({
    kind: 'terminal-cursor@1',
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  })
}
