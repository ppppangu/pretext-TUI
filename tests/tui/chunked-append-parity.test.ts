// 补建说明：该文件为后续补建，用于验证 Phase 8 true chunked append storage 与 full prepare oracle 的逐步等价；当前进度：首版覆盖 1000 small appends、seam parity 与 bundle/page invalidation。
import { describe, expect, test } from 'bun:test'
import {
  appendTerminalCellFlow,
  createInjectedTerminalWidthProfile,
  createTerminalLayoutBundle,
  createTerminalLineIndex,
  createTerminalPageCache,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalCursorForSourceOffset,
  getTerminalLayoutBundlePage,
  getTerminalLinePage,
  getTerminalSourceOffsetForCursor,
  invalidateTerminalLayoutBundle,
  invalidateTerminalLineIndex,
  invalidateTerminalPageCache,
  layoutTerminal,
  materializeTerminalLinePage,
  materializeTerminalLineRange,
  measureTerminalLineStats,
  prepareTerminal,
  prepareTerminalCellFlow,
  projectTerminalSourceOffset,
  walkTerminalLineRanges,
  type PreparedTerminalText,
  type TerminalLayoutOptions,
  type TerminalPrepareOptions,
} from '../../src/public/index.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/prepared/terminal-prepared-reader.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/telemetry/terminal-performance-counters.js'
import { serializeLineRanges } from './validation-helpers.js'

type AppendParityCase = {
  appends: readonly string[]
  id: string
  initial: string
  layout: TerminalLayoutOptions
  prepare?: TerminalPrepareOptions
}

