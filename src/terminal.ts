// 补建说明：该文件为后续补建，用于暴露 pretext-TUI 的 terminal-first 公共 API facade；当前进度：Task 4 首版，基于现有 prepared/range walker 提供 columns/rows/source-offset 语义。
import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLineRange,
  type PrepareOptions,
  type PreparedTextWithSegments,
} from './layout.js'
import {
  terminalGraphemeWidth,
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

export type PreparedTerminalText = PreparedTextWithSegments

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

function segmentGraphemeOffsets(segment: string): number[] {
  const offsets = [0]
  let offset = 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment: grapheme } of segmenter.segment(segment)) {
    offset += grapheme.length
    offsets.push(offset)
  }
  return offsets
}

function segmentGraphemes(segment: string): string[] {
  const graphemes: string[] = []
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment: grapheme } of segmenter.segment(segment)) {
    graphemes.push(grapheme)
  }
  return graphemes
}

function sourceOffsetForCursor(prepared: PreparedTerminalText, cursor: LayoutCursor): number {
  if (cursor.segmentIndex >= prepared.segments.length) return prepared.sourceText.length
  const segment = prepared.segments[cursor.segmentIndex] ?? ''
  const segmentStart = prepared.sourceStarts[cursor.segmentIndex] ?? prepared.sourceText.length
  if (cursor.graphemeIndex <= 0) return segmentStart
  const offsets = segmentGraphemeOffsets(segment)
  return segmentStart + (offsets[cursor.graphemeIndex] ?? segment.length)
}

function breakForRange(
  prepared: PreparedTerminalText,
  range: LayoutLineRange,
  sourceStart: number,
  sourceEnd: number,
): TerminalLineBreak {
  const previousKind = prepared.kinds[range.end.segmentIndex - 1]
  if (previousKind === 'hard-break') {
    return { kind: 'hard', sourceOffset: sourceEnd, materializedText: null }
  }
  if (
    previousKind === 'soft-hyphen' &&
    prepared.sourceText.slice(sourceStart, sourceEnd).includes('\u00AD')
  ) {
    return { kind: 'soft-hyphen', sourceOffset: sourceEnd, materializedText: '-' }
  }
  if (range.end.segmentIndex >= prepared.segments.length) {
    return { kind: 'end', sourceOffset: sourceEnd, materializedText: null }
  }
  return { kind: 'wrap', sourceOffset: sourceEnd, materializedText: null }
}

function visibleSourceEndForRange(
  prepared: PreparedTerminalText,
  range: LayoutLineRange,
): number {
  if (range.end.graphemeIndex > 0) {
    return sourceOffsetForCursor(prepared, range.end)
  }
  const previousIndex = range.end.segmentIndex - 1
  const previousKind = prepared.kinds[previousIndex]
  if (
    previousKind === 'space' ||
    previousKind === 'zero-width-break' ||
    previousKind === 'hard-break'
  ) {
    return sourceOffsetForCursor(prepared, {
      segmentIndex: previousIndex,
      graphemeIndex: 0,
    })
  }
  return sourceOffsetForCursor(prepared, range.end)
}

function terminalWidthForRange(
  prepared: PreparedTerminalText,
  range: LayoutLineRange,
  startColumn: number,
  visibleSoftHyphenOffset: number | null,
): number {
  let width = 0
  const lastSegmentIndex = range.end.graphemeIndex > 0
    ? range.end.segmentIndex
    : range.end.segmentIndex - 1
  for (let i = range.start.segmentIndex; i <= lastSegmentIndex; i++) {
    if (i >= prepared.segments.length) break
    const kind = prepared.kinds[i]
    if (kind === 'hard-break' || kind === 'zero-width-break') continue
    const segment = prepared.segments[i] ?? ''
    const graphemes = segmentGraphemes(segment)
    const start = i === range.start.segmentIndex ? range.start.graphemeIndex : 0
    const end = i === range.end.segmentIndex && range.end.graphemeIndex > 0
      ? range.end.graphemeIndex
      : graphemes.length

    if (kind === 'soft-hyphen') {
      const segmentStart = prepared.sourceStarts[i] ?? 0
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
      width += terminalTabAdvance(startColumn + width, prepared.tabStopAdvance)
      continue
    }
    for (let g = start; g < end; g++) {
      width += terminalGraphemeWidth(graphemes[g]!, prepared.widthProfile)
    }
  }

  const previousIndex = range.end.segmentIndex - 1
  if (range.end.graphemeIndex === 0 && prepared.kinds[previousIndex] === 'space') {
    width = Math.max(0, width - terminalGraphemeWidth(' ', prepared.widthProfile))
  }
  return width
}

