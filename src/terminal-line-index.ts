// 补建说明：该文件为后续补建，用于提供 Task 9 的 fixed-column sparse terminal line index；当前进度：运行时 handle 已改为 WeakMap-backed opaque 边界，并支持 append 后按 source/row 精确失效。
import {
  TERMINAL_START_CURSOR,
  layoutNextTerminalLineRange,
  type PreparedTerminalText,
  type TerminalCursor,
  type TerminalLayoutOptions,
  type TerminalLineRange,
} from './terminal.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalReader,
} from './terminal-prepared-reader.js'
import { getTerminalSourceOffsetForCursor } from './terminal-source-offset-index.js'

export type TerminalFixedLayoutOptions = TerminalLayoutOptions & {
  anchorInterval?: number
  generation?: number
}

export type TerminalRowAnchor = Readonly<{
  kind: 'terminal-row-anchor@1'
  cursor: TerminalCursor
  row: number
  sourceOffset: number
  startColumn: number
}>

export type TerminalLineIndexStats = Readonly<{
  anchorCount: number
  maxReplayRows: number
  rangeWalks: number
}>

export type TerminalLineIndexMetadata = Readonly<{
  anchorInterval: number
  columns: number
  generation: number
  rows: number | null
  startColumn: number
}>

export type TerminalLineIndexInvalidation = Readonly<{
  generation: number
  firstInvalidRow?: number
  firstInvalidSourceOffset?: number
}>

export type TerminalLineIndexInvalidationResult = Readonly<{
  kind: 'terminal-line-index-invalidation@1'
  generation: number
  firstInvalidRow?: number
  firstInvalidSourceOffset?: number
}>

export type TerminalLineIndexIdentity = Readonly<{
  columns: number
  generation: number
  layoutKey: string
  startColumn: number
}>

export type TerminalLineIndexCursorProjection = Readonly<{
  line: TerminalLineRange
  row: number
}>

declare const terminalLineIndexBrand: unique symbol

export type TerminalLineIndex = Readonly<{
  kind: 'terminal-line-index@1'
  readonly [terminalLineIndexBrand]: true
}>

type InternalTerminalLineIndex = {
  readonly anchorInterval: number
  readonly columns: number
  generation: number
  readonly layoutKey: string
  prepared: PreparedTerminalText
  readonly startColumn: number
  readonly anchors: TerminalRowAnchor[]
  rows: number | null
  stats: TerminalLineIndexStats
}

type MutableTerminalLineIndexStats = {
  anchorCount: number
  maxReplayRows: number
  rangeWalks: number
}

const DEFAULT_ANCHOR_INTERVAL = 64
const lineIndexStates = new WeakMap<TerminalLineIndex, InternalTerminalLineIndex>()

export function createTerminalLineIndex(
  prepared: PreparedTerminalText,
  options: TerminalFixedLayoutOptions,
): TerminalLineIndex {
  const reader = getInternalPreparedTerminalReader(prepared)
  const columns = normalizePositiveInteger(options.columns, 'Terminal line index columns')
  const startColumn = normalizeNonNegativeInteger(options.startColumn ?? 0, 'Terminal line index startColumn')
  const anchorInterval = normalizePositiveInteger(
    options.anchorInterval ?? DEFAULT_ANCHOR_INTERVAL,
    'Terminal line index anchorInterval',
  )
  const anchors = [createAnchor(0, TERMINAL_START_CURSOR, startColumn, 0)]
  const handle = Object.freeze({
    kind: 'terminal-line-index@1',
  }) as TerminalLineIndex
  lineIndexStates.set(handle, {
    columns,
    startColumn,
    anchorInterval,
    generation: normalizeNonNegativeInteger(options.generation ?? 0, 'Terminal line index generation'),
    layoutKey: createLineIndexLayoutKey(reader, columns, startColumn),
    prepared,
    anchors,
    rows: null,
    stats: {
      anchorCount: anchors.length,
      maxReplayRows: 0,
      rangeWalks: 0,
    },
  })
  return handle
}

export function getTerminalLineRangeAtRow(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  row: number,
): TerminalLineRange | null {
  const targetRow = normalizeNonNegativeInteger(row, 'Terminal row')
  const seek = seekTerminalLineIndexToRow(prepared, index, targetRow)
  if (seek === null) return null
  const line = layoutNextTerminalLineRange(prepared, seek.cursor, {
    columns: seek.internal.columns,
    startColumn: seek.startColumn,
  })
  incrementRangeWalks(seek.internal)
  if (line === null) {
    seek.internal.rows = seek.currentRow
    return null
  }
  return line
}

