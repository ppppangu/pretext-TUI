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
  getTerminalLinePage,
  invalidateTerminalLayoutBundle,
  materializeTerminalLinePage,
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
} from '../../src/index.js'
import {
  collectTerminalLines,
  readInternalPreparedTerminalText,
} from './validation-helpers.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/terminal-prepared-reader.js'

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
