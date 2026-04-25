// 补建说明：该文件为后续补建，用于验证 Batch 6 preflight 的 single-store reader-backed prepared 与既有 array-backed prepared 在 runtime API 上签名级等价；当前进度：覆盖 layout/materialization/index/page/projection/append parity，尚不声明 true chunked append。
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
  layoutTerminal,
  materializeTerminalLinePage,
  materializeTerminalLineRange,
  materializeTerminalLineRanges,
  measureTerminalLineIndexRows,
  measureTerminalLineStats,
  prepareTerminal,
  prepareTerminalCellFlow,
  projectTerminalCursor,
  projectTerminalRow,
  projectTerminalSourceOffset,
  TERMINAL_START_CURSOR,
  walkTerminalLineRanges,
  type PreparedTerminalText,
  type TerminalCursor,
  type TerminalLayoutOptions,
  type TerminalLinePage,
  type TerminalLineRange,
  type TerminalPrepareOptions,
  type TerminalSourceOffsetBias,
} from '../../src/index.js'
import {
  getTerminalLineRangesAtRows,
} from '../../src/terminal-line-index.js'
import {
  createSingleStorePreparedTerminalText,
  createPreparedTerminalTextFromReader,
  getInternalPreparedTerminalReader,
  getInternalPreparedTerminalText,
  getInternalPreparedTerminalTextDebugSnapshot,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/terminal-prepared-reader.js'
import {
  createPreparedTerminalReaderFromStore,
  createSingleStorePreparedTerminalReaderStore,
} from '../../src/terminal-reader-store.js'

type ParityCase = {
  id: string
  layout: TerminalLayoutOptions
  prepare?: TerminalPrepareOptions
  text: string
}

const biases: readonly TerminalSourceOffsetBias[] = ['before', 'closest', 'after']

const parityCases: readonly ParityCase[] = [
  {
    id: 'empty',
    text: '',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 4 },
  },
  {
    id: 'final hard break',
    text: 'a\n',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 4 },
  },
  {
    id: 'mixed hard breaks',
    text: 'a\r\nb\rc\fd\n\n',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 5 },
  },
  {
    id: 'normal whitespace',
    text: '  hello   world  ',
    prepare: { whiteSpace: 'normal' },
    layout: { columns: 6 },
  },
  {
    id: 'tab start column',
    text: 'A\tB\tC\t',
    prepare: { whiteSpace: 'pre-wrap', tabSize: 4 },
    layout: { columns: 5, startColumn: 1 },
  },
  {
    id: 'soft hyphen cluster',
    text: 'B\u00AD\u00ADB a\u00AD-b trans\u00ADatlantic',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 2 },
  },
  {
    id: 'zero width and glue',
    text: 'a\u200Bb\u2060c\uFEFFd',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 3 },
  },
  {
    id: 'grapheme clusters',
    text: 'e\u0301 😀 👩‍💻 1\uFE0F\u20E3 🇺🇸',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 8 },
  },
  {
    id: 'cjk ambiguous wide',
    text: '世界「hello」ΩΩ',
    prepare: {
      whiteSpace: 'pre-wrap',
      wordBreak: 'keep-all',
      widthProfile: { ambiguousWidth: 'wide' },
    },
    layout: { columns: 8 },
  },
  {
    id: 'overwide grapheme',
    text: '界界',
    prepare: { whiteSpace: 'pre-wrap' },
    layout: { columns: 1 },
  },
]

