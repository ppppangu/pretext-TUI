// 补建说明：该文件为后续补建，用于提供 Task 9 的 terminal source-offset/cursor lookup index；当前进度：运行时 handle 已改为 WeakMap-backed opaque 边界，索引严格绑定 prepared handle。
import type { PreparedTerminalText, TerminalCursor } from './terminal.js'

export type TerminalSourceOffsetBias = 'before' | 'after' | 'closest'

export type TerminalSourceLookupResult = Readonly<{
  kind: 'terminal-source-lookup@1'
  cursor: TerminalCursor
  exact: boolean
  requestedSourceOffset: number
  sourceOffset: number
}>

type SourceBoundary = Readonly<{
  cursor: TerminalCursor
  sourceOffset: number
}>

type TerminalSourceOffsetIndexState = {
  readonly boundaries: readonly SourceBoundary[]
  readonly cursorOffsets: ReadonlyMap<string, number>
  readonly prepared: PreparedTerminalText
}

declare const terminalSourceOffsetIndexBrand: unique symbol

export type TerminalSourceOffsetIndex = Readonly<{
  kind: 'terminal-source-offset-index@1'
  readonly [terminalSourceOffsetIndexBrand]: true
}>

const sourceBoundaryCursorKind = 'terminal-cursor@1' as const
const sourceOffsetIndexStates = new WeakMap<TerminalSourceOffsetIndex, TerminalSourceOffsetIndexState>()

export function createTerminalSourceOffsetIndex(
  prepared: PreparedTerminalText,
): TerminalSourceOffsetIndex {
  const boundaries: SourceBoundary[] = []
  const cursorOffsets = new Map<string, number>()
  const seenOffsets = new Set<string>()

  function pushBoundary(cursor: TerminalCursor, sourceOffset: number): void {
    const key = `${sourceOffset}:${cursor.segmentIndex}:${cursor.graphemeIndex}`
    if (seenOffsets.has(key)) return
    seenOffsets.add(key)
    boundaries.push({ cursor, sourceOffset })
    cursorOffsets.set(cursorKey(cursor), sourceOffset)
  }

  pushBoundary(createTerminalCursor(0, 0), 0)
  for (let segmentIndex = 0; segmentIndex < prepared.segments.length; segmentIndex++) {
    const segment = prepared.segments[segmentIndex] ?? ''
    const segmentStart = prepared.sourceStarts[segmentIndex] ?? prepared.sourceText.length
    pushBoundary(createTerminalCursor(segmentIndex, 0), segmentStart)
    let localOffset = 0
    let graphemeIndex = 0
    for (const { segment: grapheme } of graphemeSegmenter().segment(segment)) {
      localOffset += grapheme.length
      graphemeIndex++
      pushBoundary(createTerminalCursor(segmentIndex, graphemeIndex), segmentStart + localOffset)
    }
  }
  pushBoundary(createTerminalCursor(prepared.segments.length, 0), prepared.sourceText.length)

  boundaries.sort((a, b) => {
    if (a.sourceOffset !== b.sourceOffset) return a.sourceOffset - b.sourceOffset
    if (a.cursor.segmentIndex !== b.cursor.segmentIndex) return a.cursor.segmentIndex - b.cursor.segmentIndex
    return a.cursor.graphemeIndex - b.cursor.graphemeIndex
  })

  const handle = Object.freeze({
    kind: 'terminal-source-offset-index@1',
  }) as TerminalSourceOffsetIndex
  sourceOffsetIndexStates.set(handle, {
    prepared,
    boundaries,
    cursorOffsets,
  })
  return handle
}

export function isTerminalSourceOffsetIndexForPrepared(
  prepared: PreparedTerminalText,
  index: TerminalSourceOffsetIndex,
): boolean {
  return internalSourceIndex(index).prepared === prepared
}

export function getTerminalSourceOffsetForCursor(
  prepared: PreparedTerminalText,
  cursor: TerminalCursor,
  index?: TerminalSourceOffsetIndex,
): number {
  if (index !== undefined) {
    assertMatchingPrepared(prepared, index)
    const found = internalSourceIndex(index).cursorOffsets.get(cursorKey(cursor))
    if (found !== undefined) return found
  }

  if (cursor.segmentIndex >= prepared.segments.length) return prepared.sourceText.length
  const segment = prepared.segments[cursor.segmentIndex] ?? ''
  const segmentStart = prepared.sourceStarts[cursor.segmentIndex] ?? prepared.sourceText.length
  if (cursor.graphemeIndex <= 0) return segmentStart

  let localOffset = 0
  let graphemeIndex = 0
  for (const { segment: grapheme } of graphemeSegmenter().segment(segment)) {
    if (graphemeIndex >= cursor.graphemeIndex) break
    localOffset += grapheme.length
    graphemeIndex++
  }
  return Math.min(prepared.sourceText.length, segmentStart + localOffset)
}

