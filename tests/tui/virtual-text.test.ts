// 补建说明：该文件为后续补建，用于验证 Task 9 的 sparse-anchor virtual text primitives；当前进度：首版覆盖 fixed-column page parity、source offset lookup、cache stats 与 append invalidation。
import { describe, expect, test } from 'bun:test'
import {
  appendTerminalCellFlow,
  createTerminalLineIndex,
  createTerminalPageCache,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalCursorForSourceOffset,
  getTerminalLineIndexMetadata,
  getTerminalLineIndexStats,
  getTerminalLinePage,
  getTerminalPageCacheStats,
  getTerminalSourceOffsetForCursor,
  invalidateTerminalLineIndex,
  invalidateTerminalPageCache,
  layoutNextTerminalLineRange,
  materializeTerminalLineRange,
  materializeTerminalLinePage,
  measureTerminalLineIndexRows,
  prepareTerminal,
  prepareTerminalCellFlow,
  type PreparedTerminalText,
  type TerminalLayoutOptions,
} from '../../src/index.js'
import {
  collectTerminalLines,
  type CollectedTerminalLine,
} from './validation-helpers.js'

function baselineLines(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): CollectedTerminalLine[] {
  return collectTerminalLines(prepared, options)
}

function materializedTexts(lines: readonly CollectedTerminalLine[]): string[] {
  return lines.map(line => line.materialized.text)
}

function materializedPageTexts(
  prepared: PreparedTerminalText,
  page: Parameters<typeof materializeTerminalLinePage>[1],
): string[] {
  return materializeTerminalLinePage(prepared, page).map(line => line.text)
}

function makeLongTranscript(rowCount = 48): string {
  const rows: string[] = []
  for (let i = 0; i < rowCount; i++) {
    rows.push(`row ${String(i).padStart(2, '0')}: alpha beta 世界 ${i % 3 === 0 ? 'emoji 😀' : 'plain'}\tcell`)
  }
  return rows.join('\n')
}

