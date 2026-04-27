// 补建说明：该文件为后续补建，用于提供内部 PreparedTerminalReader store/reader 构造层，先以 synthetic multi-store reader parity 锁住未来 chunk storage 的读取契约；当前进度：Batch 6 preflight 仅复制既有 reader 的全局 segment/source 语义，不改变 append 策略。
import type { SegmentBreakKind } from './analysis.js'
import type { PreparedTerminalReader } from './terminal-prepared-reader.js'
import type { TerminalWidthProfile } from './terminal-width-profile.js'

export type PreparedTerminalReaderStore = Readonly<{
  chunks: readonly PreparedTerminalReaderStoreChunk[]
  kind: 'prepared-terminal-reader-store@1'
  segmentCount: number
  sourceLength: number
  tabStopAdvance: number
  widthProfile: TerminalWidthProfile
}>

type PreparedTerminalReaderStoreChunk = Readonly<{
  kinds: readonly (SegmentBreakKind | undefined)[]
  segmentBreaksAfter: readonly boolean[]
  segmentCount: number
  segmentStartIndex: number
  segments: readonly string[]
  sourceLength: number
  sourceStart: number
  sourceStarts: readonly number[]
}>

export function createSingleStorePreparedTerminalReaderStore(
  reader: PreparedTerminalReader,
): PreparedTerminalReaderStore {
  const chunk = copyReaderStoreChunk(reader, 0, reader.segmentCount)

  return freezeReaderStore({
    chunks: [chunk],
    segmentCount: reader.segmentCount,
    sourceLength: reader.sourceLength,
    tabStopAdvance: reader.tabStopAdvance,
    widthProfile: reader.widthProfile,
  })
}

export function createCompositePreparedTerminalReaderStore(
  reader: PreparedTerminalReader,
  segmentChunkSizes: readonly number[],
): PreparedTerminalReaderStore {
  const normalizedChunkSizes = normalizeSegmentChunkSizes(reader.segmentCount, segmentChunkSizes)
  const chunks: PreparedTerminalReaderStoreChunk[] = []
  let segmentStartIndex = 0
  for (const segmentCount of normalizedChunkSizes) {
    chunks.push(copyReaderStoreChunk(reader, segmentStartIndex, segmentCount))
    segmentStartIndex += segmentCount
  }

  return freezeReaderStore({
    chunks,
    segmentCount: reader.segmentCount,
    sourceLength: reader.sourceLength,
    tabStopAdvance: reader.tabStopAdvance,
    widthProfile: reader.widthProfile,
  })
}

export function assertPreparedTerminalReaderStoreInvariants(
  store: PreparedTerminalReaderStore,
): void {
  let expectedSegmentStartIndex = 0
  let expectedSourceStart = 0

  if (store.segmentCount === 0) {
    if (store.sourceLength !== 0) {
      throw new Error('Prepared terminal reader store sourceLength must be 0 when segmentCount is 0')
    }
    for (const chunk of store.chunks) {
      if (chunk.segmentCount !== 0 || chunk.segments.length !== 0) {
        throw new Error('Prepared terminal reader store empty source cannot contain non-empty chunks')
      }
    }
    return
  }

  for (const chunk of store.chunks) {
    if (chunk.segmentStartIndex !== expectedSegmentStartIndex) {
      throw new Error('Prepared terminal reader store chunks must have contiguous segment ranges')
    }
    if (
      chunk.segmentCount !== chunk.segments.length ||
      chunk.segmentCount !== chunk.kinds.length ||
      chunk.segmentCount !== chunk.sourceStarts.length ||
      chunk.segmentCount !== chunk.segmentBreaksAfter.length
    ) {
      throw new Error('Prepared terminal reader store chunk arrays must align with segmentCount')
    }
    if (chunk.segmentCount <= 0) {
      throw new Error('Prepared terminal reader store non-empty sources cannot contain empty chunks')
    }
    if (chunk.sourceStart !== expectedSourceStart) {
      throw new Error('Prepared terminal reader store chunk sourceStart must match the next global source offset')
    }

    let localSourceEnd = chunk.sourceStart
    for (let localSegmentIndex = 0; localSegmentIndex < chunk.segmentCount; localSegmentIndex++) {
      const sourceStart = chunk.sourceStarts[localSegmentIndex]!
      if (sourceStart !== localSourceEnd) {
        throw new Error('Prepared terminal reader store segment sourceStarts must be global and contiguous')
      }
      localSourceEnd = sourceStart + chunk.segments[localSegmentIndex]!.length
      if (localSourceEnd > store.sourceLength) {
        throw new Error('Prepared terminal reader store segment source range exceeds store sourceLength')
      }
    }

    if (chunk.sourceLength !== localSourceEnd - chunk.sourceStart) {
      throw new Error('Prepared terminal reader store chunk sourceLength must span its global segment range')
    }
    expectedSegmentStartIndex += chunk.segmentCount
    expectedSourceStart = localSourceEnd
  }

  if (expectedSegmentStartIndex !== store.segmentCount) {
    throw new Error('Prepared terminal reader store chunks must cover every segment')
  }
  if (expectedSourceStart !== store.sourceLength) {
    throw new Error('Prepared terminal reader store chunks must cover the full source')
  }
}

