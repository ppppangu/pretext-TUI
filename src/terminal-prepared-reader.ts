// 补建说明：该文件为后续补建，用于为通用 TUI 文本内核提供 opaque prepared document handle 与内部 reader 能力边界；当前进度：Task 1 首版，先把现有 prepared segments 存储收进 WeakMap，后续 chunked reader 可在同一边界内替换实现。
import type { SegmentBreakKind } from './analysis.js'
import type { PreparedTextWithSegments } from './layout.js'
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

type PreparedTerminalTextState = {
  geometry: PreparedTerminalGeometry | null
  prepared: PreparedTextWithSegments
}

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
    geometry: null,
    prepared,
  })
  return handle
}

export function getInternalPreparedTerminalText(
  prepared: PreparedTerminalText,
): PreparedTextWithSegments {
  return internalPreparedTerminalTextState(prepared).prepared
}

export function getInternalPreparedTerminalGeometry(
  prepared: PreparedTerminalText,
): PreparedTerminalGeometry {
  const state = internalPreparedTerminalTextState(prepared)
  if (state.geometry !== null) {
    return state.geometry
  }
  state.geometry = createPreparedTerminalGeometry(state.prepared)
  return state.geometry
}

export function getInternalPreparedTerminalTextDebugSnapshot(
  prepared: PreparedTerminalText,
): PreparedTerminalTextDebugSnapshot {
  const state = internalPreparedTerminalTextState(prepared)
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
  prepared: PreparedTextWithSegments,
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
