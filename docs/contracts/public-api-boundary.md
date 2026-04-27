<!-- 补建说明：该文件为后续补建，用于冻结 pretext-TUI 面向公开消费者的 API 稳定性边界；当前进度：Phase 7 保持 canonical 公共 API 边界不扩张，rich metadata hardening 仅进入内部索引与 capability gate。 -->
# Public API Boundary

## Purpose

This document defines the public API boundary for `pretext-TUI`.

`pretext-TUI` is a host-neutral terminal-cell text layout kernel. It is meant to sit under any text-heavy TUI, CLI, log viewer, transcript viewer, editor pane, terminal dashboard, or similar terminal host that already owns rendering and product behavior.

The package should expose durable text-layout data contracts. It should not expose internal storage, host lifecycle behavior, renderer behavior, or named-host integration code.

## Public Story

The public package story is:

```text
Given visible terminal text and terminal layout options,
prepare reusable text data, derive terminal-cell rows and ranges,
project source offsets/cursors/rows through fixed-column indexes,
and materialize only requested output.
```

This is deliberately broader than one application category. Transcript viewers are one useful workload, but they do not define the package boundary.

## Entry Points

The intended public entry points are:

| Entry point | Status | Purpose |
| --- | --- | --- |
| `pretext-tui` | Public canonical facade | Root terminal API surface for core terminal-cell layout consumers. |
| `pretext-tui/terminal` | Public alias | Same terminal API surface for consumers that prefer explicit terminal naming. |
| `pretext-tui/terminal-rich-inline` | Incubating public | Opt-in rich inline metadata for supported `SGR` and `OSC8` input. |
| `pretext-tui/package.json` | Public metadata | Package metadata for tooling. |

No other subpath should be treated as public unless a future contract explicitly adds it.

## Canonical Public Facade

The package root `pretext-tui` is the canonical public facade for core terminal APIs. Public examples should import core APIs from the root facade unless they are specifically demonstrating the explicit `pretext-tui/terminal` alias.

`pretext-tui/terminal` must remain behaviorally and declaratively equivalent to the root terminal facade. It is an explicit naming convenience, not a second product story.

`pretext-tui/terminal-rich-inline` is a separate opt-in, incubating public sidecar for policy-bound rich inline metadata. It must not become the default facade for plain terminal layout.

Internal implementation modules, validation helpers, benchmarks, fixtures, and generated status data are not public facades. Public docs must not import them, and future host-specific convenience layers must be built outside this package unless a new host-neutral contract explicitly expands the facade.

## Stability Classes

### Stable Candidates

These surfaces are candidates for the first stable `0.1` contract once declaration snapshots and package smoke tests cover them:

- `prepareTerminal`
- `layoutTerminal`
- `measureTerminalLineStats`
- `walkTerminalLineRanges`
- `layoutNextTerminalLineRange`
- `materializeTerminalLineRange`
- terminal prepare/layout option shapes
- terminal row, cursor, range, and materialized-line data shapes
- plain source-offset mapping over sanitized visible text

Stable candidates should remain pure terminal-cell text-layout APIs. They should accept terminal text and options, then return data.

### Incubating Surfaces

These surfaces are useful but need more evidence before they become stable:

- `pretext-tui/terminal-rich-inline`
- sparse line indexes
- fixed-column page caches
- source-offset indexes
- unified layout bundles that compose source-offset, sparse row, and page-cache handles
- coordinate projection helpers and projection result types
- row+column hit-test projection
- source-range-to-row-fragment projection
- generic range/block sidecar indexes
- source-first search sessions
- selection and extraction helpers
- append/cell-flow invalidation metadata
- rich diagnostics and ANSI re-emission
- custom terminal width profiles

Incubating APIs may change before `0.1`. They still must stay host-neutral and data-only.

Unified terminal layout bundles are public but incubating convenience handles. They compose a fixed-column line index, a source-offset index, and a page cache behind one opaque handle while preserving the existing prepared-text, projection, and materialization contracts. They do not create a renderer, viewport controller, selection state, or host integration layer.

Generic range sidecar indexes are public but incubating data handles. The exposed names are `createTerminalRangeIndex()`, `getTerminalRangesAtSourceOffset()`, `getTerminalRangesForSourceRange()`, `TerminalRange`, `TerminalRangeData`, `TerminalRangeIndex`, and `TerminalRangeQuery`. `createTerminalRangeIndex()` accepts generic UTF-16 source ranges with `id`, `kind`, optional inert `tags`, and optional inert JSON-like `data`. The package validates, clones, freezes, and indexes those ranges, then supports point and source-range overlap lookup. It does not interpret transcript, log, diff, test, editor, record, or action semantics; hosts layer those meanings above returned ranges.