describe('chunked append parity', () => {
  test('append store-copy cost is length-independent (O(window), not the O(N^2) rebuild)', () => {
    const prepare = { whiteSpace: 'pre-wrap' as const }
    const line = `${'x'.repeat(30)}\n`
    const maxCopiesPerAppend = (appendCount: number): number => {
      let flow = prepareTerminalCellFlow('', prepare)
      let max = 0
      for (let i = 0; i < appendCount; i++) {
        resetTerminalPerformanceCounters()
        flow = appendTerminalCellFlow(flow, line).flow
        max = Math.max(max, snapshotTerminalPerformanceCounters().terminalReaderStoreCopiedSegments)
      }
      disableTerminalPerformanceCounters()
      return max
    }
    // Store-copy work per append must be bounded by the seal window, NOT the stream length.
    // Under the old rebuild-all-chunks path this grew ~linearly with N (~600 copied segments
    // by 50 appends, ~2400 by 200); the immutable-append store keeps it flat, so quadrupling
    // the stream does not grow the worst per-append copy.
    const max250 = maxCopiesPerAppend(250)
    const max1000 = maxCopiesPerAppend(1000)
    expect(max1000).toBeLessThanOrEqual(max250 + 50)
    expect(max1000).toBeLessThan(600)
  })

  test('append ≡ reprepare holds under an injected width profile (§8.3 — width × cell-flow)', () => {
    // The 1000-append test above uses the default profile; the host always injects a width
    // profile, so re-pin the bisimulation under a non-trivial injected width (the chosen soft
    // hyphen materializes at 3 cells — the ⚠-class where a layout↔append width bug would hide).
    const wideHyphen = createInjectedTerminalWidthProfile({
      id: 'f3/append-wide-hyphen@1',
      graphemeWidth: g => (g === '-' ? 3 : 1),
    })
    const prepare = { whiteSpace: 'pre-wrap', tabSize: 4, widthProfile: wideHyphen } satisfies TerminalPrepareOptions
    const parts = ['trans\u00AD', 'atlantic ', 'soft\u00ADbreak ', '界界 ', 'a\tb ', 'more text wraps ', 'tail\n', 'next line ', 'final\u00ADword']
    let flow = prepareTerminalCellFlow('', prepare)
    let raw = ''
    for (const part of parts) {
      flow = appendTerminalCellFlow(flow, part, { invalidationWindowCodeUnits: 16 }).flow
      raw += part
      for (const columns of [6, 13, 40]) {
        // append-path layout (open-tail reprepared each append) must equal a from-scratch prepare,
        // both under the injected width — the same OracleLine[] shape the greedy oracle uses.
        expect(serializeLineRanges(getTerminalCellFlowPrepared(flow), { columns }))
          .toEqual(serializeLineRanges(prepareTerminal(raw, prepare), { columns }))
      }
    }
  })

  test('1000 small appends match full prepare without full accumulated reprepare per append', () => {
    const prepare = { whiteSpace: 'pre-wrap', tabSize: 4 } satisfies TerminalPrepareOptions
    const layout = { columns: 17 } satisfies TerminalLayoutOptions
    const parts = [
      'row ',
      'alpha ',
      '界',
      '\t',
      'e',
      '\u0301',
      ' ',
      '👩',
      '\u200D',
      '💻',
      ' ',
      '🇺',
      '🇸',
      ' soft\u00AD',
      'zero\u200B',
      'tail\n',
    ] as const
    let raw = ''
    let flow = prepareTerminalCellFlow(raw, prepare)
    let maxReprepareSourceCodeUnits = 0
    let totalReprepareSourceCodeUnits = 0

    for (let index = 0; index < 1000; index++) {
      const appended = appendTerminalCellFlow(flow, parts[index % parts.length]!, {
        invalidationWindowCodeUnits: 96,
      })
      raw += parts[index % parts.length]!
      flow = appended.flow
      maxReprepareSourceCodeUnits = Math.max(
        maxReprepareSourceCodeUnits,
        appended.invalidation.reprepareSourceCodeUnits,
      )
      totalReprepareSourceCodeUnits += appended.invalidation.reprepareSourceCodeUnits
      expect(appended.invalidation.strategy).toMatch(/^chunked-append-/)
      const chunkedPrepared = getTerminalCellFlowPrepared(flow)
      const fullPrepared = prepareTerminal(raw, prepare)
      expect(appendParitySignature(chunkedPrepared, layout)).toEqual(
        appendParitySignature(fullPrepared, layout),
      )
      if (index % 50 === 0 || index === 999) {
        expect(appendProjectionPageSignature(chunkedPrepared, layout)).toEqual(
          appendProjectionPageSignature(fullPrepared, layout),
        )
      }
    }

    const finalSourceLength = sourceLength(getTerminalCellFlowPrepared(flow))
    expect(maxReprepareSourceCodeUnits).toBeLessThan(finalSourceLength)
    expect(maxReprepareSourceCodeUnits).toBeLessThanOrEqual(640)
    expect(totalReprepareSourceCodeUnits).toBeLessThan(finalSourceLength * 160)
  }, 60000)

  test.each<AppendParityCase>([
    {
      id: 'CRLF split',
      initial: 'alpha\r',
      appends: ['\nbeta', '\r', '\ngamma'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 8 },
    },
    {
      id: 'normal whitespace collapse',
      initial: '  hello',
      appends: ['   ', 'world  ', ' again'],
      prepare: { whiteSpace: 'normal' },
      layout: { columns: 6 },
    },
    {
      id: 'tab seam',
      initial: 'A\t',
      appends: ['B\tC'],
      prepare: { whiteSpace: 'pre-wrap', tabSize: 4 },
      layout: { columns: 5, startColumn: 1 },
    },
    {
      id: 'soft hyphen and zero width break',
      initial: 'trans\u00AD',
      appends: ['atlantic hello\u200B', 'world'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 5 },
    },
    {
      id: 'WJ NBSP glue',
      initial: 'a\u2060',
      appends: ['b\u00A0', 'c\u202Fd'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 3 },
    },
    {
      id: 'combining mark split',
      initial: 'e',
      appends: ['\u0301 tail'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 4 },
    },
    {
      id: 'ZWJ emoji split',
      initial: '👩',
      appends: ['\u200D', '💻 ok'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 3 },
    },
    {
      id: 'regional flag split',
      initial: '🇺',
      appends: ['🇸 ok'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 3 },
    },
    {
      id: 'CJK punctuation',
      initial: '世界',
      appends: ['，', '你好'],
      prepare: { whiteSpace: 'pre-wrap', wordBreak: 'keep-all' },
      layout: { columns: 4 },
    },
    {
      id: 'URL and numeric merging',
      initial: 'https://exa',
      appends: ['mple.test?q=1', '23 2026-', '04-27'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 9 },
    },
    {
      id: 'consecutive and final LF',
      initial: 'a\n',
      appends: ['\n', 'b\n'],
      prepare: { whiteSpace: 'pre-wrap' },
      layout: { columns: 4 },
    },
  ])('seam parity: $id', item => {
    let raw = item.initial
    let flow = prepareTerminalCellFlow(raw, item.prepare)
    expect(appendParitySignature(getTerminalCellFlowPrepared(flow), item.layout)).toEqual(
      appendParitySignature(prepareTerminal(raw, item.prepare), item.layout),
    )
    for (const part of item.appends) {
      const appended = appendTerminalCellFlow(flow, part, { invalidationWindowCodeUnits: 16 })
      raw += part
      flow = appended.flow
      expect(appended.invalidation.strategy).toMatch(/^chunked-append-/)
      expect(appendParitySignature(getTerminalCellFlowPrepared(flow), item.layout)).toEqual(
        appendParitySignature(prepareTerminal(raw, item.prepare), item.layout),
      )
    }
  })

  test('chunked append invalidation refreshes suffix pages while preserving a stable prefix page', () => {
    const initial = Array.from({ length: 40 }, (_, index) => (
      `row ${String(index).padStart(2, '0')}: alpha beta 世界 ${index % 2 === 0 ? 'emoji 👩‍💻' : 'plain'}\tcell`
    )).join('\n')
    const prepare = { whiteSpace: 'pre-wrap', tabSize: 4 } satisfies TerminalPrepareOptions
    const layout = { columns: 28, anchorInterval: 4, generation: 0, pageSize: 4, maxPages: 4 }
    const flow = prepareTerminalCellFlow(initial, prepare)
    const before = getTerminalCellFlowPrepared(flow)
    const lineIndex = createTerminalLineIndex(before, layout)
    const pageCache = createTerminalPageCache(before, lineIndex, { pageSize: 4, maxPages: 4 })
    const bundle = createTerminalLayoutBundle(before, layout)
    const prefixBefore = getTerminalLinePage(before, pageCache, lineIndex, { startRow: 4, rowCount: 4 })
    const bundlePrefixBefore = getTerminalLayoutBundlePage(before, bundle, { startRow: 4, rowCount: 4 })

    const appended = appendTerminalCellFlow(flow, '\nappend row: alpha 世界 e\u0301 👩‍💻\tend', {
      invalidationWindowCodeUnits: 96,
    })
    const after = getTerminalCellFlowPrepared(appended.flow)
    const lineInvalidation = invalidateTerminalLineIndex(after, lineIndex, appended.invalidation)
    invalidateTerminalPageCache(pageCache, lineInvalidation)
    invalidateTerminalLayoutBundle(after, bundle, appended.invalidation)

    const fresh = prepareTerminal(`${initial}\nappend row: alpha 世界 e\u0301 👩‍💻\tend`, prepare)
    const freshIndex = createTerminalLineIndex(fresh, {
      ...layout,
      generation: getTerminalCellFlowGeneration(appended.flow),
    })
    const freshCache = createTerminalPageCache(fresh, freshIndex, { pageSize: 4, maxPages: 4 })
    const suffixStart = Math.max(0, layoutTerminal(after, layout).rows - 4)

    expect(materializeTerminalLinePage(after, getTerminalLinePage(after, pageCache, lineIndex, {
      startRow: 4,
      rowCount: 4,
    }))).toEqual(materializeTerminalLinePage(before, prefixBefore))
    expect(materializeTerminalLinePage(after, getTerminalLayoutBundlePage(after, bundle, {
      startRow: 4,
      rowCount: 4,
    }))).toEqual(materializeTerminalLinePage(before, bundlePrefixBefore))
    expect(pageTexts(after, getTerminalLinePage(after, pageCache, lineIndex, {
      startRow: suffixStart,
      rowCount: 4,
    }))).toEqual(pageTexts(fresh, getTerminalLinePage(fresh, freshCache, freshIndex, {
      startRow: suffixStart,
      rowCount: 4,
    })))
    expect(projectTerminalSourceOffset(after, bundle, sourceLength(after))).toEqual(
      projectTerminalSourceOffset(fresh, createTerminalLayoutBundle(fresh, {
        ...layout,
        generation: getTerminalCellFlowGeneration(appended.flow),
      }), sourceLength(fresh)),
    )
  })
})

