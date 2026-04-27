// 补建说明：该文件为后续补建，用于提供 Phase 5 的 source-first terminal search session；当前进度：首版支持 literal/regex、case、whole-word、generic source scopes 与可选 projection，不包含任何搜索 UI/高亮/选择行为。
import type { PreparedTerminalText } from './terminal.js'
import {
  getInternalPreparedTerminalReader,
} from './terminal-prepared-reader.js'
import {
  materializePreparedTerminalSourceTextRange,
} from './terminal-line-source.js'
import {
  projectTerminalSourceRange,
  type TerminalProjectionIndexInput,
  type TerminalProjectionIndexes,
  type TerminalSourceRangeProjection,
} from './terminal-coordinate-projection.js'
import {
  getTerminalRangesForSourceRange,
  type TerminalRangeIndex,
} from './terminal-range-index.js'
import type { TerminalLayoutBundle } from './terminal-layout-bundle.js'
import {
  recordTerminalPerformanceCounter,
} from './terminal-performance-counters.js'
import {
  createTerminalMemoryBudgetEstimate,
  type TerminalMemoryBudgetEstimate,
} from './terminal-memory-budget.js'

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

type InternalTerminalSearchMatch = Readonly<{
  matchText: string
  scopeId?: string
  sourceEnd: number
  sourceStart: number
}>

type TerminalSearchSessionState = {
  readonly indexes?: TerminalProjectionIndexInput
  readonly matches: readonly InternalTerminalSearchMatch[]
  readonly maxMatchCodeUnits: number
  readonly prepared: PreparedTerminalText
  readonly sourceLength: number
}

type NormalizedSearchQuery = {
  readonly mode: TerminalSearchMode
  readonly pattern: RegExp | null
  readonly text: string
}

type NormalizedSearchScope = Readonly<{
  scopeId?: string
  sourceEnd: number
  sourceStart: number
}>

const searchSessionStates = new WeakMap<TerminalSearchSession, TerminalSearchSessionState>()

export function createTerminalSearchSession(
  prepared: PreparedTerminalText,
  query: TerminalSearchQuery,
  options: TerminalSearchOptions = {},
): TerminalSearchSession {
  const reader = getInternalPreparedTerminalReader(prepared)
  const sourceText = materializePreparedTerminalSourceTextRange(reader, 0, reader.sourceLength)
  recordTerminalPerformanceCounter('terminalSearchSourceMaterializations')
  const normalizedQuery = normalizeSearchQuery(query, options)
  const scopes = normalizeSearchScopes(options.scope, reader.sourceLength)
  const rawMatches = normalizedQuery.mode === 'regex'
    ? collectRegexMatches(sourceText, normalizedQuery, options.wholeWord === true)
    : collectLiteralMatches(
      sourceText,
      normalizedQuery.text,
      options.caseSensitive !== false,
      options.wholeWord === true,
    )
  const matches = assignMatchesToScopes(rawMatches, scopes)
  const indexes = options.indexes === undefined
    ? undefined
    : snapshotTerminalSearchProjectionIndexes(options.indexes)

  if (indexes !== undefined) {
    projectTerminalSourceRange(prepared, indexes, { sourceStart: 0, sourceEnd: 0 })
  }

  recordTerminalPerformanceCounter('terminalSearchSessions')
  recordTerminalPerformanceCounter('terminalSearchScannedCodeUnits', sourceText.length)
  recordTerminalPerformanceCounter('terminalSearchMatches', matches.length)
  recordTerminalPerformanceCounter('terminalSearchScopes', scopes.length)
  recordTerminalPerformanceCounter('terminalSearchStoredMatches', matches.length)
  recordTerminalPerformanceCounter('terminalSearchStoredMatchCodeUnits', sumSearchMatchCodeUnits(matches))

  const handle = Object.freeze({
    kind: 'terminal-search-session@1',
  }) as TerminalSearchSession
  const state: TerminalSearchSessionState = {
    matches: Object.freeze(matches),
    maxMatchCodeUnits: maxSearchMatchCodeUnits(matches),
    prepared,
    sourceLength: reader.sourceLength,
    ...(indexes === undefined ? {} : { indexes }),
  }
  searchSessionStates.set(handle, state)
  return handle
}

