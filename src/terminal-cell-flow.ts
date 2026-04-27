// 补建说明：该文件为后续补建，用于提供 appendable terminal cell-flow generation boundary；当前进度：Phase 8 开始将 full reprepare append 替换为 sealed chunks + open normalized tail 的 reader-backed storage。
import {
  type PreparedTerminalText,
  type TerminalPrepareOptions,
} from './terminal.js'
import { prepareNormalizedTerminalSource } from './terminal-normalized-source.js'
import {
  createPreparedTerminalTextFromReader,
  getInternalPreparedTerminalGeometry,
  getInternalPreparedTerminalReader,
} from './terminal-prepared-reader.js'
import { getTerminalSegmentGeometry } from './terminal-grapheme-geometry.js'
import {
  createPreparedTerminalReaderFromStore,
  createPreparedTerminalReaderStoreFromReaders,
} from './terminal-reader-store.js'
import {
  createTerminalMemoryBudgetEstimate,
  type TerminalMemoryBudgetEstimate,
} from './terminal-memory-budget.js'

export type TerminalAppendStrategy =
  | 'full-reprepare-bounded-invalidation'
  | 'full-reprepare-normalized-invalidation'
  | 'chunked-append-bounded-invalidation'
  | 'chunked-append-normalized-invalidation'

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

export type TerminalCellFlowDebugStats = Readonly<{
  chunkCount: number
  openTailSourceCodeUnits: number
  sourceLength: number
}>

type TerminalCellFlowState = {
  chunks: readonly TerminalCellFlowChunk[]
  generation: number
  normalizer: TerminalCellFlowNormalizerState
  openSource: string
  openSourceStart: number
  prepareOptions: TerminalPrepareOptions
  prepared: PreparedTerminalText
  sourceLength: number
}

type TerminalCellFlowChunk = Readonly<{
  prepared: PreparedTerminalText
  source: string
}>

type TerminalCellFlowNormalizerState =
  | {
    kind: 'normal'
    pendingWhitespace: boolean
    sourceLength: number
  }
  | {
    kind: 'pre-wrap'
    rawEndedWithCR: boolean
    sourceLength: number
  }

type TerminalCellFlowNormalizedAppend = Readonly<{
  normalizer: TerminalCellFlowNormalizerState
  sourceDelta: string
}>

declare const preparedTerminalCellFlowBrand: unique symbol

const DEFAULT_APPEND_INVALIDATION_WINDOW_CODE_UNITS = 2048
const MIN_OPEN_TAIL_SOURCE_CODE_UNITS = 128
const MAX_OPEN_TAIL_SOURCE_CODE_UNITS = 512
const cellFlowStates = new WeakMap<PreparedTerminalCellFlow, TerminalCellFlowState>()

export function prepareTerminalCellFlow(
  text: string,
  options: TerminalPrepareOptions = {},
): PreparedTerminalCellFlow {
  const prepareOptions = clonePrepareOptions(options)
  const normalized = normalizeInitialTerminalCellFlowSource(text, prepareOptions)
  return createCellFlowFromState({
    chunks: [],
    generation: 0,
    normalizer: normalized.normalizer,
    openSource: normalized.sourceDelta,
    openSourceStart: 0,
    prepareOptions,
    sourceLength: normalized.normalizer.sourceLength,
  })
}

export function getTerminalCellFlowPrepared(flow: PreparedTerminalCellFlow): PreparedTerminalText {
  return internalCellFlow(flow).prepared
}

export function getTerminalCellFlowGeneration(flow: PreparedTerminalCellFlow): number {
  return internalCellFlow(flow).generation
}

export function getTerminalCellFlowDebugStats(flow: PreparedTerminalCellFlow): TerminalCellFlowDebugStats {
  const state = internalCellFlow(flow)
  return Object.freeze({
    chunkCount: state.chunks.length + (state.openSource.length > 0 || state.chunks.length === 0 ? 1 : 0),
    openTailSourceCodeUnits: state.openSource.length,
    sourceLength: state.sourceLength,
  })
}