function appendParitySignature(
  prepared: PreparedTerminalText,
  layout: TerminalLayoutOptions,
): unknown {
  const lines: ReturnType<typeof materializeTerminalLineRange>[] = []
  walkTerminalLineRanges(prepared, layout, line => {
    lines.push(materializeTerminalLineRange(prepared, line))
  })
  const sourceIndex = createTerminalSourceOffsetIndex(prepared)
  const length = sourceLength(prepared)
  const offsets = uniqueNumbers([0, 1, Math.floor(length / 2), Math.max(0, length - 1), length])

  return {
    layout: layoutTerminal(prepared, layout),
    stats: measureTerminalLineStats(prepared, layout),
    lines: lines.map(line => ({
      break: line.break,
      end: line.end,
      overflow: line.overflow,
      sourceEnd: line.sourceEnd,
      sourceStart: line.sourceStart,
      sourceText: line.sourceText,
      start: line.start,
      text: line.text,
      width: line.width,
    })),
    lookups: offsets.map(sourceOffset => {
      const lookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, sourceOffset, 'closest')
      return {
        cursor: lookup.cursor,
        exact: lookup.exact,
        requestedSourceOffset: lookup.requestedSourceOffset,
        roundTrip: getTerminalSourceOffsetForCursor(prepared, lookup.cursor, sourceIndex),
        sourceOffset: lookup.sourceOffset,
      }
    }),
  }
}

function appendProjectionPageSignature(
  prepared: PreparedTerminalText,
  layout: TerminalLayoutOptions,
): unknown {
  const bundle = createTerminalLayoutBundle(prepared, {
    ...layout,
    anchorInterval: 3,
    pageSize: 3,
    maxPages: 2,
  })
  const rows = layoutTerminal(prepared, layout).rows
  const length = sourceLength(prepared)
  const page = getTerminalLayoutBundlePage(prepared, bundle, {
    startRow: Math.max(0, rows - 3),
    rowCount: 3,
  })
  return {
    eofProjection: projectTerminalSourceOffset(prepared, bundle, length),
    midProjection: projectTerminalSourceOffset(prepared, bundle, Math.floor(length / 2)),
    page: pageTexts(prepared, page),
  }
}

function pageTexts(prepared: PreparedTerminalText, page: Parameters<typeof materializeTerminalLinePage>[1]): readonly string[] {
  return materializeTerminalLinePage(prepared, page).map(line => line.text)
}

function sourceLength(prepared: PreparedTerminalText): number {
  return getInternalPreparedTerminalReader(
    prepared as unknown as InternalPreparedTerminalText,
  ).sourceLength
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}
