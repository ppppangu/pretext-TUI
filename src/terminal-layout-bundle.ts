// 补建说明：该文件为后续补建，用于把 source offset index、fixed-column line index 与 page cache 组合成统一失效边界；当前进度：Phase 3 首版提供 append 后的 generation/layout identity 协议，不替代底层 primitives。
import type { PreparedTerminalText } from './terminal.js'
import type { TerminalAppendInvalidation } from './terminal-cell-flow.js'
import { getInternalPreparedTerminalReader } from './terminal-prepared-reader.js'
import {
  createTerminalLineIndex,
  getTerminalLineIndexMemoryEstimate,
  getTerminalLineIndexMetadata,
  getTerminalLineIndexStats,
  invalidateTerminalLineIndex,
  type TerminalFixedLayoutOptions,
  type TerminalLineIndex,
  type TerminalLineIndexInvalidation,
  type TerminalLineIndexInvalidationResult,
  type TerminalLineIndexStats,
} from './terminal-line-index.js'
import {
  createTerminalPageCache,
  getTerminalLinePage,
  getTerminalPageCacheMemoryEstimate,
  getTerminalPageCacheStats,
  invalidateTerminalPageCache,
  type TerminalLinePage,
  type TerminalLinePageRequest,
  type TerminalPageCache,
  type TerminalPageCacheOptions,
  type TerminalPageCacheStats,
} from './terminal-page-cache.js'
import {
  createTerminalSourceOffsetIndex,
  getTerminalSourceOffsetIndexMemoryEstimate,
  type TerminalSourceOffsetIndex,
} from './terminal-source-offset-index.js'
import { materializePreparedTerminalSourceTextRange } from './terminal-line-source.js'
import {
  combineTerminalMemoryBudgetEstimates,
  type TerminalMemoryBudgetEstimate,
} from './terminal-memory-budget.js'

export type TerminalLayoutBundleOptions = TerminalFixedLayoutOptions & TerminalPageCacheOptions

export type TerminalLayoutBundleInvalidation =
  | TerminalAppendInvalidation
  | Readonly<TerminalLineIndexInvalidation & { previousGeneration?: number }>

export type TerminalLayoutBundleInvalidationResult = Readonly<{
  kind: 'terminal-layout-bundle-invalidation@1'
  generation: number
  previousGeneration: number
  firstInvalidRow?: number
  firstInvalidSourceOffset?: number
  lineIndex: TerminalLineIndexInvalidationResult
}>

export type TerminalLayoutBundleStats = Readonly<{
  lineIndex: TerminalLineIndexStats
  pageCache: TerminalPageCacheStats
}>

type NormalizedTerminalAppendInvalidation = Readonly<{
  appendedRawCodeUnits: number
  firstInvalidSourceOffset: number
  generation: number
  invalidatedSourceCodeUnits: number
  previousGeneration: number
  reprepareSourceCodeUnits: number
  stablePrefixCodeUnits: number
  strategy: TerminalAppendInvalidation['strategy']
}>

declare const terminalLayoutBundleBrand: unique symbol

export type TerminalLayoutBundle = Readonly<{
  kind: 'terminal-layout-bundle@1'
  readonly [terminalLayoutBundleBrand]: true
}>

type InternalTerminalLayoutBundle = {
  lineIndex: TerminalLineIndex
  pageCache: TerminalPageCache
  prepared: PreparedTerminalText
  generation: number
  sourceIndex: TerminalSourceOffsetIndex | null
}

const DEFAULT_PAGE_SIZE = 64
const DEFAULT_MAX_PAGES = 16
const layoutBundleStates = new WeakMap<TerminalLayoutBundle, InternalTerminalLayoutBundle>()

