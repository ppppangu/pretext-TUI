// 补建说明：该文件为后续补建，用于锁定 coordinate projection public API 的运行时与类型边界；当前进度：Batch 6B.1 在 Task 4 覆盖基础上增加 reader-derived EOF/soft-hyphen/tab projection 回归。
import { describe, expect, test } from 'bun:test'
import {
  createTerminalLineIndex,
  createTerminalSourceOffsetIndex,
  materializeTerminalLineRange,
  prepareTerminal,
  projectTerminalCoordinate,
  projectTerminalCursor,
  projectTerminalRow,
  projectTerminalSourceRange,
  projectTerminalSourceOffset,
  type TerminalCoordinateSourceProjection,
  type PreparedTerminalText,
  type TerminalCoordinateProjection,
  type TerminalLineIndex,
  type TerminalPrepareOptions,
  type TerminalRowProjection,
  type TerminalSourceOffsetIndex,
  type TerminalSourceRangeProjection,
} from '../../src/index.js'

type ProjectionView = {
  lineIndex: TerminalLineIndex
  prepared: PreparedTerminalText
  sourceIndex: TerminalSourceOffsetIndex
}

function createProjectionView(
  text: string,
  columns: number,
  prepareOptions: TerminalPrepareOptions = { whiteSpace: 'pre-wrap' },
  startColumn = 0,
): ProjectionView {
  const prepared = prepareTerminal(text, prepareOptions)
  return {
    prepared,
    lineIndex: createTerminalLineIndex(prepared, { columns, startColumn, anchorInterval: 2 }),
    sourceIndex: createTerminalSourceOffsetIndex(prepared),
  }
}

function coordinateSignature(
  view: ProjectionView,
  projection: TerminalCoordinateProjection,
): {
  atEnd: boolean
  column: number
  exact: boolean
  kind: string
  lineSourceRange: [number, number] | null
  lineText: string | null
  requestedSourceOffset: number | null
  row: number
  sourceOffset: number
} {
  return {
    atEnd: projection.atEnd,
    column: projection.column,
    exact: projection.exact,
    kind: projection.kind,
    lineSourceRange: projection.line === null
      ? null
      : [projection.line.sourceStart, projection.line.sourceEnd],
    lineText: projection.line === null
      ? null
      : materializeTerminalLineRange(view.prepared, projection.line).text,
    requestedSourceOffset: projection.requestedSourceOffset,
    row: projection.row,
    sourceOffset: projection.sourceOffset,
  }
}

function coordinateHitSignature(
  projection: TerminalCoordinateSourceProjection | null,
): {
  bias: string
  column: number
  exact: boolean
  requested: [number, number]
  row: number
  sourceOffset: number
} | null {
  if (projection === null) return null
  return {
    bias: projection.bias,
    column: projection.column,
    exact: projection.exact,
    requested: [projection.requestedCoordinate.row, projection.requestedCoordinate.column],
    row: projection.row,
    sourceOffset: projection.sourceOffset,
  }
}

function rangeSignature(
  projection: TerminalSourceRangeProjection,
): {
  fragments: Array<{
    columns: [number, number]
    row: number
    source: [number, number]
  }>
  requested: [number, number]
  source: [number, number]
} {
  return {
    requested: [projection.requestedSourceStart, projection.requestedSourceEnd],
    source: [projection.sourceStart, projection.sourceEnd],
    fragments: projection.fragments.map(fragment => ({
      row: fragment.row,
      source: [fragment.sourceStart, fragment.sourceEnd],
      columns: [fragment.startColumn, fragment.endColumn],
    })),
  }
}

function rowSignature(
  view: ProjectionView,
  projection: TerminalRowProjection | null,
): {
  endColumn: number
  kind: string
  row: number
  sourceEnd: number
  sourceStart: number
  startColumn: number
  text: string
} | null {
  if (projection === null) return null
  return {
    endColumn: projection.endColumn,
    kind: projection.kind,
    row: projection.row,
    sourceEnd: projection.sourceEnd,
    sourceStart: projection.sourceStart,
    startColumn: projection.startColumn,
    text: materializeTerminalLineRange(view.prepared, projection.line).text,
  }
}

