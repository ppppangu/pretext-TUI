# pretext-TUI

Long terminal text should not have to be rewrapped from scratch just to draw one viewport.

Host-neutral terminal-cell text layout primitives for TUIs, CLIs, log viewers, transcript panes, editor panes, terminal dashboards, and other text-heavy terminal hosts.

`pretext-TUI` takes the best idea from Pretext - separate text analysis from layout and materialization - and moves it from browser pixels into terminal cells. It gives terminal hosts a deterministic `prepare -> layout -> range -> materialize` pipeline for Unicode text, ANSI-style rich metadata, source offsets, and large scrollable buffers.

It is not a renderer, not a terminal emulator, and not a full TUI framework. It is the text layout engine you put under one.

## Why

Modern terminal apps are becoming text-heavy again:

- command output, tool logs, patches, stack traces, and diffs
- structured terminal transcripts, command/session logs, review streams, notebooks, and source preview panes
- terminal multiplexer panes that need resize-aware and scroll-aware layout data
- editor plugins and terminal buffers that need source-aware wrapping
- rich ANSI logs with colors and links
- notes, markdown-ish prose, multilingual text, emoji, tabs, and CJK in the same viewport

The naive path is to wrap the whole string whenever the terminal resizes or the user scrolls. That works until the transcript gets large, the viewport jumps to row 2,000, or every render has to rebuild strings just to find the visible rows.

`pretext-TUI` is built around a different contract:

```text
visible terminal text
-> prepareTerminal(text, options)
-> walk rows as ranges
-> materialize only the rows the host needs
```

## Performance Snapshot

Optional local comparison command from the repository:

```sh
bun run benchmark:competitive:tui
```

This is a text-layout primitive comparison, not a full application renderer or event-loop benchmark and not a release guarantee. The command prints OS/runtime/CPU/dependency/git metadata so you can reproduce a local sample on your own machine.

For report-shaped evidence with raw samples, statistics, source hashes, runtime metadata, dependency versions, and comparator semantic caveats, use:

```sh
bun run benchmark:evidence:tui
```

That writes a local `pretext-tui-benchmark-evidence@1` JSON report under `docs/evidence/benchmark-reports/`. Treat report ids, not copied numbers, as the durable citation target.

Evidence reports include a hot viewport-seeking workload over a long fixed-column terminal buffer: prepared text, sparse row index, and page cache are reused, and only requested rows are materialized.

Treat local comparison output as workload-specific evidence: cache state, fixed columns, reused indexes, comparator semantics, runtime, hardware, and corpus all matter. Hard numbers belong in reproducible evidence reports, not copied into the public package story.

The honest read: `pretext-TUI` does more semantic work than a tiny greedy one-shot wrapper, so simple one-shot wrapping can favor smaller semantics-lite baselines. Rich SGR wrapping is about metadata structure, not headline timing. Its design priorities are long-buffer paging, source-aware ranges, viewport seeking, resize reuse, and structured rich metadata.

The release benchmark gate is separate:

```sh
bun run benchmark-check:tui
```

That gate checks deterministic counters and conservative wall-clock budgets for the package itself. Its explicit validation instrumentation is default-off in normal runtime code and tracks prepared geometry reuse plus remaining materialization-time segmentation as regression telemetry. The competitive benchmark is an optional local comparison harness, not a release guarantee and not a full application renderer or event-loop benchmark.

## What Makes It Different

- **Prepare once, relayout many times.** Reusable text analysis, terminal-width preparation, and source metadata live in prepared state. Width-dependent line/page caches stay separate.
- **Terminal cells, not browser pixels.** Width is integer terminal cells. There is no DOM, Canvas, CSS, font string, or browser measurement contract in the active runtime.
- **Ranges before strings.** You can walk line ranges without materializing text, then materialize only visible rows.
- **Large text primitives.** Sparse row anchors, fixed-column page caches, source-offset lookup, and append invalidation metadata are designed for long transcripts and logs.
- **Rich metadata sidecar.** Plain text stays strict. ANSI `SGR` and `OSC8` links use an opt-in rich path that keeps style/link metadata separate from layout.
- **Host-neutral by design.** Works under a renderer, pane system, CLI, editor plugin, terminal dashboard, or terminal UI framework without importing any of them.

