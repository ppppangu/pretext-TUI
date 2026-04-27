// 补建说明：该文件为后续补建，用于提供 Phase 4 的 host-neutral source range sidecar index；当前进度：首版支持不可变 generic ranges、点查询与 source-range overlap 查询，不理解任何宿主语义。
import {
  createTerminalMemoryBudgetEstimate,
  type TerminalMemoryBudgetEstimate,
} from './terminal-memory-budget.js'
import { recordTerminalPerformanceCounter } from './terminal-performance-counters.js'

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

type IndexedTerminalRange = {
  readonly order: number
  readonly range: TerminalRange
}

type InternalTerminalRangeIndex = {
  readonly byStart: readonly IndexedTerminalRange[]
  readonly prefixMaxEnd: readonly number[]
}

type ProxyDetector = (value: object) => boolean

const rangeIndexStates = new WeakMap<TerminalRangeIndex, InternalTerminalRangeIndex>()
let cachedProxyDetector: ProxyDetector | null | undefined

export function createTerminalRangeIndex(
  ranges: readonly TerminalRange[],
): TerminalRangeIndex {
  if (!Array.isArray(ranges)) {
    throw new Error('Terminal ranges must be an array')
  }
  const seenIds = new Set<string>()
  const normalized = [...cloneTerminalRangeArray(
    ranges,
    'Terminal ranges',
    (range, order) => normalizeTerminalRange(range as TerminalRange, order, seenIds),
  )]
  normalized.sort(compareIndexedTerminalRanges)
  const prefixMaxEnd: number[] = []
  let maxEnd = 0
  for (const item of normalized) {
    maxEnd = Math.max(maxEnd, item.range.sourceEnd)
    prefixMaxEnd.push(maxEnd)
  }
  recordTerminalPerformanceCounter('terminalRangeIndexBuilds')
  recordTerminalPerformanceCounter('terminalRangeIndexRanges', normalized.length)
  const handle = Object.freeze({
    kind: 'terminal-range-index@1',
  }) as TerminalRangeIndex
  rangeIndexStates.set(handle, {
    byStart: Object.freeze(normalized),
    prefixMaxEnd: Object.freeze(prefixMaxEnd),
  })
  return handle
}

export function getTerminalRangesAtSourceOffset(
  index: TerminalRangeIndex,
  sourceOffset: number,
): readonly TerminalRange[] {
  const offset = normalizeNonNegativeInteger(sourceOffset, 'Terminal range sourceOffset')
  recordTerminalPerformanceCounter('terminalRangeIndexLookups')
  return collectMatchingRanges(
    internalRangeIndex(index),
    offset,
    offset,
    true,
  )
}

export function getTerminalRangesForSourceRange(
  index: TerminalRangeIndex,
  query: TerminalRangeQuery,
): readonly TerminalRange[] {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('Terminal range query must be an object')
  }
  const sourceStart = normalizeNonNegativeInteger(query.sourceStart, 'Terminal range query sourceStart')
  const sourceEnd = normalizeNonNegativeInteger(query.sourceEnd, 'Terminal range query sourceEnd')
  if (sourceEnd < sourceStart) {
    throw new Error(`Terminal range query sourceEnd must be >= sourceStart, got ${sourceEnd} < ${sourceStart}`)
  }
  recordTerminalPerformanceCounter('terminalRangeIndexLookups')
  return collectMatchingRanges(
    internalRangeIndex(index),
    sourceStart,
    sourceEnd,
    sourceStart === sourceEnd,
  )
}

export function getTerminalRangeIndexMemoryEstimate(
  index: TerminalRangeIndex,
  label = 'terminal range index',
): TerminalMemoryBudgetEstimate {
  const internal = internalRangeIndex(index)
  let stringCodeUnits = 0
  let objectEntries = internal.byStart.length + internal.prefixMaxEnd.length
  for (const item of internal.byStart) {
    stringCodeUnits += item.range.id.length + item.range.kind.length
    if (item.range.tags !== undefined) {
      objectEntries += item.range.tags.length
      stringCodeUnits += item.range.tags.reduce((sum, tag) => sum + tag.length, 0)
    }
    if (item.range.data !== undefined) {
      const dataEstimate = estimateTerminalRangeData(item.range.data)
      objectEntries += dataEstimate.objectEntries
      stringCodeUnits += dataEstimate.stringCodeUnits
    }
  }
  return createTerminalMemoryBudgetEstimate({
    category: 'range-index',
    label,
    numberSlots: internal.prefixMaxEnd.length + internal.byStart.length * 3,
    objectEntries,
    rangeRecords: internal.byStart.length,
    stringCodeUnits,
    notes: ['generic inert sidecar ranges only; host payload interpretation is excluded'],
  })
}

