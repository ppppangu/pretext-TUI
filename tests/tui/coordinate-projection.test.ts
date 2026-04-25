// 补建说明：该文件为后续补建，用于锁定 coordinate projection public API 的运行时与类型边界；当前进度：Task 4 已落地，覆盖 source/cursor/row/resize/Unicode/handle 边界。
import { describe, expect, test } from 'bun:test'
import {
  createTerminalLineIndex,
  createTerminalSourceOffsetIndex,
  materializeTerminalLineRange,
  prepareTerminal,
  projectTerminalCursor,
  projectTerminalRow,
  projectTerminalSourceOffset,
  type PreparedTerminalText,
  type TerminalCoordinateProjection,
  type TerminalLineIndex,
  type TerminalPrepareOptions,
  type TerminalRowProjection,
  type TerminalSourceOffsetIndex,
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
      sourceOffset: 3,
    })
    expect(coordinateSignature(
      finalBreak,
      projectTerminalSourceOffset(finalBreak.prepared, finalBreak.sourceIndex, finalBreak.lineIndex, 4, 'after'),
    )).toMatchObject({
      atEnd: true,
      column: 0,
      lineSourceRange: null,
      lineText: null,
      row: 1,
      sourceOffset: 4,
    })
    expect(projectTerminalRow(finalBreak.prepared, finalBreak.lineIndex, 1)).toBeNull()
  })

  test('rejects forged or mismatched prepared, source-index, and line-index handles', () => {
    const view = createProjectionView('hello world', 8)
    const otherPrepared = prepareTerminal('different source', { whiteSpace: 'pre-wrap' })
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
  })
})