export function getTerminalSearchSessionMatchCount(
  session: TerminalSearchSession,
): number {
  return internalSearchSession(session).matches.length
}

export function getTerminalSearchMatchesForSourceRange(
  session: TerminalSearchSession,
  query: TerminalSearchSourceRangeQuery = {},
): readonly TerminalSearchMatch[] {
  const state = internalSearchSession(session)
  const range = normalizeSourceRangeQuery(query, state.sourceLength, 'Terminal search match query')
  const limit = normalizeOptionalLimit(query.limit, 'Terminal search match query limit')
  if (limit === 0) return Object.freeze([])
  const matches: TerminalSearchMatch[] = []
  const firstCandidateStart = Math.max(0, range.sourceStart - state.maxMatchCodeUnits)
  const collapsed = range.sourceStart === range.sourceEnd
  for (let index = lowerBoundMatchStart(state.matches, firstCandidateStart); index < state.matches.length; index++) {
    const match = state.matches[index]!
    if (isSearchMatchPastRange(match, range, collapsed)) break
    if (searchMatchIntersectsRange(match, range, collapsed)) {
      matches.push(copyTerminalSearchMatch(state, match, index))
      if (limit !== undefined && matches.length >= limit) break
    }
  }
  recordTerminalPerformanceCounter('terminalSearchReturnedMatches', matches.length)
  return Object.freeze(matches)
}

export function getTerminalSearchMatchAfterSourceOffset(
  session: TerminalSearchSession,
  sourceOffset: number,
): TerminalSearchMatch | null {
  const state = internalSearchSession(session)
  const offset = normalizeSearchSourceOffset(sourceOffset, 'Terminal search after sourceOffset', state.sourceLength)
  const index = lowerBoundMatchStart(state.matches, offset)
  const match = state.matches[index]
  const result = match === undefined ? null : copyTerminalSearchMatch(state, match, index)
  if (result !== null) recordTerminalPerformanceCounter('terminalSearchReturnedMatches')
  return result
}

export function getTerminalSearchMatchBeforeSourceOffset(
  session: TerminalSearchSession,
  sourceOffset: number,
): TerminalSearchMatch | null {
  const state = internalSearchSession(session)
  const offset = normalizeSearchSourceOffset(sourceOffset, 'Terminal search before sourceOffset', state.sourceLength)
  const index = lowerBoundMatchStart(state.matches, offset) - 1
  const match = state.matches[index]
  const result = match === undefined ? null : copyTerminalSearchMatch(state, match, index)
  if (result !== null) recordTerminalPerformanceCounter('terminalSearchReturnedMatches')
  return result
}

export function getTerminalSearchSessionMemoryEstimate(
  session: TerminalSearchSession,
  label = 'terminal search session',
): TerminalMemoryBudgetEstimate {
  const state = internalSearchSession(session)
  let stringCodeUnits = 0
  for (const match of state.matches) {
    stringCodeUnits += match.matchText.length + (match.scopeId?.length ?? 0)
  }
  return createTerminalMemoryBudgetEstimate({
    category: 'search-session',
    label,
    numberSlots: state.matches.length * 3 + 2,
    objectEntries: state.matches.length + (state.indexes === undefined ? 1 : 2),
    rangeRecords: state.matches.length,
    stringCodeUnits,
    notes: ['source text is materialized during session build; stored matches remain source ranges'],
  })
}

function collectLiteralMatches(
  sourceText: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): readonly InternalTerminalSearchMatch[] {
  const matches: InternalTerminalSearchMatch[] = []
  let cursor = 0
  while (cursor <= sourceText.length - query.length) {
    const found = caseSensitive
      ? sourceText.indexOf(query, cursor)
      : findCaseInsensitiveLiteral(sourceText, query, cursor)
    if (found < 0) break
    const sourceEnd = found + query.length
    if (!wholeWord || isWholeWordMatch(sourceText, found, sourceEnd)) {
      matches.push(Object.freeze({
        sourceStart: found,
        sourceEnd,
        matchText: sourceText.slice(found, sourceEnd),
      }))
    }
    cursor = Math.max(found + query.length, found + 1)
  }
  return matches
}