export function createTerminalLayoutBundle(
  prepared: PreparedTerminalText,
  options: TerminalLayoutBundleOptions,
): TerminalLayoutBundle {
  const lineIndex = createTerminalLineIndex(prepared, options)
  const pageSize = normalizePositiveInteger(options.pageSize ?? DEFAULT_PAGE_SIZE, 'Terminal bundle pageSize')
  const maxPages = normalizePositiveInteger(options.maxPages ?? DEFAULT_MAX_PAGES, 'Terminal bundle maxPages')
  const pageCache = createTerminalPageCache(prepared, lineIndex, { pageSize, maxPages })
  const handle = Object.freeze({
    kind: 'terminal-layout-bundle@1',
  }) as TerminalLayoutBundle
  layoutBundleStates.set(handle, {
    prepared,
    lineIndex,
    pageCache,
    generation: getTerminalLineIndexMetadata(lineIndex).generation,
    sourceIndex: null,
  })
  return handle
}

export function getTerminalLayoutBundleProjectionIndexes(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
): Readonly<{
  lineIndex: TerminalLineIndex
  sourceIndex: TerminalSourceOffsetIndex
}> {
  const internal = internalLayoutBundle(bundle)
  assertPreparedMatchesBundle(prepared, internal)
  internal.sourceIndex ??= createTerminalSourceOffsetIndex(prepared)
  return Object.freeze({
    lineIndex: internal.lineIndex,
    sourceIndex: internal.sourceIndex,
  })
}

export function getTerminalLayoutBundleLineIndex(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
): TerminalLineIndex {
  const internal = internalLayoutBundle(bundle)
  assertPreparedMatchesBundle(prepared, internal)
  return internal.lineIndex
}

export function getTerminalLayoutBundlePage(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  request: TerminalLinePageRequest,
): TerminalLinePage {
  const internal = internalLayoutBundle(bundle)
  assertPreparedMatchesBundle(prepared, internal)
  return getTerminalLinePage(
    prepared,
    internal.pageCache,
    internal.lineIndex,
    request,
  )
}

export function invalidateTerminalLayoutBundle(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  invalidation: TerminalLayoutBundleInvalidation,
): TerminalLayoutBundleInvalidationResult {
  const internal = internalLayoutBundle(bundle)
  const normalizedInvalidation = normalizeTerminalLayoutBundleInvalidation(
    prepared,
    internal,
    invalidation,
  )
  const previousGeneration = internal.generation
  const lineIndexInvalidation = invalidateTerminalLineIndex(
    prepared,
    internal.lineIndex,
    normalizedInvalidation,
  )
  invalidateTerminalPageCache(internal.pageCache, lineIndexInvalidation)
  internal.sourceIndex = null
  internal.prepared = prepared
  internal.generation = lineIndexInvalidation.generation

  const result: {
    kind: 'terminal-layout-bundle-invalidation@1'
    generation: number
    previousGeneration: number
    firstInvalidRow?: number
    firstInvalidSourceOffset?: number
    lineIndex: TerminalLineIndexInvalidationResult
  } = {
    kind: 'terminal-layout-bundle-invalidation@1',
    generation: lineIndexInvalidation.generation,
    previousGeneration,
    lineIndex: lineIndexInvalidation,
  }
  if (lineIndexInvalidation.firstInvalidRow !== undefined) {
    result.firstInvalidRow = lineIndexInvalidation.firstInvalidRow
  }
  if (lineIndexInvalidation.firstInvalidSourceOffset !== undefined) {
    result.firstInvalidSourceOffset = lineIndexInvalidation.firstInvalidSourceOffset
  }
  return Object.freeze(result)
}

export function getTerminalLayoutBundleStats(
  bundle: TerminalLayoutBundle,
): TerminalLayoutBundleStats {
  const internal = internalLayoutBundle(bundle)
  return {
    lineIndex: getTerminalLineIndexStats(internal.lineIndex),
    pageCache: getTerminalPageCacheStats(internal.pageCache),
  }
}

export function getTerminalLayoutBundleMemoryEstimate(
  bundle: TerminalLayoutBundle,
  label = 'terminal layout bundle',
): TerminalMemoryBudgetEstimate {
  const internal = internalLayoutBundle(bundle)
  const estimates = [
    getTerminalLineIndexMemoryEstimate(internal.lineIndex, `${label} line index`),
    getTerminalPageCacheMemoryEstimate(internal.pageCache, `${label} page cache`),
    ...(internal.sourceIndex === null ? [] : [
      getTerminalSourceOffsetIndexMemoryEstimate(internal.sourceIndex, `${label} source index`),
    ]),
  ]
  return combineTerminalMemoryBudgetEstimates(label, estimates, 'layout-bundle')
}