## Target Use Cases

`pretext-TUI` is a good fit when the host already owns rendering/input, but needs better terminal text layout data.

| Host scenario | Why it helps |
| --- | --- |
| Structured terminal transcripts | Command/session logs, review streams, notebooks, patches, code, tables, and prose can share one source-aware wrapping and visible-window materialization path. |
| Long log viewers | Sparse anchors and page caches avoid wrapping and materializing the entire buffer for every scroll jump. |
| Terminal panes | Resize can relayout prepared text across new column widths without carrying browser or renderer state. |
| Editor and terminal plugins | Source offsets and grapheme-safe ranges are useful for search, copy, cursor mapping, diagnostics, and preview panes. |
| Rich ANSI transcript viewers | The rich sidecar preserves inline style/link spans while keeping unsupported terminal controls out of core layout. |
| Multilingual terminal UIs | CJK, emoji, combining marks, tabs, zero-width breaks, and soft hyphens are handled through deterministic terminal-width profiles. |

## Install

```sh
npm install pretext-tui
```

The package root exports the terminal API. `./terminal` is an alias for the same API. `./terminal-rich-inline` is the opt-in rich metadata path.

## Core API

```ts
import {
  layoutTerminal,
  materializeTerminalLineRange,
  prepareTerminal,
  walkTerminalLineRanges,
} from 'pretext-tui'

const prepared = prepareTerminal('hello 世界 🚀\nstatus\tok', {
  whiteSpace: 'pre-wrap',
  tabSize: 4,
})

const stats = layoutTerminal(prepared, { columns: 40 })
console.log(stats.rows)

walkTerminalLineRanges(prepared, { columns: 40 }, line => {
  const row = materializeTerminalLineRange(prepared, line)
  console.log(row.text)
})
```

`prepareTerminal()` performs the reusable analysis pass. Layout APIs work in terminal columns and return row/range metadata. Materializers turn only requested ranges into renderable text.

## Large Text Paging

For large terminal buffers, use the fixed-column virtual text helpers:

These helpers are public but incubating before the first stable `0.1` contract. The stable core remains `prepare -> layout/range -> materialize`; sparse line indexes, page caches, source-offset indexes, and append invalidation metadata may still be refined while staying host-neutral.

```ts
import {
  createTerminalLineIndex,
  createTerminalPageCache,
  getTerminalLinePage,
  materializeTerminalLinePage,
  prepareTerminal,
} from 'pretext-tui'

const prepared = prepareTerminal(transcript, { whiteSpace: 'pre-wrap', tabSize: 4 })
const index = createTerminalLineIndex(prepared, { columns: 80, anchorInterval: 64 })
const cache = createTerminalPageCache(prepared, index, { pageSize: 32, maxPages: 8 })

const page = getTerminalLinePage(prepared, cache, index, {
  startRow: 1200,
  rowCount: 24,
})

const visibleRows = materializeTerminalLinePage(prepared, page)
```

These helpers cache range metadata, not rendered strings. The handles are opaque and bound to the prepared text/index that created them, so hosts can use them without depending on anchor or page internals.

Append support is deliberately honest today: the public API exposes bounded invalidation metadata, while the current implementation still counts full reprepare cost. That leaves room for future chunked storage without pretending it already exists.

## Rich ANSI Metadata

Plain core input rejects raw terminal controls. For inline style/link metadata, use the rich sidecar:

The `pretext-tui/terminal-rich-inline` entry point is public but incubating. Treat it as policy-bound metadata extraction, not a terminal emulator or renderer.