function collectRegexMatches(
  sourceText: string,
  query: NormalizedSearchQuery,
  wholeWord: boolean,
): readonly InternalTerminalSearchMatch[] {
  const pattern = query.pattern
  if (pattern === null) throw new Error('Terminal regex search requires a pattern')
  const matches: InternalTerminalSearchMatch[] = []
  pattern.lastIndex = 0
  while (pattern.lastIndex <= sourceText.length) {
    const match = pattern.exec(sourceText)
    if (match === null) break
    const matchText = match[0] ?? ''
    const sourceStart = match.index
    const sourceEnd = sourceStart + matchText.length
    if (matchText.length === 0) {
      throw new Error('Terminal regex search query must not produce zero-width matches')
    }
    if (!wholeWord || isWholeWordMatch(sourceText, sourceStart, sourceEnd)) {
      matches.push(Object.freeze({
        sourceStart,
        sourceEnd,
        matchText,
      }))
    }
    if (pattern.lastIndex <= sourceStart) {
      pattern.lastIndex = sourceEnd
    }
  }
  return matches
}

function assignMatchesToScopes(
  rawMatches: readonly InternalTerminalSearchMatch[],
  scopes: readonly NormalizedSearchScope[],
): readonly InternalTerminalSearchMatch[] {
  const matches: InternalTerminalSearchMatch[] = []
  for (const match of rawMatches) {
    for (const scope of scopes) {
      recordTerminalPerformanceCounter('terminalSearchScopeChecks')
      if (match.sourceStart < scope.sourceStart || match.sourceEnd > scope.sourceEnd) continue
      matches.push(Object.freeze({
        ...match,
        ...(scope.scopeId === undefined ? {} : { scopeId: scope.scopeId }),
      }))
    }
  }
  matches.sort(compareSearchMatches)
  return matches
}

function copyTerminalSearchMatch(
  state: TerminalSearchSessionState,
  match: InternalTerminalSearchMatch,
  matchIndex: number,
): TerminalSearchMatch {
  const copied: {
    kind: 'terminal-search-match@1'
    matchIndex: number
    matchText: string
    projection?: TerminalSourceRangeProjection
    scopeId?: string
    sourceEnd: number
    sourceStart: number
  } = {
    kind: 'terminal-search-match@1',
    matchIndex,
    matchText: match.matchText,
    sourceStart: match.sourceStart,
    sourceEnd: match.sourceEnd,
  }
  if (match.scopeId !== undefined) copied.scopeId = match.scopeId
  if (state.indexes !== undefined) {
    recordTerminalPerformanceCounter('terminalSearchProjectionRequests')
    copied.projection = projectTerminalSourceRange(
      state.prepared,
      state.indexes,
      {
        sourceStart: match.sourceStart,
        sourceEnd: match.sourceEnd,
      },
    )
  }
  return Object.freeze(copied)
}

function normalizeSearchQuery(
  query: TerminalSearchQuery,
  options: TerminalSearchOptions,
): NormalizedSearchQuery {
  const mode = normalizeSearchMode(options.mode, query)
  if (query instanceof RegExp) {
    if (mode !== 'regex') throw new Error('RegExp terminal search query requires mode "regex"')
    return normalizeRegexSearchQuery(query, options.caseSensitive !== false)
  }
  if (typeof query === 'string') {
    return mode === 'regex'
      ? normalizeRegexSearchQuery(query, options.caseSensitive !== false)
      : normalizeLiteralSearchQuery(query)
  }
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('Terminal search query must be a string, RegExp, or query object')
  }
  if (mode === 'regex') {
    const pattern = query.pattern ?? query.text
    if (typeof pattern !== 'string') throw new Error('Terminal regex search query pattern must be a string')
    return normalizeRegexSearchQuery(pattern, options.caseSensitive !== false)
  }
  if (typeof query.text !== 'string') throw new Error('Terminal literal search query text must be a string')
  return normalizeLiteralSearchQuery(query.text)
}