function normalizeTerminalLayoutBundleInvalidation(
  prepared: PreparedTerminalText,
  internal: InternalTerminalLayoutBundle,
  invalidation: TerminalLayoutBundleInvalidation,
): TerminalLineIndexInvalidation {
  const generation = normalizeNonNegativeInteger(invalidation.generation, 'Terminal layout bundle generation')
  if (generation !== internal.generation + 1) {
    throw new Error(
      `Terminal layout bundle invalidation generation must advance from ${internal.generation} to ${internal.generation + 1}, got ${generation}`,
    )
  }
  if (invalidation.previousGeneration !== undefined && invalidation.previousGeneration !== internal.generation) {
    throw new Error(
      `Terminal layout bundle invalidation previousGeneration must match current generation ${internal.generation}, got ${invalidation.previousGeneration}`,
    )
  }
  const firstInvalidSourceOffset = invalidation.firstInvalidSourceOffset === undefined
    ? undefined
    : normalizeNonNegativeInteger(
      invalidation.firstInvalidSourceOffset,
      'Terminal layout bundle firstInvalidSourceOffset',
    )
  const firstInvalidRowValue = 'firstInvalidRow' in invalidation
    ? invalidation.firstInvalidRow
    : undefined
  const firstInvalidRow = firstInvalidRowValue === undefined
    ? undefined
    : normalizeNonNegativeInteger(
      firstInvalidRowValue,
      'Terminal layout bundle firstInvalidRow',
    )

  if (isTerminalAppendInvalidation(invalidation)) {
    validateTerminalAppendPrepared(
      prepared,
      internal,
      normalizeTerminalAppendInvalidation(invalidation, generation, firstInvalidSourceOffset),
    )
  }

  const normalized: {
    generation: number
    firstInvalidRow?: number
    firstInvalidSourceOffset?: number
  } = { generation }
  if (firstInvalidSourceOffset !== undefined) {
    normalized.firstInvalidSourceOffset = firstInvalidSourceOffset
  } else if (firstInvalidRow !== undefined) {
    normalized.firstInvalidRow = firstInvalidRow
  }
  return normalized
}

function validateTerminalAppendPrepared(
  prepared: PreparedTerminalText,
  internal: InternalTerminalLayoutBundle,
  invalidation: NormalizedTerminalAppendInvalidation,
): void {
  if (prepared === internal.prepared) {
    throw new Error('Terminal layout bundle append invalidation requires the appended prepared text')
  }
  const reader = getInternalPreparedTerminalReader(prepared)
  if (
    invalidation.strategy.startsWith('full-reprepare-') &&
    reader.sourceLength !== invalidation.reprepareSourceCodeUnits
  ) {
    throw new Error(
      `Terminal layout bundle append prepared source length must match reprepareSourceCodeUnits ${invalidation.reprepareSourceCodeUnits}, got ${reader.sourceLength}`,
    )
  }
  if (
    invalidation.strategy.startsWith('chunked-append-') &&
    invalidation.reprepareSourceCodeUnits > reader.sourceLength
  ) {
    throw new Error(
      `Terminal layout bundle append reprepareSourceCodeUnits must fit prepared source length ${reader.sourceLength}, got ${invalidation.reprepareSourceCodeUnits}`,
    )
  }
  const previousReader = getInternalPreparedTerminalReader(internal.prepared)
  if (invalidation.stablePrefixCodeUnits > previousReader.sourceLength) {
    throw new Error(
      `Terminal layout bundle append stablePrefixCodeUnits must fit the previous prepared text, got ${invalidation.stablePrefixCodeUnits}`,
    )
  }
  if (invalidation.firstInvalidSourceOffset > invalidation.stablePrefixCodeUnits) {
    throw new Error(
      'Terminal layout bundle append firstInvalidSourceOffset must be within the stable prefix',
    )
  }
  const previousStablePrefix = materializePreparedTerminalSourceTextRange(
    previousReader,
    0,
    invalidation.stablePrefixCodeUnits,
  )
  const nextStablePrefix = materializePreparedTerminalSourceTextRange(
    reader,
    0,
    invalidation.stablePrefixCodeUnits,
  )
  if (previousStablePrefix !== nextStablePrefix) {
    throw new Error('Terminal layout bundle append stable prefix does not match the previous prepared text')
  }
  const expectedInvalidatedSourceCodeUnits = Math.max(0, reader.sourceLength - invalidation.firstInvalidSourceOffset)
  if (expectedInvalidatedSourceCodeUnits !== invalidation.invalidatedSourceCodeUnits) {
    throw new Error(
      `Terminal layout bundle append invalidatedSourceCodeUnits must match prepared text, got ${invalidation.invalidatedSourceCodeUnits}`,
    )
  }
}

