// 补建说明：该文件为后续补建，用于验证 Phase 6 host-neutral selection/extraction API 的数据边界；当前进度：首版覆盖 coordinate selection、source/rich extraction、range sidecar matches 与 invalid/no-UI 约束。
import { describe, expect, test } from 'bun:test'
import {
  createTerminalLineIndex,
  createTerminalRangeIndex,
  createTerminalSelectionFromCoordinates,
  createTerminalSourceOffsetIndex,
  extractTerminalSelection,
  extractTerminalSourceRange,
  prepareTerminal,
  type PreparedTerminalText,
  type TerminalLineIndex,
  type TerminalPrepareOptions,
  type TerminalSelection,
  type TerminalSelectionExtraction,
  type TerminalSourceOffsetIndex,
} from '../../src/index.js'
import {
  extractTerminalRichSourceRange,
  extractTerminalRichSelection,
  prepareTerminalRichInline,
} from '../../src/public-terminal-rich-inline.js'

type SelectionView = {
  lineIndex: TerminalLineIndex
  prepared: PreparedTerminalText
  sourceIndex: TerminalSourceOffsetIndex
}

function createSelectionView(
  text: string,
  columns: number,
  prepareOptions: TerminalPrepareOptions = { whiteSpace: 'pre-wrap' },
  startColumn = 0,
): SelectionView {
  const prepared = prepareTerminal(text, prepareOptions)
  return {
    prepared,
    lineIndex: createTerminalLineIndex(prepared, { columns, startColumn, anchorInterval: 2 }),
    sourceIndex: createTerminalSourceOffsetIndex(prepared),
  }
}

function indexes(view: SelectionView): { lineIndex: TerminalLineIndex, sourceIndex: TerminalSourceOffsetIndex } {
  return { lineIndex: view.lineIndex, sourceIndex: view.sourceIndex }
}

function extractionSignature(extraction: TerminalSelectionExtraction): {
  ranges: Array<[number, number, number, string, string]>
  source: [number, number, string]
  visible: string
  rows: readonly string[]
} {
  return {
    source: [extraction.sourceStart, extraction.sourceEnd, extraction.sourceText],
    visible: extraction.visibleText,
    rows: extraction.visibleRows,
    ranges: extraction.rowFragments.map(fragment => [
      fragment.row,
      fragment.sourceStart,
      fragment.sourceEnd,
      fragment.text,
      fragment.sourceText,
    ]),
  }
}