function normalizeLiteralSearchQuery(text: string): NormalizedSearchQuery {
  if (text.length === 0) throw new Error('Terminal literal search query must not be empty')
  return {
    mode: 'literal',
    pattern: null,
    text,
  }
}

function normalizeRegexSearchQuery(
  query: string | RegExp,
  caseSensitive: boolean,
): NormalizedSearchQuery {
  const source = typeof query === 'string' ? query : query.source
  if (source.length === 0) throw new Error('Terminal regex search query must not be empty')
  const sourceFlags = typeof query === 'string' ? 'u' : query.flags
  const flags = normalizeRegexFlags(sourceFlags, caseSensitive)
  let pattern: RegExp
  try {
    pattern = new RegExp(source, flags)
  } catch (error) {
    throw new Error(`Invalid terminal regex search query: ${error instanceof Error ? error.message : String(error)}`)
  }
  return {
    mode: 'regex',
    pattern,
    text: source,
  }
}

function normalizeRegexFlags(flags: string, caseSensitive: boolean): string {
  const normalized = new Set(flags.replace(/[gy]/gu, '').split('').filter(Boolean))
  normalized.add('g')
  if (caseSensitive) normalized.delete('i')
  else normalized.add('i')
  return [...normalized].join('')
}

function normalizeSearchMode(mode: unknown, query: TerminalSearchQuery): TerminalSearchMode {
  if (mode === undefined) return query instanceof RegExp ? 'regex' : 'literal'
  if (mode === 'literal' || mode === 'regex') return mode
  throw new Error(`Terminal search mode must be "literal" or "regex", got ${formatUnknownSearchValue(mode)}`)
}

function formatUnknownSearchValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return Object.prototype.toString.call(value)
}

function normalizeSearchScopes(
  scope: TerminalSearchScope | undefined,
  sourceLength: number,
): readonly NormalizedSearchScope[] {
  if (scope === undefined) return Object.freeze([{ sourceStart: 0, sourceEnd: sourceLength }])
  if (isTerminalSearchRangeIndexScope(scope)) {
    const range = normalizeSourceRangeQuery(scope, sourceLength, 'Terminal search range-index scope')
    const ranges = getTerminalRangesForSourceRange(scope.rangeIndex, range)
    return Object.freeze(ranges.map(item => Object.freeze({
      scopeId: item.id,
      sourceStart: Math.max(range.sourceStart, item.sourceStart),
      sourceEnd: Math.min(range.sourceEnd, item.sourceEnd),
    })))
  }
  const scopeItems = Array.isArray(scope) ? scope : [scope]
  if (scopeItems.length === 0) {
    throw new Error('Terminal search scope must contain at least one source range')
  }
  return Object.freeze(scopeItems.map((item, index) =>
    normalizeSourceRangeQuery(item, sourceLength, `Terminal search scope at index ${index}`),
  ))
}

function normalizeSourceRangeQuery(
  query: TerminalSearchSourceRangeQuery,
  sourceLength: number,
  label: string,
): NormalizedSearchScope {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error(`${label} must be an object`)
  }
  const sourceStart = normalizeSearchSourceOffset(query.sourceStart ?? 0, `${label} sourceStart`, sourceLength)
  const sourceEnd = normalizeSearchSourceOffset(query.sourceEnd ?? sourceLength, `${label} sourceEnd`, sourceLength)
  if (sourceEnd < sourceStart) {
    throw new Error(`${label} sourceEnd must be >= sourceStart, got ${sourceEnd} < ${sourceStart}`)
  }
  const normalized: {
    scopeId?: string
    sourceEnd: number
    sourceStart: number
  } = {
    sourceStart,
    sourceEnd,
  }
  if (query.scopeId !== undefined) {
    if (typeof query.scopeId !== 'string' || query.scopeId.length === 0) {
      throw new Error(`${label} scopeId must be a non-empty string`)
    }
    normalized.scopeId = query.scopeId
  }
  return Object.freeze(normalized)
}

