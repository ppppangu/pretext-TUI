# pretext-TUI

[![npm version](https://img.shields.io/npm/v/pretext-tui.svg)](https://www.npmjs.com/package/pretext-tui)
[![TUI validation](https://github.com/ppppangu/pretext-TUI/actions/workflows/ci-tui.yml/badge.svg)](https://github.com/ppppangu/pretext-TUI/actions/workflows/ci-tui.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ppppangu/pretext-TUI/blob/main/LICENSE)

[Website](https://pretext-tui.pages.dev/) · [npm](https://www.npmjs.com/package/pretext-tui) · [Docs & evidence](https://github.com/ppppangu/pretext-TUI/tree/main/docs) · [Changelog](https://github.com/ppppangu/pretext-TUI/blob/main/CHANGELOG.md)

**Long terminal text should not rewrap an entire buffer just to draw one viewport.**

`pretext-TUI` is a host-neutral terminal-cell text layout core for long terminal text: prepare once, seek rows by range, and materialize only the viewport the host needs. It is built for TUIs, CLIs, log viewers, transcript panes, editor panes, terminal dashboards, and other text-heavy terminal hosts.

It is not a renderer, not a terminal emulator, and not a full TUI framework. It is the text layout engine you put under one.

```text
visible terminal text
  -> prepareTerminal(text, options)        one reusable Unicode/width analysis pass
  -> layoutTerminal(columns) / row ranges  arithmetic-only layout over terminal cells
  -> materialize only the visible rows     strings on demand, not per frame
```

## Choose An API Route

| Scenario | Start with | Public entry point | Stability and evidence |
| --- | --- | --- | --- |
| 15-minute adoption check | Stable core seven: `prepareTerminal`, `layoutTerminal`, `measureTerminalLineStats`, `walkTerminalLineRanges`, `layoutNextTerminalLineRange`, `materializeTerminalLineRange`, `TERMINAL_START_CURSOR` | `pretext-tui` or `pretext-tui/terminal` | Stable as of `0.1.0`; see [Quickstart Adoption](docs/recipes/quickstart-adoption.md). |
| Long logs and deep scroll | `createTerminalLayoutBundle()`, fixed-column page queries, and `materializeTerminalLinePage()` | `pretext-tui` | Public but incubating; caches range metadata for requested rows. |
| Rich ANSI transcripts | `prepareTerminalRichInline()` plus rich line materialization | `pretext-tui/terminal-rich-inline` | Public but incubating; SGR/OSC8 metadata is opt-in and policy-bound. |
| Search, selection, and source mapping | Source-first data APIs: source indexes, coordinate projection, search sessions, range sidecars, selection extraction | `pretext-tui` | Public but incubating; hosts own UI state, highlighting, copy behavior, and domain actions. |
| Conformance and technical review | Terminal contracts, evidence docs, `bun run conformance-kit-check`, `bun run release-gate:tui` | Repository docs and validation scripts | Repo-only conformance data stays outside the npm tarball unless a separate publish-surface decision lands. |

## Why

Modern terminal apps behave like text-heavy products again:

- command output, tool logs, patches, stack traces, and diffs
- structured terminal transcripts, command/session logs, review streams, notebooks, and source preview panes
- multiplexer-like panes that must survive resize and deep scroll jumps
- editor plugins and terminal buffers that need source-aware wrapping
- rich ANSI logs with colors and links
- prose, markdown-ish notes, CJK, emoji, tabs, combining marks, and zero-width breaks in the same viewport

The usual answer is to rewrap the whole string whenever the terminal resizes or the user scrolls. That works until the transcript gets long, the viewport jumps to row 2,000, and every frame rebuilds strings just to find twelve visible rows.

`pretext-TUI` flips the order: rows and ranges first, strings only when the viewport asks.

## Quickstart

```sh
npm install pretext-tui@0.2.1
```

```ts
import {
  layoutTerminal,
  materializeTerminalLineRange,
  prepareTerminal,
  walkTerminalLineRanges,
} from 'pretext-tui'

// One reusable analysis pass: segmentation, terminal widths, source offsets.
const prepared = prepareTerminal('hello 世界 🚀\nstatus\tok', {
  whiteSpace: 'pre-wrap',
  tabSize: 4,
})

// Arithmetic-only layout: how many rows at 40 columns?
const stats = layoutTerminal(prepared, { columns: 40 })
console.log(stats.rows)

// Walk row ranges without building strings, then materialize only what you show.
walkTerminalLineRanges(prepared, { columns: 40 }, line => {
  const row = materializeTerminalLineRange(prepared, line)
  console.log(row.text)
})
```

Resize is just another layout pass over the same prepared text — no re-analysis. The package root and `pretext-tui/terminal` export the same terminal API; `pretext-tui/terminal-rich-inline` is the opt-in rich ANSI metadata path. For the copyable long-transcript adoption flow, see [docs/recipes/quickstart-adoption.md](docs/recipes/quickstart-adoption.md).

### See It Run

From a repository clone:

```sh
bun install
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

```text
[1] row-count precomputation
  52 cols -> 31 rows

[2] resize reflow
  36 cols -> 41 rows
  52 cols -> 31 rows
  68 cols -> 27 rows

[3] visible window start=0 size=12
001 | $ pretext-tui demo --profile terminal-unicode-  [w=46, break=wrap, source=0:46]
002 | narrow@1  [w=8, break=hard, source=46:54]
003 | [09:41:02] INFO  preparing terminal transcript  [w=46, break=hard, source=55:101]
004 | [09:41:02] WARN  long URL will wrap:   [w=37, break=wrap, source=102:139]
...
```

Every materialized row carries its cell width, break kind, and UTF-16 source range — the metadata a host needs for search, selection, copy, cursor mapping, and diagnostics.

## Long Buffers: Pages, Not Re-Wraps

For large terminal buffers, the fixed-column virtual text helpers turn deep scroll jumps into cache lookups instead of whole-buffer work. `createTerminalLayoutBundle()` is the convenience handle when one viewport needs a source-offset index, sparse row index, and page cache that invalidate together.

```ts
import {
  createTerminalLayoutBundle,
  getTerminalLayoutBundlePage,
  materializeTerminalLinePage,
  prepareTerminal,
} from 'pretext-tui'

const prepared = prepareTerminal(transcript, { whiteSpace: 'pre-wrap', tabSize: 4 })
const bundle = createTerminalLayoutBundle(prepared, {
  columns: 80,
  anchorInterval: 64,
  pageSize: 32,
  maxPages: 8,
})

// Jump straight to row 1200 — sparse anchors + page cache, no full rewrap.
const page = getTerminalLayoutBundlePage(prepared, bundle, {
  startRow: 1200,
  rowCount: 24,
})

const visibleRows = materializeTerminalLinePage(prepared, page)
```

These helpers cache range metadata, not rendered strings. The handles are opaque and bound to the prepared text that created them, so hosts can use them without depending on anchor or page internals. Lower-level line-index and page-cache primitives remain available for custom choreography. The paging helpers are public but incubating (see [Stability](#stability)); the stable core remains `prepare -> layout/range -> materialize`.

For growing transcripts there is incubating append support: append-only chunked storage behind the opaque `PreparedTerminalCellFlow` handle, plus tail-follow helpers (`getTerminalLayoutBundleTailPage`, `getTerminalLineIndexTailRanges`, `measureTerminalLayoutBundleRows`) so follow-mode viewports can fetch the last rows of a growing buffer with bounded replay from retained anchors instead of replaying from row zero after every append. The release benchmark gate includes 1,000-small-append workloads that assert no full-reprepare fallback and bounded analyzed source units per append. Arbitrary insert/delete/replace editing, destructive prefix eviction, host retention policy, and UI lifecycle stay outside this package.

## What Makes It Different

- **Prepare once, relayout many times.** Reusable text analysis, terminal-width preparation, and source metadata live in prepared state. Width-dependent line/page caches stay separate.
- **Terminal cells, not browser pixels.** Width is integer terminal cells. No DOM, Canvas, CSS, font string, or browser measurement contract anywhere in the active runtime.
- **Ranges before strings.** You can walk line ranges without materializing text, then materialize only visible rows.
- **Large text primitives.** Sparse row anchors, fixed-column page caches, source-offset lookup, and append invalidation metadata are designed for long transcripts and logs.
- **Generic range sidecar.** Hosts can index source ranges with inert ids, kinds, tags, and data without teaching the package any application semantics.
- **Source-first search sessions.** Hosts can search sanitized visible source text and project hits into rows only when they need layout coordinates.
- **Rich metadata sidecar.** Plain text stays strict. ANSI `SGR` and `OSC8` links use an opt-in rich path that keeps style/link metadata separate from layout.
- **Host-neutral by design.** Works under a renderer, pane system, CLI, editor plugin, terminal dashboard, or terminal UI framework without importing any of them.

## Where It Fits

`pretext-TUI` is a good fit when the host already owns rendering and input, but needs better terminal text layout data.

| Host scenario | Why it helps |
| --- | --- |
| Structured terminal transcripts | Command/session logs, review streams, notebooks, patches, code, tables, and prose share one source-aware wrapping and visible-window materialization path. |
| Long log viewers | Sparse anchors and page caches let fixed-column viewports reuse range/page metadata for repeated jumps instead of treating every jump as a fresh whole-buffer problem. |
| Terminal panes | Resize relayouts prepared text across new column widths without carrying browser or renderer state. |
| Editor and terminal plugins | Source offsets and grapheme-safe ranges power host-owned search, selection, copy, cursor mapping, diagnostics, and preview panes. |
| Structured block metadata | Generic source ranges map visible rows back to host blocks, diagnostics, records, or annotations without a host adapter. |
| Rich ANSI transcript viewers | The rich sidecar preserves inline style/link spans while keeping unsupported terminal controls out of core layout. |
| Multilingual terminal UIs | CJK, emoji, combining marks, tabs, zero-width breaks, and soft hyphens are handled through deterministic terminal-width profiles. |

## Performance, Honestly

`pretext-TUI` is architected for the workloads where long-text hosts actually hurt — repeated viewport seeks over a long prepared buffer, resize reuse, and source-aware ranges — not for winning one-shot wrapping micro-races.

For a tactile feel on your own machine, from a repository clone:

```sh
bun run demo:compare:tui            # frame-budget meters: full-rewrap loop vs prepared + page-cache loop
bun run benchmark:competitive:tui   # local text-layout comparison with full environment metadata
bun run benchmark:evidence:tui      # report-shaped evidence JSON with raw samples and statistics
```

In local optional text-layout evidence report `competitive-tui-20260615-05a8d54-clean-ad380eea`, workload `large-page-seek` shows hot fixed-column large-page seeking with prepared text, sparse row index, and page cache reused. The JSON report under [`docs/evidence/benchmark-reports/`](https://github.com/ppppangu/pretext-TUI/tree/main/docs/evidence/benchmark-reports) carries raw samples, timing statistics, OS/CPU/runtime/dependency metadata, and comparator semantic caveats. Treat report ids, not copied numbers, as the durable citation target.

The honest read: `pretext-TUI` does more semantic work than a tiny greedy one-shot wrapper, so simple one-shot wrapping can favor smaller semantics-lite baselines, and rich SGR wrapping is about metadata structure, not headline timing. These are local, workload-specific text-layout comparisons — not renderer or event-loop benchmarks, and not a release guarantee.

Separately from the optional comparison harness, every release runs deterministic performance gates: `bun run benchmark-check:tui` checks reuse counters and conservative wall-clock budgets for the package itself, and `bun run memory-budget-check:tui` checks a documented memory model for kernel-owned structures (layout bundles, range indexes, search sessions, selection extraction, rich sidecars, append-only cell flows). Those gates are internal release evidence, not public performance benchmarks.

## Beyond Wrapping: Host Workflow Surfaces

The stable core is `prepare -> layout/range -> materialize`. Around it, the package ships public but incubating surfaces for the workflows real hosts build next. Incubating means shipped, tested, and gated — but still allowed to be refined before promotion (see [Stability](#stability)).

### Coordinate And Source Mapping

Projection helpers map between UTF-16 source offsets, package-owned terminal cursors, terminal rows, terminal cell columns, and source-range fragments over a fixed-column line index. They accept explicit `{ sourceIndex, lineIndex }` handles or a `TerminalLayoutBundle`; bundle invalidation refreshes the source-offset index together with line/page invalidation.

Hosts own search UI, selection state, caret behavior, hover behavior, and highlighting. The package only returns offsets, rows, columns, cursors, and generic range fragments to build those on.

### Selection And Extraction

Selection helpers turn host-provided terminal coordinates or source ranges into immutable source-first data. They do not store active selection state and do not touch the clipboard.

```ts
import {
  createTerminalLayoutBundle,
  createTerminalSelectionFromCoordinates,
  extractTerminalSelection,
  prepareTerminal,
} from 'pretext-tui'

const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })
const bundle = createTerminalLayoutBundle(prepared, { columns: 80 })
const selection = createTerminalSelectionFromCoordinates(prepared, bundle, {
  anchor: { row: 10, column: 2 },
  focus: { row: 12, column: 18 },
  mode: 'linear',
})

if (selection) {
  const extracted = extractTerminalSelection(prepared, selection, {
    indexes: bundle,
  })
  console.log(extracted.sourceText)
  console.log(extracted.visibleText)
}
```

Extraction returns `sourceText`, deterministic `visibleText`, row fragments, optional generic range matches, and source/row bounds. Hosts own drag behavior, selection state, rendering, copy formatting, and clipboard writes. Rich extraction helpers live under `pretext-tui/terminal-rich-inline` so style/link fragments stay in the rich sidecar.

### Generic Range Sidecar

`TerminalRangeIndex` is a host-neutral index over UTF-16 source ranges — useful when the host has block, annotation, diagnostic, or record metadata keyed to the same visible source string used by `prepareTerminal()`. Growing transcripts can extend it incrementally with `appendTerminalRanges()`.

```ts
import {
  createTerminalRangeIndex,
  getTerminalRangesAtSourceOffset,
  getTerminalRangesForSourceRange,
} from 'pretext-tui'

const ranges = createTerminalRangeIndex([
  {
    id: 'block-1',
    kind: 'block',
    sourceStart: 0,
    sourceEnd: 42,
    tags: ['visible'],
    data: { payloadId: 'host-owned-id' },
  },
])

const atCaret = getTerminalRangesAtSourceOffset(ranges, 12)
const overlapping = getTerminalRangesForSourceRange(ranges, {
  sourceStart: 8,
  sourceEnd: 20,
})
```

Range metadata is inert data. The package validates, clones, freezes, indexes, and returns ranges, but it never interprets `id`, `kind`, `tags`, or `data`, and it does not implement domain actions.

### Source-First Search

Search sessions search the same sanitized visible source text used by `prepareTerminal()`, so a hit is first a UTF-16 source range. Row and column data are optional projection metadata when the host supplies indexes or a bundle.

```ts
import {
  createTerminalLayoutBundle,
  createTerminalSearchSession,
  getTerminalSearchMatchesForSourceRange,
  prepareTerminal,
} from 'pretext-tui'

const prepared = prepareTerminal(logText, { whiteSpace: 'pre-wrap' })
const bundle = createTerminalLayoutBundle(prepared, { columns: 80 })
const session = createTerminalSearchSession(prepared, /error \d+/i, {
  mode: 'regex',
  indexes: bundle,
})

const hits = getTerminalSearchMatchesForSourceRange(session, { limit: 20 })
```

Supported modes are literal and regex search, with optional case-insensitive matching, ASCII whole-word filtering, explicit source scopes, generic range-index scopes, and an opt-in stored-match limit with detectable truncation. Regex searches reject zero-width matches so scans cannot loop forever. Hosts own search boxes, active-match state, result panes, highlighting, keyboard shortcuts, and persistence.

### Rich ANSI Metadata

Plain core input rejects raw terminal controls. For inline style/link metadata, use the rich sidecar at `pretext-tui/terminal-rich-inline` — policy-bound metadata extraction, not a terminal emulator.

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

The rich path supports inline `SGR` style spans and `OSC8` links. Unsupported control sequences are rejected or sanitized, so cursor movement, erase commands, alt-screen switches, mouse modes, and clipboard controls never enter layout.

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

The full terminal contract, host boundary, and public/private API boundary live under [`docs/contracts/`](https://github.com/ppppangu/pretext-TUI/tree/main/docs/contracts) in the repository. This README summarizes them because repository-only docs are not shipped in the npm tarball.

## Stability

Current package version: `0.2.1` (pre-1.0).

The stable core seven — `prepareTerminal`, `layoutTerminal`, `measureTerminalLineStats`, `walkTerminalLineRanges`, `layoutNextTerminalLineRange`, `materializeTerminalLineRange`, and `TERMINAL_START_CURSOR` — are stable as of `0.1.0`: breaking changes to them before `1.0` require a minor version bump.

Advanced public surfaces — fixed-column indexes, page caches, layout bundles, source projection, range sidecars, search sessions, selection/extraction, append-only cell flows, and rich inline metadata — are incubating: shipped and validated, but refinable until an approval record explicitly promotes them.

Repository-only evidence docs, contracts, recipes, and production notes live at <https://github.com/ppppangu/pretext-TUI/tree/main/docs>.

## Validation

Skeptical by default — the publish gate is one command:

```sh
bun run prepublishOnly
```

It runs TUI typechecks, validation typechecks, static no-browser gating, type-aware linting, TUI tests, deterministic oracle checks, corpus checks, deterministic fuzzing, conformance kit checks, benchmark guardrails, the modelled memory-budget gate, terminal demo checks, API snapshot checks, and package smoke tests.

Useful focused commands:

```sh
bun run test:tui
bun run conformance-kit-check
bun run scripts/tui-conformance-kit-generate.ts --check
bun run benchmark-check:tui
bun run memory-budget-check:tui
bun run benchmark:competitive:tui
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

Repository scripts are for contributors cloning this repo. The published npm package ships the runtime files and README, not the benchmark harness.

## Package Boundary

`pretext-TUI` owns text preparation, wrapping, ranges, source offsets, materialization, rich inline metadata, and large-text paging primitives.

Host applications own rendering, input, panes, focus, scrolling, persistence, file operations, command execution, link opening, and product behavior.

This keeps the package useful for many hosts without bundling application-specific adapter code for any one of them.

## Provenance

`pretext-TUI` began as a migration of the MIT-licensed upstream Pretext architecture and code lineage from `@chenglou/pretext`, but the active runtime is now terminal-cell layout instead of browser text measurement. It is independently maintained as `pretext-tui` — not upstream Pretext, not a browser text-measurement package, and not a drop-in replacement for `@chenglou/pretext`.

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
- append-only cell flows and tail-follow queries for growing transcripts
- deterministic TUI oracle, corpus, fuzz, benchmark, demo, and package smoke gates

Thanks to the original Pretext project and its text-layout research lineage for the architectural seed. `pretext-TUI` carries that idea into modern terminal applications while keeping a separate package identity and product boundary.