export function getTerminalCellFlowMemoryEstimate(
  flow: PreparedTerminalCellFlow,
  label = 'terminal cell flow',
): TerminalMemoryBudgetEstimate {
  const state = internalCellFlow(flow)
  const sealedSourceCodeUnits = state.chunks.reduce((sum, chunk) => sum + chunk.source.length, 0)
  return createTerminalMemoryBudgetEstimate({
    category: 'cell-flow',
    label,
    stringCodeUnits: sealedSourceCodeUnits + state.openSource.length,
    numberSlots: state.chunks.length * 6 + state.sourceLength + 6,
    objectEntries: state.chunks.length * 4 + 3,
    rangeRecords: state.chunks.length + (state.openSource.length > 0 ? 1 : 0),
    notes: ['append-only chunk source storage plus retained prepared reader/store overhead; dependent layout/source indexes are estimated separately'],
  })
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
  const previousSourceLength = previousState.sourceLength
  const reparseStartSourceOffset = previousState.openSourceStart
  const normalized = normalizeTerminalCellFlowAppend(text, previousState.normalizer)
  const reprepareSourceCodeUnits = previousState.openSource.length + normalized.sourceDelta.length
  const nextFlow = createCellFlowFromState({
    chunks: previousState.chunks,
    generation: previousState.generation + 1,
    normalizer: normalized.normalizer,
    openSource: previousState.openSource + normalized.sourceDelta,
    openSourceStart: previousState.openSourceStart,
    prepareOptions: previousState.prepareOptions,
    sourceLength: normalized.normalizer.sourceLength,
  })
  const nextPrepared = internalCellFlow(nextFlow).prepared
  const nextReader = getInternalPreparedTerminalReader(nextPrepared)
  const stablePrefixCodeUnits = previousSourceLength
  const rawWindowStart = Math.max(0, previousSourceLength - invalidationWindowCodeUnits)
  const windowStart = snapToPreviousSourceBoundary(previousState.prepared, rawWindowStart)
  const firstInvalidSourceOffset = Math.min(
    stablePrefixCodeUnits,
    windowStart,
    reparseStartSourceOffset,
  )
  const strategy = reparseStartSourceOffset >= windowStart
    ? 'chunked-append-bounded-invalidation'
    : 'chunked-append-normalized-invalidation'

  return {
    flow: nextFlow,
    invalidation: {
      kind: 'terminal-append-invalidation@1',
      generation: previousState.generation + 1,
      previousGeneration: previousState.generation,
      appendedRawCodeUnits: text.length,
      stablePrefixCodeUnits,
      firstInvalidSourceOffset,
      invalidatedSourceCodeUnits: Math.max(0, nextReader.sourceLength - firstInvalidSourceOffset),
      reprepareSourceCodeUnits,
      strategy,
    },
  }
}

function createCellFlowFromState(
  input: Omit<TerminalCellFlowState, 'prepared'>,
): PreparedTerminalCellFlow {
  const sealed = sealTerminalCellFlowOpenSource(input)
  const prepared = createChunkedPreparedTerminalText(
    sealed.chunks,
    sealed.openSource,
    input.prepareOptions,
  )
  const handle = Object.freeze({
    kind: 'prepared-terminal-cell-flow@1',
  }) as PreparedTerminalCellFlow
  cellFlowStates.set(handle, {
    chunks: sealed.chunks,
    generation: input.generation,
    normalizer: input.normalizer,
    openSource: sealed.openSource,
    openSourceStart: sealed.openSourceStart,
    prepareOptions: input.prepareOptions,
    prepared,
    sourceLength: input.sourceLength,
  })
  return handle
}

function createChunkedPreparedTerminalText(
  chunks: readonly TerminalCellFlowChunk[],
  openSource: string,
  prepareOptions: TerminalPrepareOptions,
): PreparedTerminalText {
  const allChunks = [...chunks]
  if (openSource.length > 0 || chunks.length === 0) {
    allChunks.push(createTerminalCellFlowChunk(openSource, prepareOptions))
  }
  const readers = allChunks.map(chunk => getInternalPreparedTerminalReader(chunk.prepared))
  const store = createPreparedTerminalReaderStoreFromReaders(readers)
  const reader = createPreparedTerminalReaderFromStore(store)
  return createPreparedTerminalTextFromReader(reader)
}

function createTerminalCellFlowChunk(
  source: string,
  prepareOptions: TerminalPrepareOptions,
): TerminalCellFlowChunk {
  return Object.freeze({
    source,
    prepared: prepareNormalizedTerminalSource(source, prepareOptions),
  })
}

function sealTerminalCellFlowOpenSource(
  state: Omit<TerminalCellFlowState, 'prepared'>,
): Readonly<{
  chunks: readonly TerminalCellFlowChunk[]
  openSource: string
  openSourceStart: number
}> {
  const sealSourceCodeUnits = findTerminalCellFlowSealOffset(
    state.openSource,
    state.prepareOptions.whiteSpace ?? 'normal',
  )
  if (sealSourceCodeUnits <= 0) {
    return {
      chunks: state.chunks,
      openSource: state.openSource,
      openSourceStart: state.openSourceStart,
    }
  }

  const sealedSource = state.openSource.slice(0, sealSourceCodeUnits)
  const openSource = state.openSource.slice(sealSourceCodeUnits)
  return {
    chunks: [
      ...state.chunks,
      createTerminalCellFlowChunk(sealedSource, state.prepareOptions),
    ],
    openSource,
    openSourceStart: state.openSourceStart + sealedSource.length,
  }
}

