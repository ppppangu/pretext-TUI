// 补建说明：该文件为后续补建，用于作为发布包根入口的唯一 TypeScript 公共契约与运行时 facade；当前进度：Task 2 review 修正，替代 build 脚本中的手写 .d.ts 字符串，避免两套 API 真相源。
import {
  TERMINAL_START_CURSOR as internalTerminalStartCursor,
  layoutNextTerminalLineRange as internalLayoutNextTerminalLineRange,
  layoutTerminal as internalLayoutTerminal,
  materializeTerminalLineRange as internalMaterializeTerminalLineRange,
  measureTerminalLineStats as internalMeasureTerminalLineStats,
  prepareTerminal as internalPrepareTerminal,
  walkTerminalLineRanges as internalWalkTerminalLineRanges,
} from './terminal.js'
import {
  appendTerminalCellFlow as internalAppendTerminalCellFlow,
  getTerminalCellFlowGeneration as internalGetTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared as internalGetTerminalCellFlowPrepared,
  prepareTerminalCellFlow as internalPrepareTerminalCellFlow,
} from './terminal-cell-flow.js'
import {
  createTerminalLineIndex as internalCreateTerminalLineIndex,
  getTerminalLineIndexMetadata as internalGetTerminalLineIndexMetadata,
  getTerminalLineIndexStats as internalGetTerminalLineIndexStats,
  getTerminalLineRangeAtRow as internalGetTerminalLineRangeAtRow,
  invalidateTerminalLineIndex as internalInvalidateTerminalLineIndex,
  measureTerminalLineIndexRows as internalMeasureTerminalLineIndexRows,
} from './terminal-line-index.js'
import {
  materializeTerminalLinePage as internalMaterializeTerminalLinePage,
  materializeTerminalLineRanges as internalMaterializeTerminalLineRanges,
} from './terminal-materialize.js'
import {
  createTerminalPageCache as internalCreateTerminalPageCache,
  getTerminalLinePage as internalGetTerminalLinePage,
  getTerminalPageCacheStats as internalGetTerminalPageCacheStats,
  invalidateTerminalPageCache as internalInvalidateTerminalPageCache,
} from './terminal-page-cache.js'
import {
  createTerminalLayoutBundle as internalCreateTerminalLayoutBundle,
  getTerminalLayoutBundlePage as internalGetTerminalLayoutBundlePage,
  invalidateTerminalLayoutBundle as internalInvalidateTerminalLayoutBundle,
} from './terminal-layout-bundle.js'
import {
  createTerminalSourceOffsetIndex as internalCreateTerminalSourceOffsetIndex,
  getTerminalCursorForSourceOffset as internalGetTerminalCursorForSourceOffset,
  getTerminalSourceOffsetForCursor as internalGetTerminalSourceOffsetForCursor,
} from './terminal-source-offset-index.js'
import {
  createTerminalRangeIndex as internalCreateTerminalRangeIndex,
  getTerminalRangesAtSourceOffset as internalGetTerminalRangesAtSourceOffset,
  getTerminalRangesForSourceRange as internalGetTerminalRangesForSourceRange,
} from './terminal-range-index.js'
import {
  createTerminalSearchSession as internalCreateTerminalSearchSession,
  getTerminalSearchMatchAfterSourceOffset as internalGetTerminalSearchMatchAfterSourceOffset,
  getTerminalSearchMatchBeforeSourceOffset as internalGetTerminalSearchMatchBeforeSourceOffset,
  getTerminalSearchMatchesForSourceRange as internalGetTerminalSearchMatchesForSourceRange,
  getTerminalSearchSessionMatchCount as internalGetTerminalSearchSessionMatchCount,
} from './terminal-search-session.js'
import {
  createTerminalSelectionFromCoordinates as internalCreateTerminalSelectionFromCoordinates,
  extractTerminalSelection as internalExtractTerminalSelection,
  extractTerminalSourceRange as internalExtractTerminalSourceRange,
} from './terminal-selection.js'
import {
  projectTerminalCoordinate as internalProjectTerminalCoordinate,
  projectTerminalCursor as internalProjectTerminalCursor,
  projectTerminalRow as internalProjectTerminalRow,
  projectTerminalSourceOffset as internalProjectTerminalSourceOffset,
  projectTerminalSourceRange as internalProjectTerminalSourceRange,
} from './terminal-coordinate-projection.js'