function collectMatchingRanges(
  index: InternalTerminalRangeIndex,
  sourceStart: number,
  sourceEnd: number,
  collapsed: boolean,
): readonly TerminalRange[] {
  const searchEnd = collapsed ? sourceStart : sourceEnd
  const upperBound = collapsed
    ? upperBoundSourceStart(index.byStart, sourceStart)
    : lowerBoundSourceStart(index.byStart, sourceEnd)
  const matches: IndexedTerminalRange[] = []

  for (let cursor = upperBound - 1; cursor >= 0; cursor--) {
    const prefixMaxEnd = index.prefixMaxEnd[cursor]
    recordTerminalPerformanceCounter('terminalRangeIndexSteps')
    if (prefixMaxEnd === undefined || prefixMaxEnd < sourceStart) {
      recordTerminalPerformanceCounter('terminalRangeIndexPrefixPrunes')
      break
    }
    const item = index.byStart[cursor]!
    if (collapsed ? rangeContainsPoint(item.range, sourceStart) : rangeOverlapsQuery(item.range, sourceStart, searchEnd)) {
      matches.push(item)
    }
  }

  matches.sort(compareIndexedTerminalRanges)
  recordTerminalPerformanceCounter('terminalRangeIndexMatches', matches.length)
  return Object.freeze(matches.map(item => item.range))
}

function estimateTerminalRangeData(data: TerminalRangeData): { objectEntries: number, stringCodeUnits: number } {
  if (data === null || typeof data === 'boolean' || typeof data === 'number') {
    return { objectEntries: 1, stringCodeUnits: 0 }
  }
  if (typeof data === 'string') {
    return { objectEntries: 1, stringCodeUnits: data.length }
  }
  if (Array.isArray(data)) {
    return data.reduce(
      (sum, item) => {
        const itemEstimate = estimateTerminalRangeData(item)
        return {
          objectEntries: sum.objectEntries + itemEstimate.objectEntries + 1,
          stringCodeUnits: sum.stringCodeUnits + itemEstimate.stringCodeUnits,
        }
      },
      { objectEntries: 1, stringCodeUnits: 0 },
    )
  }
  return Object.entries(data).reduce(
    (sum, [key, value]) => {
      const valueEstimate = estimateTerminalRangeData(value)
      return {
        objectEntries: sum.objectEntries + valueEstimate.objectEntries + 1,
        stringCodeUnits: sum.stringCodeUnits + key.length + valueEstimate.stringCodeUnits,
      }
    },
    { objectEntries: 1, stringCodeUnits: 0 },
  )
}

function rangeContainsPoint(range: TerminalRange, sourceOffset: number): boolean {
  if (range.sourceStart === range.sourceEnd) return range.sourceStart === sourceOffset
  return range.sourceStart <= sourceOffset && sourceOffset < range.sourceEnd
}

function rangeOverlapsQuery(range: TerminalRange, sourceStart: number, sourceEnd: number): boolean {
  if (range.sourceStart === range.sourceEnd) {
    return sourceStart <= range.sourceStart && range.sourceStart < sourceEnd
  }
  return range.sourceStart < sourceEnd && range.sourceEnd > sourceStart
}

function normalizeTerminalRange(
  range: TerminalRange,
  order: number,
  seenIds: Set<string>,
): IndexedTerminalRange {
  if (range === null || typeof range !== 'object' || Array.isArray(range)) {
    throw new Error('Terminal range must be an object')
  }
  const id = normalizeNonEmptyString(range.id, 'Terminal range id')
  if (seenIds.has(id)) {
    throw new Error(`Terminal range id must be unique, got ${JSON.stringify(id)}`)
  }
  seenIds.add(id)
  const kind = normalizeNonEmptyString(range.kind, 'Terminal range kind')
  const sourceStart = normalizeNonNegativeInteger(range.sourceStart, 'Terminal range sourceStart')
  const sourceEnd = normalizeNonNegativeInteger(range.sourceEnd, 'Terminal range sourceEnd')
  if (sourceEnd < sourceStart) {
    throw new Error(`Terminal range sourceEnd must be >= sourceStart, got ${sourceEnd} < ${sourceStart}`)
  }
  const normalized: {
    id: string
    kind: string
    sourceStart: number
    sourceEnd: number
    data?: TerminalRangeData
    tags?: readonly string[]
  } = {
    id,
    kind,
    sourceStart,
    sourceEnd,
  }
  if (range.tags !== undefined) normalized.tags = normalizeTerminalRangeTags(range.tags)
  if (range.data !== undefined) normalized.data = cloneTerminalRangeData(range.data, 'Terminal range data')
  return {
    order,
    range: freezeTerminalRange(normalized),
  }
}

function normalizeTerminalRangeTags(tags: readonly string[]): readonly string[] {
  if (!Array.isArray(tags)) {
    throw new Error('Terminal range tags must be an array')
  }
  return cloneTerminalRangeArray(
    tags,
    'Terminal range tags',
    (tag, index) => normalizeNonEmptyString(tag as string, `Terminal range tag at index ${index}`),
  )
}

