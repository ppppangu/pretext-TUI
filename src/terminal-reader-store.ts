// 补建说明：该文件为后续补建，用于提供内部 PreparedTerminalReader store/reader 构造层，先以 single-store reader parity 锁住未来 chunk storage 的读取契约；当前进度：Batch 6 preflight 仅复制既有 reader 的全局 segment/source 语义，不改变 append 策略。
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
  const segments: string[] = []
  const kinds: Array<SegmentBreakKind | undefined> = []
  const sourceStarts: number[] = []
  const segmentBreaksAfter: boolean[] = []

  for (let segmentIndex = 0; segmentIndex < reader.segmentCount; segmentIndex++) {
    segments.push(reader.segmentText(segmentIndex) ?? '')
    kinds.push(reader.segmentKind(segmentIndex))
    sourceStarts.push(reader.segmentSourceStart(segmentIndex))
    segmentBreaksAfter.push(reader.hasSegmentBreakAfter(segmentIndex))
  }

  const chunk = freezeReaderStoreChunk({
    segmentStartIndex: 0,
    segmentCount: segments.length,
    sourceStart: 0,
    sourceLength: reader.sourceLength,
    segments,
    kinds,
    sourceStarts,
    segmentBreaksAfter,
  })

  return Object.freeze({
    kind: 'prepared-terminal-reader-store@1',
    chunks: Object.freeze([chunk]),
    segmentCount: segments.length,
    sourceLength: reader.sourceLength,
    tabStopAdvance: reader.tabStopAdvance,
    widthProfile: reader.widthProfile,
  })
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