export type AmbiguousWidthPolicy = 'narrow' | 'wide'
export type EmojiWidthPolicy = 'presentation-wide' | 'wide' | 'narrow'
export type RegionalIndicatorPolicy = 'flag-pair-wide-single-wide' | 'flag-pair-wide-single-narrow'
export type ControlCharPolicy = 'reject' | 'zero-width' | 'replacement'

export type TerminalWidthProfile = Readonly<{
  kind: 'terminal-width-profile'
  name: 'terminal-unicode-narrow'
  version: 1
  unicodeVersion: '17.0.0'
  ambiguousWidth: AmbiguousWidthPolicy
  emojiWidth: EmojiWidthPolicy
  regionalIndicator: RegionalIndicatorPolicy
  controlChars: ControlCharPolicy
  ansiMode: 'plain-reject'
  defaultTabSize: number
  cacheKey: string
}>

export type TerminalWidthProfileInput =
  | 'terminal-unicode-narrow@1'
  | Partial<Omit<TerminalWidthProfile, 'kind' | 'name' | 'version' | 'unicodeVersion' | 'cacheKey'>>
  | undefined

export type TerminalPrepareOptions = {
  whiteSpace?: 'normal' | 'pre-wrap'
  wordBreak?: 'normal' | 'keep-all'
  widthProfile?: TerminalWidthProfileInput
  tabSize?: number
}

export type TerminalLayoutOptions = {
  columns: number
  startColumn?: number
}

declare const preparedTerminalTextBrand: unique symbol
export type PreparedTerminalText = Readonly<{
  kind: 'prepared-terminal-text@1'
  readonly [preparedTerminalTextBrand]: true
}>

export type TerminalLayoutResult = { rows: number }
export type TerminalLineStats = { rows: number; maxLineWidth: number }

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

export const TERMINAL_START_CURSOR = internalTerminalStartCursor as unknown as TerminalCursor

export function prepareTerminal(
  text: string,
  options?: TerminalPrepareOptions,
): PreparedTerminalText {
  return internalPrepareTerminal(text, options) as unknown as PreparedTerminalText
}

