// 补建说明：该文件为后续补建，用于提供 Task 9 的 fixed-column terminal line page cache；当前进度：运行时 handle 已改为 WeakMap-backed opaque 边界，只缓存 range metadata，并按 line-index handle 绑定。
import type { PreparedTerminalText, TerminalLineRange } from './terminal.js'
import {
  assertTerminalLineIndexPrepared,
  getTerminalLineIndexIdentity,
  getTerminalLineRangesAtRows,
  type TerminalLineIndex,
} from './terminal-line-index.js'

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

type InternalTerminalPageCache = {
  readonly columns: number
  readonly layoutKey: string
  readonly lineIndex: TerminalLineIndex
  readonly maxPages: number
  readonly pageSize: number
  readonly pages: Map<string, TerminalLinePage>
  generation: number
  stats: TerminalPageCacheStats
}

type MutableTerminalPageCacheStats = {
  evictions: number
  invalidatedPages: number
  pageBuilds: number
  pageHits: number
  pageMisses: number
}

const DEFAULT_PAGE_SIZE = 64
const DEFAULT_MAX_PAGES = 16
const pageCacheStates = new WeakMap<TerminalPageCache, InternalTerminalPageCache>()

export function createTerminalPageCache(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  options: TerminalPageCacheOptions = {},
): TerminalPageCache {
  assertTerminalLineIndexPrepared(prepared, index)
  const identity = getTerminalLineIndexIdentity(index)
  const handle = Object.freeze({
    kind: 'terminal-page-cache@1',
  }) as TerminalPageCache
  pageCacheStates.set(handle, {
    columns: identity.columns,
    generation: identity.generation,
    layoutKey: identity.layoutKey,
    lineIndex: index,
    pageSize: normalizePositiveInteger(options.pageSize ?? DEFAULT_PAGE_SIZE, 'Terminal page size'),
    maxPages: normalizePositiveInteger(options.maxPages ?? DEFAULT_MAX_PAGES, 'Terminal max pages'),
    pages: new Map(),
    stats: {
      evictions: 0,
      invalidatedPages: 0,
      pageBuilds: 0,
      pageHits: 0,
      pageMisses: 0,
    },
  })
  return handle
}

export function getTerminalLinePage(
  prepared: PreparedTerminalText,
  cache: TerminalPageCache,
  index: TerminalLineIndex,
  request: TerminalLinePageRequest,
): TerminalLinePage {
  const internal = internalPageCache(cache)
  const identity = getTerminalLineIndexIdentity(index)
  const startRow = normalizeNonNegativeInteger(request.startRow, 'Terminal page startRow')
  const rowCount = normalizePositiveInteger(request.rowCount, 'Terminal page rowCount')
  if (internal.lineIndex !== index) {
    throw new Error('Terminal page cache is bound to a different line index')
  }
  if (internal.layoutKey !== identity.layoutKey || internal.columns !== identity.columns) {
    throw new Error('Terminal page cache layout identity does not match the line index')
  }
  if (rowCount > internal.pageSize) {
    throw new Error(`Terminal page rowCount must be <= pageSize (${internal.pageSize}), got ${rowCount}`)
  }
  assertTerminalLineIndexPrepared(prepared, index)
  if (internal.generation !== identity.generation) {
    clearTerminalPageCache(internal, identity.generation)
  }

  const key = pageKey(startRow, rowCount)
  const cached = internal.pages.get(key)
  if (cached !== undefined) {
    internal.pages.delete(key)
    internal.pages.set(key, cached)
    incrementPageHits(internal)
    return cached
  }

  incrementPageMisses(internal)
  const lines = getTerminalLineRangesAtRows(prepared, index, startRow, rowCount)

  const page = createImmutablePage({
    kind: 'terminal-line-page@1',
    generation: identity.generation,
    columns: identity.columns,
    startRow,
    rowCount: lines.length,
    lines,
  })
  internal.pages.set(key, page)
  incrementPageBuilds(internal)
  evictOverflowPages(internal)
  return page
}

export function getTerminalPageCacheStats(cache: TerminalPageCache): TerminalPageCacheStats {
  return { ...internalPageCache(cache).stats }
}

export function invalidateTerminalPageCache(
  cache: TerminalPageCache,
  invalidation: { generation: number; firstInvalidRow?: number },
): void {
  const internal = internalPageCache(cache)
  const firstInvalidRow = invalidation.firstInvalidRow
  if (firstInvalidRow === undefined) {
    clearTerminalPageCache(internal, invalidation.generation)
    return
  }
  normalizeNonNegativeInteger(firstInvalidRow, 'Terminal firstInvalidRow')

  let removed = 0
  for (const [key, page] of internal.pages) {
    const requestedRowCount = pageRowCountFromKey(key)
    if (page.startRow + requestedRowCount > firstInvalidRow) {
      internal.pages.delete(key)
      removed++
      continue
    }
    if (page.generation !== invalidation.generation) {
      internal.pages.set(key, createImmutablePage({
        ...page,
        generation: invalidation.generation,
      }))
    }
  }
  internal.generation = invalidation.generation
  const stats = mutableStats(internal)
  stats.invalidatedPages += removed
  internal.stats = stats
}

function clearTerminalPageCache(cache: InternalTerminalPageCache, generation: number): void {
  const removed = cache.pages.size
  cache.pages.clear()
  cache.generation = generation
  const stats = mutableStats(cache)
  stats.invalidatedPages += removed
  cache.stats = stats
}

function evictOverflowPages(cache: InternalTerminalPageCache): void {
  while (cache.pages.size > cache.maxPages) {
    const oldestKey = cache.pages.keys().next().value as string | undefined
    if (oldestKey === undefined) return
    cache.pages.delete(oldestKey)
    const stats = mutableStats(cache)
    stats.evictions++
    cache.stats = stats
  }
}

function incrementPageHits(cache: InternalTerminalPageCache): void {
  const stats = mutableStats(cache)
  stats.pageHits++
  cache.stats = stats
}

function incrementPageMisses(cache: InternalTerminalPageCache): void {
  const stats = mutableStats(cache)
  stats.pageMisses++
  cache.stats = stats
}

function incrementPageBuilds(cache: InternalTerminalPageCache): void {
  const stats = mutableStats(cache)
  stats.pageBuilds++
  cache.stats = stats
}

function mutableStats(cache: InternalTerminalPageCache): MutableTerminalPageCacheStats {
  return { ...cache.stats }
}

function pageKey(startRow: number, rowCount: number): string {
  return `${startRow}:${rowCount}`
}

function pageRowCountFromKey(key: string): number {
  const separator = key.indexOf(':')
  return Number(key.slice(separator + 1))
}

function createImmutablePage(page: TerminalLinePage): TerminalLinePage {
  return Object.freeze({
    ...page,
    lines: Object.freeze(page.lines.map(freezeTerminalLineRange)),
  })
}

function freezeTerminalLineRange(line: TerminalLineRange): TerminalLineRange {
  return Object.freeze({
    ...line,
    start: Object.freeze({ ...line.start }),
    end: Object.freeze({ ...line.end }),
    break: Object.freeze({ ...line.break }),
    overflow: line.overflow === null ? null : Object.freeze({ ...line.overflow }),
  })
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

function internalPageCache(cache: TerminalPageCache): InternalTerminalPageCache {
  const state = pageCacheStates.get(cache)
  if (state === undefined) {
    throw new Error('Invalid terminal page cache handle')
  }
  return state
}