export function getTerminalCursorForSourceOffset(
  prepared: PreparedTerminalText,
  index: TerminalSourceOffsetIndex,
  sourceOffset: number,
  bias: TerminalSourceOffsetBias = 'closest',
): TerminalSourceLookupResult {
  assertMatchingPrepared(prepared, index)
  if (!Number.isInteger(sourceOffset)) {
    throw new Error(`Terminal source offset must be an integer, got ${sourceOffset}`)
  }
  const requestedSourceOffset = sourceOffset
  const clamped = Math.max(0, Math.min(prepared.sourceText.length, sourceOffset))
  const boundaries = internalSourceIndex(index).boundaries
  const after = lowerBoundSourceOffset(boundaries, clamped)
  const exact = boundaries[after]?.sourceOffset === clamped
  const chosen = exact
    ? chooseExactBoundary(boundaries, after, upperBoundSourceOffset(boundaries, clamped), bias)
    : chooseBoundary(boundaries, after, clamped, bias)

  return {
    kind: 'terminal-source-lookup@1',
    cursor: copyTerminalCursor(chosen.cursor),
    exact,
    requestedSourceOffset,
    sourceOffset: chosen.sourceOffset,
  }
}

function chooseExactBoundary(
  boundaries: readonly SourceBoundary[],
  first: number,
  lastExclusive: number,
  bias: TerminalSourceOffsetBias,
): SourceBoundary {
  if (bias === 'before') return boundaries[first]!
  return boundaries[lastExclusive - 1]!
}

function chooseBoundary(
  boundaries: readonly SourceBoundary[],
  after: number,
  sourceOffset: number,
  bias: TerminalSourceOffsetBias,
): SourceBoundary {
  const afterBoundary = boundaries[Math.min(after, boundaries.length - 1)]
  const beforeBoundary = boundaries[Math.max(0, after - 1)]
  if (afterBoundary !== undefined && afterBoundary.sourceOffset === sourceOffset) return afterBoundary
  if (bias === 'after') return afterBoundary ?? beforeBoundary!
  if (bias === 'before') return beforeBoundary ?? afterBoundary!

  if (beforeBoundary === undefined) return afterBoundary!
  if (afterBoundary === undefined) return beforeBoundary
  const beforeDistance = Math.abs(sourceOffset - beforeBoundary.sourceOffset)
  const afterDistance = Math.abs(afterBoundary.sourceOffset - sourceOffset)
  return beforeDistance <= afterDistance ? beforeBoundary : afterBoundary
}

function upperBoundSourceOffset(boundaries: readonly SourceBoundary[], sourceOffset: number): number {
  let lo = 0
  let hi = boundaries.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (boundaries[mid]!.sourceOffset <= sourceOffset) lo = mid + 1
    else hi = mid
  }
  return lo
}

function lowerBoundSourceOffset(boundaries: readonly SourceBoundary[], sourceOffset: number): number {
  let lo = 0
  let hi = boundaries.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (boundaries[mid]!.sourceOffset < sourceOffset) lo = mid + 1
    else hi = mid
  }
  return lo
}

let sharedGraphemeSegmenter: Intl.Segmenter | null = null

function graphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

function createTerminalCursor(segmentIndex: number, graphemeIndex: number): TerminalCursor {
  return Object.freeze({
    kind: sourceBoundaryCursorKind,
    segmentIndex,
    graphemeIndex,
  })
}

function copyTerminalCursor(cursor: TerminalCursor): TerminalCursor {
  return createTerminalCursor(cursor.segmentIndex, cursor.graphemeIndex)
}

function assertMatchingPrepared(
  prepared: PreparedTerminalText,
  index: TerminalSourceOffsetIndex,
): void {
  if (!isTerminalSourceOffsetIndexForPrepared(prepared, index)) {
    throw new Error('Terminal source offset index was built for a different prepared source')
  }
}

function cursorKey(cursor: TerminalCursor): string {
  return `${cursor.segmentIndex}:${cursor.graphemeIndex}`
}

function internalSourceIndex(index: TerminalSourceOffsetIndex): TerminalSourceOffsetIndexState {
  const state = sourceOffsetIndexStates.get(index)
  if (state === undefined) {
    throw new Error('Invalid terminal source offset index handle')
  }
  return state
}
