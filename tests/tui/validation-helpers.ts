// 补建说明：该文件为后续补建，用于让 Task 7 的 TUI tests/scripts 共享 public API 验证 helper；当前进度：首版覆盖行收集、不变量、轻量 oracle、hash 与 deterministic fuzz 基础能力。
import {
  TERMINAL_START_CURSOR,
  layoutNextTerminalLineRange,
  layoutTerminal,
  materializeTerminalLineRange,
  measureTerminalLineStats,
  prepareTerminal,
  walkTerminalLineRanges,
  type MaterializedTerminalLine,
  type PreparedTerminalText,
  type TerminalLayoutOptions,
  type TerminalLineRange,
  type TerminalPrepareOptions,
} from '../../src/index.js'
import {
  terminalGraphemeWidth,
  terminalStringWidth,
  terminalTabAdvance,
} from '../../src/terminal-string-width.js'

export type CollectedTerminalLine = {
  range: TerminalLineRange
  materialized: MaterializedTerminalLine
}

export type LayoutSnapshot = {
  rows: number
  maxLineWidth: number
  texts: string[]
  sourceTexts: string[]
  widths: number[]
  breakKinds: string[]
  sourceRanges: Array<[number, number]>
  overflow: Array<{ width: number, columns: number } | null>
}

export type LayoutGoldenCase = {
  id: string
  text: string
  prepare?: TerminalPrepareOptions
  layout: TerminalLayoutOptions
  expected: LayoutSnapshot
}

export type RichGoldenCase = {
  id: string
  rawText: string
  prepare?: TerminalPrepareOptions & { unsupportedControlMode?: 'sanitize' | 'reject' }
  layout: TerminalLayoutOptions
  expected: {
    visibleText: string
    diagnosticCount: number
    spanKinds: string[]
    texts: string[]
    fragmentTexts: string[][]
  }
}

export type WidthGoldenCase = {
  id: string
  text: string
  widthProfile?: TerminalPrepareOptions['widthProfile']
  expectedWidth: number
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function collectTerminalLines(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): CollectedTerminalLine[] {
  const lines: CollectedTerminalLine[] = []
  walkTerminalLineRanges(prepared, options, range => {
    lines.push({ range, materialized: materializeTerminalLineRange(prepared, range) })
  })
  return lines
}

export function collectTerminalLinesByNext(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLineRange[] {
  const lines: TerminalLineRange[] = []
  let cursor = TERMINAL_START_CURSOR
  let startColumn = options.startColumn ?? 0
  while (true) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: options.columns,
      startColumn,
    })
    if (line === null) break
    lines.push(line)
    cursor = line.end
    startColumn = 0
  }
  return lines
}

export function snapshotLayoutCase(
  text: string,
  prepareOptions: TerminalPrepareOptions | undefined,
  layoutOptions: TerminalLayoutOptions,
): LayoutSnapshot {
  const prepared = prepareTerminal(text, prepareOptions)
  const collected = collectTerminalLines(prepared, layoutOptions)
  const stats = measureTerminalLineStats(prepared, layoutOptions)
  return {
    rows: layoutTerminal(prepared, layoutOptions).rows,
    maxLineWidth: stats.maxLineWidth,
    texts: collected.map(line => line.materialized.text),
    sourceTexts: collected.map(line => line.materialized.sourceText),
    widths: collected.map(line => line.range.width),
    breakKinds: collected.map(line => line.range.break.kind),
    sourceRanges: collected.map(line => [line.range.sourceStart, line.range.sourceEnd]),
    overflow: collected.map(line => line.range.overflow),
  }
}

export function assertLayoutGolden(testCase: LayoutGoldenCase): void {
  const actual = snapshotLayoutCase(testCase.text, testCase.prepare, testCase.layout)
  assertDeepEqual(actual, testCase.expected, `layout golden ${testCase.id}`)
}

