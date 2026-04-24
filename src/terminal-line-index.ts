// 补建说明：该文件为后续补建，用于提供 Task 9 的 fixed-column sparse terminal line index；当前进度：运行时 handle 已改为 WeakMap-backed opaque 边界，并支持 append 后按 source/row 精确失效。
import {
  TERMINAL_START_CURSOR,
  layoutNextTerminalLineRange,
  type PreparedTerminalText,
  type TerminalCursor,
  type TerminalLayoutOptions,
  type TerminalLineRange,
} from './terminal.js'
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
    generation: options.generation ?? 0,
    layoutKey: [
      prepared.widthProfile.cacheKey,
      `tab=${prepared.tabStopAdvance}`,
      `columns=${columns}`,
      `start=${startColumn}`,
    ].join('|'),
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
  const internal = internalLineIndex(index)
  assertPreparedMatchesLineIndex(prepared, internal)
  if (internal.rows !== null && targetRow >= internal.rows) return null

  const anchor = findNearestAnchorByRow(internal.anchors, targetRow)
  let cursor = anchor.cursor
  let startColumn = anchor.startColumn
  let currentRow = anchor.row
  let replayRows = 0

  while (currentRow <= targetRow) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: internal.columns,
      startColumn,
    })
    incrementRangeWalks(internal)
    if (line === null) {
      internal.rows = currentRow
      return null
    }
    if (currentRow === targetRow) {
      recordReplayRows(internal, replayRows)
      return line
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

  return null
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
  const firstInvalidSourceOffset = invalidation.firstInvalidSourceOffset
  const firstInvalidRow = invalidation.firstInvalidRow ?? (
    firstInvalidSourceOffset === undefined
      ? undefined
      : findFirstInvalidRowForSourceOffset(internal, firstInvalidSourceOffset)
  )

  if (firstInvalidRow === undefined && firstInvalidSourceOffset === undefined) {
    internal.anchors.length = 1
    internal.rows = null
    internal.generation = invalidation.generation
    internal.prepared = prepared
    updateAnchorCount(internal)
    return {
      kind: 'terminal-line-index-invalidation@1',
      generation: invalidation.generation,
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
  internal.generation = invalidation.generation
  internal.prepared = prepared
  updateAnchorCount(internal)

  const result: {
    kind: 'terminal-line-index-invalidation@1'
    generation: number
    firstInvalidRow?: number
    firstInvalidSourceOffset?: number
  } = {
    kind: 'terminal-line-index-invalidation@1',
    generation: invalidation.generation,
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

function maybeStoreAnchor(index: InternalTerminalLineIndex, anchor: TerminalRowAnchor): void {
  index.anchors.push(anchor)
  index.anchors.sort((a, b) => a.row - b.row)
  updateAnchorCount(index)
}

function shouldStoreAnchor(index: InternalTerminalLineIndex, row: number): boolean {
  return row % index.anchorInterval === 0 && !index.anchors.some(item => item.row === row)
}

function findNearestAnchorByRow(anchors: readonly TerminalRowAnchor[], row: number): TerminalRowAnchor {
  let lo = 0
  let hi = anchors.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (anchors[mid]!.row <= row) lo = mid + 1
    else hi = mid
  }
  return anchors[Math.max(0, lo - 1)]!
}

function findNearestAnchorBySourceOffset(
  anchors: readonly TerminalRowAnchor[],
  sourceOffset: number,
): TerminalRowAnchor {
  let candidate = anchors[0]!
  for (const anchor of anchors) {
    if (anchor.sourceOffset > sourceOffset) break
    candidate = anchor
  }
  return candidate
}

function findFirstInvalidRowForSourceOffset(
  index: InternalTerminalLineIndex,
  sourceOffset: number,
): number {
  const prepared = index.prepared
  const clamped = Math.max(0, Math.min(prepared.sourceText.length, sourceOffset))
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
    if (line.sourceEnd >= clamped || line.sourceStart >= clamped) return currentRow
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
