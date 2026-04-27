<!-- 补建说明：该文件为后续补建，用于记录通用 terminal pane resize 如何保持 source-offset 语义锚点并重建宽度相关索引；当前进度：Task 3 首版 recipe，不包含任何 renderer 或宿主专用 resize API。 -->
# Terminal Pane Resize

Use this pattern when a host already owns a terminal pane and needs wrapped rows to reflow after the pane width changes.

`pretext-TUI` treats prepared text as width-independent. A resize should keep the prepared handle, then rebuild width-dependent line indexes and page caches for the new `columns`.

## Host Owns

- observing pane size changes
- viewport height and scroll policy
- repaint scheduling
- choosing which semantic anchor to preserve
- deciding whether to keep the top row, cursor row, active search hit, or selected range stable

## Package Owns

- reflowing the same source text into terminal-cell rows for a new column count
- rebuilding sparse line indexes for a fixed width
- materializing the requested visible page

## Incubating API Note

This recipe uses sparse line indexes and page caches. They are public and useful for large fixed-width views, but remain incubating unless a future approval record explicitly promotes them.

## Public Imports

```ts
import {
  createTerminalLineIndex,
  createTerminalPageCache,
  getTerminalLinePage,
  getTerminalLineRangeAtRow,
  materializeTerminalLinePage,
  measureTerminalLineIndexRows,
  prepareTerminal,
  type MaterializedTerminalLine,
  type PreparedTerminalText,
  type TerminalLineIndex,
} from 'pretext-tui'
```

## Preserve A Source-Offset Anchor

Do not preserve only a physical row number across resize. A row number is layout-dependent; a source offset is semantic.

```ts
function sourceOffsetAtTopRow(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  topRow: number,
): number {
  return getTerminalLineRangeAtRow(prepared, index, topRow)?.sourceStart ?? 0
}
```

After resize, find the first row whose source range reaches the anchor.

```ts
function findRowForSourceOffset(
  prepared: PreparedTerminalText,
  index: TerminalLineIndex,
  sourceOffset: number,
): number {
  const rows = measureTerminalLineIndexRows(prepared, index)
  let low = 0
  let high = Math.max(0, rows - 1)

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const line = getTerminalLineRangeAtRow(prepared, index, mid)
    if (!line) break

    if (line.sourceEnd <= sourceOffset) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return Math.min(low, Math.max(0, rows - 1))
}
```

## Rebuild Width-Dependent State

```ts
function pageAfterResize(
  text: string,
  previousColumns: number,
  previousTopRow: number,
  nextColumns: number,
  rowCount: number,
): readonly MaterializedTerminalLine[] {
  const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })
  const previousIndex = createTerminalLineIndex(prepared, { columns: previousColumns, anchorInterval: 64 })
  const anchorSourceOffset = sourceOffsetAtTopRow(prepared, previousIndex, previousTopRow)

  const nextIndex = createTerminalLineIndex(prepared, { columns: nextColumns, anchorInterval: 64 })
  const nextTopRow = findRowForSourceOffset(prepared, nextIndex, anchorSourceOffset)
  const nextCache = createTerminalPageCache(prepared, nextIndex, {
    pageSize: Math.max(rowCount, 64),
    maxPages: 6,
  })
  const page = getTerminalLinePage(prepared, nextCache, nextIndex, {
    startRow: nextTopRow,
    rowCount,
  })

  return materializeTerminalLinePage(prepared, page)
}
```

In a long-lived host, keep `prepared` around instead of calling `prepareTerminal()` inside the resize function. The example is written as a single function only to keep the flow copyable.

## Notes

- `columns`, `startColumn`, line indexes, and page caches are layout-time state.
- `whiteSpace`, `tabSize`, and width profile are prepare-time identity. If those change, prepare again.
- A host can preserve a search hit or selection by storing its `sourceStart`, then finding the row for that source offset after resize.
