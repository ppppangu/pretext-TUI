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
  createTerminalSourceOffsetIndex as internalCreateTerminalSourceOffsetIndex,
  getTerminalCursorForSourceOffset as internalGetTerminalCursorForSourceOffset,
  getTerminalSourceOffsetForCursor as internalGetTerminalSourceOffsetForCursor,
} from './terminal-source-offset-index.js'
import {
  projectTerminalCursor as internalProjectTerminalCursor,
  projectTerminalRow as internalProjectTerminalRow,
  projectTerminalSourceOffset as internalProjectTerminalSourceOffset,
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

export type TerminalCellCoordinate = Readonly<{
  column: number
  row: number
}>

export type TerminalSourceProjectionOptions = Readonly<{
  bias?: TerminalSourceOffsetBias
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

export type TerminalRowProjection = Readonly<{
  kind: 'terminal-row-projection@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  startColumn: number
  sourceEnd: number
  sourceStart: number
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
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  sourceOffset: number,
  bias?: TerminalSourceOffsetBias | TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalSourceOffset(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
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
  sourceIndex: TerminalSourceOffsetIndex,
  lineIndex: TerminalLineIndex,
  cursor: TerminalCursor,
  options?: TerminalSourceProjectionOptions,
): TerminalSourceProjection
export function projectTerminalCursor(
  prepared: PreparedTerminalText,
  indexesOrSourceIndex: TerminalProjectionIndexes | TerminalSourceOffsetIndex,
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

export function projectTerminalRow(
  prepared: PreparedTerminalText,
  lineIndex: TerminalLineIndex,
  row: number,
): TerminalRowProjection | null {
  return internalProjectTerminalRow(
    prepared as never,
    lineIndex as never,
    row,
  ) as TerminalRowProjection | null
}