describe('coordinate projection public API', () => {
  test('projects source offsets to terminal row, absolute column, and line range', () => {
    const view = createProjectionView(
      'A\tB界e\u0301\u200Btail',
      6,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )

    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 0, 'after'),
    )).toMatchObject({
      atEnd: false,
      column: 1,
      exact: true,
      kind: 'terminal-coordinate-projection@1',
      lineSourceRange: [0, 3],
      lineText: 'A  B',
      requestedSourceOffset: 0,
      row: 0,
      sourceOffset: 0,
    })
    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 2, 'after'),
    )).toMatchObject({
      column: 4,
      lineSourceRange: [0, 3],
      lineText: 'A  B',
      row: 0,
      sourceOffset: 2,
    })
    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 4, 'after'),
    )).toMatchObject({
      column: 2,
      lineSourceRange: [3, 6],
      lineText: '界e\u0301',
      row: 1,
      sourceOffset: 4,
    })
  })

  test('keeps combining and zero-width offsets grapheme-safe while preserving visible columns', () => {
    const view = createProjectionView(
      'A\tB界e\u0301\u200Btail',
      6,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )

    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 5, 'before'),
    )).toMatchObject({
      column: 2,
      exact: false,
      row: 1,
      sourceOffset: 4,
    })
    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 5, 'after'),
    )).toMatchObject({
      column: 3,
      exact: false,
      row: 1,
      sourceOffset: 6,
    })
    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 7, 'after'),
    )).toMatchObject({
      column: 0,
      lineSourceRange: [7, 11],
      lineText: 'tail',
      row: 2,
      sourceOffset: 7,
    })
  })

  test('projects cursors and rows without exposing prepared or index internals', () => {
    const view = createProjectionView(
      'A\tB界e\u0301\u200Btail',
      6,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )
    const sourceProjection = projectTerminalSourceOffset(
      view.prepared,
      view.sourceIndex,
      view.lineIndex,
      4,
      'after',
    )

    expect(coordinateSignature(
      view,
      projectTerminalCursor(view.prepared, view.sourceIndex, view.lineIndex, sourceProjection.cursor),
    )).toMatchObject({
      atEnd: false,
      column: 2,
      exact: true,
      kind: 'terminal-coordinate-projection@1',
      lineSourceRange: [3, 6],
      lineText: '界e\u0301',
      row: 1,
      sourceOffset: 4,
    })

    expect(rowSignature(view, projectTerminalRow(view.prepared, view.lineIndex, 0))).toEqual({
      endColumn: 5,
      kind: 'terminal-row-projection@1',
      row: 0,
      sourceEnd: 3,
      sourceStart: 0,
      startColumn: 1,
      text: 'A  B',
    })
    expect(rowSignature(view, projectTerminalRow(view.prepared, view.lineIndex, 1))).toEqual({
      endColumn: 3,
      kind: 'terminal-row-projection@1',
      row: 1,
      sourceEnd: 6,
      sourceStart: 3,
      startColumn: 0,
      text: '界e\u0301',
    })
    expect(rowSignature(view, projectTerminalRow(view.prepared, view.lineIndex, 2))).toEqual({
      endColumn: 4,
      kind: 'terminal-row-projection@1',
      row: 2,
      sourceEnd: 11,
      sourceStart: 7,
      startColumn: 0,
      text: 'tail',
    })
    expect(projectTerminalRow(view.prepared, view.lineIndex, 3)).toBeNull()
  })

  test('projects through grouped index overloads with the same coordinate semantics', () => {
    const view = createProjectionView(
      'A\tB界e\u0301\u200Btail',
      6,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }
    const projection = projectTerminalSourceOffset(view.prepared, indexes, 4, { bias: 'after' })

    expect(coordinateSignature(view, projection)).toMatchObject({
      column: 2,
      lineSourceRange: [3, 6],
      lineText: '界e\u0301',
      row: 1,
      sourceOffset: 4,
    })
    expect(projection.coordinate).toEqual({ row: projection.row, column: projection.column })
    expect(coordinateSignature(
      view,
      projectTerminalCursor(view.prepared, indexes, projection.cursor, { bias: 'after' }),
    )).toMatchObject({
      column: 2,
      lineSourceRange: [3, 6],
      row: 1,
      sourceOffset: 4,
    })
  })

  test('projects terminal row and cell column back to grapheme-safe source offsets', () => {
    const view = createProjectionView(
      'A\tB界e\u0301\u200Btail',
      6,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }

    expect(coordinateHitSignature(projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 0, column: 3, bias: 'before' },
    ))).toEqual({
      bias: 'before',
      column: 2,
      exact: false,
      requested: [0, 3],
      row: 0,
      sourceOffset: 1,
    })
    expect(coordinateHitSignature(projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 0, column: 3, bias: 'after' },
    ))).toEqual({
      bias: 'after',
      column: 4,
      exact: false,
      requested: [0, 3],
      row: 0,
      sourceOffset: 2,
    })
    expect(coordinateHitSignature(projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 1, column: 1, bias: 'after' },
    ))).toMatchObject({
      column: 2,
      exact: false,
      row: 1,
      sourceOffset: 4,
    })
    expect(coordinateHitSignature(projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 2, column: 99 },
    ))).toMatchObject({
      column: 4,
      exact: false,
      row: 2,
      sourceOffset: 11,
    })
    expect(projectTerminalCoordinate(view.prepared, indexes, { row: 99, column: 0 })).toBeNull()
  })

  test('projects source ranges into terminal row fragments without host semantics', () => {
    const view = createProjectionView('hello world', 5, { whiteSpace: 'normal' })
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }

    expect(rangeSignature(projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 0, sourceEnd: 11 },
    ))).toEqual({
      requested: [0, 11],
      source: [0, 11],
      fragments: [
        { row: 0, source: [0, 5], columns: [0, 5] },
        { row: 1, source: [6, 11], columns: [0, 5] },
      ],
    })
    expect(rangeSignature(projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 4, sourceEnd: 8 },
    ))).toEqual({
      requested: [4, 8],
      source: [4, 8],
      fragments: [
        { row: 0, source: [4, 5], columns: [4, 5] },
        { row: 1, source: [6, 8], columns: [0, 2] },
      ],
    })
  })

  test('source range projection expands partial grapheme clusters and keeps collapsed ranges empty', () => {
    const view = createProjectionView('e\u0301x', 8, { whiteSpace: 'pre-wrap' })
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }

    expect(rangeSignature(projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 1, sourceEnd: 2 },
    ))).toEqual({
      requested: [1, 2],
      source: [0, 2],
      fragments: [
        { row: 0, source: [0, 2], columns: [0, 1] },
      ],
    })
    expect(rangeSignature(projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 1, sourceEnd: 1 },
    ))).toEqual({
      requested: [1, 1],
      source: [0, 0],
      fragments: [],
    })
  })

  test('reprojects the same source anchor after resize with a rebuilt fixed-column line index', () => {
    const text = 'alpha beta gamma'
    const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })
    const sourceIndex = createTerminalSourceOffsetIndex(prepared)
    const wide: ProjectionView = {
      prepared,
      sourceIndex,
      lineIndex: createTerminalLineIndex(prepared, { columns: 20 }),
    }
    const narrow: ProjectionView = {
      prepared,
      sourceIndex,
      lineIndex: createTerminalLineIndex(prepared, { columns: 8 }),
    }

    expect(coordinateSignature(
      wide,
      projectTerminalSourceOffset(prepared, sourceIndex, wide.lineIndex, 11, 'after'),
    )).toMatchObject({
      column: 11,
      lineSourceRange: [0, 16],
      lineText: 'alpha beta gamma',
      row: 0,
      sourceOffset: 11,
    })
    expect(coordinateSignature(
      narrow,
      projectTerminalSourceOffset(prepared, sourceIndex, narrow.lineIndex, 11, 'after'),
    )).toMatchObject({
      column: 0,
      lineSourceRange: [11, 16],
      lineText: 'gamma',
      row: 2,
      sourceOffset: 11,
    })
  })

  test('reports the projected row when a collapsed wrap delimiter is consumed', () => {
    const view = createProjectionView('hello world', 5, { whiteSpace: 'normal' })

    expect(coordinateSignature(
      view,
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, 5, 'closest'),
    )).toMatchObject({
      column: 0,
      exact: true,
      lineSourceRange: [6, 11],
      lineText: 'world',
      requestedSourceOffset: 5,
      row: 1,
      sourceOffset: 5,
    })
  })

  test('projects EOF to a terminal endpoint without fabricating a rendered row', () => {
    const inline = createProjectionView('abc', 8)
    const finalBreak = createProjectionView('abc\n', 8)

    expect(coordinateSignature(
      inline,
      projectTerminalSourceOffset(inline.prepared, inline.sourceIndex, inline.lineIndex, 3, 'after'),
    )).toMatchObject({
      atEnd: true,
      column: 3,
      lineSourceRange: [0, 3],
      lineText: 'abc',
      row: 0,
      exact: true,
      requestedSourceOffset: 3,
      sourceOffset: 3,
    })
    expect(coordinateSignature(
      inline,
      projectTerminalSourceOffset(inline.prepared, inline.sourceIndex, inline.lineIndex, 3, 'before'),
    )).toMatchObject({
      atEnd: true,
      column: 3,
      exact: true,
      lineSourceRange: [0, 3],
      lineText: 'abc',
      requestedSourceOffset: 3,
      row: 0,
      sourceOffset: 3,
    })
    expect(coordinateSignature(
      inline,
      projectTerminalSourceOffset(inline.prepared, inline.sourceIndex, inline.lineIndex, 4, 'after'),
    )).toMatchObject({
      atEnd: true,
      column: 3,
      exact: false,
      lineSourceRange: [0, 3],
      lineText: 'abc',
      requestedSourceOffset: 4,
      row: 0,
      sourceOffset: 3,
    })
    expect(coordinateSignature(
      inline,
      projectTerminalSourceOffset(inline.prepared, inline.sourceIndex, inline.lineIndex, 4, 'before'),
    )).toMatchObject({
      atEnd: true,
      column: 3,
      exact: false,
      lineSourceRange: [0, 3],
      lineText: 'abc',
      requestedSourceOffset: 4,
      row: 0,
      sourceOffset: 3,
    })
    expect(coordinateSignature(
      inline,
      projectTerminalSourceOffset(inline.prepared, inline.sourceIndex, inline.lineIndex, -1, 'before'),
    )).toMatchObject({
      atEnd: false,
      column: 0,
      exact: false,
      lineSourceRange: [0, 3],
      lineText: 'abc',
      requestedSourceOffset: -1,
      row: 0,
      sourceOffset: 0,
    })
    expect(coordinateSignature(
      finalBreak,
      projectTerminalSourceOffset(finalBreak.prepared, finalBreak.sourceIndex, finalBreak.lineIndex, 4, 'after'),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: true,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 4,
      row: 1,
      sourceOffset: 4,
    })
    expect(coordinateSignature(
      finalBreak,
      projectTerminalSourceOffset(finalBreak.prepared, finalBreak.sourceIndex, finalBreak.lineIndex, 4, 'before'),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: true,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 4,
      row: 1,
      sourceOffset: 4,
    })
    expect(coordinateSignature(
      finalBreak,
      projectTerminalSourceOffset(finalBreak.prepared, finalBreak.sourceIndex, finalBreak.lineIndex, 5, 'after'),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: false,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 5,
      row: 1,
      sourceOffset: 4,
    })
    expect(coordinateSignature(
      finalBreak,
      projectTerminalSourceOffset(finalBreak.prepared, finalBreak.sourceIndex, finalBreak.lineIndex, 5, 'before'),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: false,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 5,
      row: 1,
      sourceOffset: 4,
    })
    expect(projectTerminalRow(finalBreak.prepared, finalBreak.lineIndex, 1)).toBeNull()

    const empty = createProjectionView('', 8)
    expect(coordinateSignature(
      empty,
      projectTerminalSourceOffset(empty.prepared, empty.sourceIndex, empty.lineIndex, 0),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: true,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 0,
      row: 0,
      sourceOffset: 0,
    })
    expect(coordinateSignature(
      empty,
      projectTerminalSourceOffset(empty.prepared, empty.sourceIndex, empty.lineIndex, 1),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      exact: false,
      lineSourceRange: null,
      lineText: null,
      requestedSourceOffset: 1,
      row: 0,
      sourceOffset: 0,
    })
  })

  test('projects final hard-break EOF through reader-derived segment boundaries', () => {
    for (const [text, expectedRow] of [
      ['abc\n\n', 2],
      ['abc\r\n', 1],
      ['abc\r', 1],
      ['abc\f', 1],
    ] as const) {
      const view = createProjectionView(text, 8)
      expect(coordinateSignature(
        view,
        projectTerminalSourceOffset(
          view.prepared,
          view.sourceIndex,
          view.lineIndex,
          999,
          'after',
        ),
      )).toMatchObject({
        atEnd: true,
        column: 0,
        lineSourceRange: null,
        lineText: null,
        row: expectedRow,
      })
      expect(projectTerminalRow(view.prepared, view.lineIndex, expectedRow)).toBeNull()
    }

    for (const text of ['abc\n\u200B', 'abc\n ']) {
      const view = createProjectionView(text, 8)
      const signature = coordinateSignature(
        view,
        projectTerminalSourceOffset(
          view.prepared,
          view.sourceIndex,
          view.lineIndex,
          999,
          'after',
        ),
      )
      expect(signature).toMatchObject({
        atEnd: true,
        row: 1,
      })
      expect(signature.lineSourceRange).not.toBeNull()
    }
  })

  test('projects selected soft hyphen width by source offset', () => {
    const doubleSoftHyphen = createProjectionView('B\u00AD\u00ADB', 1)

    expect(coordinateSignature(
      doubleSoftHyphen,
      projectTerminalSourceOffset(
        doubleSoftHyphen.prepared,
        doubleSoftHyphen.sourceIndex,
        doubleSoftHyphen.lineIndex,
        2,
        'after',
      ),
    )).toMatchObject({
      row: 0,
      column: 1,
      sourceOffset: 2,
    })
    expect(coordinateSignature(
      doubleSoftHyphen,
      projectTerminalSourceOffset(
        doubleSoftHyphen.prepared,
        doubleSoftHyphen.sourceIndex,
        doubleSoftHyphen.lineIndex,
        3,
        'after',
      ),
    )).toMatchObject({
      row: 1,
      column: 0,
      sourceOffset: 3,
    })

    const softThenHyphen = createProjectionView('a\u00AD-b', 2)
    expect(coordinateSignature(
      softThenHyphen,
      projectTerminalSourceOffset(
        softThenHyphen.prepared,
        softThenHyphen.sourceIndex,
        softThenHyphen.lineIndex,
        2,
        'after',
      ),
    )).toMatchObject({
      row: 1,
      column: 0,
    })
    expect(coordinateSignature(
      softThenHyphen,
      projectTerminalSourceOffset(
        softThenHyphen.prepared,
        softThenHyphen.sourceIndex,
        softThenHyphen.lineIndex,
        3,
        'after',
      ),
    )).toMatchObject({
      row: 1,
      column: 1,
    })
  })

  test('projects tab columns with dynamic terminal stops after reader migration', () => {
    const view = createProjectionView(
      'A\t界\tB',
      20,
      { whiteSpace: 'pre-wrap', tabSize: 4 },
      1,
    )
    const projectedColumns = [0, 1, 2, 3, 4, 5].map(offset =>
      projectTerminalSourceOffset(view.prepared, view.sourceIndex, view.lineIndex, offset, 'after').column,
    )

    expect(projectedColumns).toEqual([1, 2, 4, 6, 8, 9])
  })

  test('rejects invalid runtime source-offset bias across projection overloads', () => {
    const view = createProjectionView('hello world', 8)
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }
    const cursor = projectTerminalSourceOffset(view.prepared, indexes, 0).cursor

    expect(() => projectTerminalSourceOffset(
      view.prepared,
      view.sourceIndex,
      view.lineIndex,
      0,
      'sideways' as never,
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      view.sourceIndex,
      view.lineIndex,
      0,
      null as never,
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      view.sourceIndex,
      view.lineIndex,
      0,
      1 as never,
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      indexes,
      0,
      { bias: 1 as never },
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      indexes,
      0,
      1 as never,
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalCursor(
      view.prepared,
      indexes,
      cursor,
      { bias: 'sideways' as never },
    )).toThrow('Terminal source offset bias')
    expect(() => projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 0, column: 0, bias: 'sideways' as never },
    )).toThrow('Terminal source offset bias')
  })

  test('rejects invalid coordinate and source-range projection requests', () => {
    const view = createProjectionView('hello world', 8)
    const indexes = { sourceIndex: view.sourceIndex, lineIndex: view.lineIndex }

    expect(() => projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: -1, column: 0 },
    )).toThrow('Terminal coordinate row')
    expect(() => projectTerminalCoordinate(
      view.prepared,
      indexes,
      { row: 0, column: 1.5 },
    )).toThrow('Terminal coordinate column')
    expect(() => projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 2.5, sourceEnd: 4 },
    )).toThrow('Terminal source range start')
    expect(() => projectTerminalSourceRange(
      view.prepared,
      indexes,
      { sourceStart: 4, sourceEnd: 3 },
    )).toThrow('source range end')
  })

  test('rejects forged or mismatched prepared, source-index, and line-index handles', () => {
    const view = createProjectionView('hello world', 8)
    const otherPrepared = prepareTerminal('different source', { whiteSpace: 'pre-wrap' })
    const otherLineIndex = createTerminalLineIndex(otherPrepared, { columns: 8 })
    const otherSourceIndex = createTerminalSourceOffsetIndex(otherPrepared)
    const forgedPrepared = Object.freeze({ kind: 'prepared-terminal-text@1' }) as PreparedTerminalText
    const forgedSourceIndex = Object.freeze({ kind: 'terminal-source-offset-index@1' }) as TerminalSourceOffsetIndex
    const forgedLineIndex = Object.freeze({ kind: 'terminal-line-index@1' }) as TerminalLineIndex

    expect(() => projectTerminalSourceOffset(
      forgedPrepared,
      view.sourceIndex,
      view.lineIndex,
      0,
    )).toThrow('Invalid prepared terminal text handle')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      forgedSourceIndex,
      view.lineIndex,
      0,
    )).toThrow('Invalid terminal source offset index handle')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      forgedSourceIndex,
      view.lineIndex,
      0,
      1 as never,
    )).toThrow('Invalid terminal source offset index handle')
    expect(() => projectTerminalSourceOffset(
      view.prepared,
      view.sourceIndex,
      forgedLineIndex,
      0,
    )).toThrow('Invalid terminal line index handle')
    expect(() => projectTerminalSourceOffset(
      otherPrepared,
      view.sourceIndex,
      view.lineIndex,
      0,
    )).toThrow(/different prepared/)
    expect(() => projectTerminalRow(view.prepared, forgedLineIndex, 0)).toThrow(
      'Invalid terminal line index handle',
    )
    expect(() => projectTerminalCoordinate(
      view.prepared,
      { sourceIndex: view.sourceIndex, lineIndex: forgedLineIndex },
      { row: 0, column: 0 },
    )).toThrow('Invalid terminal line index handle')
    expect(() => projectTerminalCoordinate(
      view.prepared,
      { sourceIndex: forgedSourceIndex, lineIndex: view.lineIndex },
      { row: 0, column: 0 },
    )).toThrow('Invalid terminal source offset index handle')
    expect(() => projectTerminalCoordinate(
      view.prepared,
      { sourceIndex: forgedSourceIndex, lineIndex: view.lineIndex },
      { row: 99, column: 0 },
    )).toThrow('Invalid terminal source offset index handle')
    expect(() => projectTerminalCoordinate(
      view.prepared,
      { sourceIndex: view.sourceIndex, lineIndex: otherLineIndex },
      { row: 0, column: 0 },
    )).toThrow(/different prepared/)
    expect(() => projectTerminalSourceRange(
      view.prepared,
      { sourceIndex: forgedSourceIndex, lineIndex: view.lineIndex },
      { sourceStart: 0, sourceEnd: 1 },
    )).toThrow('Invalid terminal source offset index handle')
    expect(() => projectTerminalSourceRange(
      view.prepared,
      { sourceIndex: view.sourceIndex, lineIndex: forgedLineIndex },
      { sourceStart: 0, sourceEnd: 1 },
    )).toThrow('Invalid terminal line index handle')
    expect(() => projectTerminalSourceRange(
      view.prepared,
      { sourceIndex: otherSourceIndex, lineIndex: view.lineIndex },
      { sourceStart: 0, sourceEnd: 1 },
    )).toThrow(/different prepared/)
  })
})