describe('single-store reader parity', () => {
  test.each([...parityCases])('reader-backed store matches array-backed runtime signature: $id', item => {
    const arrayPrepared = prepareTerminal(item.text, item.prepare)
    const readerBacked = createSingleStorePreparedForParity(arrayPrepared)

    expect(() => getInternalPreparedTerminalText(readerBacked as unknown as InternalPreparedTerminalText)).toThrow(
      'reader-backed',
    )
    expect(runtimeSignature(readerBacked, item.layout)).toEqual(runtimeSignature(arrayPrepared, item.layout))
  })

  test('cell flow exposes reader-backed prepared while append remains full reprepare', () => {
    const sequences = [
      {
        initial: 'alpha beta',
        appends: [' gamma', '\nnext line', '\tcell'],
        prepare: { whiteSpace: 'pre-wrap', tabSize: 4 } satisfies TerminalPrepareOptions,
        layout: { columns: 9 } satisfies TerminalLayoutOptions,
        invalidationSize: 6,
      },
      {
        initial: 'soft\u00AD',
        appends: ['hyphen', '\u200Btail', '\n'],
        prepare: { whiteSpace: 'pre-wrap' } satisfies TerminalPrepareOptions,
        layout: { columns: 4 } satisfies TerminalLayoutOptions,
        invalidationSize: 2,
      },
      {
        initial: 'hello\r',
        appends: ['\nworld', '  again', ' e\u0301'],
        prepare: { whiteSpace: 'normal' } satisfies TerminalPrepareOptions,
        layout: { columns: 7 } satisfies TerminalLayoutOptions,
        invalidationSize: 1,
      },
    ] as const

    for (const sequence of sequences) {
      let raw = sequence.initial
      let flow = prepareTerminalCellFlow(raw, sequence.prepare)
      let flowPrepared = getTerminalCellFlowPrepared(flow)
      expect(() => getInternalPreparedTerminalText(flowPrepared as unknown as InternalPreparedTerminalText)).toThrow(
        'reader-backed',
      )
      expect(runtimeSignature(flowPrepared, sequence.layout)).toEqual(
        runtimeSignature(prepareTerminal(raw, sequence.prepare), sequence.layout),
      )

      for (const appendedText of sequence.appends) {
        const previousFlow = flow
        const previousPrepared = flowPrepared
        const previousGeneration = getTerminalCellFlowGeneration(previousFlow)
        const lineIndex = createTerminalLineIndex(previousPrepared, {
          ...sequence.layout,
          anchorInterval: 2,
          generation: previousGeneration,
        })
        const cache = createTerminalPageCache(previousPrepared, lineIndex, { pageSize: 2, maxPages: 4 })
        getTerminalLinePage(previousPrepared, cache, lineIndex, { startRow: 0, rowCount: 2 })

        const appended = appendTerminalCellFlow(previousFlow, appendedText, {
          invalidationWindowCodeUnits: sequence.invalidationSize,
        })
        raw += appendedText
        flow = appended.flow
        flowPrepared = getTerminalCellFlowPrepared(flow)
        const freshPrepared = prepareTerminal(raw, sequence.prepare)

        expect(getTerminalCellFlowGeneration(flow)).toBe(previousGeneration + 1)
        expect(appended.invalidation.reprepareSourceCodeUnits).toBe(
          getInternalPreparedTerminalReader(flowPrepared as unknown as InternalPreparedTerminalText).sourceLength,
        )
        expect(appended.invalidation.strategy).toMatch(/^full-reprepare-/)
        expect(() => getInternalPreparedTerminalText(flowPrepared as unknown as InternalPreparedTerminalText)).toThrow(
          'reader-backed',
        )
        expect(runtimeSignature(flowPrepared, sequence.layout)).toEqual(
          runtimeSignature(freshPrepared, sequence.layout),
        )

        const lineInvalidation = invalidateTerminalLineIndex(flowPrepared, lineIndex, appended.invalidation)
        invalidateTerminalPageCache(cache, lineInvalidation)
        const invalidatedPage = getTerminalLinePage(flowPrepared, cache, lineIndex, { startRow: 0, rowCount: 2 })
        const freshIndex = createTerminalLineIndex(freshPrepared, {
          ...sequence.layout,
          anchorInterval: 2,
          generation: getTerminalCellFlowGeneration(flow),
        })
        const freshPage = getTerminalLinePage(
          freshPrepared,
          createTerminalPageCache(freshPrepared, freshIndex, { pageSize: 2, maxPages: 4 }),
          freshIndex,
          { startRow: 0, rowCount: 2 },
        )
        expect(pageSignature(flowPrepared, invalidatedPage)).toEqual(pageSignature(freshPrepared, freshPage))
      }
    }
  })

  test('append prepare options snapshot protects width profile identity', () => {
    const widthProfile = { ambiguousWidth: 'narrow' as const }
    const flow = prepareTerminalCellFlow('ΩΩ', { whiteSpace: 'pre-wrap', widthProfile })
    ;(widthProfile as unknown as { ambiguousWidth: 'wide' }).ambiguousWidth = 'wide'

    const appended = appendTerminalCellFlow(flow, 'Ω')
    const prepared = getTerminalCellFlowPrepared(appended.flow)

    expect(measureTerminalLineStats(prepared, { columns: 100 }).maxLineWidth).toBe(3)
    expect(appended.invalidation.reprepareSourceCodeUnits).toBe(3)
  })

  test('provider-backed single-store debug snapshots are copied compatibility data', () => {
    const arrayPrepared = prepareTerminal('A\t界\nsoft\u00ADhyphen', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
      widthProfile: { ambiguousWidth: 'wide' },
    })
    const singleStore = createSingleStorePreparedTerminalText(
      arrayPrepared as unknown as InternalPreparedTerminalText,
    )

    const sourceSnapshot = getInternalPreparedTerminalTextDebugSnapshot(
      arrayPrepared as unknown as InternalPreparedTerminalText,
    )
    const firstSnapshot = getInternalPreparedTerminalTextDebugSnapshot(singleStore)
    ;(firstSnapshot.segments as string[])[0] = 'mutated'
    ;(firstSnapshot.sourceStarts as number[])[0] = 999
    const secondSnapshot = getInternalPreparedTerminalTextDebugSnapshot(singleStore)

    expect(firstSnapshot).not.toEqual(secondSnapshot)
    expect(secondSnapshot).toEqual(sourceSnapshot)
    expect(runtimeSignature(singleStore as unknown as PreparedTerminalText, { columns: 6 })).toEqual(
      runtimeSignature(arrayPrepared, { columns: 6 }),
    )
  })

  test('small append stress stays runtime-equal to fresh full prepare without chunked claims', () => {
    let flow = prepareTerminalCellFlow('', { whiteSpace: 'pre-wrap', tabSize: 4 })
    let raw = ''
    const parts = ['a', ' ', '界', '\t', 'e\u0301', '\u200B', 'b', '\n']
    for (let i = 0; i < 160; i++) {
      const part = parts[i % parts.length]!
      const appended = appendTerminalCellFlow(flow, part, { invalidationWindowCodeUnits: 8 })
      raw += part
      flow = appended.flow
      const prepared = getTerminalCellFlowPrepared(flow)

      expect(appended.invalidation.strategy).toMatch(/^full-reprepare-/)
      expect(appended.invalidation.reprepareSourceCodeUnits).toBe(
        getInternalPreparedTerminalReader(prepared as unknown as InternalPreparedTerminalText).sourceLength,
      )
      expect(coreLayoutSignature(prepared, { columns: 13 })).toEqual(
        coreLayoutSignature(prepareTerminal(raw, { whiteSpace: 'pre-wrap', tabSize: 4 }), { columns: 13 }),
      )
    }
  })
})

