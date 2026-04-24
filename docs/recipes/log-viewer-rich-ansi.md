<!-- 补建说明：该文件为后续补建，用于记录 rich ANSI log viewer 如何通过公开 rich sidecar 与核心 page cache 组合成安全、分页、fragment-first 的长文本视图；当前进度：Task 3 首版 recipe，不包含链接打开或宿主动作实现。 -->
# Log Viewer With Rich ANSI

Use this pattern when a host needs to show terminal logs that may contain SGR styles or OSC8 hyperlinks.

The rich sidecar is opt-in and incubating. It parses supported inline metadata into fragments and diagnostics. Unsupported controls are sanitized or rejected according to policy. The host still owns link opening, clipboard behavior, persistence, filtering, and rendering.

## Host Owns

- loading and retaining log bytes or decoded text
- deciding which policy profile to use
- rendering fragments into the chosen UI toolkit
- opening links or ignoring links
- copy/export behavior
- search UI, filters, and domain-specific log grouping

## Package Owns

- sanitizing supported rich inline terminal text
- exposing visible text, redacted diagnostics, SGR fragments, and OSC8 link metadata
- terminal-cell wrapping and page caching through the nested prepared handle
- optional policy-bound ANSI reconstruction when explicitly requested

## Incubating API Note

This recipe uses the incubating `pretext-tui/terminal-rich-inline` entry point plus sparse line indexes and page caches. Keep rich output fragment-first and treat ANSI reconstruction as an explicit export choice, not a default rendering path.

## Public Imports

```ts
import {
  createTerminalLineIndex,
  createTerminalPageCache,
  getTerminalLinePage,
} from 'pretext-tui'
import {
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  type MaterializedTerminalRichLine,
} from 'pretext-tui/terminal-rich-inline'
```

## Prepare Rich Log Text

```ts
function prepareRichLog(rawLog: string) {
  return prepareTerminalRichInline(rawLog, {
    whiteSpace: 'pre-wrap',
    profile: 'transcript',
    unsupportedControlMode: 'sanitize',
    rawRetention: 'fingerprint',
    bidiFormatControls: 'sanitize',
    osc8: {
      allowedSchemes: ['http:', 'https:'],
      allowCredentials: false,
      maxUriCodeUnits: 2048,
    },
    diagnostics: {
      maxDiagnostics: 100,
      sampleCodeUnits: 0,
    },
  })
}
```

The default policy does not expose full raw terminal input, does not emit reconstructed ANSI text, and does not include diagnostic samples. Opt in only when the host has a clear need.

## Page Rich Fragments

Use the nested `prepared` handle for the core line index and page cache, then materialize each range through the rich sidecar.

```ts
function materializeRichLogPage(rawLog: string, columns: number, startRow: number, rowCount: number): {
  rows: readonly MaterializedTerminalRichLine[]
  diagnostics: readonly unknown[]
} {
  const rich = prepareRichLog(rawLog)
  const index = createTerminalLineIndex(rich.prepared, {
    columns,
    anchorInterval: 64,
    generation: 0,
  })
  const cache = createTerminalPageCache(rich.prepared, index, {
    pageSize: Math.max(rowCount, 64),
    maxPages: 8,
  })
  const page = getTerminalLinePage(rich.prepared, cache, index, { startRow, rowCount })

  return {
    rows: page.lines.map(line => materializeTerminalRichLineRange(rich, line)),
    diagnostics: rich.diagnostics,
  }
}
```

Each row contains plain text plus rich fragments. A renderer can paint fragments, but the package does not define paint behavior.

## Explicit ANSI Reconstruction

If a host needs ANSI text for export, request it explicitly. The policy may still cap or disable output.

```ts
function materializeAnsiForExport(rawLog: string, columns: number): string | undefined {
  const rich = prepareRichLog(rawLog)
  const index = createTerminalLineIndex(rich.prepared, { columns })
  const page = getTerminalLinePage(
    rich.prepared,
    createTerminalPageCache(rich.prepared, index),
    index,
    { startRow: 0, rowCount: 1 },
  )
  const firstLine = page.lines[0]
  if (!firstLine) return undefined

  return materializeTerminalRichLineRange(rich, firstLine, { ansiText: 'sgr' }).ansiText
}
```

## Notes

- Treat `fragments[].link` as inert metadata. Link opening belongs to the host.
- Treat diagnostics as redacted telemetry. Do not reconstruct blocked control sequences from diagnostics.
- Use `audit-strict` when the host wants rejection-oriented behavior over permissive sanitization.
- Keep raw log retention outside the package if a product must store full original output. The public rich result intentionally exposes only policy-bound summaries.
