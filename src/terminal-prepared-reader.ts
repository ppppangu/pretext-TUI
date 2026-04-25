// 补建说明：该文件为后续补建，用于为通用 TUI 文本内核提供 opaque prepared document handle 与内部 reader 能力边界；当前进度：Batch 6 preflight 支持从既有 prepared 派生 single-store reader-backed handle，默认 prepare 仍为 array-backed，legacy storage 仅保留为兼容/debug 来源。
import type { SegmentBreakKind } from './analysis.js'
import type { PreparedTextWithSegments } from './layout.js'
import { createSingleStorePreparedTerminalReader } from './terminal-reader-store.js'
import {
  createPreparedTerminalGeometry,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'
import type { TerminalWidthProfile } from './terminal-width-profile.js'

declare const preparedTerminalTextBrand: unique symbol

export type PreparedTerminalText = Readonly<{
  kind: 'prepared-terminal-text@1'
  readonly [preparedTerminalTextBrand]: true
}>

type ArrayBackedPreparedTerminalTextState = {
  kind: 'array-backed'
  geometry: PreparedTerminalGeometry | null
  prepared: PreparedTextWithSegments
  reader: PreparedTerminalReader
}

type ReaderBackedPreparedTerminalTextState = {
  kind: 'reader-backed'
  debugSnapshotProvider?: () => PreparedTerminalTextDebugSnapshot
  geometry: PreparedTerminalGeometry | null
  reader: PreparedTerminalReader
}

type PreparedTerminalTextState =
  | ArrayBackedPreparedTerminalTextState
  | ReaderBackedPreparedTerminalTextState

export type PreparedTerminalReader = Readonly<{
  kind: 'prepared-terminal-reader@1'
  hasSegmentBreakAfter(segmentIndex: number): boolean
  segmentCount: number
  segmentKind(segmentIndex: number): SegmentBreakKind | undefined
  segmentSourceStart(segmentIndex: number): number
  segmentText(segmentIndex: number): string | undefined
  sourceLength: number
  tabStopAdvance: number
  widthProfile: TerminalWidthProfile
}>

export type PreparedTerminalTextDebugSnapshot = Readonly<{
  kind: 'prepared-terminal-text-debug-snapshot@1'
  breakableFitAdvances: readonly (readonly number[] | null)[]
  chunks: readonly PreparedTerminalTextChunkDebugSnapshot[]
  discretionaryHyphenWidth: number
  kinds: readonly SegmentBreakKind[]
  letterSpacing: number
  lineEndFitAdvances: readonly number[]
  lineEndPaintAdvances: readonly number[]
  segmentBreaksAfter: readonly boolean[]
  segments: readonly string[]
  segLevels: readonly number[] | null
  simpleLineWalkFastPath: boolean
  sourceStarts: readonly number[]
  sourceText: string
  spacingGraphemeCounts: readonly number[]
  tabStopAdvance: number
  widthProfile: TerminalWidthProfile
  widths: readonly number[]
}>

type PreparedTerminalTextChunkDebugSnapshot = Readonly<{
  consumedEndSegmentIndex: number
  endSegmentIndex: number
  startSegmentIndex: number
}>

const preparedTerminalTextStates = new WeakMap<PreparedTerminalText, PreparedTerminalTextState>()

export function createPreparedTerminalText(
  prepared: PreparedTextWithSegments,
): PreparedTerminalText {
  const handle = Object.freeze({
    kind: 'prepared-terminal-text@1',
  }) as PreparedTerminalText
  preparedTerminalTextStates.set(handle, {
    kind: 'array-backed',
    geometry: null,
    prepared,
    reader: createArrayPreparedTerminalReader(prepared),
  })
  return handle
}

export function createPreparedTerminalTextFromReader(
  reader: PreparedTerminalReader,
  debugSnapshotProvider?: () => PreparedTerminalTextDebugSnapshot,
): PreparedTerminalText {
  const handle = Object.freeze({
    kind: 'prepared-terminal-text@1',
  }) as PreparedTerminalText
  const state: ReaderBackedPreparedTerminalTextState = {
    kind: 'reader-backed',
    geometry: null,
    reader,
  }
  if (debugSnapshotProvider !== undefined) state.debugSnapshotProvider = debugSnapshotProvider
  preparedTerminalTextStates.set(handle, state)
  return handle
}

export function createSingleStorePreparedTerminalText(
  prepared: PreparedTerminalText,
): PreparedTerminalText {
  return createPreparedTerminalTextFromReader(
    createSingleStorePreparedTerminalReader(getInternalPreparedTerminalReader(prepared)),
    () => getInternalPreparedTerminalTextDebugSnapshot(prepared),
  )
}

export function getInternalPreparedTerminalText(
  prepared: PreparedTerminalText,
): PreparedTextWithSegments {
  const state = internalPreparedTerminalTextState(prepared)
  if (state.kind !== 'array-backed') {
    throw new Error('Prepared terminal text handle is reader-backed and has no legacy prepared storage')
  }
  return state.prepared
}

export function getInternalPreparedTerminalReader(
  prepared: PreparedTerminalText,
): PreparedTerminalReader {
  return internalPreparedTerminalTextState(prepared).reader
}

export function getInternalPreparedTerminalGeometry(
  prepared: PreparedTerminalText,
): PreparedTerminalGeometry {
  const state = internalPreparedTerminalTextState(prepared)
  if (state.geometry !== null) {
    return state.geometry
  }
  state.geometry = createPreparedTerminalGeometry(state.reader)
  return state.geometry
}

export function getInternalPreparedTerminalTextDebugSnapshot(
  prepared: PreparedTerminalText,
): PreparedTerminalTextDebugSnapshot {
  const state = internalPreparedTerminalTextState(prepared)
  if (state.kind === 'reader-backed') {
    if (state.debugSnapshotProvider === undefined) {
      throw new Error('Prepared terminal text handle has no debug snapshot provider')
    }
    return copyPreparedTerminalTextDebugSnapshot(state.debugSnapshotProvider())
  }
  return copyPreparedTerminalTextDebugSnapshot(state.prepared)
}

function internalPreparedTerminalTextState(prepared: PreparedTerminalText): PreparedTerminalTextState {
  const state = preparedTerminalTextStates.get(prepared)
  if (state === undefined) {
    throw new Error('Invalid prepared terminal text handle')
  }
  return state
}

function copyPreparedTerminalTextDebugSnapshot(
  prepared: PreparedTextWithSegments | PreparedTerminalTextDebugSnapshot,
): PreparedTerminalTextDebugSnapshot {
  return {
    kind: 'prepared-terminal-text-debug-snapshot@1',
    breakableFitAdvances: prepared.breakableFitAdvances.map(advances => (
      advances === null ? null : [...advances]
    )),
    chunks: prepared.chunks.map(chunk => ({ ...chunk })),
    discretionaryHyphenWidth: prepared.discretionaryHyphenWidth,
    kinds: [...prepared.kinds],
    letterSpacing: prepared.letterSpacing,
    lineEndFitAdvances: [...prepared.lineEndFitAdvances],
    lineEndPaintAdvances: [...prepared.lineEndPaintAdvances],
    segmentBreaksAfter: [...prepared.segmentBreaksAfter],
    segments: [...prepared.segments],
    segLevels: prepared.segLevels === null ? null : Array.from(prepared.segLevels),
    simpleLineWalkFastPath: prepared.simpleLineWalkFastPath,
    sourceStarts: [...prepared.sourceStarts],
    sourceText: prepared.sourceText,
    spacingGraphemeCounts: [...prepared.spacingGraphemeCounts],
    tabStopAdvance: prepared.tabStopAdvance,
    widthProfile: { ...prepared.widthProfile },
    widths: [...prepared.widths],
  }
}

function createArrayPreparedTerminalReader(
  prepared: PreparedTextWithSegments,
): PreparedTerminalReader {
  return Object.freeze({
    kind: 'prepared-terminal-reader@1',
    get segmentCount() {
      return prepared.segments.length
    },
    get sourceLength() {
      return prepared.sourceText.length
    },
    get tabStopAdvance() {
      return prepared.tabStopAdvance
    },
    get widthProfile() {
      return prepared.widthProfile
    },
    hasSegmentBreakAfter(segmentIndex: number): boolean {
      return prepared.segmentBreaksAfter[segmentIndex] ?? false
    },
    segmentKind(segmentIndex: number): SegmentBreakKind | undefined {
      return prepared.kinds[segmentIndex]
    },
    segmentSourceStart(segmentIndex: number): number {
      return prepared.sourceStarts[segmentIndex] ?? prepared.sourceText.length
    },
    segmentText(segmentIndex: number): string | undefined {
      return prepared.segments[segmentIndex]
    },
  })
}