export function getTerminalLineRangesAtRows(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  row: number,
  rowCount: number,
): readonly TerminalLineRange[] {
  const targetRow = normalizeNonNegativeInteger(row, 'Terminal row')
  const requestedRows = normalizePositiveInteger(rowCount, 'Terminal row count')
  const seek = seekTerminalLineIndexToRow(prepared, index, targetRow)
  if (seek === null) return []
  const internal = seek.internal
  let cursor = seek.cursor
  let startColumn = seek.startColumn
  let currentRow = seek.currentRow

  const lines: TerminalLineRange[] = []
  while (lines.length < requestedRows) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: internal.columns,
      startColumn,
    })
    incrementRangeWalks(internal)
    if (line === null) {
      internal.rows = currentRow
      break
    }

    lines.push(line)
    cursor = line.end
    startColumn = 0
    currentRow++
    if (shouldStoreAnchor(internal, currentRow)) {
      maybeStoreAnchor(internal, createAnchor(
        currentRow,
        cursor,
        startColumn,
        getTerminalSourceOffsetForCursor(prepared, cursor),
      ))
    }
  }

  return lines
}

export function getTerminalLineRangeForCursor(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  cursor: TerminalCursor,
  sourceOffset: number,
): TerminalLineIndexCursorProjection | null {
  const targetSourceOffset = normalizeSourceOffsetForLineProjection(prepared, sourceOffset)
  const seek = seekTerminalLineIndexToSourceOffset(prepared, index, targetSourceOffset)
  const internal = seek.internal
  let currentCursor = seek.cursor
  let startColumn = seek.startColumn
  let currentRow = seek.currentRow
  let replayRows = 0
  let previous: TerminalLineIndexCursorProjection | null = null

  while (true) {
    const line = layoutNextTerminalLineRange(prepared, currentCursor, {
      columns: internal.columns,
      startColumn,
    })
    incrementRangeWalks(internal)
    if (line === null) {
      internal.rows = currentRow
      recordReplayRows(internal, replayRows)
      return previous
    }

    if (compareTerminalCursors(cursor, line.start) < 0) {
      recordReplayRows(internal, replayRows)
      return createCursorProjection(currentRow, line)
    }

    const endComparison = compareTerminalCursors(cursor, line.end)
    if (endComparison < 0) {
      recordReplayRows(internal, replayRows)
      return createCursorProjection(currentRow, line)
    }

    previous = createCursorProjection(currentRow, line)
    currentCursor = line.end
    startColumn = 0
    currentRow++
    replayRows++
    if (shouldStoreAnchor(internal, currentRow)) {
      maybeStoreAnchor(internal, createAnchor(
        currentRow,
        currentCursor,
        startColumn,
        getTerminalSourceOffsetForCursor(prepared, currentCursor),
      ))
    }
  }
}

type TerminalLineIndexSeekResult = {
  currentRow: number
  cursor: TerminalCursor
  internal: InternalTerminalLineIndex
  startColumn: number
}

type TerminalLineIndexSourceSeekResult = TerminalLineIndexSeekResult

function seekTerminalLineIndexToRow(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  targetRow: number,
): TerminalLineIndexSeekResult | null {
  // Replaying from a sparse anchor is intentionally stateful: it updates walk stats and stores
  // anchors crossed before the requested row, while leaving the target row itself to the caller.
  const internal = internalLineIndex(index)
  assertPreparedMatchesLineIndex(prepared, internal)
  if (internal.rows !== null && targetRow >= internal.rows) return null

  const anchor = findNearestAnchorByRow(internal.anchors, targetRow)
  let cursor = anchor.cursor
  let startColumn = anchor.startColumn
  let currentRow = anchor.row
  let replayRows = 0

  while (currentRow < targetRow) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: internal.columns,
      startColumn,
    })
    incrementRangeWalks(internal)
    if (line === null) {
      internal.rows = currentRow
      return null
    }

    cursor = line.end
    startColumn = 0
    currentRow++
    replayRows++
    if (shouldStoreAnchor(internal, currentRow)) {
      maybeStoreAnchor(internal, createAnchor(
        currentRow,
        cursor,
        startColumn,
        getTerminalSourceOffsetForCursor(prepared, cursor),
      ))
    }
  }

  recordReplayRows(internal, replayRows)
  return {
    currentRow,
    cursor,
    internal,
    startColumn,
  }
}

function seekTerminalLineIndexToSourceOffset(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  targetSourceOffset: number,
): TerminalLineIndexSourceSeekResult {
  const internal = internalLineIndex(index)
  assertPreparedMatchesLineIndex(prepared, internal)
  const anchor = findNearestAnchorBySourceOffset(internal.anchors, targetSourceOffset)
  return {
    currentRow: anchor.row,
    cursor: anchor.cursor,
    internal,
    startColumn: anchor.startColumn,
  }
}