function findTerminalCellFlowSealOffset(
  source: string,
  whiteSpace: TerminalPrepareOptions['whiteSpace'],
): number {
  if (source.length <= MAX_OPEN_TAIL_SOURCE_CODE_UNITS) return 0
  const maxCut = source.length - MIN_OPEN_TAIL_SOURCE_CODE_UNITS
  const boundary = whiteSpace === 'pre-wrap'
    ? source.lastIndexOf('\n', maxCut)
    : source.lastIndexOf(' ', maxCut)
  return boundary < 0 ? 0 : boundary + 1
}

function normalizeInitialTerminalCellFlowSource(
  text: string,
  prepareOptions: TerminalPrepareOptions,
): TerminalCellFlowNormalizedAppend {
  const whiteSpace = prepareOptions.whiteSpace ?? 'normal'
  return normalizeTerminalCellFlowAppend(
    text,
    whiteSpace === 'pre-wrap'
      ? { kind: 'pre-wrap', rawEndedWithCR: false, sourceLength: 0 }
      : { kind: 'normal', pendingWhitespace: false, sourceLength: 0 },
  )
}

function normalizeTerminalCellFlowAppend(
  text: string,
  state: TerminalCellFlowNormalizerState,
): TerminalCellFlowNormalizedAppend {
  return state.kind === 'pre-wrap'
    ? normalizePreWrapAppend(text, state)
    : normalizeNormalAppend(text, state)
}

function normalizeNormalAppend(
  text: string,
  state: Extract<TerminalCellFlowNormalizerState, { kind: 'normal' }>,
): TerminalCellFlowNormalizedAppend {
  let sourceDelta = ''
  let pendingWhitespace = state.pendingWhitespace

  for (const char of text) {
    if (isNormalCollapsibleWhitespace(char)) {
      pendingWhitespace = true
      continue
    }
    if (pendingWhitespace && state.sourceLength + sourceDelta.length > 0) {
      sourceDelta += ' '
    }
    pendingWhitespace = false
    sourceDelta += char
  }

  return {
    sourceDelta,
    normalizer: {
      kind: 'normal',
      pendingWhitespace,
      sourceLength: state.sourceLength + sourceDelta.length,
    },
  }
}

function normalizePreWrapAppend(
  text: string,
  state: Extract<TerminalCellFlowNormalizerState, { kind: 'pre-wrap' }>,
): TerminalCellFlowNormalizedAppend {
  let sourceDelta = ''
  let index = 0
  if (state.rawEndedWithCR && text.charCodeAt(0) === 0x0a) {
    index = 1
  }

  while (index < text.length) {
    const code = text.charCodeAt(index)
    if (code === 0x0d) {
      sourceDelta += '\n'
      index += text.charCodeAt(index + 1) === 0x0a ? 2 : 1
      continue
    }
    if (code === 0x0c) {
      sourceDelta += '\n'
      index++
      continue
    }
    sourceDelta += text[index]!
    index++
  }

  return {
    sourceDelta,
    normalizer: {
      kind: 'pre-wrap',
      rawEndedWithCR: text.length === 0 ? state.rawEndedWithCR : text.charCodeAt(text.length - 1) === 0x0d,
      sourceLength: state.sourceLength + sourceDelta.length,
    },
  }
}

function isNormalCollapsibleWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

function clonePrepareOptions(options: TerminalPrepareOptions): TerminalPrepareOptions {
  const clone: TerminalPrepareOptions = {}
  if (options.whiteSpace !== undefined) clone.whiteSpace = options.whiteSpace
  if (options.wordBreak !== undefined) clone.wordBreak = options.wordBreak
  if (options.widthProfile !== undefined) {
    clone.widthProfile = typeof options.widthProfile === 'object'
      ? { ...options.widthProfile }
      : options.widthProfile
  }
  if (options.tabSize !== undefined) clone.tabSize = options.tabSize
  return clone
}

function snapToPreviousSourceBoundary(prepared: PreparedTerminalText, sourceOffset: number): number {
  const reader = getInternalPreparedTerminalReader(prepared)
  const geometry = getInternalPreparedTerminalGeometry(prepared)
  const clamped = Math.max(0, Math.min(reader.sourceLength, sourceOffset))
  let best = 0
  for (let segmentIndex = 0; segmentIndex < reader.segmentCount; segmentIndex++) {
    const segment = reader.segmentText(segmentIndex) ?? ''
    const segmentStart = reader.segmentSourceStart(segmentIndex)
    const segmentEnd = segmentStart + segment.length
    if (clamped < segmentStart) return best
    if (clamped >= segmentEnd) {
      best = segmentEnd
      continue
    }

    const segmentGeometry = getTerminalSegmentGeometry(geometry, segmentIndex)
    for (const localOffset of segmentGeometry.localSourceOffsets) {
      const nextBoundary = segmentStart + localOffset
      if (nextBoundary > clamped) return best
      best = nextBoundary
    }
    return best
  }
  return best
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