Source-first search sessions are public but incubating data handles. The exposed runtime names are `createTerminalSearchSession()`, `getTerminalSearchSessionMatchCount()`, `getTerminalSearchMatchesForSourceRange()`, `getTerminalSearchMatchAfterSourceOffset()`, and `getTerminalSearchMatchBeforeSourceOffset()`. The exposed search types include `TerminalSearchSession`, `TerminalSearchMatch`, `TerminalSearchMode`, `TerminalSearchQuery`, `TerminalSearchOptions`, `TerminalSearchScope`, `TerminalSearchRangeIndexScope`, and `TerminalSearchSourceRangeQuery`. Search hits are UTF-16 source ranges over sanitized visible source text, with optional projection metadata when hosts provide indexes. The package does not expose search UI, active-match state, highlighting, result panes, keyboard handling, or host-specific query semantics.

Selection and extraction helpers are public but incubating immutable data APIs. The exposed core runtime names are `createTerminalSelectionFromCoordinates()`, `extractTerminalSourceRange()`, and `extractTerminalSelection()`. The exposed core selection/extraction types include `TerminalSelection`, `TerminalSelectionCoordinate`, `TerminalSelectionDirection`, `TerminalSelectionExtraction`, `TerminalSelectionExtractionFragment`, `TerminalSelectionExtractionOptions`, `TerminalSelectionMode`, `TerminalSelectionRequest`, and `TerminalSourceRangeExtractionRequest`. Rich extraction companions live only under `pretext-tui/terminal-rich-inline` as `extractTerminalRichSourceRange()` and `extractTerminalRichSelection()`. The package does not expose clipboard behavior, active selection state, mouse tracking, caret policy, highlight rendering, or copy formatting.

### Private Surfaces

These surfaces are not public API:

- `src/*`
- `dist/internal/*`
- analysis, line-walking, measurement, tokenizer, and width internals
- scripts, benchmarks, fixtures, generated status data, and repository-only validation helpers
- internal storage fields on prepared text, indexes, pages, cursors, diagnostics, or rich fragments
- true chunked append storage internals until proven and explicitly surfaced through a stable capability boundary

Docs, recipes, tests, and examples for public consumers must not import private surfaces.

### Unsupported Product Behavior

The public API must not promise:

- rendering, painting, frames, borders, panes, tabs, focus, or keybindings
- PTY control, shell execution, command routing, file operations, or session persistence
- clipboard, link opening, mouse handling, permissions, or telemetry
- named-host package subpaths
- browser, DOM, Canvas, CSS, or pixel measurement compatibility
- broad benchmark supremacy wording
- chunked append storage until it is implemented and proven
- arbitrary insert/delete/replace editing in prepared flows

Hosts may build those behaviors above `pretext-TUI`, but the package boundary stays text layout.

## Public Handle Rules

Public core handles should be opaque at runtime. A host can pass them back into package APIs, but should not inspect or mutate their internals.

This applies to:

- prepared terminal text
- line indexes
- page caches
- source-offset indexes
- layout bundles
- range sidecar indexes
- append/cell-flow handles

`PreparedTerminalRichInline` is the current incubating exception: it intentionally exposes visible text, spans, redacted diagnostics, raw-to-visible mapping, raw summary policy, and rich policy summary as data contracts while nesting the core `PreparedTerminalText` as an opaque handle. Runtime rich helpers still validate that the handle came from `prepareTerminalRichInline()` before using indexed spans or re-emitting ANSI. The public data shape must not expose full raw terminal input, full unsafe diagnostic sequences, internal rich span indexes, raw-visible indexes, or implicit ANSI re-emission.

Future implementation work should preserve this shape through capability boundaries, branded types, private symbols, WeakMaps, or equivalent internal storage.

Repository validation may use internal debug snapshot APIs to inspect copied prepared-reader structure. Those snapshots are private test infrastructure: they must stay outside package exports and public subpaths, must be detached from live WeakMap state, and must not appear in public examples or recipes.

## Documentation Rules

Public documentation should:

- lead with the host-neutral terminal-cell layout kernel story
- name TUI, CLI, log, transcript, and editor-pane hosts as peer examples
- describe named applications only as possible consumers, not as existing integrations
- keep benchmark numbers in evidence reports, not repeated public narrative
- distinguish release gates from optional local comparison commands
- link to this document when explaining API stability or private internals

## Acceptance Checklist

- Root and `./terminal` exports describe the same terminal API surface.
- Root `pretext-tui` remains the canonical public facade for core APIs.
- `./terminal-rich-inline` is clearly marked as opt-in and incubating.
- Public examples import only public entry points.
- Public docs do not imply bundled integration code for any named host.
- Performance wording is tied to reproducible evidence or kept qualitative.
- Internal storage is not part of the public data contract.
- Internal debug snapshots are copied repository-only validation data and are absent from public package exports.