describe('terminal selection and extraction', () => {
  test('creates linear selections from coordinates and extracts wrapped visible rows', () => {
    const view = createSelectionView('hello world', 5, { whiteSpace: 'normal' })
    const selection = createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 0, column: 1 },
      focus: { row: 1, column: 3 },
      mode: 'linear',
    })

    expect(selection).not.toBeNull()
    expect(Object.isFrozen(selection)).toBe(true)
    expect(selection?.kind).toBe('terminal-selection@1')
    expect(selection?.direction).toBe('forward')
    expect(selection?.collapsed).toBe(false)
    expect(selection).not.toHaveProperty('clipboard')
    expect(selection).not.toHaveProperty('highlight')
    expect(selection).not.toHaveProperty('active')

    const extraction = extractTerminalSelection(view.prepared, selection!, { indexes: indexes(view) })
    expect(Object.isFrozen(extraction)).toBe(true)
    expect(extractionSignature(extraction)).toEqual({
      source: [1, 9, 'ello wor'],
      visible: 'ello\nwor',
      rows: ['ello', 'wor'],
      ranges: [
        [0, 1, 5, 'ello', 'ello'],
        [1, 6, 9, 'wor', 'wor'],
      ],
    })
  })

  test('preserves reverse direction while extracting source-ordered text', () => {
    const view = createSelectionView('alpha beta gamma', 8, { whiteSpace: 'pre-wrap' })
    const selection = createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 1, column: 4 },
      focus: { row: 0, column: 1 },
    })
    const extraction = extractTerminalSelection(view.prepared, selection!, { indexes: indexes(view) })

    expect(selection?.direction).toBe('backward')
    expect(extraction.sourceStart).toBeLessThan(extraction.sourceEnd)
    expect(extraction.visibleText).toBe('lpha \nbeta')
  })

  test('selection extraction follows collapsed whitespace source text', () => {
    const view = createSelectionView('alpha   beta\t\n gamma', 40, { whiteSpace: 'normal', tabSize: 4 })
    const selection = createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 0, column: 0 },
      focus: { row: 0, column: 16 },
    })
    const extraction = extractTerminalSelection(view.prepared, selection!, { indexes: indexes(view) })

    expect(extraction.sourceText).toBe('alpha beta gamma')
    expect(extraction.visibleText).toBe('alpha beta gamma')
    expect(extraction.visibleRows).toEqual(['alpha beta gamma'])
  })

  test('extracts multi-line hard-break ranges without fabricating final EOF rows', () => {
    const view = createSelectionView('a\n\nb\n', 10, { whiteSpace: 'pre-wrap' })
    const extraction = extractTerminalSourceRange(view.prepared, { sourceStart: 0, sourceEnd: 5 }, {
      indexes: indexes(view),
    })

    expect(extraction.sourceText).toBe('a\n\nb\n')
    expect(extraction.visibleRows).toEqual(['a', '', 'b'])
    expect(extraction.rowEnd).toBeGreaterThanOrEqual(extraction.rowStart)
  })

  test('expands partial grapheme ranges and keeps wide characters and tabs cell-based', () => {
    const view = createSelectionView('e\u0301\t界B', 10, { whiteSpace: 'pre-wrap', tabSize: 4 }, 1)
    const extraction = extractTerminalSourceRange(view.prepared, { sourceStart: 1, sourceEnd: 4 }, {
      indexes: indexes(view),
    })

    expect(extraction.sourceText).toBe('e\u0301\t界')
    expect(extraction.visibleText).toBe('e\u0301  界')
    expect(extraction.rowFragments[0]?.startColumn).toBe(1)
    expect(extraction.rowFragments[0]?.endColumn).toBe(6)
  })

  test('includes generic range sidecar matches without interpreting range metadata', () => {
    const view = createSelectionView('one two three', 20, { whiteSpace: 'pre-wrap' })
    const rangeIndex = createTerminalRangeIndex([
      { id: 'block', kind: 'host-owned', sourceStart: 0, sourceEnd: 13, tags: ['x'], data: { payload: 'p1' } },
      { id: 'point', kind: 'marker', sourceStart: 4, sourceEnd: 4 },
    ])
    const extraction = extractTerminalSourceRange(view.prepared, { sourceStart: 4, sourceEnd: 7 }, {
      indexes: indexes(view),
      rangeIndex,
    })

    expect(extraction.rangeMatches?.map(range => range.id)).toEqual(['block', 'point'])
    expect(extraction.rangeMatches?.[0]?.kind).toBe('host-owned')
  })

  test('extracts clipped rich fragments through the rich sidecar only', () => {
    const rich = prepareTerminalRichInline('\x1b[31mred\x1b[0m and \x1b]8;;https://e.test\x1b\\link\x1b]8;;\x1b\\', {
      whiteSpace: 'pre-wrap',
    })
    const view: SelectionView = {
      prepared: rich.prepared,
      sourceIndex: createTerminalSourceOffsetIndex(rich.prepared),
      lineIndex: createTerminalLineIndex(rich.prepared, { columns: 20 }),
    }
    const selection = createTerminalSelectionFromCoordinates(rich.prepared, indexes(view), {
      anchor: { row: 0, column: 0 },
      focus: { row: 0, column: 12 },
    })
    const extraction = extractTerminalRichSelection(rich, selection!, { indexes: indexes(view) })

    expect(extraction.visibleText).toBe('red and link')
    expect(extraction.richFragments.map(fragment => ({
      text: fragment.text,
      style: fragment.style?.fg,
      link: fragment.link,
    }))).toEqual([
      { text: 'red', style: 'ansi:31', link: null },
      { text: ' and ', style: undefined, link: null },
      { text: 'link', style: undefined, link: 'https://e.test' },
    ])
    expect(extraction.richFragments.some(fragment => fragment.text.includes('\x1b'))).toBe(false)
  })

  test('extracts rich source ranges clipped through style and link spans', () => {
    const rich = prepareTerminalRichInline('\x1b[31mred alert\x1b[0m and \x1b]8;;https://e.test\x1b\\linked text\x1b]8;;\x1b\\', {
      whiteSpace: 'pre-wrap',
    })
    const view: SelectionView = {
      prepared: rich.prepared,
      sourceIndex: createTerminalSourceOffsetIndex(rich.prepared),
      lineIndex: createTerminalLineIndex(rich.prepared, { columns: 40 }),
    }
    const extraction = extractTerminalRichSourceRange(rich, { sourceStart: 2, sourceEnd: 22 }, {
      indexes: indexes(view),
    })

    expect(extraction.visibleText).toBe('d alert and linked t')
    expect(extraction.richFragments.map(fragment => ({
      text: fragment.text,
      style: fragment.style?.fg,
      link: fragment.link,
    }))).toEqual([
      { text: 'd alert', style: 'ansi:31', link: null },
      { text: ' and ', style: undefined, link: null },
      { text: 'linked t', style: undefined, link: 'https://e.test' },
    ])
  })

  test('keeps rich selection fragments grapheme-safe when spans start inside a cluster', () => {
    const rich = prepareTerminalRichInline('a\x1b[31m\u0301\x1b[0mB', {
      whiteSpace: 'pre-wrap',
    })
    const view: SelectionView = {
      prepared: rich.prepared,
      sourceIndex: createTerminalSourceOffsetIndex(rich.prepared),
      lineIndex: createTerminalLineIndex(rich.prepared, { columns: 10 }),
    }
    const selection = createTerminalSelectionFromCoordinates(rich.prepared, indexes(view), {
      anchor: { row: 0, column: 0 },
      focus: { row: 0, column: 1 },
    })
    const extraction = extractTerminalRichSelection(rich, selection!, { indexes: indexes(view) })

    expect(extraction.visibleText).toBe('a\u0301')
    expect(extraction.richFragments.map(fragment => fragment.text)).toEqual(['a\u0301'])
    expect(extraction.richFragments[0]?.sourceStart).toBe(0)
    expect(extraction.richFragments[0]?.sourceEnd).toBe(2)
    expect(extraction.richFragments[0]?.columnEnd).toBe(1)
  })

  test('returns collapsed selections and empty extraction data', () => {
    const view = createSelectionView('abc', 10)
    const selection = createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 0, column: 1 },
      focus: { row: 0, column: 1 },
    })
    const extraction = extractTerminalSelection(view.prepared, selection!, { indexes: indexes(view) })

    expect(selection?.collapsed).toBe(true)
    expect(extraction.sourceText).toBe('')
    expect(extraction.visibleRows).toEqual([])
    expect(extraction.rowFragments).toEqual([])
  })

  test('returns null for outside coordinates and rejects invalid requests', () => {
    const view = createSelectionView('abc', 10)
    const selection = createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 99, column: 0 },
      focus: { row: 0, column: 1 },
    })

    expect(selection).toBeNull()
    expect(() => createTerminalSelectionFromCoordinates(view.prepared, indexes(view), {
      anchor: { row: 0, column: 0 },
      focus: { row: 0, column: 1 },
      mode: 'block' as never,
    })).toThrow('linear')
    expect(() => extractTerminalSourceRange(view.prepared, { sourceStart: 2, sourceEnd: 1 }, {
      indexes: indexes(view),
    })).toThrow('source range end')
    expect(() => extractTerminalSelection(view.prepared, { kind: 'nope' } as unknown as TerminalSelection, {
      indexes: indexes(view),
    })).toThrow('Invalid terminal selection')
    expect(() => extractTerminalSourceRange(view.prepared, { sourceStart: 0, sourceEnd: 1 }, undefined as never)).toThrow('options')
    expect(() => extractTerminalSourceRange(view.prepared, { sourceStart: 0, sourceEnd: 1 }, {
      indexes: undefined as never,
    })).toThrow('options.indexes')
    expect(() => extractTerminalSourceRange(view.prepared, { sourceStart: 0, sourceEnd: 1 }, {
      indexes: null as never,
    })).toThrow('options.indexes')
  })
})