export function layoutTerminal(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLayoutResult {
  return internalLayoutTerminal(prepared as never, options)
}

export function measureTerminalLineStats(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLineStats {
  return internalMeasureTerminalLineStats(prepared as never, options)
}

export function walkTerminalLineRanges(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
  onLine: (line: TerminalLineRange) => void,
): number {
  return internalWalkTerminalLineRanges(prepared as never, options, onLine as never)
}

export function layoutNextTerminalLineRange(
  prepared: PreparedTerminalText,
  cursor: TerminalCursor,
  options: TerminalLayoutOptions,
): TerminalLineRange | null {
  return internalLayoutNextTerminalLineRange(prepared as never, cursor, options) as TerminalLineRange | null
}

export function materializeTerminalLineRange(
  prepared: PreparedTerminalText,
  range: TerminalLineRange,
): MaterializedTerminalLine {
  return internalMaterializeTerminalLineRange(prepared as never, range as never) as MaterializedTerminalLine
}

export type TerminalAppendStrategy =
  | 'full-reprepare-bounded-invalidation'
  | 'full-reprepare-normalized-invalidation'
  | 'chunked-append-bounded-invalidation'
  | 'chunked-append-normalized-invalidation'

declare const preparedTerminalCellFlowBrand: unique symbol
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

export type TerminalAppendOptions = { invalidationWindowCodeUnits?: number }

export function prepareTerminalCellFlow(
  text: string,
  options?: TerminalPrepareOptions,
): PreparedTerminalCellFlow {
  return internalPrepareTerminalCellFlow(text, options) as unknown as PreparedTerminalCellFlow
}

export function getTerminalCellFlowPrepared(flow: PreparedTerminalCellFlow): PreparedTerminalText {
  return internalGetTerminalCellFlowPrepared(flow as never) as unknown as PreparedTerminalText
}

export function getTerminalCellFlowGeneration(flow: PreparedTerminalCellFlow): number {
  return internalGetTerminalCellFlowGeneration(flow as never)
}

export function appendTerminalCellFlow(
  flow: PreparedTerminalCellFlow,
  text: string,
  options?: TerminalAppendOptions,
): TerminalAppendResult {
  return internalAppendTerminalCellFlow(flow as never, text, options) as unknown as TerminalAppendResult
}

export type TerminalFixedLayoutOptions = TerminalLayoutOptions & {
  anchorInterval?: number
  generation?: number
}

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

declare const terminalLineIndexBrand: unique symbol
export type TerminalLineIndex = Readonly<{
  kind: 'terminal-line-index@1'
  readonly [terminalLineIndexBrand]: true
}>

export function createTerminalLineIndex(
  prepared: PreparedTerminalText,
  options: TerminalFixedLayoutOptions,
): TerminalLineIndex {
  return internalCreateTerminalLineIndex(prepared as never, options) as unknown as TerminalLineIndex
}

export function getTerminalLineRangeAtRow(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  row: number,
): TerminalLineRange | null {
  return internalGetTerminalLineRangeAtRow(prepared as never, index as never, row) as TerminalLineRange | null
}

export function measureTerminalLineIndexRows(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
): number {
  return internalMeasureTerminalLineIndexRows(prepared as never, index as never)
}

export function getTerminalLineIndexStats(index: TerminalLineIndex): TerminalLineIndexStats {
  return internalGetTerminalLineIndexStats(index as never)
}

export function getTerminalLineIndexMetadata(index: TerminalLineIndex): TerminalLineIndexMetadata {
  return internalGetTerminalLineIndexMetadata(index as never)
}

export function invalidateTerminalLineIndex(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  invalidation: TerminalLineIndexInvalidation,
): TerminalLineIndexInvalidationResult {
  return internalInvalidateTerminalLineIndex(
    prepared as never,
    index as never,
    invalidation,
  ) as TerminalLineIndexInvalidationResult
}

export function materializeTerminalLineRanges(
  prepared: PreparedTerminalText,
  lines: readonly TerminalLineRange[],
): readonly MaterializedTerminalLine[] {
  return internalMaterializeTerminalLineRanges(prepared as never, lines as never) as readonly MaterializedTerminalLine[]
}

export function materializeTerminalLinePage(
  prepared: PreparedTerminalText,
  page: TerminalLinePage,
): readonly MaterializedTerminalLine[] {
  return internalMaterializeTerminalLinePage(prepared as never, page as never) as readonly MaterializedTerminalLine[]
}

export type TerminalLinePage = Readonly<{
  kind: 'terminal-line-page@1'
  columns: number
  generation: number
  lines: readonly TerminalLineRange[]
  rowCount: number
  startRow: number
}>

export type TerminalPageCacheOptions = {
  maxPages?: number
  pageSize?: number
}

export type TerminalLinePageRequest = {
  rowCount: number
  startRow: number
}

export type TerminalPageCacheStats = Readonly<{
  evictions: number
  invalidatedPages: number
  pageBuilds: number
  pageHits: number
  pageMisses: number
}>

declare const terminalPageCacheBrand: unique symbol
export type TerminalPageCache = Readonly<{
  kind: 'terminal-page-cache@1'
  readonly [terminalPageCacheBrand]: true
}>

export function createTerminalPageCache(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  options?: TerminalPageCacheOptions,
): TerminalPageCache {
  return internalCreateTerminalPageCache(prepared as never, index as never, options) as unknown as TerminalPageCache
}

export function getTerminalLinePage(
  prepared: PreparedTerminalText,
  cache: TerminalPageCache,
  index: TerminalLineIndex,
  request: TerminalLinePageRequest,
): TerminalLinePage {
  return internalGetTerminalLinePage(prepared as never, cache as never, index as never, request) as TerminalLinePage
}

export function getTerminalPageCacheStats(cache: TerminalPageCache): TerminalPageCacheStats {
  return internalGetTerminalPageCacheStats(cache as never)
}

export function invalidateTerminalPageCache(
  cache: TerminalPageCache,
  invalidation: { generation: number; firstInvalidRow?: number },
): void {
  internalInvalidateTerminalPageCache(cache as never, invalidation)
}

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

declare const terminalLayoutBundleBrand: unique symbol
export type TerminalLayoutBundle = Readonly<{
  kind: 'terminal-layout-bundle@1'
  readonly [terminalLayoutBundleBrand]: true
}>

export function createTerminalLayoutBundle(
  prepared: PreparedTerminalText,
  options: TerminalLayoutBundleOptions,
): TerminalLayoutBundle {
  return internalCreateTerminalLayoutBundle(prepared as never, options) as unknown as TerminalLayoutBundle
}

export function getTerminalLayoutBundlePage(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  request: TerminalLinePageRequest,
): TerminalLinePage {
  return internalGetTerminalLayoutBundlePage(
    prepared as never,
    bundle as never,
    request,
  ) as TerminalLinePage
}

export function invalidateTerminalLayoutBundle(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  invalidation: TerminalLayoutBundleInvalidation,
): TerminalLayoutBundleInvalidationResult {
  return internalInvalidateTerminalLayoutBundle(
    prepared as never,
    bundle as never,
    invalidation as never,
  ) as TerminalLayoutBundleInvalidationResult
}

export type TerminalRangeData =
  | null
  | boolean
  | number
  | string
  | readonly TerminalRangeData[]
  | { readonly [key: string]: TerminalRangeData }

export type TerminalRange = Readonly<{
  id: string
  kind: string
  sourceStart: number
  sourceEnd: number
  data?: TerminalRangeData
  tags?: readonly string[]
}>

export type TerminalRangeQuery = Readonly<{
  sourceStart: number
  sourceEnd: number
}>

declare const terminalRangeIndexBrand: unique symbol
export type TerminalRangeIndex = Readonly<{
  kind: 'terminal-range-index@1'
  readonly [terminalRangeIndexBrand]: true
}>

export function createTerminalRangeIndex(
  ranges: readonly TerminalRange[],
): TerminalRangeIndex {
  return internalCreateTerminalRangeIndex(ranges as never) as unknown as TerminalRangeIndex
}

export function getTerminalRangesAtSourceOffset(
  index: TerminalRangeIndex,
  sourceOffset: number,
): readonly TerminalRange[] {
  return internalGetTerminalRangesAtSourceOffset(
    index as never,
    sourceOffset,
  ) as readonly TerminalRange[]
}

export function getTerminalRangesForSourceRange(
  index: TerminalRangeIndex,
  query: TerminalRangeQuery,
): readonly TerminalRange[] {
  return internalGetTerminalRangesForSourceRange(
    index as never,
    query,
  ) as readonly TerminalRange[]
}

export type TerminalSearchMode = 'literal' | 'regex'

export type TerminalSearchQuery = string | RegExp | Readonly<{
  pattern?: string
  text?: string
}>

export type TerminalSearchSourceRangeQuery = Readonly<{
  limit?: number
  scopeId?: string
  sourceEnd?: number
  sourceStart?: number
}>

export type TerminalSearchRangeIndexScope = Readonly<{
  rangeIndex: TerminalRangeIndex
  sourceEnd?: number
  sourceStart?: number
}>

export type TerminalSearchScope =
  | TerminalSearchRangeIndexScope
  | TerminalSearchSourceRangeQuery
  | readonly TerminalSearchSourceRangeQuery[]

export type TerminalSearchOptions = Readonly<{
  caseSensitive?: boolean
  indexes?: TerminalProjectionIndexInput
  mode?: TerminalSearchMode
  scope?: TerminalSearchScope
  wholeWord?: boolean
}>

export type TerminalSearchMatch = Readonly<{
  kind: 'terminal-search-match@1'
  matchIndex: number
  matchText: string
  projection?: TerminalSourceRangeProjection
  scopeId?: string
  sourceEnd: number
  sourceStart: number
}>

declare const terminalSearchSessionBrand: unique symbol
export type TerminalSearchSession = Readonly<{
  kind: 'terminal-search-session@1'
  readonly [terminalSearchSessionBrand]: true
}>

export function createTerminalSearchSession(
  prepared: PreparedTerminalText,
  query: TerminalSearchQuery,
  options?: TerminalSearchOptions,
): TerminalSearchSession {
  return internalCreateTerminalSearchSession(
    prepared as never,
    query as never,
    options as never,
  ) as unknown as TerminalSearchSession
}

export function getTerminalSearchSessionMatchCount(
  session: TerminalSearchSession,
): number {
  return internalGetTerminalSearchSessionMatchCount(session as never)
}

export function getTerminalSearchMatchesForSourceRange(
  session: TerminalSearchSession,
  query?: TerminalSearchSourceRangeQuery,
): readonly TerminalSearchMatch[] {
  return internalGetTerminalSearchMatchesForSourceRange(
    session as never,
    query as never,
  ) as readonly TerminalSearchMatch[]
}

export function getTerminalSearchMatchAfterSourceOffset(
  session: TerminalSearchSession,
  sourceOffset: number,
): TerminalSearchMatch | null {
  return internalGetTerminalSearchMatchAfterSourceOffset(
    session as never,
    sourceOffset,
  ) as TerminalSearchMatch | null
}

export function getTerminalSearchMatchBeforeSourceOffset(
  session: TerminalSearchSession,
  sourceOffset: number,
): TerminalSearchMatch | null {
  return internalGetTerminalSearchMatchBeforeSourceOffset(
    session as never,
    sourceOffset,
  ) as TerminalSearchMatch | null
}

export type TerminalSelectionMode = 'linear'
export type TerminalSelectionDirection = 'forward' | 'backward' | 'collapsed'

export type TerminalSelectionCoordinate = Readonly<{
  bias?: TerminalSourceOffsetBias
  column: number
  row: number
}>

export type TerminalSelectionRequest = Readonly<{
  anchor: TerminalSelectionCoordinate
  focus: TerminalSelectionCoordinate
  mode?: TerminalSelectionMode
}>

export type TerminalSelection = Readonly<{
  kind: 'terminal-selection@1'
  anchor: TerminalCoordinateSourceProjection
  collapsed: boolean
  direction: TerminalSelectionDirection
  focus: TerminalCoordinateSourceProjection
  mode: TerminalSelectionMode
  projection: TerminalSourceRangeProjection
  rowEnd: number
  rowStart: number
  sourceEnd: number
  sourceStart: number
}>

export type TerminalSourceRangeExtractionRequest = TerminalSourceRangeProjectionRequest

export type TerminalSelectionExtractionOptions = Readonly<{
  indexes: TerminalProjectionIndexInput
  rangeIndex?: TerminalRangeIndex
}>

export type TerminalSelectionExtractionFragment = Readonly<{
  kind: 'terminal-selection-extraction-fragment@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  sourceEnd: number
  sourceStart: number
  sourceText: string
  startColumn: number
  text: string
}>

export type TerminalSelectionExtraction = Readonly<{
  kind: 'terminal-selection-extraction@1'
  projection: TerminalSourceRangeProjection
  rangeMatches?: readonly TerminalRange[]
  requestedSourceEnd: number
  requestedSourceStart: number
  rowEnd: number
  rowFragments: readonly TerminalSelectionExtractionFragment[]
  rowStart: number
  sourceEnd: number
  sourceStart: number
  sourceText: string
  visibleRows: readonly string[]
  visibleText: string
}>

export function createTerminalSelectionFromCoordinates(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexInput,
  request: TerminalSelectionRequest,
): TerminalSelection | null {
  return internalCreateTerminalSelectionFromCoordinates(
    prepared as never,
    indexes as never,
    request as never,
  ) as TerminalSelection | null
}

export function extractTerminalSourceRange(
  prepared: PreparedTerminalText,
  request: TerminalSourceRangeExtractionRequest,
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtraction {
  return internalExtractTerminalSourceRange(
    prepared as never,
    request as never,
    options as never,
  ) as TerminalSelectionExtraction
}

export function extractTerminalSelection(
  prepared: PreparedTerminalText,
  selection: TerminalSelection,
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtraction {
  return internalExtractTerminalSelection(
    prepared as never,
    selection as never,
    options as never,
  ) as TerminalSelectionExtraction
}

export type TerminalSourceOffsetBias = 'before' | 'after' | 'closest'

export type TerminalSourceLookupResult = Readonly<{
  kind: 'terminal-source-lookup@1'
  cursor: TerminalCursor
  exact: boolean
  requestedSourceOffset: number
  sourceOffset: number
}>

declare const terminalSourceOffsetIndexBrand: unique symbol
export type TerminalSourceOffsetIndex = Readonly<{
  kind: 'terminal-source-offset-index@1'
  readonly [terminalSourceOffsetIndexBrand]: true
}>

export type TerminalProjectionIndexes = Readonly<{
  lineIndex: TerminalLineIndex
  sourceIndex: TerminalSourceOffsetIndex
}>

export type TerminalProjectionIndexInput = TerminalProjectionIndexes | TerminalLayoutBundle

export type TerminalCellCoordinate = Readonly<{
  column: number
  row: number
}>

export type TerminalSourceProjectionOptions = Readonly<{
  bias?: TerminalSourceOffsetBias
}>

export type TerminalCoordinateProjectionRequest = Readonly<{
  bias?: TerminalSourceOffsetBias
  column: number
  row: number
}>

export type TerminalSourceProjection = Readonly<{
  kind: 'terminal-coordinate-projection@1'
  atEnd: boolean
  column: number
  coordinate: TerminalCellCoordinate
  cursor: TerminalCursor
  exact: boolean
  line: TerminalLineRange | null
  requestedSourceOffset: number | null
  row: number
  sourceOffset: number
}>

export type TerminalCoordinateProjection = TerminalSourceProjection

export type TerminalCoordinateSourceProjection = TerminalSourceProjection & Readonly<{
  bias: TerminalSourceOffsetBias
  requestedCoordinate: TerminalCellCoordinate
}>

export type TerminalRowProjection = Readonly<{
  kind: 'terminal-row-projection@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  startColumn: number
  sourceEnd: number
  sourceStart: number
}>

export type TerminalSourceRangeProjectionRequest = Readonly<{
  sourceEnd: number
  sourceStart: number
}>

export type TerminalSourceRangeProjectionFragment = Readonly<{
  kind: 'terminal-source-range-fragment@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  sourceEnd: number
  sourceStart: number
  startColumn: number
}>

export type TerminalSourceRangeProjection = Readonly<{
  kind: 'terminal-source-range-projection@1'
  end: TerminalSourceProjection
  fragments: readonly TerminalSourceRangeProjectionFragment[]
  requestedSourceEnd: number
  requestedSourceStart: number
  sourceEnd: number
  sourceStart: number
  start: TerminalSourceProjection
}>

export function createTerminalSourceOffsetIndex(
  prepared: PreparedTerminalText,
): TerminalSourceOffsetIndex {
  return internalCreateTerminalSourceOffsetIndex(prepared as never) as unknown as TerminalSourceOffsetIndex
}

export function getTerminalSourceOffsetForCursor(
  prepared: PreparedTerminalText,
  cursor: TerminalCursor,
  index?: TerminalSourceOffsetIndex,
): number {
  return internalGetTerminalSourceOffsetForCursor(prepared as never, cursor, index as never)
}

export function getTerminalCursorForSourceOffset(
  prepared: PreparedTerminalText,
  index: TerminalSourceOffsetIndex,
  sourceOffset: number,
  bias?: TerminalSourceOffsetBias,
): TerminalSourceLookupResult {
  return internalGetTerminalCursorForSourceOffset(
    prepared as never,
    index as never,
    sourceOffset,
    bias,
  ) as TerminalSourceLookupResult
}

export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  sourceOffset: number,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  sourceOffset: number,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  sourceOffset: number,
  bias?: TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexInput | TerminalSourceOffsetIndex,
  lineIndexOrSourceOffset: TerminalLineIndex | number,
  sourceOffsetOrOptions?: number | TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
  biasOrOptions?: TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  return internalProjectTerminalSourceOffset(
    prepared as never,
    indexesOrSourceIndex as never,
    lineIndexOrSourceOffset as never,
    sourceOffsetOrOptions as never,
    biasOrOptions as never,
  ) as TerminalSourceProjection
}

export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexes,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexInput | TerminalSourceOffsetIndex,
  lineIndexOrCursor: TerminalLineIndex | TerminalCursor,
  cursorOrOptions?: TerminalCursor | TerminalSourceProjectionOptions,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection {
  return internalProjectTerminalCursor(
    prepared as never,
    indexesOrSourceIndex as never,
    lineIndexOrCursor as never,
    cursorOrOptions as never,
    options as never,
  ) as TerminalSourceProjection
}

export function projectTerminalCoordinate(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexInput,
  request: TerminalCoordinateProjectionRequest,
): TerminalCoordinateSourceProjection | null {
  return internalProjectTerminalCoordinate(
    prepared as never,
    indexes as never,
    request,
  ) as TerminalCoordinateSourceProjection | null
}

export function projectTerminalSourceRange(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexInput,
  request: TerminalSourceRangeProjectionRequest,
): TerminalSourceRangeProjection {
  return internalProjectTerminalSourceRange(
    prepared as never,
    indexes as never,
    request,
  ) as TerminalSourceRangeProjection
}

export function projectTerminalRow(
  prepared: PreparedTerminalText,
  lineIndex: TerminalLineIndex | TerminalLayoutBundle,
  row: number,
): TerminalRowProjection | null {
  return internalProjectTerminalRow(
    prepared as never,
    lineIndex as never,
    row,
  ) as TerminalRowProjection | null
}