export function createCompositePreparedTerminalReader(
  reader: PreparedTerminalReader,
  segmentChunkSizes: readonly number[],
): PreparedTerminalReader {
  return createPreparedTerminalReaderFromStore(
    createCompositePreparedTerminalReaderStore(reader, segmentChunkSizes),
  )
}

function copyReaderStoreChunk(
  reader: PreparedTerminalReader,
  segmentStartIndex: number,
  segmentCount: number,
): PreparedTerminalReaderStoreChunk {
  const segments: string[] = []
  const kinds: Array<SegmentBreakKind | undefined> = []
  const sourceStarts: number[] = []
  const segmentBreaksAfter: boolean[] = []

  for (
    let segmentIndex = segmentStartIndex;
    segmentIndex < segmentStartIndex + segmentCount;
    segmentIndex++
  ) {
    segments.push(reader.segmentText(segmentIndex) ?? '')
    kinds.push(reader.segmentKind(segmentIndex))
    sourceStarts.push(reader.segmentSourceStart(segmentIndex))
    segmentBreaksAfter.push(reader.hasSegmentBreakAfter(segmentIndex))
  }

  const sourceStart = segmentCount === 0
    ? 0
    : sourceStarts[0]!
  const sourceEnd = segmentCount === 0
    ? reader.sourceLength
    : sourceStarts[sourceStarts.length - 1]! + segments[segments.length - 1]!.length
  return freezeReaderStoreChunk({
    segmentStartIndex,
    segmentCount: segments.length,
    sourceStart,
    sourceLength: sourceEnd - sourceStart,
    segments,
    kinds,
    sourceStarts,
    segmentBreaksAfter,
  })
}

function freezeReaderStore(
  input: Omit<PreparedTerminalReaderStore, 'chunks' | 'kind'> & {
    chunks: PreparedTerminalReaderStoreChunk[]
  },
): PreparedTerminalReaderStore {
  const store = Object.freeze({
    kind: 'prepared-terminal-reader-store@1',
    chunks: Object.freeze([...input.chunks]),
    segmentCount: input.segmentCount,
    sourceLength: input.sourceLength,
    tabStopAdvance: input.tabStopAdvance,
    widthProfile: input.widthProfile,
  } satisfies PreparedTerminalReaderStore)
  assertPreparedTerminalReaderStoreInvariants(store)
  return store
}