describe('tui virtual text primitives', () => {
  test('fixed-column pages match eager walked ranges at anchor boundaries and tail', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const layout = { columns: 24 }
    const eager = baselineLines(prepared, layout)
    const index = createTerminalLineIndex(prepared, { ...layout, anchorInterval: 4 })
    const cache = createTerminalPageCache(prepared, index, { pageSize: 5, maxPages: 4 })

    for (const startRow of [0, 3, 4, 5, 17, eager.length - 4]) {
      const page = getTerminalLinePage(prepared, cache, index, { startRow, rowCount: 4 })
      expect(page.lines.map(line => [line.sourceStart, line.sourceEnd, line.width])).toEqual(
        eager.slice(startRow, startRow + 4).map(line => [
          line.range.sourceStart,
          line.range.sourceEnd,
          line.range.width,
        ]),
      )
      expect(materializedPageTexts(prepared, page)).toEqual(
        materializedTexts(eager.slice(startRow, startRow + 4)),
      )
    }
  })

  test('line index builds sparse anchors without eager materialization', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const index = createTerminalLineIndex(prepared, { columns: 20, anchorInterval: 8 })
    const rows = measureTerminalLineIndexRows(prepared, index)
    const stats = getTerminalLineIndexStats(index)

    expect(rows).toBeGreaterThan(80)
    expect(stats.anchorCount).toBeGreaterThan(4)
    expect(stats.anchorCount).toBeLessThan(rows)
    expect(stats.maxReplayRows).toBeLessThanOrEqual(8)
    expect(getTerminalLineIndexStats(index).rangeWalks).toBeGreaterThan(rows)
  })

  test('page cache tracks hits, misses, evictions, and fixed-column separation', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const narrowIndex = createTerminalLineIndex(prepared, { columns: 18, anchorInterval: 4 })
    const wideIndex = createTerminalLineIndex(prepared, { columns: 34, anchorInterval: 4 })
    const cache = createTerminalPageCache(prepared, narrowIndex, { pageSize: 4, maxPages: 2 })

    const first = getTerminalLinePage(prepared, cache, narrowIndex, { startRow: 8, rowCount: 4 })
    const second = getTerminalLinePage(prepared, cache, narrowIndex, { startRow: 8, rowCount: 4 })
    getTerminalLinePage(prepared, cache, narrowIndex, { startRow: 16, rowCount: 4 })
    getTerminalLinePage(prepared, cache, narrowIndex, { startRow: 24, rowCount: 4 })

    expect(second.lines).toEqual(first.lines)
    expect(getTerminalPageCacheStats(cache)).toMatchObject({
      pageHits: 1,
      pageMisses: 3,
      pageBuilds: 3,
      evictions: 1,
    })
    expect(() => getTerminalLinePage(prepared, cache, wideIndex, { startRow: 8, rowCount: 4 })).toThrow(
      'different line index',
    )
    expect(() => getTerminalLinePage(prepared, cache, narrowIndex, { startRow: 8, rowCount: 5 })).toThrow(
      'pageSize',
    )
    expect(getTerminalLineIndexMetadata(narrowIndex).columns).not.toBe(getTerminalLineIndexMetadata(wideIndex).columns)
    expect(getTerminalLinePage(prepared, createTerminalPageCache(prepared, wideIndex), wideIndex, {
      startRow: 8,
      rowCount: 4,
    }).lines.map(line => line.width)).not.toEqual(first.lines.map(line => line.width))
  })

  test('source offset index round-trips grapheme-safe cursors independently from row caches', () => {
    const prepared = prepareTerminal('A😀e\u0301\t世界\ntrans\u00ADatlantic\u200Btail', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    })
    const sourceIndex = createTerminalSourceOffsetIndex(prepared)
    const eager = baselineLines(prepared, { columns: 7 })

    for (const item of eager) {
      const startLookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, item.range.sourceStart)
      const endLookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, item.range.sourceEnd, 'before')
      expect(startLookup.exact).toBe(true)
      expect(getTerminalSourceOffsetForCursor(prepared, startLookup.cursor, sourceIndex)).toBe(item.range.sourceStart)
      expect(getTerminalSourceOffsetForCursor(prepared, endLookup.cursor, sourceIndex)).toBe(item.range.sourceEnd)
    }

    const insideEmoji = getTerminalCursorForSourceOffset(prepared, sourceIndex, 2, 'before')
    const afterInsideEmoji = getTerminalCursorForSourceOffset(prepared, sourceIndex, 2, 'after')
    expect(insideEmoji.sourceOffset).toBe(1)
    expect(afterInsideEmoji.sourceOffset).toBe(3)

    const sameLengthDifferentSource = prepareTerminal('B😀e\u0301\t世界\ntrans\u00ADatlantic\u200Btail', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    })
    expect(() => getTerminalCursorForSourceOffset(sameLengthDifferentSource, sourceIndex, 1)).toThrow(
      'different prepared source',
    )

    const hardBreakPrepared = prepareTerminal('a\nb', { whiteSpace: 'pre-wrap' })
    const hardBreakIndex = createTerminalSourceOffsetIndex(hardBreakPrepared)
    const replaySafe = getTerminalCursorForSourceOffset(hardBreakPrepared, hardBreakIndex, 2)
    const replayed = layoutNextTerminalLineRange(hardBreakPrepared, replaySafe.cursor, { columns: 10 })
    expect(replayed && materializeTerminalLineRange(hardBreakPrepared, replayed).text).toBe('b')
  })

  test('append invalidation preserves stable prefix pages and refreshes suffix pages', () => {
    const initialText = makeLongTranscript(24)
    const initialFlow = prepareTerminalCellFlow(initialText, { whiteSpace: 'pre-wrap', tabSize: 4 })
    const initialPrepared = getTerminalCellFlowPrepared(initialFlow)
    const layout = { columns: 28, anchorInterval: 6, generation: getTerminalCellFlowGeneration(initialFlow) }
    const index = createTerminalLineIndex(initialPrepared, layout)
    const cache = createTerminalPageCache(initialPrepared, index, { pageSize: 4, maxPages: 4 })
    const prefixPageBefore = getTerminalLinePage(initialPrepared, cache, index, { startRow: 6, rowCount: 4 })
    const prefixTextsBefore = materializedPageTexts(initialPrepared, prefixPageBefore)
    const initialRows = measureTerminalLineIndexRows(initialPrepared, index)
    getTerminalLinePage(initialPrepared, cache, index, { startRow: initialRows - 4, rowCount: 4 })

    const appended = appendTerminalCellFlow(
      initialFlow,
      '\nappend 00: bounded invalidation keeps prefix stable\nappend 01: 世界 😀',
      { invalidationWindowCodeUnits: 128 },
    )
    const appendedPrepared = getTerminalCellFlowPrepared(appended.flow)
    const lineInvalidation = invalidateTerminalLineIndex(appendedPrepared, index, appended.invalidation)
    invalidateTerminalPageCache(cache, lineInvalidation)

    const freshIndex = createTerminalLineIndex(appendedPrepared, {
      columns: layout.columns,
      anchorInterval: layout.anchorInterval,
      generation: getTerminalCellFlowGeneration(appended.flow),
    })
    const prefixPageAfter = getTerminalLinePage(appendedPrepared, cache, index, { startRow: 6, rowCount: 4 })
    const suffixPage = getTerminalLinePage(appendedPrepared, cache, index, {
      startRow: measureTerminalLineIndexRows(appendedPrepared, freshIndex) - 4,
      rowCount: 4,
    })
    const freshSuffixPage = getTerminalLinePage(
      appendedPrepared,
      createTerminalPageCache(appendedPrepared, freshIndex),
      freshIndex,
      {
        startRow: measureTerminalLineIndexRows(appendedPrepared, freshIndex) - 4,
        rowCount: 4,
      },
    )

    expect(appended.invalidation.strategy).toBe('full-reprepare-bounded-invalidation')
    expect(appended.invalidation.stablePrefixCodeUnits).toBe(initialPrepared.sourceText.length)
    expect(lineInvalidation.firstInvalidRow).toBeGreaterThan(10)
    expect(materializedPageTexts(appendedPrepared, prefixPageAfter)).toEqual(prefixTextsBefore)
    expect(materializedPageTexts(appendedPrepared, suffixPage)).toEqual(
      materializedPageTexts(appendedPrepared, freshSuffixPage),
    )
    expect(getTerminalPageCacheStats(cache).pageHits).toBeGreaterThan(0)
    expect(getTerminalPageCacheStats(cache).invalidatedPages).toBeGreaterThan(0)
  })

  test('source-offset EOF invalidation backs up to the affected previous row', () => {
    const before = prepareTerminal('hello\u200B', { whiteSpace: 'pre-wrap' })
    const after = prepareTerminal('hello\u200Bworld', { whiteSpace: 'pre-wrap' })
    const index = createTerminalLineIndex(before, { columns: 20, generation: 0 })
    const cache = createTerminalPageCache(before, index, { pageSize: 2, maxPages: 2 })
    getTerminalLinePage(before, cache, index, { startRow: 0, rowCount: 1 })

    const lineInvalidation = invalidateTerminalLineIndex(after, index, {
      generation: 1,
      firstInvalidSourceOffset: before.sourceText.length,
    })
    invalidateTerminalPageCache(cache, lineInvalidation)
    const page = getTerminalLinePage(after, cache, index, { startRow: 0, rowCount: 1 })

    expect(lineInvalidation.firstInvalidRow).toBe(0)
    expect(materializedPageTexts(after, page)).toEqual(['helloworld'])
    expect(getTerminalPageCacheStats(cache).invalidatedPages).toBe(1)
  })

  test('public virtual handles do not expose mutable implementation state', () => {
    const prepared = prepareTerminal('opaque handles stay small', { whiteSpace: 'pre-wrap' })
    const sourceIndex = createTerminalSourceOffsetIndex(prepared)
    const lineIndex = createTerminalLineIndex(prepared, { columns: 12 })
    const pageCache = createTerminalPageCache(prepared, lineIndex)
    const flow = prepareTerminalCellFlow('opaque handles stay small')

    expect(Object.keys(sourceIndex)).toEqual(['kind'])
    expect(Object.keys(lineIndex)).toEqual(['kind'])
    expect(Object.keys(pageCache)).toEqual(['kind'])
    expect(Object.keys(flow)).toEqual(['kind'])

    const lookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, 1)
    const page = getTerminalLinePage(prepared, pageCache, lineIndex, { startRow: 0, rowCount: 1 })
    expect(Object.isFrozen(lookup.cursor)).toBe(true)
    expect(Object.isFrozen(page)).toBe(true)
    expect(Object.isFrozen(page.lines)).toBe(true)
    expect(Object.isFrozen(page.lines[0])).toBe(true)
  })
})