function createSingleStorePreparedForParity(prepared: PreparedTerminalText): PreparedTerminalText {
  const store = createSingleStorePreparedTerminalReaderStore(
    getInternalPreparedTerminalReader(prepared as unknown as InternalPreparedTerminalText),
  )
  expect(Object.isFrozen(store)).toBe(true)
  expect(Object.isFrozen(store.chunks)).toBe(true)
  expect(store.chunks.length).toBe(1)
  const reader = createPreparedTerminalReaderFromStore(store)
  return createPreparedTerminalTextFromReader(reader) as unknown as PreparedTerminalText
}

function runtimeSignature(prepared: PreparedTerminalText, layout: TerminalLayoutOptions): unknown {
  return {
    core: coreLayoutSignature(prepared, layout),
    virtual: virtualPrimitiveSignature(prepared, layout),
  }
}

function coreLayoutSignature(prepared: PreparedTerminalText, layout: TerminalLayoutOptions): unknown {
  const walked: TerminalLineRange[] = []
  walkTerminalLineRanges(prepared, layout, line => walked.push(line))
  const nextWalk = collectByNext(prepared, layout)
  const page: TerminalLinePage = {
    kind: 'terminal-line-page@1',
    columns: layout.columns,
    generation: 0,
    startRow: 0,
    rowCount: walked.length,
    lines: walked,
  }

  return {
    layout: layoutTerminal(prepared, layout),
    stats: measureTerminalLineStats(prepared, layout),
    walked: walked.map(line => lineSignature(prepared, line)),
    nextWalk: nextWalk.map(line => lineSignature(prepared, line)),
    nextFirst: lineSignature(
      prepared,
      layoutNextTerminalLineRange(prepared, TERMINAL_START_CURSOR, layout),
    ),
    rangeMaterialized: materializeTerminalLineRanges(prepared, walked).map(materializedLineSignature),
    pageMaterialized: materializeTerminalLinePage(prepared, page).map(materializedLineSignature),
  }
}