function cloneTerminalRangeData(
  value: TerminalRangeData,
  label: string,
  seen = new WeakSet<object>(),
): TerminalRangeData {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} number must be finite`)
    return value
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} must be inert JSON-like data`)
  }
  if (seen.has(value)) {
    throw new Error(`${label} must not contain cycles`)
  }
  if (isProxyObject(value)) {
    throw new Error(`${label} must not be a Proxy object`)
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const clone = cloneTerminalRangeArray(value, label, (item, index) => cloneTerminalRangeData(
      item as TerminalRangeData,
      `${label}[${index}]`,
      seen,
    ))
    seen.delete(value)
    return clone
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} objects must be plain objects`)
  }
  const clone: Record<string, TerminalRangeData> = {}
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') throw new Error(`${label} must not contain symbol keys`)
  }
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key]!
    if (!descriptor.enumerable) throw new Error(`${label}.${key} must be enumerable`)
    if ('get' in descriptor || 'set' in descriptor) throw new Error(`${label}.${key} must be a data property`)
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`${label}.${key} is not allowed`)
    }
    clone[key] = cloneTerminalRangeData(
      descriptor.value as TerminalRangeData,
      `${label}.${key}`,
      seen,
    )
  }
  const frozen = Object.freeze(clone)
  seen.delete(value)
  return frozen
}

function cloneTerminalRangeArray<T>(
  value: readonly unknown[],
  label: string,
  cloneItem: (item: unknown, index: number) => T,
): readonly T[] {
  if (isProxyObject(value)) {
    throw new Error(`${label} must not be a Proxy object`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>
  const lengthDescriptor = descriptors['length']
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    throw new Error(`${label}.length must be a non-negative integer`)
  }
  const length = lengthDescriptor.value as number
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') throw new Error(`${label} must not contain symbol keys`)
    if (key === 'length') continue
    const index = normalizeArrayIndexKey(key)
    if (index === null || index >= length) {
      throw new Error(`${label}.${key} is not allowed`)
    }
  }

  const clone: T[] = []
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[String(index)]
    if (descriptor === undefined) throw new Error(`${label} must not contain sparse array holes`)
    if (!descriptor.enumerable) throw new Error(`${label}[${index}] must be enumerable`)
    if ('get' in descriptor || 'set' in descriptor) throw new Error(`${label}[${index}] must be a data property`)
    clone.push(cloneItem(descriptor.value, index))
  }
  return Object.freeze(clone)
}

function normalizeArrayIndexKey(key: string): number | null {
  if (key.length === 0 || !/^(?:0|[1-9]\d*)$/u.test(key)) return null
  const index = Number(key)
  if (!Number.isSafeInteger(index)) return null
  return index
}

function freezeTerminalRange(range: TerminalRange): TerminalRange {
  return Object.freeze(range)
}

function compareIndexedTerminalRanges(a: IndexedTerminalRange, b: IndexedTerminalRange): number {
  if (a.range.sourceStart !== b.range.sourceStart) return a.range.sourceStart - b.range.sourceStart
  if (a.range.sourceEnd !== b.range.sourceEnd) return b.range.sourceEnd - a.range.sourceEnd
  if (a.range.id !== b.range.id) return a.range.id < b.range.id ? -1 : 1
  if (a.range.kind !== b.range.kind) return a.range.kind < b.range.kind ? -1 : 1
  return a.order - b.order
}

function lowerBoundSourceStart(ranges: readonly IndexedTerminalRange[], sourceStart: number): number {
  let lo = 0
  let hi = ranges.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (ranges[mid]!.range.sourceStart < sourceStart) lo = mid + 1
    else hi = mid
  }
  return lo
}

function upperBoundSourceStart(ranges: readonly IndexedTerminalRange[], sourceStart: number): number {
  let lo = 0
  let hi = ranges.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (ranges[mid]!.range.sourceStart <= sourceStart) lo = mid + 1
    else hi = mid
  }
  return lo
}

function normalizeNonEmptyString(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return value
}

function internalRangeIndex(index: TerminalRangeIndex): InternalTerminalRangeIndex {
  const state = rangeIndexStates.get(index)
  if (state === undefined) {
    throw new Error('Invalid terminal range index handle')
  }
  return state
}

function isProxyObject(value: object): boolean {
  const detector = getProxyDetector()
  return detector !== undefined && detector(value)
}

function getProxyDetector(): ProxyDetector | undefined {
  if (cachedProxyDetector !== undefined) return cachedProxyDetector ?? undefined
  const maybeGlobal = globalThis as {
    process?: {
      binding?: (name: string) => unknown
      getBuiltinModule?: (name: string) => unknown
    }
  }
  try {
    const builtin = maybeGlobal.process?.getBuiltinModule?.('node:util') as {
      types?: { isProxy?: unknown }
    } | undefined
    if (typeof builtin?.types?.isProxy === 'function') {
      cachedProxyDetector = builtin.types.isProxy as ProxyDetector
      return cachedProxyDetector
    }
    const binding = maybeGlobal.process?.binding?.('util') as { isProxy?: unknown } | undefined
    cachedProxyDetector = typeof binding?.isProxy === 'function' ? (binding.isProxy as ProxyDetector) : null
  } catch {
    cachedProxyDetector = null
  }
  return cachedProxyDetector ?? undefined
}