function normalizeSegmentChunkSizes(
  segmentCount: number,
  segmentChunkSizes: readonly number[],
): number[] {
  if (segmentCount === 0) {
    if (segmentChunkSizes.length !== 0) {
      throw new Error('Prepared terminal reader store empty source must use no segment chunks')
    }
    return []
  }
  if (segmentChunkSizes.length === 0) {
    throw new Error('Prepared terminal reader store chunk sizes must cover every segment')
  }
  let covered = 0
  const normalized: number[] = []
  for (const size of segmentChunkSizes) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error(`Prepared terminal reader store chunk size must be a positive integer, got ${size}`)
    }
    covered += size
    if (covered > segmentCount) {
      throw new Error('Prepared terminal reader store chunk sizes exceed segmentCount')
    }
    normalized.push(size)
  }
  if (covered !== segmentCount) {
    throw new Error('Prepared terminal reader store chunk sizes must cover every segment')
  }
  return normalized
}

export function createPreparedTerminalReaderFromStore(
  store: PreparedTerminalReaderStore,
): PreparedTerminalReader {
  return Object.freeze({
    kind: 'prepared-terminal-reader@1',
    get segmentCount() {
      return store.segmentCount
    },
    get sourceLength() {
      return store.sourceLength
    },
    get tabStopAdvance() {
      return store.tabStopAdvance
    },
    get widthProfile() {
      return store.widthProfile
    },
    hasSegmentBreakAfter(segmentIndex: number): boolean {
      const found = findReaderStoreSegment(store, segmentIndex)
      return found?.chunk.segmentBreaksAfter[found.localSegmentIndex] ?? false
    },
    segmentKind(segmentIndex: number): SegmentBreakKind | undefined {
      const found = findReaderStoreSegment(store, segmentIndex)
      return found?.chunk.kinds[found.localSegmentIndex]
    },
    segmentSourceStart(segmentIndex: number): number {
      const found = findReaderStoreSegment(store, segmentIndex)
      return found?.chunk.sourceStarts[found.localSegmentIndex] ?? store.sourceLength
    },
    segmentText(segmentIndex: number): string | undefined {
      const found = findReaderStoreSegment(store, segmentIndex)
      return found?.chunk.segments[found.localSegmentIndex]
    },
  })
}

export function createSingleStorePreparedTerminalReader(
  reader: PreparedTerminalReader,
): PreparedTerminalReader {
  return createPreparedTerminalReaderFromStore(
    createSingleStorePreparedTerminalReaderStore(reader),
  )
}

type ReaderStoreSegmentLookup = {
  chunk: PreparedTerminalReaderStoreChunk
  localSegmentIndex: number
}

function findReaderStoreSegment(
  store: PreparedTerminalReaderStore,
  segmentIndex: number,
): ReaderStoreSegmentLookup | null {
  if (segmentIndex < 0 || segmentIndex >= store.segmentCount) return null
  let lo = 0
  let hi = store.chunks.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const chunk = store.chunks[mid]!
    if (segmentIndex < chunk.segmentStartIndex) {
      hi = mid
    } else if (segmentIndex >= chunk.segmentStartIndex + chunk.segmentCount) {
      lo = mid + 1
    } else {
      return {
        chunk,
        localSegmentIndex: segmentIndex - chunk.segmentStartIndex,
      }
    }
  }
  return null
}

function freezeReaderStoreChunk(
  chunk: Omit<PreparedTerminalReaderStoreChunk, 'kinds' | 'segmentBreaksAfter' | 'segments' | 'sourceStarts'> & {
    kinds: Array<SegmentBreakKind | undefined>
    segmentBreaksAfter: boolean[]
    segments: string[]
    sourceStarts: number[]
  },
): PreparedTerminalReaderStoreChunk {
  return Object.freeze({
    ...chunk,
    kinds: Object.freeze([...chunk.kinds]),
    segmentBreaksAfter: Object.freeze([...chunk.segmentBreaksAfter]),
    segments: Object.freeze([...chunk.segments]),
    sourceStarts: Object.freeze([...chunk.sourceStarts]),
  })
}