function virtualPrimitiveSignature(prepared: PreparedTerminalText, layout: TerminalLayoutOptions): unknown {
  const reader = getInternalPreparedTerminalReader(prepared as unknown as InternalPreparedTerminalText)
  const sourceIndex = createTerminalSourceOffsetIndex(prepared)
  const lineIndex = createTerminalLineIndex(prepared, {
    ...layout,
    anchorInterval: 2,
    generation: 11,
  })
  const rows = measureTerminalLineIndexRows(prepared, lineIndex)
  const rowSamples = uniqueNonNegative([0, 1, 2, rows - 1, rows, rows + 1])
  const rangeBatchStarts = uniqueNonNegative([0, Math.max(0, rows - 2), rows + 1])
  const cache = createTerminalPageCache(prepared, lineIndex, { pageSize: 3, maxPages: 4 })
  const pageRequests = [
    { startRow: 0, rowCount: 2 },
    { startRow: Math.max(0, rows - 2), rowCount: 3 },
    { startRow: rows + 1, rowCount: 1 },
  ]
  const pages = pageRequests.map(request => pageSignature(
    prepared,
    getTerminalLinePage(prepared, cache, lineIndex, request),
  ))
  const repeatedPage = pageSignature(
    prepared,
    getTerminalLinePage(prepared, cache, lineIndex, pageRequests[0]!),
  )
  const offsets = sampleSourceOffsets(reader.sourceLength)
  const lookupItems = offsets.flatMap(sourceOffset => biases.map(bias => {
    const lookup = getTerminalCursorForSourceOffset(prepared, sourceIndex, sourceOffset, bias)
    return {
      bias,
      cursor: lookup.cursor,
      exact: lookup.exact,
      requestedSourceOffset: lookup.requestedSourceOffset,
      roundTripDirect: getTerminalSourceOffsetForCursor(prepared, lookup.cursor),
      roundTripIndexed: getTerminalSourceOffsetForCursor(prepared, lookup.cursor, sourceIndex),
      sourceOffset: lookup.sourceOffset,
    }
  }))
  const projectionIndexes = { sourceIndex, lineIndex }

  return {
    metadata: getTerminalLineIndexMetadata(lineIndex),
    stats: getTerminalLineIndexStats(lineIndex),
    rows,
    rowsAt: rowSamples.map(row => ({
      row,
      line: lineSignature(prepared, getTerminalLineRangeAtRow(prepared, lineIndex, row)),
    })),
    rangesAtRows: rangeBatchStarts.map(row => ({
      row,
      lines: getTerminalLineRangesAtRows(prepared as never, lineIndex as never, row, 3)
        .map(line => lineSignature(prepared, line as never)),
    })),
    pages,
    repeatedPage,
    pageStats: getTerminalPageCacheStats(cache),
    lookups: lookupItems.map(item => ({
      bias: item.bias,
      cursor: cursorSignature(item.cursor),
      exact: item.exact,
      requestedSourceOffset: item.requestedSourceOffset,
      roundTripDirect: item.roundTripDirect,
      roundTripIndexed: item.roundTripIndexed,
      sourceOffset: item.sourceOffset,
    })),
    sourceProjections: offsets.flatMap(sourceOffset => biases.map(bias => ({
      bias,
      objectOverload: projectionSignature(
        prepared,
        projectTerminalSourceOffset(prepared, projectionIndexes, sourceOffset, { bias }),
      ),
      positionalOverload: projectionSignature(
        prepared,
        projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, sourceOffset, bias),
      ),
      sourceOffset,
    }))),
    cursorProjections: lookupItems.slice(0, 8).map(item => projectionSignature(
      prepared,
      projectTerminalCursor(prepared, sourceIndex, lineIndex, item.cursor, { bias: item.bias }),
    )),
    rowProjections: rowSamples.map(row => {
      const projected = projectTerminalRow(prepared, lineIndex, row)
      return projected === null
        ? { row, projected: null }
        : {
          row,
          projected: {
            endColumn: projected.endColumn,
            line: lineSignature(prepared, projected.line),
            sourceEnd: projected.sourceEnd,
            sourceStart: projected.sourceStart,
            startColumn: projected.startColumn,
          },
        }
    }),
  }
}

