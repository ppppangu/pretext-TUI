<!-- 补建说明：该文件为后续补建，用于冻结 pretext-TUI 与通用 host app 的职责边界；当前进度：作为当前 host-neutral 边界文档，后续实现不得把 host app 职责纳入包内。 -->
# Host App Boundary

## Purpose

This document defines the boundary between `pretext-TUI` and applications that consume it.

The package must remain a standalone terminal text-layout library. It must not become a renderer, pane system, command runner, file navigator, session manager, or application framework.

## Decision Summary

- `pretext-TUI` is a pure terminal-cell text layout package.
- Consumers are host applications.
- Host applications own rendering, input, panes, focus, scroll state, persistence, and domain behavior.
- Integration happens through typed data APIs, not through bundled host-specific adapters.

## Core Boundary Principle

`pretext-TUI` answers:

```text
Given visible terminal text plus layout options,
what terminal-cell lines, ranges, source offsets, and materialized fragments result?
```

The host application answers:

```text
Where does the content live, what is focused, what data is loaded,
what keys do, and how is the screen composed?
```

## Ownership Matrix

| Area | `pretext-TUI` Owns | Host Application Owns |
| --- | --- | --- |
| Text semantics | Unicode segmentation, terminal width, wrapping, tabs, hard breaks, glue, SHY/ZWSP/NBSP | Choosing which content to show |
| Layout unit | Integer terminal cells and rows | Viewport dimensions and container layout |
| Prepared data | Width-independent prepared text, line cursors, ranges, UTF-16 source offsets | Domain objects, documents, files, messages, jobs, tasks |
| Materialization | Visible line text and optional rich inline fragments | Painting, themes, borders, status bars, decorations |
| Streaming text | Optional append/page/cache primitives for large text flows | Data lifecycle, persistence, scrolling policy |
| Rich metadata | SGR/OSC8 parsing in rich path only | Link opening, action handling, interaction policy |
| Large terminal text | Text wrapping, source mapping, paged visible line materialization | Loading domain content, permissions, preview selection, operation routing |
| Coordinate projection | Source offset, cursor, and row projection into fixed-column terminal rows/columns | Choosing anchors to preserve, scroll adjustment, caret policy, selections, diagnostics UX |
| Capabilities | Pure functions and data contracts | Lifecycle, telemetry, feature flags, fallbacks |

## What Belongs In `pretext-TUI`

- Terminal width profiles.
- `prepareTerminal()` and related terminal-first APIs.
- Fixed-column line stats.
- Range walking.
- Materializing requested lines/ranges.
- Stable cursor/range/source-offset mapping.
- Stable source-offset/cursor/row projection into terminal row and cell-column coordinates.
- Rich inline metadata for style/link/copy semantics.
- Sparse-anchor/page-cache primitives for large terminal text.
- Deterministic tests, fixtures, fuzzing, and benchmarks.

The package must not import a consumer app, renderer framework, terminal UI framework, filesystem layer, session state, or app config.

## What Belongs In Host Applications

- Screen composition.
- Pane management.
- Split layouts.
- Focus routing.
- Resize handling.
- Keybindings.
- Command palette.
- Mouse handling.
- Scroll containers.
- Session and persistence state.
- Filesystem traversal.
- File operations.
- Workspace rules.
- Permission prompts.
- Preview provider registries.
- Link opening.
- Theme mapping.
- Application-specific copy/selection behavior.

## Host-Neutral API Shape

The package should expose pure data APIs that are easy for any host to adapt:

```ts
type TerminalTextLayout = {
  prepare(input: TerminalTextInput): PreparedTerminalText
  measure(prepared: PreparedTerminalText, constraints: TerminalLayoutConstraints): TerminalLineStats
  walkLines(
    prepared: PreparedTerminalText,
    constraints: TerminalLayoutConstraints,
    onLine: (line: TerminalLineRange) => void,
  ): number
  materialize(prepared: PreparedTerminalText, range: TerminalLineRange): TerminalMaterializedLine
}
```

The exact names may change during implementation. The boundary must remain side-effect-free.

## Future Host Features

A host may later build multi-pane navigation, file previews, searchable logs, command output viewers, or terminal notebooks.

`pretext-TUI` may support those features only by providing:

- terminal string width and truncation helpers
- wrapped content line ranges
- source-offset mapping for search and copy
- coordinate projection for source anchors, cursors, and rows after resize
- large-text paging primitives
- terminal-safe rich inline metadata

`pretext-TUI` must not implement:

- external data traversal
- tree/list state
- domain operations
- preview routing
- split layout engine
- focus model
- keyboard grammar
- git status collection
- host permissions
- host session rules

## Non-Goals

`pretext-TUI` is not:

- an application shell
- a renderer
- a component library
- a layout engine for panes
- a terminal emulator
- a filesystem explorer
- a markdown parser
- a syntax-highlighting engine
- a universal TUI framework
- a browser/Canvas/DOM compatibility layer
- a host-specific adapter package

## Acceptance Checklist

- The package remains host-neutral.
- No host application dependency is introduced.
- Rich metadata remains data-only.
- Pane, focus, external data, session, and command concerns stay outside the package.
- Future extensibility is provided through typed primitives, not bundled application behavior.
