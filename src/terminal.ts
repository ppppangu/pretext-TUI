// 补建说明：该文件为后续补建，用于暴露 pretext-TUI 的 terminal-first 公共 API facade；当前进度：Batch 6A.2 将 layout/range/materialization helper 迁移到 PreparedTerminalReader + geometry 读取面。
import {
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLineRange,
  type PrepareOptions,
} from './layout.js'
import {
  createPreparedTerminalText,
  getInternalPreparedTerminalGeometry,
  type PreparedTerminalReader,
  type PreparedTerminalText,
} from './terminal-prepared-reader.js'
import {
  materializePreparedTerminalSourceRange,
  materializePreparedTerminalSourceTextRange,
  selectedSoftHyphenSourceOffsetForRange,
  visibleStartCursorForRange,
} from './terminal-line-source.js'
import {
  getTerminalCursorSourceOffset,
  getTerminalSegmentGeometry,
  getTerminalSegmentGrapheme,
  getTerminalSegmentGraphemeCount,
  getTerminalSegmentWidthAt,
  getTerminalSegmentWidthRange,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'
import { isTerminalBidiFormatControlCodePoint } from './terminal-control-policy.js'
import {
  terminalGraphemeWidth,
  terminalStringWidth,
  terminalTabAdvance,
} from './terminal-string-width.js'
import type { TerminalWidthProfileInput } from './terminal-types.js'

export type TerminalPrepareOptions = {
  whiteSpace?: PrepareOptions['whiteSpace']
  wordBreak?: PrepareOptions['wordBreak']
  widthProfile?: TerminalWidthProfileInput
  tabSize?: number
}

export type TerminalLayoutOptions = {
  columns: number
  startColumn?: number
}

export type { PreparedTerminalText } from './terminal-prepared-reader.js'

export type TerminalLayoutResult = {
  rows: number
}

export type TerminalLineStats = {
  rows: number
  maxLineWidth: number
}

export type TerminalCursor = Readonly<{
  kind: 'terminal-cursor@1'
  segmentIndex: number
  graphemeIndex: number
}>

export type TerminalLineBreak = Readonly<{
  kind: 'wrap' | 'hard' | 'soft-hyphen' | 'end'
  sourceOffset: number | null
  materializedText: '-' | null
}>

export type TerminalLineRange = Readonly<{
  kind: 'terminal-line-range@1'
  start: TerminalCursor
  end: TerminalCursor
  sourceStart: number
  sourceEnd: number
  width: number
  columns: number
  startColumn: number
  break: TerminalLineBreak
  overflow: { width: number; columns: number } | null
}>

export type MaterializedTerminalLine = TerminalLineRange & {
  text: string
  sourceText: string
}

export const TERMINAL_START_CURSOR: TerminalCursor = Object.freeze({
  kind: 'terminal-cursor@1',
  segmentIndex: 0,
  graphemeIndex: 0,
})

function assertPlainTerminalInput(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const ch = text[i]!
    const allowedWhitespace = ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
    if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f)) && !allowedWhitespace) {
      throw new Error(`Plain terminal text cannot contain control character U+${code.toString(16).toUpperCase()}`)
    }
    if (isTerminalBidiFormatControlCodePoint(code)) {
      throw new Error(`Plain terminal text cannot contain bidi format control U+${code.toString(16).toUpperCase()}`)
    }
  }
}

function validateColumns(columns: number): number {
  if (!Number.isInteger(columns) || columns <= 0) {
    throw new Error(`Terminal columns must be a positive integer, got ${columns}`)
  }
  return columns
}