export function assertTerminalInvariants(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): void {
  const walked = collectTerminalLines(prepared, options)
  const next = collectTerminalLinesByNext(prepared, options)
  const layout = layoutTerminal(prepared, options)
  const stats = measureTerminalLineStats(prepared, options)

  assert(layout.rows === walked.length, `layout rows mismatch: ${layout.rows} !== ${walked.length}`)
  assert(stats.rows === walked.length, `stats rows mismatch: ${stats.rows} !== ${walked.length}`)
  assert(stats.maxLineWidth === Math.max(0, ...walked.map(line => line.range.width)), 'maxLineWidth mismatch')
  assertDeepEqual(
    next.map(line => cursorKey(line.end)),
    walked.map(line => cursorKey(line.range.end)),
    'layoutNext/walk cursor mismatch',
  )

  const sourceBoundaries = graphemeBoundarySet(prepared.sourceText)
  for (let i = 0; i < walked.length; i++) {
    const { range, materialized } = walked[i]!
    assert(range.sourceStart <= range.sourceEnd, `invalid source range ${range.sourceStart}:${range.sourceEnd}`)
    assert(sourceBoundaries.has(range.sourceStart), `sourceStart is not a grapheme boundary: ${range.sourceStart}`)
    assert(sourceBoundaries.has(range.sourceEnd), `sourceEnd is not a grapheme boundary: ${range.sourceEnd}`)
    assert(
      materialized.sourceText === prepared.sourceText.slice(range.sourceStart, range.sourceEnd),
      `sourceText mismatch on line ${i}`,
    )
    assert(!hasUnsafeControls(materialized.text), `unsafe control emitted on line ${i}`)
    assert(
      terminalStringWidth(materialized.text, prepared.widthProfile) === range.width,
      `materialized width mismatch on line ${i}`,
    )
    assertDeepEqual(range.overflow, range.startColumn + range.width > range.columns
      ? { width: range.startColumn + range.width, columns: range.columns }
      : null, `overflow mismatch on line ${i}`)

    if (i > 0) {
      assert(range.startColumn === 0, `continuation line kept startColumn at line ${i}`)
      const continued = layoutNextTerminalLineRange(prepared, walked[i - 1]!.range.end, {
        columns: range.columns,
        startColumn: 0,
      })
      assertDeepEqual(continued, range, `continuation replay mismatch at line ${i}`)
    }

    const replay = layoutNextTerminalLineRange(prepared, range.start, {
      columns: range.columns,
      startColumn: range.startColumn,
    })
    assertDeepEqual(replay, range, `line replay mismatch at line ${i}`)
  }
}

export type OracleLine = {
  text: string
  sourceText: string
  sourceStart: number
  sourceEnd: number
  width: number
  breakKind: 'wrap' | 'hard' | 'soft-hyphen' | 'end'
  overflow: { width: number, columns: number } | null
}

type Position = { segmentIndex: number, graphemeIndex: number }

type BreakCandidate = {
  position: Position
  text: string
  sourceEnd: number
  width: number
  breakKind: OracleLine['breakKind']
}

export function computePreparedGreedyOracle(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): OracleLine[] {
  const lines: OracleLine[] = []
  let position: Position = { segmentIndex: 0, graphemeIndex: 0 }
  let startColumn = options.startColumn ?? 0

  while (position.segmentIndex < prepared.segments.length) {
    const line = computeNextOracleLine(prepared, position, options.columns, startColumn)
    if (line === null) break
    lines.push(line.line)
    position = line.next
    startColumn = 0
  }

  return lines
}

