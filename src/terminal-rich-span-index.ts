// 补建说明：该文件为后续补建，用于提供 Phase 7 rich sidecar 的内部 span/raw-visible range 索引；当前进度：首版为 rich materialization、selection 与 raw-visible provenance 查询提供 host-neutral interval lookup，不作为公共子路径暴露。
import type { TerminalRichSpan } from './ansi-tokenize.js'
import { recordTerminalPerformanceCounter } from './terminal-performance-counters.js'

export type TerminalRichSourceRangeQuery = Readonly<{
  sourceStart: number
  sourceEnd: number
}>

export type TerminalRichRawRangeQuery = Readonly<{
  rawStart: number
  rawEnd: number
}>

export type TerminalRichRawVisibleRange = Readonly<{
  rawStart: number
  rawEnd: number
  sourceStart: number
  sourceEnd: number
}>

type IndexedRichSpan = Readonly<{
  order: number
  span: TerminalRichSpan
}>

type IndexedRawVisibleRange = Readonly<{
  order: number
  range: TerminalRichRawVisibleRange
}>

export type TerminalRichSpanIntervalIndex = Readonly<{
  byStart: readonly IndexedRichSpan[]
  prefixMaxEnd: readonly number[]
}>

export type TerminalRichRawVisibleIndex = Readonly<{
  byRawStart: readonly IndexedRawVisibleRange[]
  bySourceStart: readonly IndexedRawVisibleRange[]
  rawPrefixMaxEnd: readonly number[]
  sourcePrefixMaxEnd: readonly number[]
}>

export function createTerminalRichSpanIntervalIndex(
  spans: readonly TerminalRichSpan[],
): TerminalRichSpanIntervalIndex {
  recordTerminalPerformanceCounter('richSpanIndexBuilds')
  const byStart = spans
    .map((span, order) => Object.freeze({ span: validateRichSpan(span, order), order }))
    .sort((a, b) =>
      a.span.sourceStart - b.span.sourceStart ||
      a.span.sourceEnd - b.span.sourceEnd ||
      a.order - b.order,
    )
  return Object.freeze({
    byStart: Object.freeze(byStart),
    prefixMaxEnd: Object.freeze(buildPrefixMax(byStart, item => item.span.sourceEnd)),
  })
}

export function getTerminalRichSpansForSourceRange(
  index: TerminalRichSpanIntervalIndex,
  query: TerminalRichSourceRangeQuery,
): readonly TerminalRichSpan[] {
  validateSpanIndex(index)
  const range = normalizeSourceRange(query)
  recordTerminalPerformanceCounter('richSpanIndexLookups')
  if (range.sourceEnd <= range.sourceStart) return Object.freeze([])
  const firstPossible = firstPrefixGreaterThan(index.prefixMaxEnd, range.sourceStart)
  const endExclusive = firstStartAtOrAfter(index.byStart, range.sourceEnd, item => item.span.sourceStart)
  const matches: IndexedRichSpan[] = []
  for (let i = firstPossible; i < endExclusive; i++) {
    recordTerminalPerformanceCounter('richSpanIndexSteps')
    const item = index.byStart[i]!
    if (item.span.sourceEnd > item.span.sourceStart && item.span.sourceEnd > range.sourceStart) {
      matches.push(item)
    }
  }
  recordTerminalPerformanceCounter('richSpanIndexMatches', matches.length)
  return Object.freeze(matches
    .sort((a, b) => a.order - b.order)
    .map(item => item.span))
}

export function createTerminalRichRawVisibleIndex(
  ranges: readonly TerminalRichRawVisibleRange[],
): TerminalRichRawVisibleIndex {
  recordTerminalPerformanceCounter('richRawVisibleIndexBuilds')
  const frozenRanges = ranges.map((range, order) => Object.freeze({
    order,
    range: Object.freeze({ ...validateRawVisibleRange(range, order) }),
  }))
  const byRawStart = [...frozenRanges].sort((a, b) =>
    a.range.rawStart - b.range.rawStart ||
    a.range.rawEnd - b.range.rawEnd ||
    a.order - b.order,
  )
  const bySourceStart = [...frozenRanges].sort((a, b) =>
    a.range.sourceStart - b.range.sourceStart ||
    a.range.sourceEnd - b.range.sourceEnd ||
    a.order - b.order,
  )
  return Object.freeze({
    byRawStart: Object.freeze(byRawStart),
    bySourceStart: Object.freeze(bySourceStart),
    rawPrefixMaxEnd: Object.freeze(buildPrefixMax(byRawStart, item => item.range.rawEnd)),
    sourcePrefixMaxEnd: Object.freeze(buildPrefixMax(bySourceStart, item => item.range.sourceEnd)),
  })
}

