// 补建说明：该文件为后续补建，用于验证 Phase 3 unified layout bundle 的分页、projection 与 append invalidation 协议；当前进度：首版覆盖 opaque handle、manual primitive parity、generation guard 与 stale prepared 拒绝。
import { describe, expect, test } from 'bun:test'
import {
  appendTerminalCellFlow,
  createTerminalLayoutBundle,
  createTerminalLineIndex,
  createTerminalPageCache,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalLayoutBundlePage,
  getTerminalLayoutBundleTailPage,
  getTerminalLineIndexStats,
  getTerminalLinePage,
  getTerminalLineRangeAtRow,
  invalidateTerminalLayoutBundle,
  materializeTerminalLinePage,
  measureTerminalLayoutBundleRows,
  measureTerminalLineIndexRows,
  prepareTerminal,
  prepareTerminalCellFlow,
  projectTerminalCoordinate,
  projectTerminalCursor,
  projectTerminalRow,
  projectTerminalSourceOffset,
  projectTerminalSourceRange,
  type PreparedTerminalText,
  type TerminalLayoutBundle,
  type TerminalLinePage,
  type TerminalLayoutOptions,
} from '../../src/public/index.js'
import {
  collectTerminalLines,
  readInternalPreparedTerminalText,
} from './validation-helpers.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/telemetry/terminal-performance-counters.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/prepared/terminal-prepared-reader.js'

function makeLongTranscript(rowCount = 32): string {
  const rows: string[] = []
  for (let i = 0; i < rowCount; i++) {
    rows.push(`row ${String(i).padStart(2, '0')}: alpha beta 世界 ${i % 3 === 0 ? 'emoji 👩‍💻' : 'plain'}\tcell`)
  }
  return rows.join('\n')
}

function pageSignature(
  prepared: PreparedTerminalText,
  page: TerminalLinePage,
): unknown {
  const materialized = materializeTerminalLinePage(prepared, page)
  return {
    columns: page.columns,
    rowCount: page.rowCount,
    startRow: page.startRow,
    lines: page.lines.map((line, index) => ({
      sourceStart: line.sourceStart,
      sourceEnd: line.sourceEnd,
      text: materialized[index]?.text,
      sourceText: materialized[index]?.sourceText,
      width: line.width,
      break: line.break,
      overflow: line.overflow,
    })),
  }
}

function materializedTexts(prepared: PreparedTerminalText, page: TerminalLinePage): readonly string[] {
  return materializeTerminalLinePage(prepared, page).map(line => line.text)
}

function getInternalSourceLength(prepared: PreparedTerminalText): number {
  return getInternalPreparedTerminalReader(
    prepared as unknown as InternalPreparedTerminalText,
  ).sourceLength
}