function computeNextOracleLine(
  prepared: PreparedTerminalText,
  rawStart: Position,
  columns: number,
  startColumn: number,
): { line: OracleLine, next: Position } | null {
  const start = normalizeOracleLineStart(prepared, rawStart)
  if (start.segmentIndex >= prepared.segments.length) return null

  const firstKind = prepared.kinds[start.segmentIndex]
  if (firstKind === 'hard-break') {
    const sourceOffset = prepared.sourceStarts[start.segmentIndex] ?? prepared.sourceText.length
    return {
      line: makeOracleLine('', prepared, sourceOffset, sourceOffset, 0, columns, startColumn, 'hard'),
      next: { segmentIndex: start.segmentIndex + 1, graphemeIndex: 0 },
    }
  }

  let position = { ...start }
  let text = ''
  let width = 0
  let sourceEnd = sourceOffsetForPosition(prepared, start)
  const sourceStart = sourceEnd
  let lastBreak: BreakCandidate | null = null

  while (position.segmentIndex < prepared.segments.length) {
    const kind = prepared.kinds[position.segmentIndex]!
    if (kind === 'hard-break') {
      return {
        line: makeOracleLine(text, prepared, sourceStart, sourceEnd, width, columns, startColumn, 'hard'),
        next: { segmentIndex: position.segmentIndex + 1, graphemeIndex: 0 },
      }
    }

    const unit = readOracleUnit(prepared, position, startColumn + width)
    if (unit === null) {
      position = { segmentIndex: position.segmentIndex + 1, graphemeIndex: 0 }
      continue
    }

    if (kind === 'space') {
      lastBreak = {
        position: unit.next,
        text: text.replace(/ +$/g, ''),
        sourceEnd: unit.sourceStart,
        width: terminalStringWidth(text.replace(/ +$/g, ''), prepared.widthProfile),
        breakKind: 'wrap',
      }
    }

    if (kind === 'zero-width-break') {
      lastBreak = {
        position: unit.next,
        text,
        sourceEnd: unit.sourceStart,
        width,
        breakKind: 'wrap',
      }
      position = unit.next
      continue
    }

    if (kind === 'soft-hyphen') {
      lastBreak = {
        position: unit.next,
        text: `${text}-`,
        sourceEnd: unit.sourceEnd,
        width: width + 1,
        breakKind: 'soft-hyphen',
      }
      position = unit.next
      continue
    }

    const nextWidth = width + unit.width
    if (startColumn + nextWidth > columns) {
      if (lastBreak !== null && comparePositions(lastBreak.position, start) > 0) {
        return {
          line: makeOracleLine(
            lastBreak.text,
            prepared,
            sourceStart,
            lastBreak.sourceEnd,
            lastBreak.width,
            columns,
            startColumn,
            lastBreak.breakKind,
          ),
          next: lastBreak.position,
        }
      }
      if (text.length === 0) {
        const breakKind = unit.next.segmentIndex >= prepared.segments.length ? 'end' : 'wrap'
        return {
          line: makeOracleLine(
            unit.text,
            prepared,
            sourceStart,
            unit.sourceEnd,
            unit.width,
            columns,
            startColumn,
            breakKind,
          ),
          next: unit.next,
        }
      }
      return {
        line: makeOracleLine(text.replace(/ +$/g, ''), prepared, sourceStart, sourceEnd, terminalStringWidth(text.replace(/ +$/g, ''), prepared.widthProfile), columns, startColumn, 'wrap'),
        next: position,
      }
    }

    text += unit.text
    width = nextWidth
    sourceEnd = unit.sourceEnd
    position = unit.next

    if (kind === 'preserved-space' || kind === 'tab') {
      lastBreak = {
        position,
        text,
        sourceEnd,
        width,
        breakKind: 'wrap',
      }
    }
  }

  return {
    line: makeOracleLine(text, prepared, sourceStart, sourceEnd, width, columns, startColumn, 'end'),
    next: position,
  }
}

function makeOracleLine(
  text: string,
  prepared: PreparedTerminalText,
  sourceStart: number,
  sourceEnd: number,
  width: number,
  columns: number,
  startColumn: number,
  breakKind: OracleLine['breakKind'],
): OracleLine {
  return {
    text,
    sourceText: prepared.sourceText.slice(sourceStart, sourceEnd),
    sourceStart,
    sourceEnd,
    width,
    breakKind,
    overflow: startColumn + width > columns ? { width: startColumn + width, columns } : null,
  }
}

