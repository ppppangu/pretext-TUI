// 补建说明：该文件为后续补建，用于提供 Task 9 的 appendable terminal cell-flow generation boundary；当前进度：运行时 flow 已改为 WeakMap-backed opaque handle，append 语义明确为 full reprepare + bounded cache invalidation。
import {
  prepareTerminal,
  type PreparedTerminalText,
  type TerminalPrepareOptions,
} from './terminal.js'

export type TerminalAppendStrategy =
  | 'full-reprepare-bounded-invalidation'
  | 'full-reprepare-normalized-invalidation'

export type PreparedTerminalCellFlow = Readonly<{
  kind: 'prepared-terminal-cell-flow@1'
  readonly [preparedTerminalCellFlowBrand]: true
}>

export type TerminalAppendInvalidation = Readonly<{
  kind: 'terminal-append-invalidation@1'
  appendedRawCodeUnits: number
  firstInvalidSourceOffset: number
  generation: number
  invalidatedSourceCodeUnits: number
  previousGeneration: number
  reprepareSourceCodeUnits: number
  stablePrefixCodeUnits: number
  strategy: TerminalAppendStrategy
}>

export type TerminalAppendResult = Readonly<{
  flow: PreparedTerminalCellFlow
  invalidation: TerminalAppendInvalidation
}>

export type TerminalAppendOptions = {
  invalidationWindowCodeUnits?: number
}

type TerminalCellFlowState = {
  generation: number
  prepareOptions: TerminalPrepareOptions
  prepared: PreparedTerminalText
  rawText: string
}

declare const preparedTerminalCellFlowBrand: unique symbol

const DEFAULT_APPEND_INVALIDATION_WINDOW_CODE_UNITS = 2048
const cellFlowStates = new WeakMap<PreparedTerminalCellFlow, TerminalCellFlowState>()

export function prepareTerminalCellFlow(
  text: string,
  options: TerminalPrepareOptions = {},
): PreparedTerminalCellFlow {
  return createCellFlow(text, clonePrepareOptions(options), 0)
}

export function getTerminalCellFlowPrepared(flow: PreparedTerminalCellFlow): PreparedTerminalText {
  return internalCellFlow(flow).prepared
}

export function getTerminalCellFlowGeneration(flow: PreparedTerminalCellFlow): number {
  return internalCellFlow(flow).generation
}

export function appendTerminalCellFlow(
  flow: PreparedTerminalCellFlow,
  text: string,
  options: TerminalAppendOptions = {},
): TerminalAppendResult {
  const invalidationWindowCodeUnits = normalizePositiveInteger(
    options.invalidationWindowCodeUnits ?? DEFAULT_APPEND_INVALIDATION_WINDOW_CODE_UNITS,
    'Terminal append invalidationWindowCodeUnits',
  )
  const previousState = internalCellFlow(flow)
  const previousPrepared = previousState.prepared
  const nextFlow = createCellFlow(
    previousState.rawText + text,
    previousState.prepareOptions,
    previousState.generation + 1,
  )
  const nextPrepared = internalCellFlow(nextFlow).prepared
  const rawStablePrefix = commonPrefixLength(previousPrepared.sourceText, nextPrepared.sourceText)
  const stablePrefixCodeUnits = snapToPreviousSourceBoundary(previousPrepared, rawStablePrefix)
  const rawWindowStart = Math.max(0, previousPrepared.sourceText.length - invalidationWindowCodeUnits)
  const windowStart = snapToPreviousSourceBoundary(previousPrepared, rawWindowStart)
  const firstInvalidSourceOffset = Math.min(stablePrefixCodeUnits, windowStart)
  const strategy = stablePrefixCodeUnits >= windowStart
    ? 'full-reprepare-bounded-invalidation'
    : 'full-reprepare-normalized-invalidation'

  return {
    flow: nextFlow,
    invalidation: {
      kind: 'terminal-append-invalidation@1',
      generation: previousState.generation + 1,
      previousGeneration: previousState.generation,
      appendedRawCodeUnits: text.length,
      stablePrefixCodeUnits,
      firstInvalidSourceOffset,
      invalidatedSourceCodeUnits: Math.max(0, nextPrepared.sourceText.length - firstInvalidSourceOffset),
      reprepareSourceCodeUnits: nextPrepared.sourceText.length,
      strategy,
    },
  }
}

function createCellFlow(
  rawText: string,
  prepareOptions: TerminalPrepareOptions,
  generation: number,
): PreparedTerminalCellFlow {
  const handle = Object.freeze({
    kind: 'prepared-terminal-cell-flow@1',
  }) as PreparedTerminalCellFlow
  cellFlowStates.set(handle, {
    generation,
    rawText,
    prepareOptions,
    prepared: prepareTerminal(rawText, prepareOptions),
  })
  return handle
}

function clonePrepareOptions(options: TerminalPrepareOptions): TerminalPrepareOptions {
  const clone: TerminalPrepareOptions = {}
  if (options.whiteSpace !== undefined) clone.whiteSpace = options.whiteSpace
  if (options.wordBreak !== undefined) clone.wordBreak = options.wordBreak
  if (options.widthProfile !== undefined) clone.widthProfile = options.widthProfile
  if (options.tabSize !== undefined) clone.tabSize = options.tabSize
  return clone
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) {
    index++
  }
  return index
}

function snapToPreviousSourceBoundary(prepared: PreparedTerminalText, sourceOffset: number): number {
  const clamped = Math.max(0, Math.min(prepared.sourceText.length, sourceOffset))
  let best = 0
  for (let segmentIndex = 0; segmentIndex < prepared.segments.length; segmentIndex++) {
    const segment = prepared.segments[segmentIndex] ?? ''
    const segmentStart = prepared.sourceStarts[segmentIndex] ?? prepared.sourceText.length
    const segmentEnd = segmentStart + segment.length
    if (clamped < segmentStart) return best
    if (clamped >= segmentEnd) {
      best = segmentEnd
      continue
    }

    let localOffset = 0
    for (const { segment: grapheme } of graphemeSegmenter().segment(segment)) {
      const nextOffset = localOffset + grapheme.length
      if (segmentStart + nextOffset > clamped) return segmentStart + localOffset
      localOffset = nextOffset
      best = segmentStart + localOffset
    }
    return best
  }
  return best
}

let sharedGraphemeSegmenter: Intl.Segmenter | null = null

function graphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`)
  }
  return value
}

function internalCellFlow(flow: PreparedTerminalCellFlow): TerminalCellFlowState {
  const state = cellFlowStates.get(flow)
  if (state === undefined) {
    throw new Error('Invalid terminal cell flow handle')
  }
  return state
}