```ts
import {
  TERMINAL_START_CURSOR,
} from 'pretext-tui'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
} from 'pretext-tui/terminal-rich-inline'

const prepared = prepareTerminalRichInline(
  '\x1b[31mred\x1b[0m and \x1b]8;;https://example.test\x1b\\link\x1b]8;;\x1b\\',
)

const line = layoutNextTerminalRichLineRange(
  prepared,
  TERMINAL_START_CURSOR,
  { columns: 80 },
)

if (line) {
  const rich = materializeTerminalRichLineRange(prepared, line)
  console.log(rich.fragments)

  const ansi = materializeTerminalRichLineRange(prepared, line, {
    ansiText: 'sgr-osc8',
  })
  if (ansi.ansiText) console.log(ansi.ansiText)
}
```

The rich path supports inline `SGR` style spans and `OSC8` links. Unsupported terminal control sequences are rejected or sanitized so cursor movement, erase commands, alt-screen switches, mouse modes, clipboard controls, and similar behaviors never enter layout.

Security defaults are conservative:

- Full raw terminal input is not exposed on prepared rich handles.
- Diagnostics are redacted, capped, and sample-free by default; they carry offsets, length, family, and fingerprint instead of full unsafe sequences.
- `ansiText` reconstruction is explicit opt-in through `materializeTerminalRichLineRange(..., { ansiText })`.
- OSC8 links are policy-checked for allowed schemes, credentials, and URI length. Opening links is always host-owned behavior.
- Bidi format controls are sanitized by default and can be rejected by policy.

## Terminal Semantics

The active contract is terminal-first:

- width unit: terminal cells
- height unit: terminal rows
- fitting: exact integer comparison
- tabs: dynamic layout-time segments
- plain core input: sanitized visible text
- ANSI/OSC8: rich sidecar only
- unsupported terminal controls: rejected or sanitized
- source offsets: UTF-16 over sanitized visible text
- bidi/shaping/rendering policy: host-owned beyond logical-order layout metadata

Repository contributors can find the full terminal contract, host boundary, and public/private API boundary under `docs/contracts/`. The npm package README summarizes those contracts because repository-only docs are not shipped in the package tarball.

## Validation

The publish gate is:

```sh
bun run prepublishOnly
```

It runs TUI typechecks, validation typechecks, static no-browser gating, TUI tests, oracle checks, corpus checks, deterministic fuzzing, benchmark guardrails, terminal demo checks, API snapshot checks, and package smoke tests.

Useful focused commands:

```sh
bun run test:tui
bun run benchmark-check:tui
bun run benchmark:competitive:tui
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

Repository scripts are for contributors cloning this repo. The published npm package ships the runtime files and README, not the benchmark harness.

## Package Boundary

`pretext-TUI` owns text preparation, wrapping, ranges, source offsets, materialization, rich inline metadata, and large-text paging primitives.

Host applications own rendering, input, panes, focus, scrolling, persistence, file operations, command execution, link opening, and product behavior.

This keeps the package useful for many hosts without bundling application-specific adapter code for any one of them.

Repository contributors can use `docs/roadmap/` for future adoption planning and `docs/marketing/` for launch-copy guardrails. Those files are planning artifacts, not shipped package documentation.

## Provenance And Product Boundary

`pretext-TUI` began as a migration of the MIT-licensed upstream Pretext architecture and code lineage from `@chenglou/pretext`, but the active runtime is now terminal-cell layout instead of browser text measurement.

This package is independently maintained as `pretext-tui`. It is not upstream Pretext, not a browser text-measurement package, and not a drop-in replacement for `@chenglou/pretext`.

Kept from Pretext:

- the two-phase `prepare -> layout` idea
- range-based manual layout
- Unicode-aware text analysis as the foundation
- host-controlled rendering instead of bundled UI

Added or changed for `pretext-TUI`:

- terminal width profiles and integer-cell fitting
- browser/DOM/Canvas-free runtime and validation gates
- terminal-first public exports
- rich `SGR`/`OSC8` sidecar
- sparse row anchors and fixed-column page caches
- source-offset lookup for terminal rows/cursors
- append invalidation metadata for growing transcripts
- deterministic TUI oracle, corpus, fuzz, benchmark, demo, and package smoke gates

Thanks to the original Pretext project and its text-layout research lineage for the architectural seed. `pretext-TUI` carries that idea into modern terminal applications while keeping a separate package identity and product boundary.