export function measureTerminalLineIndexRows(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
): number {
  const internal = internalLineIndex(index)
  assertPreparedMatchesLineIndex(prepared, internal)
  if (internal.rows !== null) return internal.rows
  let row = 0
  while (getTerminalLineRangeAtRow(prepared, index, row) !== null) {
    row++
  }
  internal.rows = row
  return row
}

export function getTerminalLineIndexStats(index: TerminalLineIndex): TerminalLineIndexStats {
  const internal = internalLineIndex(index)
  return {
    ...internal.stats,
    anchorCount: internal.anchors.length,
  }
}

export function getTerminalLineIndexMetadata(index: TerminalLineIndex): TerminalLineIndexMetadata {
  const internal = internalLineIndex(index)
  return {
    anchorInterval: internal.anchorInterval,
    columns: internal.columns,
    generation: internal.generation,
    rows: internal.rows,
    startColumn: internal.startColumn,
  }
}

export function invalidateTerminalLineIndex(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  invalidation: TerminalLineIndexInvalidation,
): TerminalLineIndexInvalidationResult {
  const internal = internalLineIndex(index)
  const generation = normalizeNonNegativeInteger(invalidation.generation, 'Terminal line index invalidation generation')
  const invalidationFirstInvalidRow = invalidation.firstInvalidRow === undefined
    ? undefined
    : normalizeNonNegativeInteger(invalidation.firstInvalidRow, 'Terminal firstInvalidRow')
  const invalidationFirstInvalidSourceOffset = invalidation.firstInvalidSourceOffset === undefined
    ? undefined
    : normalizeNonNegativeInteger(invalidation.firstInvalidSourceOffset, 'Terminal firstInvalidSourceOffset')
  const nextReader = getInternalPreparedTerminalReader(prepared)
  const nextLayoutKey = createLineIndexLayoutKey(nextReader, internal.columns, internal.startColumn)
  if (nextLayoutKey !== internal.layoutKey) {
    throw new Error('Terminal line index cannot be invalidated with prepared text that has a different layout identity')
  }
  const firstInvalidSourceOffset = invalidationFirstInvalidSourceOffset
  const firstInvalidRow = invalidationFirstInvalidRow ?? (
    firstInvalidSourceOffset === undefined
      ? undefined
      : findFirstInvalidRowForSourceOffset(internal, firstInvalidSourceOffset)
  )

  if (firstInvalidRow === undefined && firstInvalidSourceOffset === undefined) {
    internal.anchors.length = 1
    internal.rows = null
    internal.generation = generation
    internal.prepared = prepared
    updateAnchorCount(internal)
    return {
      kind: 'terminal-line-index-invalidation@1',
      generation,
    }
  }

  const keep = internal.anchors.filter(anchor => {
    if (anchor.row === 0) return true
    if (firstInvalidRow !== undefined && anchor.row >= firstInvalidRow) return false
    if (firstInvalidSourceOffset !== undefined && anchor.sourceOffset >= firstInvalidSourceOffset) return false
    return true
  })
  internal.anchors.length = 0
  internal.anchors.push(...keep)
  internal.rows = null
  internal.generation = generation
  internal.prepared = prepared
  updateAnchorCount(internal)

  const result: {
    kind: 'terminal-line-index-invalidation@1'
    generation: number
    firstInvalidRow?: number
    firstInvalidSourceOffset?: number
  } = {
    kind: 'terminal-line-index-invalidation@1',
    generation,
  }
  if (firstInvalidRow !== undefined) result.firstInvalidRow = firstInvalidRow
  if (firstInvalidSourceOffset !== undefined) result.firstInvalidSourceOffset = firstInvalidSourceOffset
  return result
}

export function assertTerminalLineIndexPrepared(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
): void {
  assertPreparedMatchesLineIndex(prepared, internalLineIndex(index))
}

export function getTerminalLineIndexIdentity(index: TerminalLineIndex): TerminalLineIndexIdentity {
  const internal = internalLineIndex(index)
  return {
    columns: internal.columns,
    generation: internal.generation,
    layoutKey: internal.layoutKey,
    startColumn: internal.startColumn,
  }
}

function createAnchor(
  row: number,
  cursor: TerminalCursor,
  startColumn: number,
  sourceOffset: number,
): TerminalRowAnchor {
  return {
    kind: 'terminal-row-anchor@1',
    row,
    cursor,
    startColumn,
    sourceOffset,
  }
}

function createCursorProjection(row: number, line: TerminalLineRange): TerminalLineIndexCursorProjection {
  return { row, line }
}

function createLineIndexLayoutKey(
  reader: PreparedTerminalReader,
  columns: number,
  startColumn: number,
): string {
  return [
    reader.widthProfile.cacheKey,
    `tab=${reader.tabStopAdvance}`,
    `columns=${columns}`,
    `start=${startColumn}`,
  ].join('|')
}