function normalizeStartColumn(startColumn: number | undefined): number {
  const value = startColumn ?? 0
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Terminal startColumn must be a non-negative integer, got ${value}`)
  }
  return value
}

function toLayoutCursor(cursor: TerminalCursor): LayoutCursor {
  return {
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  }
}

function toTerminalCursor(cursor: LayoutCursor): TerminalCursor {
  return {
    kind: 'terminal-cursor@1',
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  }
}

function canonicalizeLayoutCursor(
  geometry: PreparedTerminalGeometry,
  cursor: LayoutCursor,
): LayoutCursor {
  const reader = geometry.reader
  let segmentIndex = Math.max(0, cursor.segmentIndex)
  let graphemeIndex = Math.max(0, cursor.graphemeIndex)
  while (segmentIndex < reader.segmentCount) {
    const graphemeCount = getTerminalSegmentGraphemeCount(geometry, segmentIndex)
    if (graphemeIndex < graphemeCount) break
    segmentIndex++
    graphemeIndex = 0
  }
  return { segmentIndex, graphemeIndex }
}

function sourceOffsetForCursor(
  geometry: PreparedTerminalGeometry,
  cursor: LayoutCursor,
): number {
  return getTerminalCursorSourceOffset(geometry, cursor)
}

function visibleSourceStartForRange(
  geometry: PreparedTerminalGeometry,
  range: LayoutLineRange,
): number {
  const reader = geometry.reader
  const visibleStart = visibleStartCursorForRange(reader, range)
  return sourceOffsetForCursor(geometry, visibleStart)
}

function breakForRange(
  reader: PreparedTerminalReader,
  range: LayoutLineRange,
  sourceEnd: number,
  visibleSoftHyphenOffset: number | null,
): TerminalLineBreak {
  const previousKind = reader.segmentKind(range.end.segmentIndex - 1)
  if (previousKind === 'hard-break') {
    return { kind: 'hard', sourceOffset: sourceEnd, materializedText: null }
  }
  if (previousKind === 'soft-hyphen' && visibleSoftHyphenOffset !== null) {
    return { kind: 'soft-hyphen', sourceOffset: sourceEnd, materializedText: '-' }
  }
  if (range.end.segmentIndex >= reader.segmentCount) {
    return { kind: 'end', sourceOffset: sourceEnd, materializedText: null }
  }
  return { kind: 'wrap', sourceOffset: sourceEnd, materializedText: null }
}

function visibleSourceEndForRange(
  geometry: PreparedTerminalGeometry,
  range: LayoutLineRange,
): number {
  const reader = geometry.reader
  if (range.end.graphemeIndex > 0) {
    return sourceOffsetForCursor(geometry, range.end)
  }
  const previousIndex = range.end.segmentIndex - 1
  const previousKind = reader.segmentKind(previousIndex)
  if (
    previousKind === 'space' ||
    previousKind === 'zero-width-break' ||
    previousKind === 'hard-break'
  ) {
    return sourceOffsetForCursor(geometry, {
      segmentIndex: previousIndex,
      graphemeIndex: 0,
    })
  }
  return sourceOffsetForCursor(geometry, range.end)
}

function terminalWidthForRange(
  geometry: PreparedTerminalGeometry,
  range: LayoutLineRange,
  startColumn: number,
  visibleSoftHyphenOffset: number | null,
  trimTrailingCollapsibleSpaces: boolean,
): number {
  const reader = geometry.reader
  let width = 0
  const visibleStart = visibleStartCursorForRange(reader, range)
  const lastSegmentIndex = range.end.graphemeIndex > 0
    ? range.end.segmentIndex
    : range.end.segmentIndex - 1
  for (let i = visibleStart.segmentIndex; i <= lastSegmentIndex; i++) {
    if (i >= reader.segmentCount) break
    const kind = reader.segmentKind(i)
    if (kind === 'hard-break' || kind === 'zero-width-break') continue
    const segment = reader.segmentText(i) ?? ''
    const segmentGeometry = getTerminalSegmentGeometry(geometry, i)
    const graphemes = segmentGeometry.graphemes
    const start = i === visibleStart.segmentIndex ? visibleStart.graphemeIndex : 0
    const end = i === range.end.segmentIndex && range.end.graphemeIndex > 0
      ? range.end.graphemeIndex
      : graphemes.length

    if (kind === 'soft-hyphen') {
      const segmentStart = reader.segmentSourceStart(i)
      const segmentEnd = segmentStart + segment.length
      if (
        visibleSoftHyphenOffset !== null &&
        visibleSoftHyphenOffset >= segmentStart &&
        visibleSoftHyphenOffset < segmentEnd
      ) {
        width += 1
      }
      continue
    }
    if (kind === 'tab') {
      width += terminalTabAdvance(startColumn + width, reader.tabStopAdvance)
      continue
    }
    const rangeWidth = getTerminalSegmentWidthRange(geometry, i, start, end)
    if (rangeWidth !== null) {
      width += rangeWidth
    } else {
      for (let g = start; g < end; g++) {
        width += terminalGraphemeWidth(graphemes[g]!, reader.widthProfile)
      }
    }
  }

  if (trimTrailingCollapsibleSpaces && range.end.graphemeIndex === 0) {
    let trailingIndex = range.end.segmentIndex - 1
    while (trailingIndex >= visibleStart.segmentIndex) {
      const kind = reader.segmentKind(trailingIndex)
      if (kind === 'hard-break' || kind === 'zero-width-break' || kind === 'soft-hyphen') {
        trailingIndex--
        continue
      }
      if (
        kind === 'glue' &&
        terminalStringWidth(reader.segmentText(trailingIndex) ?? '', reader.widthProfile) === 0
      ) {
        trailingIndex--
        continue
      }
      if (kind !== 'space') break
      width = Math.max(0, width - terminalStringWidth(reader.segmentText(trailingIndex) ?? ' ', reader.widthProfile))
      trailingIndex--
    }
  }
  return width
}

function toTerminalRange(
  geometry: PreparedTerminalGeometry,
  range: LayoutLineRange,
  options: TerminalLayoutOptions,
): TerminalLineRange {
  const reader = geometry.reader
  const columns = validateColumns(options.columns)
  const startColumn = normalizeStartColumn(options.startColumn)
  const sourceStart = visibleSourceStartForRange(geometry, range)
  const sourceEnd = Math.max(sourceStart, visibleSourceEndForRange(geometry, range))
  const selectedSoftHyphenOffset = selectedSoftHyphenSourceOffsetForRange(
    reader,
    range,
    sourceStart,
    sourceEnd,
  )
  const breakInfo = breakForRange(reader, range, sourceEnd, selectedSoftHyphenOffset)
  const visibleSoftHyphenOffset = breakInfo.kind === 'soft-hyphen'
    ? selectedSoftHyphenOffset
    : null
  const width = terminalWidthForRange(
    geometry,
    range,
    startColumn,
    visibleSoftHyphenOffset,
    breakInfo.kind === 'wrap',
  )
  const occupiedWidth = startColumn + width
  return {
    kind: 'terminal-line-range@1',
    start: toTerminalCursor(range.start),
    end: toTerminalCursor(range.end),
    sourceStart,
    sourceEnd,
    width,
    columns,
    startColumn,
    break: breakInfo,
    overflow: occupiedWidth > columns ? { width: occupiedWidth, columns } : null,
  }
}

function shouldTrimMaterializedTrailingSpaces(
  reader: PreparedTerminalReader,
  range: TerminalLineRange,
): boolean {
  if (range.break.kind !== 'wrap') return false
  let segmentIndex = range.end.graphemeIndex > 0
    ? range.end.segmentIndex
    : range.end.segmentIndex - 1
  while (segmentIndex >= range.start.segmentIndex) {
    const kind = reader.segmentKind(segmentIndex)
    if (kind === 'hard-break' || kind === 'zero-width-break' || kind === 'soft-hyphen') {
      segmentIndex--
      continue
    }
    if (
      kind === 'glue' &&
      terminalStringWidth(reader.segmentText(segmentIndex) ?? '', reader.widthProfile) === 0
    ) {
      segmentIndex--
      continue
    }
    return kind === 'space'
  }
  return false
}

type TerminalBreakCandidate = {
  end: LayoutCursor
  width: number
}

function compareLayoutCursors(a: LayoutCursor, b: LayoutCursor): number {
  if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex
  return a.graphemeIndex - b.graphemeIndex
}

function nextGraphemeCursor(
  geometry: PreparedTerminalGeometry,
  cursor: LayoutCursor,
): LayoutCursor | null {
  const reader = geometry.reader
  if (cursor.segmentIndex >= reader.segmentCount) return null
  const graphemeCount = getTerminalSegmentGraphemeCount(geometry, cursor.segmentIndex)
  if (cursor.graphemeIndex >= graphemeCount) {
    return {
      segmentIndex: cursor.segmentIndex + 1,
      graphemeIndex: 0,
    }
  }
  if (cursor.graphemeIndex + 1 >= graphemeCount) {
    return {
      segmentIndex: cursor.segmentIndex + 1,
      graphemeIndex: 0,
    }
  }
  return {
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex + 1,
  }
}

function normalizeTerminalLineStart(
  reader: PreparedTerminalReader,
  cursor: LayoutCursor,
): LayoutCursor | null {
  if (cursor.segmentIndex >= reader.segmentCount) return null
  if (cursor.graphemeIndex > 0) return { ...cursor }

  let segmentIndex = cursor.segmentIndex
  while (segmentIndex < reader.segmentCount) {
    const kind = reader.segmentKind(segmentIndex)
    if (kind !== 'space' && kind !== 'zero-width-break' && kind !== 'soft-hyphen') break
    segmentIndex++
  }
  return {
    segmentIndex,
    graphemeIndex: 0,
  }
}

function createInternalTerminalRange(
  start: LayoutCursor,
  end: LayoutCursor,
  width: number,
): LayoutLineRange {
  return { start, end, width }
}

function layoutNextTerminalInternalRange(
  geometry: PreparedTerminalGeometry,
  cursor: TerminalCursor,
  columns: number,
  startColumn: number,
): LayoutLineRange | null {
  const reader = geometry.reader
  const rawStart = canonicalizeLayoutCursor(geometry, toLayoutCursor(cursor))
  const visibleStart = normalizeTerminalLineStart(reader, rawStart)
  if (visibleStart === null) return null
  const rangeStart = visibleStart.segmentIndex >= reader.segmentCount &&
    rawStart.segmentIndex < reader.segmentCount
    ? rawStart
    : visibleStart
  if (visibleStart.segmentIndex >= reader.segmentCount) {
    return createInternalTerminalRange(
      rangeStart,
      visibleStart,
      0,
    )
  }

  if (reader.segmentKind(visibleStart.segmentIndex) === 'hard-break') {
    return createInternalTerminalRange(
      visibleStart,
      { segmentIndex: visibleStart.segmentIndex + 1, graphemeIndex: 0 },
      0,
    )
  }

  let position = { ...visibleStart }
  let width = 0
  let hasContent = false
  let lastBreak: TerminalBreakCandidate | null = null

  while (position.segmentIndex < reader.segmentCount) {
    const kind = reader.segmentKind(position.segmentIndex)
    const graphemeCount = getTerminalSegmentGraphemeCount(geometry, position.segmentIndex)

    if (kind === 'hard-break') {
      return createInternalTerminalRange(
        rangeStart,
        { segmentIndex: position.segmentIndex + 1, graphemeIndex: 0 },
        width,
      )
    }

    if (position.graphemeIndex >= graphemeCount) {
      position = { segmentIndex: position.segmentIndex + 1, graphemeIndex: 0 }
      continue
    }

    const next = nextGraphemeCursor(geometry, position)
    if (next === null) break

    if (kind === 'zero-width-break') {
      if (hasContent) lastBreak = { end: next, width }
      position = next
      continue
    }

    if (kind === 'soft-hyphen') {
      if (hasContent && startColumn + width + 1 <= columns) {
        lastBreak = { end: next, width: width + 1 }
      }
      position = next
      continue
    }

    let advance = 0
    if (kind === 'tab') {
      advance = terminalTabAdvance(startColumn + width, reader.tabStopAdvance)
    } else {
      const measured = getTerminalSegmentWidthAt(
        geometry,
        position.segmentIndex,
        position.graphemeIndex,
      )
      advance = measured ?? terminalGraphemeWidth(
        getTerminalSegmentGrapheme(geometry, position.segmentIndex, position.graphemeIndex),
        reader.widthProfile,
      )
    }

    if (startColumn + width + advance > columns) {
      if (lastBreak !== null && compareLayoutCursors(lastBreak.end, rangeStart) > 0) {
        return createInternalTerminalRange(rangeStart, lastBreak.end, lastBreak.width)
      }
      if (!hasContent) {
        return createInternalTerminalRange(rangeStart, next, advance)
      }
      return createInternalTerminalRange(rangeStart, position, width)
    }

    if (kind === 'space') {
      lastBreak = { end: next, width }
    }

    width += advance
    hasContent = true
    position = next

    if (kind === 'preserved-space' || kind === 'tab') {
      lastBreak = { end: position, width }
    } else if (
      kind === 'text' &&
      position.graphemeIndex === 0 &&
      reader.segmentKind(position.segmentIndex) === 'text' &&
      reader.hasSegmentBreakAfter(position.segmentIndex - 1) === true
    ) {
      lastBreak = { end: position, width }
    }
  }

  return createInternalTerminalRange(rangeStart, position, width)
}

export function prepareTerminal(
  text: string,
  options: TerminalPrepareOptions = {},
): PreparedTerminalText {
  assertPlainTerminalInput(text)
  const prepareOptions: PrepareOptions = {}
  if (options.whiteSpace !== undefined) prepareOptions.whiteSpace = options.whiteSpace
  if (options.wordBreak !== undefined) prepareOptions.wordBreak = options.wordBreak
  if (options.widthProfile !== undefined) prepareOptions.widthProfile = options.widthProfile
  if (options.tabSize !== undefined) prepareOptions.tabSize = options.tabSize
  return createPreparedTerminalText(prepareWithSegments(text, 'terminal', prepareOptions))
}

export function layoutTerminal(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLayoutResult {
  let rows = 0
  walkTerminalLineRanges(prepared, options, () => {
    rows++
  })
  return { rows }
}

export function measureTerminalLineStats(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLineStats {
  let rows = 0
  let maxLineWidth = 0
  walkTerminalLineRanges(prepared, options, line => {
    rows++
    maxLineWidth = Math.max(maxLineWidth, line.width)
  })
  return {
    rows,
    maxLineWidth,
  }
}

export function walkTerminalLineRanges(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
  onLine: (line: TerminalLineRange) => void,
): number {
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const columns = validateColumns(options.columns)
  const startColumn = normalizeStartColumn(options.startColumn)
  let rows = 0
  let cursor = TERMINAL_START_CURSOR
  let currentStartColumn = startColumn
  while (true) {
    const internalLine = layoutNextTerminalInternalRange(
      geometry,
      cursor,
      columns,
      currentStartColumn,
    )
    if (internalLine === null) break
    const line = toTerminalRange(geometry, internalLine, { columns, startColumn: currentStartColumn })
    rows++
    onLine(line)
    cursor = line.end
    currentStartColumn = 0
  }
  return rows
}

export function layoutNextTerminalLineRange(
  prepared: PreparedTerminalText,
  cursor: TerminalCursor,
  options: TerminalLayoutOptions,
): TerminalLineRange | null {
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const columns = validateColumns(options.columns)
  const startColumn = normalizeStartColumn(options.startColumn)
  const line = layoutNextTerminalInternalRange(geometry, cursor, columns, startColumn)
  return line === null ? null : toTerminalRange(geometry, line, { columns, startColumn })
}

export function materializeTerminalLineRange(
  prepared: PreparedTerminalText,
  range: TerminalLineRange,
): MaterializedTerminalLine {
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const reader = geometry.reader
  const sourceText = materializePreparedTerminalSourceTextRange(
    reader,
    range.sourceStart,
    range.sourceEnd,
  )
  const materialized = materializePreparedTerminalSourceRange(
    geometry,
    range,
    range.sourceStart,
    range.sourceEnd,
    range.startColumn,
  )
  return {
    ...range,
    text: shouldTrimMaterializedTrailingSpaces(reader, range)
      ? materialized.text.replace(/[ \u00AD\u200B\u2060\uFEFF]+$/g, '')
      : materialized.text,
    sourceText,
  }
}