function normalizeOracleLineStart(prepared: PreparedTerminalText, start: Position): Position {
  const next = { ...start }
  while (next.graphemeIndex === 0 && next.segmentIndex < prepared.segments.length) {
    const kind = prepared.kinds[next.segmentIndex]
    if (kind !== 'space' && kind !== 'zero-width-break' && kind !== 'soft-hyphen') break
    next.segmentIndex++
  }
  return next
}

function readOracleUnit(
  prepared: PreparedTerminalText,
  position: Position,
  absoluteColumn: number,
): { text: string, width: number, sourceStart: number, sourceEnd: number, next: Position } | null {
  const segment = prepared.segments[position.segmentIndex]
  if (segment === undefined) return null
  const graphemes = Array.from(graphemeSegmenter.segment(segment), item => item.segment)
  const grapheme = graphemes[position.graphemeIndex]
  if (grapheme === undefined) return null
  const localStart = graphemes.slice(0, position.graphemeIndex).join('').length
  const sourceStart = (prepared.sourceStarts[position.segmentIndex] ?? prepared.sourceText.length) + localStart
  const sourceEnd = sourceStart + grapheme.length
  const next = position.graphemeIndex + 1 >= graphemes.length
    ? { segmentIndex: position.segmentIndex + 1, graphemeIndex: 0 }
    : { segmentIndex: position.segmentIndex, graphemeIndex: position.graphemeIndex + 1 }
  const kind = prepared.kinds[position.segmentIndex]
  if (kind === 'tab') {
    const width = terminalTabAdvance(absoluteColumn, prepared.tabStopAdvance)
    return { text: ' '.repeat(width), width, sourceStart, sourceEnd, next }
  }
  if (kind === 'soft-hyphen' || kind === 'zero-width-break') {
    return { text: '', width: 0, sourceStart, sourceEnd, next }
  }
  return {
    text: grapheme,
    width: terminalGraphemeWidth(grapheme, prepared.widthProfile),
    sourceStart,
    sourceEnd,
    next,
  }
}

function sourceOffsetForPosition(prepared: PreparedTerminalText, position: Position): number {
  if (position.segmentIndex >= prepared.segments.length) return prepared.sourceText.length
  const segmentStart = prepared.sourceStarts[position.segmentIndex] ?? prepared.sourceText.length
  if (position.graphemeIndex === 0) return segmentStart
  const segment = prepared.segments[position.segmentIndex] ?? ''
  const graphemes = Array.from(graphemeSegmenter.segment(segment), item => item.segment)
  return segmentStart + graphemes.slice(0, position.graphemeIndex).join('').length
}

function comparePositions(a: Position, b: Position): number {
  if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex
  return a.graphemeIndex - b.graphemeIndex
}

function graphemeBoundarySet(text: string): Set<number> {
  const offsets = new Set<number>([0])
  let offset = 0
  for (const item of graphemeSegmenter.segment(text)) {
    offset += item.segment.length
    offsets.add(offset)
  }
  return offsets
}

function cursorKey(cursor: { segmentIndex: number, graphemeIndex: number }): string {
  return `${cursor.segmentIndex}:${cursor.graphemeIndex}`
}

export function hasUnsafeControls(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const allowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c
    if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x1b) && !allowedWhitespace) {
      return true
    }
  }
  return false
}

export function stableHash(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function parseCliArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq === -1) args[arg.slice(2)] = true
    else args[arg.slice(2, eq)] = arg.slice(eq + 1)
  }
  return args
}

export function createSeededRandom(seed: string): () => number {
  let state = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 0x01000193)
  }
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch\nactual:   ${JSON.stringify(actual, null, 2)}\nexpected: ${JSON.stringify(expected, null, 2)}`)
  }
}