function validateRichSpan(span: TerminalRichSpan, order: number): TerminalRichSpan {
  if (span === null || typeof span !== 'object' || Array.isArray(span)) {
    throw new Error(`Terminal rich span ${order} must be an object`)
  }
  const record = span as unknown as Record<string, unknown>
  const kind = ownRequired(record, 'kind', `Terminal rich span ${order}`)
  if (kind !== 'style' && kind !== 'link') {
    throw new Error(`Terminal rich span ${order} kind must be style or link`)
  }
  const rawStart = ownRequiredNumber(record, 'rawStart', `Terminal rich span ${order}`)
  const rawEnd = ownRequiredNumber(record, 'rawEnd', `Terminal rich span ${order}`)
  const sourceStart = ownRequiredNumber(record, 'sourceStart', `Terminal rich span ${order}`)
  const sourceEnd = ownRequiredNumber(record, 'sourceEnd', `Terminal rich span ${order}`)
  validateStoredRange('Terminal rich span', order, 'raw', rawStart, rawEnd)
  validateStoredRange('Terminal rich span', order, 'source', sourceStart, sourceEnd)
  if (kind === 'style') {
    const style = ownRequired(record, 'style', `Terminal rich span ${order}`)
    if (style === null || typeof style !== 'object' || Array.isArray(style)) {
      throw new Error(`Terminal rich span ${order} style must be an object`)
    }
    return Object.freeze({
      kind,
      rawStart,
      rawEnd,
      sourceStart,
      sourceEnd,
      style: Object.freeze({ ...(style as Record<string, unknown>) }),
    }) as TerminalRichSpan
  }
  const uri = ownRequired(record, 'uri', `Terminal rich span ${order}`)
  if (typeof uri !== 'string') {
    throw new Error(`Terminal rich span ${order} uri must be a string`)
  }
  return Object.freeze({
    kind,
    rawStart,
    rawEnd,
    sourceStart,
    sourceEnd,
    uri,
  }) as TerminalRichSpan
}

function validateRawVisibleRange(
  range: TerminalRichRawVisibleRange,
  order: number,
): TerminalRichRawVisibleRange {
  if (range === null || typeof range !== 'object' || Array.isArray(range)) {
    throw new Error(`Terminal rich raw-visible range ${order} must be an object`)
  }
  const record = range as unknown as Record<string, unknown>
  const rawStart = ownRequiredNumber(record, 'rawStart', `Terminal rich raw-visible range ${order}`)
  const rawEnd = ownRequiredNumber(record, 'rawEnd', `Terminal rich raw-visible range ${order}`)
  const sourceStart = ownRequiredNumber(record, 'sourceStart', `Terminal rich raw-visible range ${order}`)
  const sourceEnd = ownRequiredNumber(record, 'sourceEnd', `Terminal rich raw-visible range ${order}`)
  validateStoredRange('Terminal rich raw-visible range', order, 'raw', rawStart, rawEnd)
  validateStoredRange('Terminal rich raw-visible range', order, 'source', sourceStart, sourceEnd)
  return Object.freeze({ rawStart, rawEnd, sourceStart, sourceEnd })
}

function validateSpanIndex(index: TerminalRichSpanIntervalIndex): void {
  if (index === null || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error('Terminal rich span index must be an object')
  }
  if (!Array.isArray(index.byStart) || !Array.isArray(index.prefixMaxEnd)) {
    throw new Error('Terminal rich span index is malformed')
  }
}

function validateRawVisibleIndex(index: TerminalRichRawVisibleIndex): void {
  if (index === null || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error('Terminal rich raw-visible index must be an object')
  }
  if (
    !Array.isArray(index.byRawStart) ||
    !Array.isArray(index.bySourceStart) ||
    !Array.isArray(index.rawPrefixMaxEnd) ||
    !Array.isArray(index.sourcePrefixMaxEnd)
  ) {
    throw new Error('Terminal rich raw-visible index is malformed')
  }
}

function ownRequired(
  record: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new Error(`${label} ${key} must be an own property`)
  }
  return record[key]
}

function ownRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = ownRequired(record, key, label)
  if (typeof value !== 'number') {
    throw new Error(`${label} ${key} must be a number`)
  }
  return value
}

function validateStoredRange(
  label: string,
  order: number,
  dimension: 'raw' | 'source',
  start: number,
  end: number,
): void {
  if (!Number.isInteger(start) || start < 0) {
    throw new Error(`${label} ${order} ${dimension} start must be a non-negative integer`)
  }
  if (!Number.isInteger(end) || end < start) {
    throw new Error(`${label} ${order} ${dimension} end must be >= start`)
  }
}