function toTerminalRange(
  prepared: PreparedTerminalText,
  range: LayoutLineRange,
  options: TerminalLayoutOptions,
): TerminalLineRange {
  const columns = validateColumns(options.columns)
  const startColumn = normalizeStartColumn(options.startColumn)
  const sourceStart = sourceOffsetForCursor(prepared, range.start)
  const sourceEnd = visibleSourceEndForRange(prepared, range)
  const breakInfo = breakForRange(prepared, range, sourceStart, sourceEnd)
  const visibleSoftHyphenOffset =
    breakInfo.kind === 'soft-hyphen'
      ? sourceStart + prepared.sourceText.slice(sourceStart, sourceEnd).lastIndexOf('\u00AD')
      : null
  const width = terminalWidthForRange(prepared, range, startColumn, visibleSoftHyphenOffset)
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

function materializeVisibleTerminalText(
  text: string,
  startColumn: number,
  tabSize: number,
  prepared: PreparedTerminalText,
  stripLeadingSoftHyphenArtifact: boolean,
): { text: string; width: number } {
  let rendered = ''
  let column = startColumn
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(text)) {
    if (segment === '\t') {
      const advance = terminalTabAdvance(column, tabSize)
      rendered += ' '.repeat(advance)
      column += advance
      continue
    }
    if (segment === '\u200B' || segment === '\u2060' || segment === '\uFEFF') {
      continue
    }
    rendered += segment
    column += terminalGraphemeWidth(segment, prepared.widthProfile)
  }
  if (stripLeadingSoftHyphenArtifact && rendered.startsWith('-')) {
    rendered = rendered.slice(1)
  }
  return { text: rendered, width: column - startColumn }
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
  return prepareWithSegments(text, 'terminal', prepareOptions)
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
  const columns = validateColumns(options.columns)
  const startColumn = normalizeStartColumn(options.startColumn)
  let rows = 0
  let cursor = TERMINAL_START_CURSOR
  let currentStartColumn = startColumn
  while (true) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns,
      startColumn: currentStartColumn,
    })
    if (line === null) break
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
  const columns = validateColumns(options.columns)
  let effectiveColumns = columns
  while (effectiveColumns >= 1) {
    const line = layoutNextLineRange(
      prepared,
      toLayoutCursor(cursor),
      effectiveColumns,
    )
    if (line === null) return null
    const terminalLine = toTerminalRange(prepared, line, options)
    if (terminalLine.overflow === null || effectiveColumns === 1) {
      return terminalLine
    }
    effectiveColumns--
  }
  return null
}

export function materializeTerminalLineRange(
  prepared: PreparedTerminalText,
  range: TerminalLineRange,
): MaterializedTerminalLine {
  const line = materializeLineRange(prepared, {
    width: range.width,
    start: toLayoutCursor(range.start),
    end: toLayoutCursor(range.end),
  })
  const sourceText = prepared.sourceText.slice(range.sourceStart, range.sourceEnd)
  const visibleText = sourceText.endsWith(' ') ? line.text : line.text.replace(/ +$/g, '')
  const materialized = materializeVisibleTerminalText(
    visibleText,
    range.startColumn,
    prepared.tabStopAdvance,
    prepared,
    prepared.sourceText[range.sourceStart - 1] === '\u00AD' &&
      !sourceText.includes('\u00AD') &&
      !sourceText.startsWith('-'),
  )
  return {
    ...range,
    text: materialized.text,
    sourceText,
  }
}
