<!-- 补建说明：该文件为后续补建，用于冻结 pretext-TUI 面向公开消费者的 API 稳定性边界；当前进度：首版定位文档，作为后续 API gate、recipes 和发布文案审核的依据。 -->
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
map rows back to source offsets, and materialize only requested output.
```

This is deliberately broader than one application category. Transcript viewers are one useful workload, but they do not define the package boundary.

## Entry Points

The intended public entry points are:

| Entry point | Status | Purpose |
| --- | --- | --- |
| `pretext-tui` | Public | Root terminal API surface. |
| `pretext-tui/terminal` | Public alias | Same terminal API surface for consumers that prefer explicit terminal naming. |
| `pretext-tui/terminal-rich-inline` | Incubating public | Opt-in rich inline metadata for supported `SGR` and `OSC8` input. |
| `pretext-tui/package.json` | Public metadata | Package metadata for tooling. |

No other subpath should be treated as public unless a future contract explicitly adds it.

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

Stable candidates should remain pure terminal-cell text-layout APIs. They should accept terminal text and options, then return data.

### Incubating Surfaces

These surfaces are useful but need more evidence before they become stable:

- `pretext-tui/terminal-rich-inline`
- sparse line indexes
- fixed-column page caches
- source-offset indexes
- append/cell-flow invalidation metadata
- rich diagnostics and ANSI re-emission
- custom terminal width profiles

Incubating APIs may change before `0.1`. They still must stay host-neutral and data-only.

### Private Surfaces

These surfaces are not public API:

- `src/*`
- `dist/internal/*`
- analysis, line-walking, measurement, tokenizer, and width internals
- scripts, benchmarks, fixtures, generated status data, and repository-only validation helpers
- internal storage fields on prepared text, indexes, pages, cursors, diagnostics, or rich fragments

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

Hosts may build those behaviors above `pretext-TUI`, but the package boundary stays text layout.

## Public Handle Rules

Public core handles should be opaque at runtime. A host can pass them back into package APIs, but should not inspect or mutate their internals.

This applies to:

- prepared terminal text
- line indexes
- page caches
- source-offset indexes
- append/cell-flow handles

`PreparedTerminalRichInline` is the current incubating exception: it intentionally exposes visible text, spans, redacted diagnostics, raw-to-visible mapping, raw summary policy, and rich policy summary as data contracts while nesting the core `PreparedTerminalText` as an opaque handle. It must not expose full raw terminal input, full unsafe diagnostic sequences, or implicit ANSI re-emission.

Future implementation work should preserve this shape through capability boundaries, branded types, private symbols, WeakMaps, or equivalent internal storage.

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
- `./terminal-rich-inline` is clearly marked as opt-in and incubating.
- Public examples import only public entry points.
- Public docs do not imply bundled integration code for any named host.
- Performance wording is tied to reproducible evidence or kept qualitative.
- Internal storage is not part of the public data contract.