export function getTerminalRichRawVisibleRangesForSourceRange(
  index: TerminalRichRawVisibleIndex,
  query: TerminalRichSourceRangeQuery,
): readonly TerminalRichRawVisibleRange[] {
  validateRawVisibleIndex(index)
  const range = normalizeSourceRange(query)
  recordTerminalPerformanceCounter('richRawVisibleIndexLookups')
  if (range.sourceEnd <= range.sourceStart) return Object.freeze([])
  const matches = getOverlappingRawVisibleRanges(
    index.bySourceStart,
    index.sourcePrefixMaxEnd,
    range.sourceStart,
    range.sourceEnd,
    item => item.range.sourceStart,
    item => item.range.sourceEnd,
  )
  return freezeRawVisibleMatches(matches)
}

export function getTerminalRichRawVisibleRangesForRawRange(
  index: TerminalRichRawVisibleIndex,
  query: TerminalRichRawRangeQuery,
): readonly TerminalRichRawVisibleRange[] {
  validateRawVisibleIndex(index)
  const range = normalizeRawRange(query)
  recordTerminalPerformanceCounter('richRawVisibleIndexLookups')
  if (range.rawEnd <= range.rawStart) return Object.freeze([])
  const matches = getOverlappingRawVisibleRanges(
    index.byRawStart,
    index.rawPrefixMaxEnd,
    range.rawStart,
    range.rawEnd,
    item => item.range.rawStart,
    item => item.range.rawEnd,
  )
  return freezeRawVisibleMatches(matches)
}

function getOverlappingRawVisibleRanges(
  entries: readonly IndexedRawVisibleRange[],
  prefixMaxEnd: readonly number[],
  start: number,
  end: number,
  startOf: (item: IndexedRawVisibleRange) => number,
  endOf: (item: IndexedRawVisibleRange) => number,
): readonly IndexedRawVisibleRange[] {
  const firstPossible = firstPrefixGreaterThan(prefixMaxEnd, start)
  const endExclusive = firstStartAtOrAfter(entries, end, startOf)
  const matches: IndexedRawVisibleRange[] = []
  for (let i = firstPossible; i < endExclusive; i++) {
    recordTerminalPerformanceCounter('richRawVisibleIndexSteps')
    const item = entries[i]!
    if (endOf(item) > startOf(item) && endOf(item) > start) matches.push(item)
  }
  recordTerminalPerformanceCounter('richRawVisibleIndexMatches', matches.length)
  return matches
}

function freezeRawVisibleMatches(
  matches: readonly IndexedRawVisibleRange[],
): readonly TerminalRichRawVisibleRange[] {
  return Object.freeze(matches
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(item => Object.freeze({ ...item.range })))
}

function buildPrefixMax<T>(
  values: readonly T[],
  endOf: (value: T) => number,
): number[] {
  const prefixMaxEnd: number[] = []
  let maxEnd = 0
  for (const value of values) {
    maxEnd = Math.max(maxEnd, endOf(value))
    prefixMaxEnd.push(maxEnd)
  }
  return prefixMaxEnd
}

function firstPrefixGreaterThan(values: readonly number[], target: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (values[mid]! <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function firstStartAtOrAfter<T>(
  values: readonly T[],
  target: number,
  startOf: (value: T) => number,
): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (startOf(values[mid]!) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function normalizeSourceRange(query: TerminalRichSourceRangeQuery): TerminalRichSourceRangeQuery {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('Terminal rich source range query must be an object')
  }
  const record = query as unknown as Record<string, unknown>
  const sourceStart = ownRequiredNumber(record, 'sourceStart', 'Terminal rich source range query')
  const sourceEnd = ownRequiredNumber(record, 'sourceEnd', 'Terminal rich source range query')
  if (!Number.isInteger(sourceStart) || sourceStart < 0) {
    throw new Error('Terminal rich source range start must be a non-negative integer')
  }
  if (!Number.isInteger(sourceEnd) || sourceEnd < sourceStart) {
    throw new Error('Terminal rich source range end must be >= sourceStart')
  }
  return { sourceStart, sourceEnd }
}

function normalizeRawRange(query: TerminalRichRawRangeQuery): TerminalRichRawRangeQuery {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('Terminal rich raw range query must be an object')
  }
  const record = query as unknown as Record<string, unknown>
  const rawStart = ownRequiredNumber(record, 'rawStart', 'Terminal rich raw range query')
  const rawEnd = ownRequiredNumber(record, 'rawEnd', 'Terminal rich raw range query')
  if (!Number.isInteger(rawStart) || rawStart < 0) {
    throw new Error('Terminal rich raw range start must be a non-negative integer')
  }
  if (!Number.isInteger(rawEnd) || rawEnd < rawStart) {
    throw new Error('Terminal rich raw range end must be >= rawStart')
  }
  return { rawStart, rawEnd }
}