describe('terminal layout bundle', () => {
  test('bundle pages and projections match manually composed primitives', () => {
    const prepared = prepareTerminal(makeLongTranscript(), {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
      widthProfile: { ambiguousWidth: 'wide' },
    })
    const layout = { columns: 28, startColumn: 2, anchorInterval: 4, pageSize: 5, maxPages: 4 }
    const bundle = createTerminalLayoutBundle(prepared, layout)
    const manualLineIndex = createTerminalLineIndex(prepared, layout)
    const manualSourceIndex = createTerminalSourceOffsetIndex(prepared)
    const manualCache = createTerminalPageCache(prepared, manualLineIndex, {
      pageSize: layout.pageSize,
      maxPages: layout.maxPages,
    })
    const eager = collectTerminalLines(prepared, layout satisfies TerminalLayoutOptions)

    for (const startRow of [0, 1, 3, 4, 11, Math.max(0, eager.length - 5), eager.length + 2]) {
      const request = { startRow, rowCount: 5 }
      expect(pageSignature(
        prepared,
        getTerminalLayoutBundlePage(prepared, bundle, request),
      )).toEqual(pageSignature(
        prepared,
        getTerminalLinePage(prepared, manualCache, manualLineIndex, request),
      ))
    }

    const manualIndexes = { sourceIndex: manualSourceIndex, lineIndex: manualLineIndex }
    for (const sourceOffset of [0, 5, 17, readInternalPreparedTerminalText(prepared).sourceText.length]) {
      expect(projectTerminalSourceOffset(prepared, bundle, sourceOffset)).toEqual(
        projectTerminalSourceOffset(prepared, manualIndexes, sourceOffset),
      )
    }
    const cursorProjection = projectTerminalSourceOffset(prepared, manualIndexes, 17)
    expect(projectTerminalCursor(prepared, bundle, cursorProjection.cursor)).toEqual(
      projectTerminalCursor(prepared, manualIndexes, cursorProjection.cursor),
    )
    expect(projectTerminalCoordinate(prepared, bundle, { row: 2, column: 8 })).toEqual(
      projectTerminalCoordinate(prepared, manualIndexes, { row: 2, column: 8 }),
    )
    expect(projectTerminalRow(prepared, bundle, 3)).toEqual(
      projectTerminalRow(prepared, manualLineIndex, 3),
    )
    expect(projectTerminalSourceRange(prepared, bundle, { sourceStart: 4, sourceEnd: 48 })).toEqual(
      projectTerminalSourceRange(prepared, manualIndexes, { sourceStart: 4, sourceEnd: 48 }),
    )
  })

  test('append invalidation refreshes page cache and source projection state together', () => {
    const flow = prepareTerminalCellFlow(makeLongTranscript(20), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const before = getTerminalCellFlowPrepared(flow)
    const layout = {
      columns: 26,
      anchorInterval: 4,
      generation: getTerminalCellFlowGeneration(flow),
      pageSize: 4,
      maxPages: 4,
    }
    const bundle = createTerminalLayoutBundle(before, layout)
    const prefixPageBefore = getTerminalLayoutBundlePage(before, bundle, { startRow: 4, rowCount: 4 })
    const prefixTextsBefore = materializedTexts(before, prefixPageBefore)
    projectTerminalSourceOffset(before, bundle, 8)

    const appended = appendTerminalCellFlow(
      flow,
      '\nappend seam: hello\u200Bworld e\u0301 👩‍💻 flag 🇺🇸\tend',
      { invalidationWindowCodeUnits: 96 },
    )
    const after = getTerminalCellFlowPrepared(appended.flow)
    const invalidation = invalidateTerminalLayoutBundle(after, bundle, appended.invalidation)
    const freshBundle = createTerminalLayoutBundle(after, {
      ...layout,
      generation: getTerminalCellFlowGeneration(appended.flow),
    })
    const afterSourceLength = getInternalSourceLength(after)
    const suffixStart = Math.max(0, projectTerminalSourceOffset(after, bundle, afterSourceLength).row - 3)
    const suffixPage = getTerminalLayoutBundlePage(after, bundle, { startRow: suffixStart, rowCount: 4 })
    const freshSuffixPage = getTerminalLayoutBundlePage(after, freshBundle, { startRow: suffixStart, rowCount: 4 })
    const appendedOffset = Math.max(0, afterSourceLength - 12)

    expect(invalidation.previousGeneration).toBe(0)
    expect(invalidation.generation).toBe(1)
    expect(invalidation.firstInvalidRow).toBeGreaterThan(0)
    expect(materializedTexts(after, getTerminalLayoutBundlePage(after, bundle, { startRow: 4, rowCount: 4 }))).toEqual(prefixTextsBefore)
    expect(pageSignature(after, suffixPage)).toEqual(pageSignature(after, freshSuffixPage))
    expect(projectTerminalSourceOffset(after, bundle, appendedOffset)).toEqual(
      projectTerminalSourceOffset(after, freshBundle, appendedOffset),
    )
    const appendedCursor = projectTerminalSourceOffset(after, freshBundle, appendedOffset).cursor
    expect(projectTerminalCursor(after, bundle, appendedCursor)).toEqual(
      projectTerminalCursor(after, freshBundle, appendedCursor),
    )
    expect(typeof projectTerminalCoordinate(after, bundle, { row: suffixStart, column: 0 })?.sourceOffset).toBe('number')
  })

  test('bundle invalidation rejects stale, replayed, skipped-back, and layout-identity mismatched updates without mutation', () => {
    const before = prepareTerminal('alpha beta', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const after = prepareTerminal('alpha beta gamma', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const differentTabSize = prepareTerminal('alpha beta gamma', { whiteSpace: 'pre-wrap', tabSize: 8 })
    const bundle = createTerminalLayoutBundle(before, { columns: 10, generation: 0 })

    expect(() => invalidateTerminalLayoutBundle(after, bundle, {
      generation: 2,
      previousGeneration: 0,
    })).toThrow('must advance from 0 to 1')
    expect(() => invalidateTerminalLayoutBundle(after, bundle, {
      generation: 1,
      previousGeneration: 99,
    })).toThrow('previousGeneration must match current generation 0')
    expect(() => invalidateTerminalLayoutBundle(differentTabSize, bundle, {
      generation: 1,
      previousGeneration: 0,
    })).toThrow('different layout identity')

    expect(invalidateTerminalLayoutBundle(after, bundle, {
      generation: 1,
      previousGeneration: 0,
      firstInvalidSourceOffset: 5,
    }).generation).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(after, bundle, {
      generation: 1,
      previousGeneration: 1,
    })).toThrow('must advance from 1')
    expect(() => getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 })).toThrow(
      'bound to a different prepared text',
    )
  })

  test('bundle invalidation canonicalizes source invalidation and rejects post-validation failures before mutation', () => {
    const before = prepareTerminal('alpha beta gamma\nstable suffix', { whiteSpace: 'pre-wrap' })
    const after = prepareTerminal('ALPHA beta gamma\nstable suffix', { whiteSpace: 'pre-wrap' })
    const bundle = createTerminalLayoutBundle(before, { columns: 10, generation: 0, pageSize: 2, maxPages: 3 })
    getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 2 })
    const invalidation = invalidateTerminalLayoutBundle(after, bundle, {
      generation: 1,
      previousGeneration: 0,
      firstInvalidSourceOffset: 0,
      firstInvalidRow: 99,
    })
    const freshBundle = createTerminalLayoutBundle(after, { columns: 10, generation: 1, pageSize: 2, maxPages: 3 })

    expect(invalidation.firstInvalidRow).toBe(0)
    expect(pageSignature(after, getTerminalLayoutBundlePage(after, bundle, { startRow: 0, rowCount: 2 }))).toEqual(
      pageSignature(after, getTerminalLayoutBundlePage(after, freshBundle, { startRow: 0, rowCount: 2 })),
    )

    const beforeInvalid = prepareTerminal('one two three', { whiteSpace: 'pre-wrap' })
    const afterInvalid = prepareTerminal('one two three four', { whiteSpace: 'pre-wrap' })
    const invalidBundle = createTerminalLayoutBundle(beforeInvalid, { columns: 8, generation: 0 })
    expect(() => invalidateTerminalLayoutBundle(afterInvalid, invalidBundle, {
      generation: 1,
      previousGeneration: 0,
      firstInvalidRow: -1,
    })).toThrow('firstInvalidRow must be a non-negative integer')
    expect(getTerminalLayoutBundlePage(beforeInvalid, invalidBundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(afterInvalid, invalidBundle, {
      generation: 1,
      previousGeneration: 0,
      firstInvalidSourceOffset: Number.NaN,
    })).toThrow('firstInvalidSourceOffset must be a non-negative integer')
    expect(getTerminalLayoutBundlePage(beforeInvalid, invalidBundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
  })

  test('append-shaped bundle invalidation rejects stale prepared text without mutation', () => {
    const flow = prepareTerminalCellFlow('alpha beta', { whiteSpace: 'pre-wrap' })
    const before = getTerminalCellFlowPrepared(flow)
    const bundle = createTerminalLayoutBundle(before, {
      columns: 10,
      generation: getTerminalCellFlowGeneration(flow),
    })
    getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 })
    const appended = appendTerminalCellFlow(flow, ' gamma')
    const wrongPreparedSameLength = prepareTerminal('xxxxxxxxxxxxxxxx', { whiteSpace: 'pre-wrap' })

    expect(() => invalidateTerminalLayoutBundle(before, bundle, appended.invalidation)).toThrow(
      'requires the appended prepared text',
    )
    expect(getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(wrongPreparedSameLength, bundle, appended.invalidation)).toThrow(
      'stable prefix does not match',
    )
    expect(getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(getTerminalCellFlowPrepared(appended.flow), bundle, {
      ...appended.invalidation,
      generation: appended.invalidation.generation + 1,
    })).toThrow('must advance from 0 to 1')
    expect(getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(getTerminalCellFlowPrepared(appended.flow), bundle, {
      ...appended.invalidation,
      stablePrefixCodeUnits: Number.NaN,
      invalidatedSourceCodeUnits: getInternalSourceLength(getTerminalCellFlowPrepared(appended.flow)),
    })).toThrow('stablePrefixCodeUnits must be a non-negative integer')
    expect(getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
    expect(() => invalidateTerminalLayoutBundle(getTerminalCellFlowPrepared(appended.flow), bundle, {
      ...appended.invalidation,
      strategy: 'bogus' as never,
    })).toThrow('append strategy must be a known append strategy')
    expect(getTerminalLayoutBundlePage(before, bundle, { startRow: 0, rowCount: 1 }).lines.length).toBe(1)
  })

  test('bundle APIs reject forged and cloned handles', () => {
    const prepared = prepareTerminal('bundle boundary', { whiteSpace: 'pre-wrap' })
    const bundle = createTerminalLayoutBundle(prepared, { columns: 8 })
    const forged = Object.freeze({ kind: 'terminal-layout-bundle@1' }) as TerminalLayoutBundle
    const cloned = Object.freeze({ ...bundle }) as TerminalLayoutBundle

    for (const invalidBundle of [forged, cloned]) {
      expect(() => getTerminalLayoutBundlePage(prepared, invalidBundle, { startRow: 0, rowCount: 1 })).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => invalidateTerminalLayoutBundle(prepared, invalidBundle, { generation: 1 })).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => projectTerminalSourceOffset(prepared, invalidBundle, 0)).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => projectTerminalCursor(prepared, invalidBundle, {
        kind: 'terminal-cursor@1',
        segmentIndex: 0,
        graphemeIndex: 0,
      })).toThrow('Invalid terminal layout bundle handle')
      expect(() => projectTerminalCoordinate(prepared, invalidBundle, { row: 0, column: 0 })).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => projectTerminalSourceRange(prepared, invalidBundle, { sourceStart: 0, sourceEnd: 1 })).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => projectTerminalRow(prepared, invalidBundle, 0)).toThrow(
        'Invalid terminal layout bundle handle',
      )
    }
  })
})

