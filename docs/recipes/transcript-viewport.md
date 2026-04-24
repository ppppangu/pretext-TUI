<!-- 补建说明：该文件为后续补建，用于记录结构化 transcript/stream viewport 如何只用公开 API 组合分页、行范围与 source range；当前进度：Task 3 首版 recipe，作为通用宿主集成示例而非特定应用适配。 -->
# Structured Transcript Viewport

Use this pattern when a host has many ordered text blocks and wants a virtual terminal viewport over the combined text.

The blocks might be chat turns, command entries, notebook cells, build steps, review comments, or any other host-owned records. `pretext-TUI` does not need to know their domain meaning. It only receives visible terminal text and returns row/range/source-offset data.

## Host Owns

- block ids, block kinds, timestamps, persistence, and loading
- scroll state, focus, keyboard and mouse input
- rendering rows, borders, headers, badges, and status bars
- mapping source ranges back to domain actions
- deciding when source text changes and when indexes must be rebuilt

## Package Owns

- terminal-cell wrapping
- source-offset ranges per visual row
- sparse row lookup
- page materialization for the current viewport

## Incubating API Note

This recipe uses sparse line indexes and page caches. They are public and covered by package smoke tests, but remain incubating until the first stable `0.1` API contract.

## Public Imports

```ts
import {
  createTerminalLineIndex,
  createTerminalPageCache,
  getTerminalLinePage,
  materializeTerminalLinePage,
  prepareTerminal,
  type MaterializedTerminalLine,
  type TerminalLineRange,
} from 'pretext-tui'
```

## Compose Host Blocks Into One Visible Source

Keep host metadata in a side table. The package receives only the visible text.

```ts
type HostBlock = {
  id: string
  kind: 'note' | 'input' | 'output' | 'diagnostic'
  text: string
}

type BlockRange = {
  block: HostBlock
  sourceStart: number
  sourceEnd: number
}

function buildViewportSource(blocks: readonly HostBlock[]): {
  source: string
  ranges: readonly BlockRange[]
} {
  let source = ''
  const ranges: BlockRange[] = []

  for (const block of blocks) {
    if (source.length > 0) source += '\n'
    const sourceStart = source.length
    source += block.text
    ranges.push({ block, sourceStart, sourceEnd: source.length })
  }

  return { source, ranges }
}
```

## Build A Paged View

`PreparedTerminalText` is width-independent. The line index and page cache are width-dependent and should be rebuilt when `columns` changes.

```ts
function buildVisiblePage(blocks: readonly HostBlock[], columns: number, startRow: number, rowCount: number): {
  rows: readonly MaterializedTerminalLine[]
  ranges: readonly TerminalLineRange[]
  blockRanges: readonly BlockRange[]
} {
  const { source, ranges: blockRanges } = buildViewportSource(blocks)
  const prepared = prepareTerminal(source, { whiteSpace: 'pre-wrap' })
  const lineIndex = createTerminalLineIndex(prepared, {
    columns,
    anchorInterval: 64,
    generation: 0,
  })
  const pageCache = createTerminalPageCache(prepared, lineIndex, {
    pageSize: Math.max(rowCount, 64),
    maxPages: 8,
  })
  const page = getTerminalLinePage(prepared, pageCache, lineIndex, { startRow, rowCount })

  return {
    rows: materializeTerminalLinePage(prepared, page),
    ranges: page.lines,
    blockRanges,
  }
}
```

## Map A Visible Row Back To Host Metadata

Rows expose `sourceStart` and `sourceEnd`. The host decides what that means for its own records.

```ts
function findBlockForLine(line: TerminalLineRange, blockRanges: readonly BlockRange[]): HostBlock | null {
  return blockRanges.find(range => line.sourceStart >= range.sourceStart && line.sourceStart < range.sourceEnd)?.block ?? null
}
```

For very large block tables, replace the linear lookup with a host-owned interval index. Keep that index outside `pretext-TUI` because it stores domain metadata, not terminal layout state.

## Notes

- Use source offsets as semantic anchors for selection, search hits, and jump targets.
- Keep block metadata separate from prepared text. This preserves a small public API surface and avoids mixing domain state into the terminal layout kernel.
- For append-heavy streams, `prepareTerminalCellFlow()` and append invalidation metadata can be used as an incubating public surface, but it still reports current full-reprepare strategy until true chunked append is implemented.
