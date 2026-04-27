<!-- 补建说明：该文件为后续补建，用于记录 generic agent transcript 如何只用公开 API 组合可分页 transcript、rich fragments、generic source ranges 与 append invalidation；当前进度：Phase 10 首版 recipe，保持 agent 语义和流转状态在宿主侧。 -->
# Generic Agent Transcript

Use this pattern when a host stores ordered transcript records and wants a virtual terminal viewport over the visible transcript text.

The records might represent user requests, agent responses, observations, status notes, or other product-owned transcript entries. `pretext-TUI` receives only visible text. It does not interpret roles, run work, update records, choose labels, or decide what an entry means.

## Host Owns

- transcript ids, record kinds, timestamps, persistence, retention, and streaming lifecycle
- deciding the visible label and grouping for each record
- rendering rows, badges, controls, separators, and scroll state
- side effects, safety policy, permissions, and product workflow
- mapping generic source ranges back to host records and actions

## Package Owns

- terminal-cell wrapping for the visible transcript text
- source-offset ranges for visual rows
- fixed-column page materialization and invalidation
- generic source-range lookup over inert sidecar metadata
- optional rich inline fragments and redacted diagnostics

## Incubating API Note

This recipe uses rich inline preparation, layout bundles, generic range sidecars, and append invalidation metadata. They are public and covered by package smoke tests, but remain incubating unless a future approval record explicitly promotes them.

## Public Imports

```ts
import {
  appendTerminalCellFlow,
  createTerminalLayoutBundle,
  createTerminalRangeIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalLayoutBundlePage,
  getTerminalRangesForSourceRange,
  invalidateTerminalLayoutBundle,
  prepareTerminalCellFlow,
  type PreparedTerminalCellFlow,
  type TerminalLayoutBundle,
  type TerminalLayoutBundleInvalidationResult,
  type TerminalRange,
} from 'pretext-tui'
import {
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  type MaterializedTerminalRichLine,
} from 'pretext-tui/terminal-rich-inline'
```

## Compose Records Into Visible Text

Keep the durable transcript model in the host. The package receives a string plus optional inert source ranges.

```ts
type TranscriptRecord = {
  id: string
  kind: 'request' | 'response' | 'observation' | 'status'
  text: string
}

function visibleLabel(kind: TranscriptRecord['kind']): string {
  switch (kind) {
    case 'request':
      return 'Request'
    case 'response':
      return 'Response'
    case 'observation':
      return 'Observation'
    case 'status':
      return 'Status'
  }
}

function composeTranscriptSource(records: readonly TranscriptRecord[]): {
  source: string
  ranges: readonly TerminalRange[]
} {
  let source = ''
  const ranges: TerminalRange[] = []

  for (const record of records) {
    if (source.length > 0) source += '\n\n'
    const sourceStart = source.length
    source += `${visibleLabel(record.kind)}\n${record.text}`
    ranges.push({
      id: record.id,
      kind: `agent-transcript:${record.kind}`,
      sourceStart,
      sourceEnd: source.length,
      tags: [record.kind],
      data: { recordId: record.id },
    })
  }

  return { source, ranges }
}
```

`TerminalRange.data` must stay inert JSON-like data. Keep full record objects, callbacks, permissions, and product state in the host.

## Materialize A Rich Transcript Page

Use the rich sidecar when transcript text may contain supported SGR or OSC8 metadata. Materialize rows as fragments; reconstructed ANSI text remains opt-in and is not needed for rendering.

```ts
function materializeTranscriptPage(
  records: readonly TranscriptRecord[],
  columns: number,
  startRow: number,
  rowCount: number,
): {
  rows: readonly MaterializedTerminalRichLine[]
  visibleRecordIds: readonly string[]
} {
  const { source, ranges } = composeTranscriptSource(records)
  const rich = prepareTerminalRichInline(source, {
    whiteSpace: 'pre-wrap',
    profile: 'transcript',
    unsupportedControlMode: 'sanitize',
    rawRetention: 'fingerprint',
  })
  const rangeIndex = createTerminalRangeIndex(ranges)
  const bundle = createTerminalLayoutBundle(rich.prepared, {
    columns,
    anchorInterval: 64,
    pageSize: Math.max(rowCount, 64),
    maxPages: 8,
  })
  const page = getTerminalLayoutBundlePage(rich.prepared, bundle, { startRow, rowCount })
  const rows = page.lines.map(line => materializeTerminalRichLineRange(rich, line))
  const visibleRecordIds = [
    ...new Set(
      page.lines.flatMap(line =>
        getTerminalRangesForSourceRange(rangeIndex, {
          sourceStart: line.sourceStart,
          sourceEnd: line.sourceEnd,
        }).map(range => range.id),
      ),
    ),
  ]

  return { rows, visibleRecordIds }
}
```

The returned ids are just source-range matches. The host decides how to highlight, collapse, select, or navigate the corresponding records.

## Append Visible Transcript Text

For append-heavy transcripts, keep an appendable flow for the visible text and invalidate the width-dependent bundle after new text is accepted by the host.

```ts
type TranscriptFlowView = {
  flow: PreparedTerminalCellFlow
  bundle: TerminalLayoutBundle
}

function createTranscriptFlowView(source: string, columns: number): TranscriptFlowView {
  const flow = prepareTerminalCellFlow(source, { whiteSpace: 'pre-wrap' })
  return {
    flow,
    bundle: createTerminalLayoutBundle(getTerminalCellFlowPrepared(flow), {
      columns,
      generation: getTerminalCellFlowGeneration(flow),
      anchorInterval: 64,
      pageSize: 64,
      maxPages: 8,
    }),
  }
}

function appendTranscriptVisibleText(
  view: TranscriptFlowView,
  appendedText: string,
): {
  view: TranscriptFlowView
  invalidation: TerminalLayoutBundleInvalidationResult
} {
  const appended = appendTerminalCellFlow(view.flow, appendedText)
  const prepared = getTerminalCellFlowPrepared(appended.flow)
  const invalidation = invalidateTerminalLayoutBundle(prepared, view.bundle, appended.invalidation)

  return {
    view: { flow: appended.flow, bundle: view.bundle },
    invalidation,
  }
}
```

Append invalidation is about terminal text caches only. Record lifecycle, retention, retries, and grouping remain host-owned.

## Notes

- Use source offsets and record ids as semantic anchors; physical rows change when `columns` changes.
- Store full transcript metadata outside `pretext-TUI`; put only inert ids, tags, and JSON-like payload hints in `TerminalRange`.
- Keep rich output fragment-first. Link opening, copy policy, and diagnostic display are host decisions.
- Rebuild prepared text and range indexes when the visible transcript source changes outside append-only growth.