function normalizeTerminalAppendInvalidation(
  invalidation: TerminalAppendInvalidation,
  generation: number,
  firstInvalidSourceOffset: number | undefined,
): NormalizedTerminalAppendInvalidation {
  const previousGeneration = normalizeNonNegativeInteger(
    invalidation.previousGeneration,
    'Terminal layout bundle append previousGeneration',
  )
  const appendedRawCodeUnits = normalizeNonNegativeInteger(
    invalidation.appendedRawCodeUnits,
    'Terminal layout bundle append appendedRawCodeUnits',
  )
  const stablePrefixCodeUnits = normalizeNonNegativeInteger(
    invalidation.stablePrefixCodeUnits,
    'Terminal layout bundle append stablePrefixCodeUnits',
  )
  const normalizedFirstInvalidSourceOffset = firstInvalidSourceOffset ?? normalizeNonNegativeInteger(
    invalidation.firstInvalidSourceOffset,
    'Terminal layout bundle append firstInvalidSourceOffset',
  )
  const invalidatedSourceCodeUnits = normalizeNonNegativeInteger(
    invalidation.invalidatedSourceCodeUnits,
    'Terminal layout bundle append invalidatedSourceCodeUnits',
  )
  const reprepareSourceCodeUnits = normalizeNonNegativeInteger(
    invalidation.reprepareSourceCodeUnits,
    'Terminal layout bundle append reprepareSourceCodeUnits',
  )
  const strategy = normalizeTerminalAppendStrategy(invalidation.strategy)
  return {
    appendedRawCodeUnits,
    firstInvalidSourceOffset: normalizedFirstInvalidSourceOffset,
    generation,
    invalidatedSourceCodeUnits,
    previousGeneration,
    reprepareSourceCodeUnits,
    stablePrefixCodeUnits,
    strategy,
  }
}

function normalizeTerminalAppendStrategy(value: unknown): TerminalAppendInvalidation['strategy'] {
  if (
    value === 'full-reprepare-bounded-invalidation' ||
    value === 'full-reprepare-normalized-invalidation' ||
    value === 'chunked-append-bounded-invalidation' ||
    value === 'chunked-append-normalized-invalidation'
  ) {
    return value
  }
  throw new Error(`Terminal layout bundle append strategy must be a known append strategy, got ${formatUnknown(value)}`)
}

function isTerminalAppendInvalidation(
  invalidation: TerminalLayoutBundleInvalidation,
): invalidation is TerminalAppendInvalidation {
  return 'kind' in invalidation && invalidation.kind === 'terminal-append-invalidation@1'
}

function assertPreparedMatchesBundle(
  prepared: PreparedTerminalText,
  internal: InternalTerminalLayoutBundle,
): void {
  if (internal.prepared !== prepared) {
    throw new Error('Terminal layout bundle is bound to a different prepared text')
  }
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

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return Object.prototype.toString.call(value)
}

function internalLayoutBundle(bundle: TerminalLayoutBundle): InternalTerminalLayoutBundle {
  const state = layoutBundleStates.get(bundle)
  if (state === undefined) {
    throw new Error('Invalid terminal layout bundle handle')
  }
  return state
}
