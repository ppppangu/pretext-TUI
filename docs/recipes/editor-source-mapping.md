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
- mapping source offsets to terminal cursors

## Incubating API Note

This recipe uses source-offset indexes and sparse line indexes. They are public, host-neutral data APIs, but still incubating before the stable `0.1` contract.

## Public Imports

```ts
import {
  createTerminalLineIndex,
  createTerminalSourceOffsetIndex,
  getTerminalCursorForSourceOffset,
  getTerminalLineRangeAtRow,
  getTerminalSourceOffsetForCursor,
  measureTerminalLineIndexRows,
  prepareTerminal,
  type PreparedTerminalText,
  type TerminalLineIndex,
  type TerminalLineRange,
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

## Source Offset To Wrapped Row

The public source-offset index maps a source offset to a terminal cursor. The row lookup remains a fixed-width line-index concern.

```ts
function findRowForSourceOffset(view: SourceView, sourceOffset: number): number {
  const lookup = getTerminalCursorForSourceOffset(view.prepared, view.sourceIndex, sourceOffset, 'closest')
  const normalizedOffset = getTerminalSourceOffsetForCursor(view.prepared, lookup.cursor, view.sourceIndex)
  const rows = measureTerminalLineIndexRows(view.prepared, view.lineIndex)

  let low = 0
  let high = Math.max(0, rows - 1)

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const line = getTerminalLineRangeAtRow(view.prepared, view.lineIndex, mid)
    if (!line) break

    if (line.sourceEnd <= normalizedOffset) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Math.min(low, Math.max(0, rows - 1))
}
```

## Wrapped Row To Source Range

```ts
function sourceRangeForWrappedRow(view: SourceView, row: number): Pick<TerminalLineRange, 'sourceStart' | 'sourceEnd'> | null {
  const line = getTerminalLineRangeAtRow(view.prepared, view.lineIndex, row)
  if (!line) return null
  return { sourceStart: line.sourceStart, sourceEnd: line.sourceEnd }
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

## Notes

- Keep file and diagnostic metadata outside `pretext-TUI`; pass only visible text into the package.
- Use `sourceStart` and `sourceEnd` as durable anchors for diagnostics, search hits, and copy ranges.
- Rebuild the line index when `columns` changes. Rebuild the prepared text and source index when the visible source text changes.