function collectByNext(prepared: PreparedTerminalText, layout: TerminalLayoutOptions): TerminalLineRange[] {
  const lines: TerminalLineRange[] = []
  let cursor = TERMINAL_START_CURSOR
  let startColumn = layout.startColumn ?? 0
  while (true) {
    const line = layoutNextTerminalLineRange(prepared, cursor, {
      columns: layout.columns,
      startColumn,
    })
    if (line === null) break
    lines.push(line)
    cursor = line.end
    startColumn = 0
  }
  return lines
}

function pageSignature(prepared: PreparedTerminalText, page: TerminalLinePage): unknown {
  return {
    columns: page.columns,
    generation: page.generation,
    rowCount: page.rowCount,
    startRow: page.startRow,
    lines: page.lines.map(line => lineSignature(prepared, line)),
  }
}

function lineSignature(prepared: PreparedTerminalText, line: TerminalLineRange | null): unknown {
  if (line === null) return null
  const materialized = materializeTerminalLineRange(prepared, line)
  return {
    break: { ...line.break },
    columns: line.columns,
    end: cursorSignature(line.end),
    overflow: line.overflow === null ? null : { ...line.overflow },
    sourceEnd: line.sourceEnd,
    sourceStart: line.sourceStart,
    sourceText: materialized.sourceText,
    start: cursorSignature(line.start),
    startColumn: line.startColumn,
    text: materialized.text,
    width: line.width,
  }
}

function materializedLineSignature(line: ReturnType<typeof materializeTerminalLineRange>): unknown {
  return {
    break: { ...line.break },
    sourceEnd: line.sourceEnd,
    sourceStart: line.sourceStart,
    sourceText: line.sourceText,
    text: line.text,
    width: line.width,
  }
}

function projectionSignature(
  prepared: PreparedTerminalText,
  projection: ReturnType<typeof projectTerminalSourceOffset>,
): unknown {
  return {
    atEnd: projection.atEnd,
    column: projection.column,
    coordinate: { ...projection.coordinate },
    cursor: cursorSignature(projection.cursor),
    exact: projection.exact,
    line: lineSignature(prepared, projection.line),
    requestedSourceOffset: projection.requestedSourceOffset,
    row: projection.row,
    sourceOffset: projection.sourceOffset,
  }
}

function cursorSignature(cursor: TerminalCursor): unknown {
  return {
    segmentIndex: cursor.segmentIndex,
    graphemeIndex: cursor.graphemeIndex,
  }
}

function sampleSourceOffsets(sourceLength: number): number[] {
  return uniqueNumbers([
    -1,
    0,
    1,
    Math.floor(sourceLength / 2),
    Math.max(0, sourceLength - 1),
    sourceLength,
    sourceLength + 1,
  ])
}

function uniqueNonNegative(values: readonly number[]): number[] {
  return uniqueNumbers(values.filter(value => value >= 0))
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}