function normalizeSearchSourceOffset(value: number, label: string, sourceLength: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return Math.min(value, sourceLength)
}

function normalizeOptionalLimit(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return value
}

function findCaseInsensitiveLiteral(sourceText: string, query: string, fromIndex: number): number {
  const normalizedQuery = query.toLowerCase()
  for (let index = fromIndex; index <= sourceText.length - query.length; index++) {
    if (sourceText.slice(index, index + query.length).toLowerCase() === normalizedQuery) {
      return index
    }
  }
  return -1
}

function isWholeWordMatch(sourceText: string, sourceStart: number, sourceEnd: number): boolean {
  return !isSearchWordCodeUnit(sourceText.charCodeAt(sourceStart - 1)) &&
    !isSearchWordCodeUnit(sourceText.charCodeAt(sourceEnd))
}

function isSearchWordCodeUnit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  )
}

function compareSearchMatches(a: InternalTerminalSearchMatch, b: InternalTerminalSearchMatch): number {
  if (a.sourceStart !== b.sourceStart) return a.sourceStart - b.sourceStart
  if (a.sourceEnd !== b.sourceEnd) return a.sourceEnd - b.sourceEnd
  const aScope = a.scopeId ?? ''
  const bScope = b.scopeId ?? ''
  if (aScope !== bScope) return aScope < bScope ? -1 : 1
  return 0
}

function maxSearchMatchCodeUnits(matches: readonly InternalTerminalSearchMatch[]): number {
  let max = 0
  for (const match of matches) {
    max = Math.max(max, match.sourceEnd - match.sourceStart)
  }
  return max
}

function sumSearchMatchCodeUnits(matches: readonly InternalTerminalSearchMatch[]): number {
  return matches.reduce((sum, match) => sum + (match.sourceEnd - match.sourceStart), 0)
}

function searchMatchIntersectsRange(
  match: InternalTerminalSearchMatch,
  range: NormalizedSearchScope,
  collapsed: boolean,
): boolean {
  if (range.scopeId !== undefined && match.scopeId !== range.scopeId) return false
  if (collapsed) {
    return match.sourceStart <= range.sourceStart && range.sourceStart < match.sourceEnd
  }
  return match.sourceStart < range.sourceEnd && match.sourceEnd > range.sourceStart
}

function isSearchMatchPastRange(
  match: InternalTerminalSearchMatch,
  range: NormalizedSearchScope,
  collapsed: boolean,
): boolean {
  return collapsed
    ? match.sourceStart > range.sourceStart
    : match.sourceStart >= range.sourceEnd
}

function lowerBoundMatchStart(
  matches: readonly InternalTerminalSearchMatch[],
  sourceOffset: number,
): number {
  let lo = 0
  let hi = matches.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (matches[mid]!.sourceStart < sourceOffset) lo = mid + 1
    else hi = mid
  }
  return lo
}

function isTerminalSearchRangeIndexScope(scope: TerminalSearchScope): scope is TerminalSearchRangeIndexScope {
  return typeof scope === 'object' &&
    scope !== null &&
    !Array.isArray(scope) &&
    'rangeIndex' in scope
}

function snapshotTerminalSearchProjectionIndexes(
  indexes: TerminalProjectionIndexInput,
): TerminalProjectionIndexInput {
  if (isTerminalLayoutBundleInput(indexes)) return indexes
  return Object.freeze({
    lineIndex: indexes.lineIndex,
    sourceIndex: indexes.sourceIndex,
  } satisfies TerminalProjectionIndexes)
}

function isTerminalLayoutBundleInput(input: TerminalProjectionIndexInput): input is TerminalLayoutBundle {
  return typeof input === 'object' &&
    input !== null &&
    'kind' in input &&
    input.kind === 'terminal-layout-bundle@1'
}

function internalSearchSession(session: TerminalSearchSession): TerminalSearchSessionState {
  const state = searchSessionStates.get(session)
  if (state === undefined) {
    throw new Error('Invalid terminal search session handle')
  }
  return state
}
