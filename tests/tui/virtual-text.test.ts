// 补建说明：该文件为后续补建，用于验证 sparse-anchor virtual text primitives；当前进度：Phase 8 更新 fixed-column page/source/cache 与 chunked append invalidation parity。
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
  getTerminalLineRangeAtRow,
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
  TERMINAL_START_CURSOR,
  type PreparedTerminalText,
  type TerminalLayoutOptions,
} from '../../src/index.js'
import {
  collectTerminalLines,
  readInternalPreparedTerminalText,
  type CollectedTerminalLine,
} from './validation-helpers.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/terminal-prepared-reader.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/terminal-performance-counters.js'

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

function rangeSignature(prepared: PreparedTerminalText, page: Parameters<typeof materializeTerminalLinePage>[1]): unknown[] {
  const materialized = materializeTerminalLinePage(prepared, page)
  return page.lines.map((line, index) => ({
    sourceEnd: line.sourceEnd,
    sourceStart: line.sourceStart,
    sourceText: materialized[index]!.sourceText,
    text: materialized[index]!.text,
    width: line.width,
    break: line.break,
    overflow: line.overflow,
  }))
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

  test('single-row lookup does not pre-store the following anchor', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const index = createTerminalLineIndex(prepared, { columns: 20, anchorInterval: 16 })

    expect(materializeTerminalLineRange(prepared, getTerminalLineRangeAtRow(prepared, index, 15)!).text).toBeTruthy()
    expect(getTerminalLineIndexStats(index).anchorCount).toBe(1)
    expect(getTerminalLineIndexStats(index).maxReplayRows).toBe(15)
    expect(materializeTerminalLineRange(prepared, getTerminalLineRangeAtRow(prepared, index, 16)!).text).toBeTruthy()
    expect(getTerminalLineIndexStats(index).anchorCount).toBe(2)
  })

  test('page cache miss uses one sparse seek before sequential row walking', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const index = createTerminalLineIndex(prepared, { columns: 20, anchorInterval: 16 })
    const cache = createTerminalPageCache(prepared, index, { pageSize: 8, maxPages: 2 })
    expect(getTerminalLineRangeAtRow(prepared, index, 16)).not.toBeNull()
    const before = getTerminalLineIndexStats(index).rangeWalks
    const page = getTerminalLinePage(prepared, cache, index, { startRow: 31, rowCount: 8 })
    const stats = getTerminalLineIndexStats(index)
    const repeatedIndex = createTerminalLineIndex(prepared, { columns: 20, anchorInterval: 16 })
    expect(getTerminalLineRangeAtRow(prepared, repeatedIndex, 16)).not.toBeNull()
    const repeatedBefore = getTerminalLineIndexStats(repeatedIndex).rangeWalks
    for (let row = 31; row < 39; row++) {
      expect(getTerminalLineRangeAtRow(prepared, repeatedIndex, row)).not.toBeNull()
    }
    const repeatedWalks = getTerminalLineIndexStats(repeatedIndex).rangeWalks - repeatedBefore

    expect(page.rowCount).toBe(8)
    expect(stats.rangeWalks - before).toBeLessThan(repeatedWalks)
    expect(stats.maxReplayRows).toBeLessThanOrEqual(16)
    expect(stats.anchorCount).toBeGreaterThan(1)
  })

  test('page cache miss and hit preserve unicode-heavy range/source parity', () => {
    const text = [
      'combining: e\u0301 cafe\u0301 wrap',
      'emoji: 👩‍💻 1️⃣ 🇺🇸 😀',
      'cjk tab: 世界\tterminal',
      'soft\u00ADhyphen zero\u200Bwidth tail',
      'plain ending',
    ].join('\n')
    const prepared = prepareTerminal(text, {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
      widthProfile: { ambiguousWidth: 'wide' },
    })
    const layout = { columns: 9 }
    const eager = baselineLines(prepared, layout)
    const index = createTerminalLineIndex(prepared, { ...layout, anchorInterval: 3 })
    const cache = createTerminalPageCache(prepared, index, { pageSize: 4, maxPages: 2 })
    const page = getTerminalLinePage(prepared, cache, index, { startRow: 2, rowCount: 4 })
    const cachedHit = getTerminalLinePage(prepared, cache, index, { startRow: 2, rowCount: 4 })
    const expected = {
      kind: 'terminal-line-page@1' as const,
      columns: 9,
      generation: 0,
      startRow: 2,
      rowCount: 4,
      lines: eager.slice(2, 6).map(line => line.range),
    }

    expect(rangeSignature(prepared, page)).toEqual(rangeSignature(prepared, expected))
    expect(rangeSignature(prepared, cachedHit)).toEqual(rangeSignature(prepared, expected))
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

  test('source offset lookup reports exactness for the requested offset before clamping', () => {
    const prepared = prepareTerminal('abc', { whiteSpace: 'pre-wrap' })
    const index = createTerminalSourceOffsetIndex(prepared)
    const sourceLength = readInternalPreparedTerminalText(prepared).sourceText.length

    expect(getTerminalCursorForSourceOffset(prepared, index, -1)).toMatchObject({
      exact: false,
      requestedSourceOffset: -1,
      sourceOffset: 0,
    })
    expect(getTerminalCursorForSourceOffset(prepared, index, sourceLength)).toMatchObject({
      exact: true,
      requestedSourceOffset: sourceLength,
      sourceOffset: sourceLength,
    })
    expect(getTerminalCursorForSourceOffset(prepared, index, sourceLength + 1)).toMatchObject({
      exact: false,
      requestedSourceOffset: sourceLength + 1,
      sourceOffset: sourceLength,
    })

    const empty = prepareTerminal('', { whiteSpace: 'pre-wrap' })
    const emptyIndex = createTerminalSourceOffsetIndex(empty)
    expect(getTerminalCursorForSourceOffset(empty, emptyIndex, 0)).toMatchObject({
      exact: true,
      requestedSourceOffset: 0,
      sourceOffset: 0,
    })
    expect(getTerminalCursorForSourceOffset(empty, emptyIndex, 1)).toMatchObject({
      exact: false,
      requestedSourceOffset: 1,
      sourceOffset: 0,
    })
  })

  test('source offset lookup rejects invalid runtime bias and keeps duplicate-offset tie policy explicit', () => {
    const prepared = prepareTerminal('A\nB', { whiteSpace: 'pre-wrap' })
    const index = createTerminalSourceOffsetIndex(prepared)

    expect(() => getTerminalCursorForSourceOffset(prepared, index, 0, 'sideways' as never)).toThrow(
      'Terminal source offset bias',
    )
    expect(() => getTerminalCursorForSourceOffset(prepared, index, 0, null as never)).toThrow(
      'Terminal source offset bias',
    )
    expect(() => getTerminalCursorForSourceOffset(prepared, index, 0, 1 as never)).toThrow(
      'Terminal source offset bias',
    )

    const before = getTerminalCursorForSourceOffset(prepared, index, 2, 'before')
    const after = getTerminalCursorForSourceOffset(prepared, index, 2, 'after')
    const closest = getTerminalCursorForSourceOffset(prepared, index, 2, 'closest')

    expect(before).toMatchObject({ exact: true, requestedSourceOffset: 2, sourceOffset: 2 })
    expect(after).toMatchObject({ exact: true, requestedSourceOffset: 2, sourceOffset: 2 })
    expect(closest).toMatchObject({ exact: true, requestedSourceOffset: 2, sourceOffset: 2 })
    expect(before.cursor).not.toEqual(after.cursor)
    expect(closest.cursor).toEqual(after.cursor)
  })

  test('source offset cursors replay from canonical segment boundaries', () => {
    for (const item of [
      {
        text: 'hello world',
        offset: 5,
        expected: 'world',
        whiteSpace: 'normal',
      },
      {
        text: 'a\nb',
        offset: 2,
        expected: 'b',
        whiteSpace: 'pre-wrap',
      },
      {
        text: 'a\n',
        offset: 2,
        expected: '',
        whiteSpace: 'pre-wrap',
      },
      {
        text: 'a\u200Bb',
        offset: 2,
        expected: 'b',
        whiteSpace: 'pre-wrap',
      },
      {
        text: 'a\u00ADb',
        offset: 2,
        expected: 'b',
        whiteSpace: 'pre-wrap',
      },
      {
        text: 'a\tb',
        offset: 2,
        expected: 'b',
        whiteSpace: 'pre-wrap',
      },
    ] as const) {
      const prepared = prepareTerminal(item.text, { whiteSpace: item.whiteSpace, tabSize: 4 })
      const sourceIndex = createTerminalSourceOffsetIndex(prepared)
      const before = getTerminalCursorForSourceOffset(prepared, sourceIndex, item.offset, 'before')
      const closest = getTerminalCursorForSourceOffset(prepared, sourceIndex, item.offset, 'closest')
      const after = getTerminalCursorForSourceOffset(prepared, sourceIndex, item.offset, 'after')
      const canonicalLine = layoutNextTerminalLineRange(prepared, after.cursor, { columns: 10 })
      const expectedSignature = canonicalLine === null
        ? null
        : rangeSignature(prepared, {
          kind: 'terminal-line-page@1',
          columns: 10,
          generation: 0,
          startRow: 0,
          rowCount: 1,
          lines: [canonicalLine],
        })[0]
      for (const cursor of [before.cursor, closest.cursor, after.cursor]) {
        const line = layoutNextTerminalLineRange(prepared, cursor, { columns: 10 })
        expect(line === null ? '' : materializeTerminalLineRange(prepared, line).text).toBe(item.expected)
        expect(line === null
          ? null
          : rangeSignature(prepared, {
            kind: 'terminal-line-page@1',
            columns: 10,
            generation: 0,
            startRow: 0,
            rowCount: 1,
            lines: [line],
          })[0]).toEqual(expectedSignature)
      }
    }
  })

  test('prepared geometry is reused across source lookup, layout, materialization, and append boundaries', () => {
    const prepared = prepareTerminal('A😀e\u0301\t世界\ntrans\u00ADatlantic\u200Btail', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    })
    const internal = readInternalPreparedTerminalText(prepared)

    try {
      resetTerminalPerformanceCounters()
      const sourceIndex = createTerminalSourceOffsetIndex(prepared)
      const sourceCounters = snapshotTerminalPerformanceCounters()
      expect(sourceCounters.preparedGeometryBuilds).toBe(1)
      expect(sourceCounters.preparedGeometrySegments).toBe(internal.segments.length)
      expect(getTerminalSourceOffsetForCursor(prepared, TERMINAL_START_CURSOR, sourceIndex)).toBe(0)

      resetTerminalPerformanceCounters()
      const indexedLookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, 2, 'after')
      expect(getTerminalSourceOffsetForCursor(prepared, indexedLookup.cursor, sourceIndex)).toBe(
        indexedLookup.sourceOffset,
      )
      const indexedLookupCounters = snapshotTerminalPerformanceCounters()
      expect(indexedLookupCounters.preparedGeometryBuilds).toBe(0)
      expect(indexedLookupCounters.preparedGeometrySegments).toBe(0)

      resetTerminalPerformanceCounters()
      let cursor = TERMINAL_START_CURSOR
      let lineCount = 0
      while (true) {
        const line = layoutNextTerminalLineRange(prepared, cursor, { columns: 7 })
        if (line === null) break
        lineCount++
        cursor = line.end
        if (lineCount === 1) {
          materializeTerminalLineRange(prepared, line)
        }
      }
      const layoutCounters = snapshotTerminalPerformanceCounters()
      expect(lineCount).toBeGreaterThan(1)
      expect(layoutCounters.preparedGeometryBuilds).toBe(0)
      expect(layoutCounters.preparedGeometryCacheHits).toBeGreaterThan(0)
      expect(layoutCounters.preparedGeometryWidthPrefixHits).toBeGreaterThan(0)

      resetTerminalPerformanceCounters()
      const flow = prepareTerminalCellFlow('prefix e\u0301 tail', { whiteSpace: 'pre-wrap' })
      const appended = appendTerminalCellFlow(flow, '\nnext line', { invalidationWindowCodeUnits: 4 })
      const appendCounters = snapshotTerminalPerformanceCounters()
      expect(appendCounters.preparedGeometryBuilds).toBe(1)
      expect(appendCounters.preparedGeometrySegments).toBeGreaterThan(0)
      expect(appended.invalidation.stablePrefixCodeUnits).toBe(
        getInternalSourceLength(getTerminalCellFlowPrepared(flow)),
      )
    } finally {
      disableTerminalPerformanceCounters()
    }
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

    expect(appended.invalidation.strategy).toMatch(/^chunked-append-/)
    expect(appended.invalidation.stablePrefixCodeUnits).toBe(getInternalSourceLength(initialPrepared))
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
      firstInvalidSourceOffset: readInternalPreparedTerminalText(before).sourceText.length,
    })
    invalidateTerminalPageCache(cache, lineInvalidation)
    const page = getTerminalLinePage(after, cache, index, { startRow: 0, rowCount: 1 })

    expect(lineInvalidation.firstInvalidRow).toBe(0)
    expect(materializedPageTexts(after, page)).toEqual(['helloworld'])
    expect(getTerminalPageCacheStats(cache).invalidatedPages).toBe(1)
  })

  test('source-offset invalidation backs up at exact row boundaries for merged graphemes', () => {
    for (const [beforeText, afterText, invalidOffset] of [
      ['1B', '1\uFE0F\u20E3B', 1],
      ['eB', 'e\u0301B', 1],
      ['👩B', '👩‍💻B', 2],
    ] as const) {
      const before = prepareTerminal(beforeText, { whiteSpace: 'pre-wrap' })
      const after = prepareTerminal(afterText, { whiteSpace: 'pre-wrap' })
      const index = createTerminalLineIndex(before, { columns: 1, anchorInterval: 1, generation: 0 })
      const cache = createTerminalPageCache(before, index, { pageSize: 1, maxPages: 2 })
      getTerminalLinePage(before, cache, index, { startRow: 0, rowCount: 1 })

      const lineInvalidation = invalidateTerminalLineIndex(after, index, {
        generation: 1,
        firstInvalidSourceOffset: invalidOffset,
      })
      invalidateTerminalPageCache(cache, lineInvalidation)
      const page = getTerminalLinePage(after, cache, index, { startRow: 0, rowCount: 1 })
      const freshIndex = createTerminalLineIndex(after, { columns: 1, anchorInterval: 1, generation: 1 })
      const freshPage = getTerminalLinePage(
        after,
        createTerminalPageCache(after, freshIndex, { pageSize: 1, maxPages: 2 }),
        freshIndex,
        { startRow: 0, rowCount: 1 },
      )

      expect(lineInvalidation.firstInvalidRow).toBe(0)
      expect(rangeSignature(after, page)).toEqual(rangeSignature(after, freshPage))
      expect(getTerminalPageCacheStats(cache).invalidatedPages).toBe(1)
    }
  })

  test('source-offset invalidation stays correct with dense anchors at structural boundaries', () => {
    for (const item of [
      {
        beforeText: 'A\nB',
        afterText: 'A\nXB',
        columns: 4,
        expectedFirstInvalidRow: 0,
        invalidOffset: 2,
        startRow: 0,
      },
      {
        beforeText: 'A\n\nB',
        afterText: 'A\n\nXB',
        columns: 4,
        expectedFirstInvalidRow: 1,
        invalidOffset: 3,
        startRow: 1,
      },
      {
        beforeText: 'alpha\u200Bbeta',
        afterText: 'alpha\u200BXYbeta',
        columns: 5,
        expectedFirstInvalidRow: 0,
        invalidOffset: 6,
        startRow: 0,
      },
      {
        beforeText: 'a\u00ADbc',
        afterText: 'a\u00ADXbc',
        columns: 2,
        expectedFirstInvalidRow: 0,
        invalidOffset: 2,
        startRow: 0,
      },
    ] as const) {
      const before = prepareTerminal(item.beforeText, { whiteSpace: 'pre-wrap' })
      const after = prepareTerminal(item.afterText, { whiteSpace: 'pre-wrap' })
      const index = createTerminalLineIndex(before, {
        columns: item.columns,
        anchorInterval: 1,
        generation: 0,
      })
      const cache = createTerminalPageCache(before, index, { pageSize: 2, maxPages: 8 })
      const rows = measureTerminalLineIndexRows(before, index)
      for (let row = 0; row < rows; row++) {
        getTerminalLinePage(before, cache, index, { startRow: row, rowCount: 1 })
      }

      const lineInvalidation = invalidateTerminalLineIndex(after, index, {
        generation: 1,
        firstInvalidSourceOffset: item.invalidOffset,
      })
      invalidateTerminalPageCache(cache, lineInvalidation)
      const page = getTerminalLinePage(after, cache, index, { startRow: item.startRow, rowCount: 2 })
      const freshIndex = createTerminalLineIndex(after, {
        columns: item.columns,
        anchorInterval: 1,
        generation: 1,
      })
      const freshPage = getTerminalLinePage(
        after,
        createTerminalPageCache(after, freshIndex, { pageSize: 2, maxPages: 8 }),
        freshIndex,
        { startRow: item.startRow, rowCount: 2 },
      )

      expect(lineInvalidation.firstInvalidRow).toBe(item.expectedFirstInvalidRow)
      expect(rangeSignature(after, page)).toEqual(rangeSignature(after, freshPage))
    }
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

function getInternalSourceLength(prepared: PreparedTerminalText): number {
  return getInternalPreparedTerminalReader(
    prepared as unknown as InternalPreparedTerminalText,
  ).sourceLength
}
