<!-- 补建说明：该文件为后续补建，用于记录 editor-like source pane 如何把宿主自己的 source line/column 与 pretext-TUI 的 source offset/terminal row 映射连接起来；当前进度：Task 3 首版 recipe，保持编辑器行为和文件操作在宿主侧。 -->
# Editor Source Mapping

Use this pattern when a host has its own source model and wants wrapped terminal rows to stay linked to source offsets.

`pretext-TUI` uses UTF-16 source offsets over sanitized visible text. The host remains responsible for file paths, line/column conversion, diagnostics, file opening, persistence, and edits.

## Host Owns

- file identity, buffers, edits, diagnostics, and line/column indexes
- converting file line/column positions to UTF-16 source offsets
- opening files, focusing panes, and applying edits
- deciding how much context to show around a source range

## Package Owns

- terminal-cell line ranges
- source-offset lookup handles
- mapping terminal rows to source ranges
- mapping source offsets and cursors to terminal row/column projections

## Incubating API Note

This recipe uses source-offset indexes, sparse line indexes, and coordinate projection helpers. They are public, host-neutral data APIs, but still incubating before the stable `0.1` contract.

## Public Imports

```ts
import {
  createTerminalLineIndex,
  createTerminalSourceOffsetIndex,
  getTerminalCursorForSourceOffset,
  prepareTerminal,
  projectTerminalCursor,
  projectTerminalRow,
  projectTerminalSourceOffset,
  type PreparedTerminalText,
  type TerminalCoordinateProjection,
  type TerminalCursor,
  type TerminalLineIndex,
  type TerminalRowProjection,
  type TerminalSourceOffsetIndex,
} from 'pretext-tui'
```

## Build The Source Mapping Handles

```ts
type SourceView = {
  prepared: PreparedTerminalText
  lineIndex: TerminalLineIndex
  sourceIndex: TerminalSourceOffsetIndex
}

function createSourceView(text: string, columns: number): SourceView {
  const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })
  return {
    prepared,
    lineIndex: createTerminalLineIndex(prepared, { columns, anchorInterval: 64 }),
    sourceIndex: createTerminalSourceOffsetIndex(prepared),
  }
}
```

## Source Offset To Terminal Coordinate

Use source offsets as the semantic anchor. The projection result gives the fixed-width terminal row, absolute terminal cell column, normalized source offset, opaque cursor, and containing line range.

```ts
function projectSourceOffset(view: SourceView, sourceOffset: number): TerminalCoordinateProjection {
  return projectTerminalSourceOffset(
    view.prepared,
    view.sourceIndex,
    view.lineIndex,
    sourceOffset,
    'closest',
  )
}
```

`projection.column` is a terminal-cell column, not a UTF-16 column. It includes `startColumn`, tab expansion, wide graphemes, and combining marks.

## Cursor To Terminal Coordinate

If the host already stored a package cursor, project it through the same prepared/source/line handles.

```ts
function projectStoredCursor(view: SourceView, cursor: TerminalCursor): TerminalCoordinateProjection {
  return projectTerminalCursor(view.prepared, view.sourceIndex, view.lineIndex, cursor)
}
```

For cursor lookup from a raw source offset, continue to use the source index when you only need the cursor:

```ts
function cursorForDiagnosticStart(view: SourceView, sourceOffset: number): TerminalCursor {
  return getTerminalCursorForSourceOffset(
    view.prepared,
    view.sourceIndex,
    sourceOffset,
    'closest',
  ).cursor
}
```

## Wrapped Row To Source Range

```ts
function sourceRangeForWrappedRow(
  view: SourceView,
  row: number,
): Pick<TerminalRowProjection, 'sourceStart' | 'sourceEnd'> | null {
  const projection = projectTerminalRow(view.prepared, view.lineIndex, row)
  if (!projection) return null
  return {
    sourceStart: projection.sourceStart,
    sourceEnd: projection.sourceEnd,
  }
}
```

## Host Line/Column Bridge

Keep this bridge in the host because it depends on the host source model.

```ts
type HostSourcePosition = {
  line: number
  columnUtf16: number
}

function sourceOffsetFromHostPosition(text: string, position: HostSourcePosition): number {
  let offset = 0
  let currentLine = 0

  for (const line of text.split('\n')) {
    if (currentLine === position.line) {
      return offset + Math.min(position.columnUtf16, line.length)
    }
    offset += line.length + 1
    currentLine++
  }

  return text.length
}
```

For a production host, replace this simple helper with the host's own buffer index so edits and large files remain efficient.

## Resize Reprojection

Keep the source offset as the durable anchor, rebuild only the width-dependent line index, then project the same source offset into the new terminal width.

```ts
function reprojectAfterResize(
  view: SourceView,
  sourceOffset: number,
  nextColumns: number,
): TerminalCoordinateProjection {
  const resized: SourceView = {
    prepared: view.prepared,
    sourceIndex: view.sourceIndex,
    lineIndex: createTerminalLineIndex(view.prepared, {
      columns: nextColumns,
      anchorInterval: 64,
    }),
  }

  return projectSourceOffset(resized, sourceOffset)
}
```

## Notes

- Keep file and diagnostic metadata outside `pretext-TUI`; pass only visible text into the package.
- Use `sourceStart` and `sourceEnd` as durable anchors for diagnostics, search hits, and copy ranges.
- Rebuild the line index when `columns` changes. Rebuild the prepared text and source index when the visible source text changes.
- Projection rejects forged or mismatched prepared/source/line handles through the same public capability boundaries as the underlying indexes.