function maybeStoreAnchor(index: InternalTerminalLineIndex, anchor: TerminalRowAnchor): void {
  if (hasAnchorAtRow(index.anchors, anchor.row)) return
  const last = index.anchors[index.anchors.length - 1]
  if (last === undefined || last.row <= anchor.row) {
    index.anchors.push(anchor)
  } else {
    index.anchors.splice(findAnchorRowUpperBound(index.anchors, anchor.row), 0, anchor)
  }
  updateAnchorCount(index)
}

function shouldStoreAnchor(index: InternalTerminalLineIndex, row: number): boolean {
  return row % index.anchorInterval === 0 && !hasAnchorAtRow(index.anchors, row)
}

function findNearestAnchorByRow(anchors: readonly TerminalRowAnchor[], row: number): TerminalRowAnchor {
  const insertionIndex = findAnchorRowUpperBound(anchors, row)
  return anchors[Math.max(0, insertionIndex - 1)]!
}

function findAnchorRowUpperBound(anchors: readonly TerminalRowAnchor[], row: number): number {
  let lo = 0
  let hi = anchors.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (anchors[mid]!.row <= row) lo = mid + 1
    else hi = mid
  }
  return lo
}

function hasAnchorAtRow(anchors: readonly TerminalRowAnchor[], row: number): boolean {
  let lo = 0
  let hi = anchors.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (anchors[mid]!.row < row) lo = mid + 1
    else hi = mid
  }
  return anchors[lo]?.row === row
}

function compareTerminalCursors(a: TerminalCursor, b: TerminalCursor): number {
  if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex
  return a.graphemeIndex - b.graphemeIndex
}

function findNearestAnchorBySourceOffset(
  anchors: readonly TerminalRowAnchor[],
  sourceOffset: number,
): TerminalRowAnchor {
  // Row anchors are row-sorted; their cursor-derived source offsets are monotonic for the
  // current terminal layout model. Preserve the former linear scan semantics: last <= target.
  let lo = 0
  let hi = anchors.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (anchors[mid]!.sourceOffset <= sourceOffset) lo = mid + 1
    else hi = mid
  }
  return anchors[Math.max(0, lo - 1)]!
}

function findFirstInvalidRowForSourceOffset(
  index: InternalTerminalLineIndex,
  sourceOffset: number,
): number {
  const prepared = index.prepared
  const reader = getInternalPreparedTerminalReader(prepared)
  const clamped = Math.max(0, Math.min(reader.sourceLength, sourceOffset))
  const anchor = findNearestAnchorBySourceOffset(index.anchors, clamped)
  let cursor = anchor.cursor
  let startColumn = anchor.startColumn
  let currentRow = anchor.row

  while (true) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: index.columns,
      startColumn,
    })
    if (line === null) return Math.max(0, currentRow - 1)
    if (line.sourceStart >= clamped) return clamped === 0 ? currentRow : Math.max(0, currentRow - 1)
    if (line.sourceEnd >= clamped) return currentRow
    cursor = line.end
    startColumn = 0
    currentRow++
  }
}

function incrementRangeWalks(index: InternalTerminalLineIndex): void {
  const stats = mutableStats(index)
  stats.rangeWalks++
  index.stats = stats
}

function recordReplayRows(index: InternalTerminalLineIndex, replayRows: number): void {
  const stats = mutableStats(index)
  stats.maxReplayRows = Math.max(stats.maxReplayRows, replayRows)
  index.stats = stats
}

function updateAnchorCount(index: InternalTerminalLineIndex): void {
  const stats = mutableStats(index)
  stats.anchorCount = index.anchors.length
  index.stats = stats
}

function mutableStats(index: InternalTerminalLineIndex): MutableTerminalLineIndexStats {
  return { ...index.stats }
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`)
  }
  return value
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return value
}

function normalizeSourceOffsetForLineProjection(
  prepared: PreparedTerminalText,
  sourceOffset: number,
): number {
  if (!Number.isInteger(sourceOffset)) {
    throw new Error(`Terminal source offset must be an integer, got ${sourceOffset}`)
  }
  const reader = getInternalPreparedTerminalReader(prepared)
  return Math.max(0, Math.min(reader.sourceLength, sourceOffset))
}

function assertPreparedMatchesLineIndex(
  prepared: PreparedTerminalText,
  index: InternalTerminalLineIndex,
): void {
  if (index.prepared !== prepared) {
    throw new Error('Terminal line index is bound to a different prepared text')
  }
}

function internalLineIndex(index: TerminalLineIndex): InternalTerminalLineIndex {
  const state = lineIndexStates.get(index)
  if (state === undefined) {
    throw new Error('Invalid terminal line index handle')
  }
  return state
}