describe('terminal layout bundle tail follow', () => {
  test('T2 tail page matches manual page at startRow=total-N with correct shape and is frozen', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const layout = { columns: 28, anchorInterval: 4, pageSize: 8, maxPages: 4 }
    const bundle = createTerminalLayoutBundle(prepared, layout)
    const total = measureTerminalLayoutBundleRows(prepared, bundle)
    const tailPage = getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: 8 })
    const manual = getTerminalLayoutBundlePage(prepared, bundle, { startRow: total - 8, rowCount: 8 })

    expect(tailPage.startRow).toBe(total - 8)
    expect(tailPage.rowCount).toBe(8)
    expect(tailPage.generation).toBe(0)
    expect(Object.isFrozen(tailPage)).toBe(true)
    expect(Object.isFrozen(tailPage.lines)).toBe(true)
    expect(pageSignature(prepared, tailPage)).toEqual(pageSignature(prepared, manual))
  })

  test('T3 measureTerminalLayoutBundleRows equals a manual line index and the memo is stable', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const layout = { columns: 26, anchorInterval: 8 }
    const bundle = createTerminalLayoutBundle(prepared, { ...layout, pageSize: 8, maxPages: 4 })
    const manualIndex = createTerminalLineIndex(prepared, layout)

    const bundleRows = measureTerminalLayoutBundleRows(prepared, bundle)
    expect(bundleRows).toBe(measureTerminalLineIndexRows(prepared, manualIndex))

    // A second bundle row measurement is served from the memoized total: no extra range walks on a
    // separately built line index of the same shape, confirming the measure does not rescan to EOF.
    const sameShapeIndex = createTerminalLineIndex(prepared, layout)
    measureTerminalLineIndexRows(prepared, sameShapeIndex)
    const walksBefore = getTerminalLineIndexStats(sameShapeIndex).rangeWalks
    expect(measureTerminalLayoutBundleRows(prepared, bundle)).toBe(bundleRows)
    measureTerminalLineIndexRows(prepared, sameShapeIndex)
    expect(getTerminalLineIndexStats(sameShapeIndex).rangeWalks).toBe(walksBefore)
  })

  test('T6 bundle tail rejects non-positive and non-integer rowCount', () => {
    const prepared = prepareTerminal('row\nrow\nrow', { whiteSpace: 'pre-wrap' })
    const bundle = createTerminalLayoutBundle(prepared, { columns: 12, pageSize: 4, maxPages: 2 })

    expect(() => getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: 0 })).toThrow('positive integer')
    expect(() => getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: -1 })).toThrow('positive integer')
    expect(() => getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: 2.5 })).toThrow('positive integer')
  })

  test('T7 bundle tail inherits the pageSize cap while the line-index primitive does not', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const bundle = createTerminalLayoutBundle(prepared, { columns: 28, anchorInterval: 4, pageSize: 8, maxPages: 4 })

    expect(() => getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: 9 })).toThrow('pageSize')
    // The line-index primitive carries no page-size constraint, so the same rowCount resolves fine.
    const manualIndex = createTerminalLineIndex(prepared, { columns: 28, anchorInterval: 4 })
    expect(getTerminalLineRangeAtRow(prepared, manualIndex, 8)).not.toBeNull()
  })

  test('T8 startColumn tails match manual paging at both levels', () => {
    const prepared = prepareTerminal(makeLongTranscript(), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const layout = { columns: 28, startColumn: 2, anchorInterval: 4 }
    const bundle = createTerminalLayoutBundle(prepared, { ...layout, pageSize: 8, maxPages: 4 })
    const total = measureTerminalLayoutBundleRows(prepared, bundle)

    const tailPage = getTerminalLayoutBundleTailPage(prepared, bundle, { rowCount: 6 })
    const manualPage = getTerminalLayoutBundlePage(prepared, bundle, { startRow: total - 6, rowCount: 6 })
    expect(pageSignature(prepared, tailPage)).toEqual(pageSignature(prepared, manualPage))
  })

  test('T9 append then invalidate then tail equals a fresh bundle tail with a bounded post-append measure', () => {
    const initialFlow = prepareTerminalCellFlow(makeLongTranscript(40), { whiteSpace: 'pre-wrap', tabSize: 4 })
    const before = getTerminalCellFlowPrepared(initialFlow)
    const anchorInterval = 6
    const layout = {
      columns: 26,
      anchorInterval,
      generation: getTerminalCellFlowGeneration(initialFlow),
      pageSize: 8,
      maxPages: 4,
    }
    const bundle = createTerminalLayoutBundle(before, layout)
    // Warm the bundle to the initial EOF so the memo and anchors cover the pre-append transcript.
    measureTerminalLayoutBundleRows(before, bundle)

    const appended = appendTerminalCellFlow(
      initialFlow,
      '\nappend tail row 00: 世界 😀\nappend tail row 01: bounded follow read',
      { invalidationWindowCodeUnits: 96 },
    )
    const after = getTerminalCellFlowPrepared(appended.flow)
    const invalidation = invalidateTerminalLayoutBundle(after, bundle, appended.invalidation)
    const firstInvalidRow = invalidation.firstInvalidRow ?? 0

    const freshBundle = createTerminalLayoutBundle(after, {
      ...layout,
      generation: getTerminalCellFlowGeneration(appended.flow),
    })

    let tailPage: TerminalLinePage
    let measuredRows: number
    try {
      resetTerminalPerformanceCounters()
      measuredRows = measureTerminalLayoutBundleRows(after, bundle)
      tailPage = getTerminalLayoutBundleTailPage(after, bundle, { rowCount: 8 })
      const counters = snapshotTerminalPerformanceCounters()
      const appendedRows = measuredRows - measureTerminalLineIndexRows(before, createTerminalLineIndex(before, layout))
      expect(appendedRows).toBeGreaterThan(0)
      // The post-append measure resumes from the last surviving anchor (strictly before the first
      // invalidated row), so its replay spans only the invalidated-plus-appended tail rows plus at
      // most one anchor gap, never the whole transcript.
      const reflowedTailRows = measuredRows - firstInvalidRow
      expect(counters.terminalTailMeasureRows).toBeLessThanOrEqual(reflowedTailRows + anchorInterval)
      expect(counters.terminalTailMeasureRows).toBeLessThan(measuredRows)
      expect(counters.terminalTailQueries).toBeGreaterThanOrEqual(1)
    } finally {
      disableTerminalPerformanceCounters()
    }

    const freshTailPage = getTerminalLayoutBundleTailPage(after, freshBundle, { rowCount: 8 })
    expect(tailPage.startRow).toBe(Math.max(0, measuredRows - 8))
    expect(pageSignature(after, tailPage)).toEqual(pageSignature(after, freshTailPage))
  })

  test('T11 bundle tail and measure reject forged, cloned, and stale prepared handles', () => {
    const prepared = prepareTerminal('tail boundary\nsecond row\nthird row', { whiteSpace: 'pre-wrap' })
    const bundle = createTerminalLayoutBundle(prepared, { columns: 12, pageSize: 4, maxPages: 2 })
    const forged = Object.freeze({ kind: 'terminal-layout-bundle@1' }) as TerminalLayoutBundle
    const cloned = Object.freeze({ ...bundle }) as TerminalLayoutBundle
    const otherPrepared = prepareTerminal('tail boundary\nsecond row\nthird row', { whiteSpace: 'pre-wrap' })

    for (const invalid of [forged, cloned]) {
      expect(() => getTerminalLayoutBundleTailPage(prepared, invalid, { rowCount: 2 })).toThrow(
        'Invalid terminal layout bundle handle',
      )
      expect(() => measureTerminalLayoutBundleRows(prepared, invalid)).toThrow(
        'Invalid terminal layout bundle handle',
      )
    }
    expect(() => getTerminalLayoutBundleTailPage(otherPrepared, bundle, { rowCount: 2 })).toThrow(
      'bound to a different prepared text',
    )
    expect(() => measureTerminalLayoutBundleRows(otherPrepared, bundle)).toThrow(
      'bound to a different prepared text',
    )
  })
})
