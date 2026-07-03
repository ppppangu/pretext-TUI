<!-- 补建说明：该文件为后续补建，用于给 TUI/CLI 库作者提供一个短小完整的 long transcript viewport 采用流程；当前进度：首版覆盖 prepare 一次、resize 重排、visible rows 分页、materialize 和可选 source range metadata，且只使用公开入口。 -->
# Quickstart Adoption

Use this recipe when you want to answer the first adoption question: can this package prepare a long transcript once, page the visible rows, survive resize, and keep source metadata available?

The stable core remains `prepare -> layout/range -> materialize`. This recipe adds the public fixed-column layout bundle because long transcripts usually need page lookup as soon as the first demo scrolls past the top screen.

## Host Owns

- transcript storage and lifecycle
- viewport start row, height, and resize events
- rendering, focus, input, scroll behavior, and copy behavior
- deciding which source offset or row stays anchored across resize

## Package Owns

- terminal-cell preparation and wrapping
- fixed-column range/page lookup
- row materialization for the requested viewport
- source-offset projection data

## Incubating API Note

This recipe uses `createTerminalLayoutBundle()`, `getTerminalLayoutBundlePage()`, and `projectTerminalSourceOffset()`. These surfaces are public and release-gated, but remain incubating unless a future approval record promotes them.

## Public Imports

```ts
import {
  createTerminalLayoutBundle,
  getTerminalLayoutBundlePage,
  layoutTerminal,
  materializeTerminalLinePage,
  prepareTerminal,
  projectTerminalSourceOffset,
  type MaterializedTerminalLine,
  type PreparedTerminalText,
  type TerminalLayoutBundle,
} from 'pretext-tui'
```

## Prepare Once

Prepare the visible terminal source once. The prepared handle is width-independent, so it can be reused across resize.

```ts
function prepareTranscript(transcript: string): PreparedTerminalText {
  return prepareTerminal(transcript, {
    whiteSpace: 'pre-wrap',
    tabSize: 4,
  })
}
```

## Page Visible Rows

Build width-dependent state for the current columns, then materialize only the requested rows.

```ts
type TranscriptViewport = {
  bundle: TerminalLayoutBundle
  rows: readonly MaterializedTerminalLine[]
  totalRows: number
}

function pageTranscript(
  prepared: PreparedTerminalText,
  columns: number,
  startRow: number,
  rowCount: number,
): TranscriptViewport {
  const totalRows = layoutTerminal(prepared, { columns }).rows
  const bundle = createTerminalLayoutBundle(prepared, {
    columns,
    anchorInterval: 64,
    pageSize: Math.max(32, rowCount),
    maxPages: 8,
  })
  const page = getTerminalLayoutBundlePage(prepared, bundle, {
    startRow,
    rowCount,
  })

  return {
    bundle,
    rows: materializeTerminalLinePage(prepared, page),
    totalRows,
  }
}
```

## Resize Reflow

On resize, keep the same `prepared` handle and rebuild only the width-dependent bundle. A production host would choose its own anchor policy; this simple example reuses the current `startRow`.

```ts
const prepared = prepareTranscript(rawTranscriptText)

const firstViewport = pageTranscript(prepared, 80, 0, 24)
const resizedViewport = pageTranscript(prepared, 52, 0, 24)

console.log(firstViewport.totalRows)
console.log(resizedViewport.rows.map(row => row.text))
```

## Optional Source Metadata

Use source offsets as durable anchors for search hits, selection ranges, diagnostics, and row inspection. Projection returns row/column data without the package owning your UI state.

```ts
function inspectSourceOffset(
  prepared: PreparedTerminalText,
  bundle: TerminalLayoutBundle,
  sourceOffset: number,
) {
  const projection = projectTerminalSourceOffset(prepared, bundle, sourceOffset)

  return {
    row: projection.row,
    column: projection.column,
    exact: projection.exact,
    sourceOffset: projection.sourceOffset,
  }
}
```

## Notes

- Prepare again only when the visible source text or prepare-time policy changes.
- Rebuild the layout bundle when `columns`, `startColumn`, page size, or cache policy changes.
- Keep conformance and release checks in the repository: `bun run conformance-kit-check`, `bun run scripts/tui-conformance-kit-generate.ts --check`, and `bun run release-gate:tui`.
