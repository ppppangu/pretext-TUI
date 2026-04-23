# pretext-TUI

`pretext-TUI` is a terminal-cell text layout package for TUI applications.

It is being migrated from the upstream Pretext architecture into a publishable package whose active runtime is based on integer terminal columns and rows, deterministic width profiles, range walking, and lazy materialization.

The product goal is not browser text measurement. The active package must not depend on DOM, Canvas, web pages, CSS pixels, or browser automation.

## Status

The package surface is terminal-first:

- package root exports the terminal API
- `./terminal` is an alias for the same API
- browser/demo/rich-inline subpaths are not exported

The package is still `0.0.0` while broader validation, rich metadata, and large-text primitives are added.

## Target Architecture

The package keeps the useful Pretext architecture:

```text
prepare -> layout -> line ranges -> materialize
```

But the units and runtime change:

```text
visible terminal text
-> prepareTerminal(text, options)
-> layoutTerminal(prepared, { columns, startColumn })
-> walk/materialize only the lines a host needs
```

The important constraints are:

- `prepareTerminal()` performs text analysis and width precomputation.
- `layoutTerminal()` stays arithmetic-only.
- line-range APIs avoid building strings.
- materialization happens only for requested lines or ranges.
- source mapping uses UTF-16 offsets over sanitized visible text.
- rich metadata is data-only and host-neutral.

## Target API Shape

The planned core API is:

```ts
import {
  layoutNextTerminalLineRange,
  layoutTerminal,
  materializeTerminalLineRange,
  measureTerminalLineStats,
  prepareTerminal,
  walkTerminalLineRanges,
} from 'pretext-tui'

const prepared = prepareTerminal('hello 世界 🚀', {
  whiteSpace: 'pre-wrap',
  tabSize: 8,
  widthProfile: 'terminal-unicode-narrow@1',
})

const stats = layoutTerminal(prepared, {
  columns: 40,
  startColumn: 0,
})

console.log(stats.rows)
```

The `pretext-tui` package name and terminal exports are the active package surface.

## Terminal Semantics

The active TUI contract is defined in [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md).

Summary:

- width unit: terminal cells
- height unit: terminal rows
- fitting: exact integer comparison
- tabs: dynamic layout-time segments
- plain core input: sanitized visible text
- ANSI/OSC8: rich metadata path only
- unsupported terminal controls: rejected or sanitized
- source offsets: UTF-16 over sanitized visible text

## Host App Boundary

The host boundary is defined in [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md).

`pretext-TUI` owns text preparation, wrapping, ranges, materialization, and metadata.

Host applications own rendering, input, panes, focus, scrolling, persistence, file operations, and domain behavior.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the active migration commands and future TUI validation surface.

See [TODO.md](TODO.md) for the current migration order.

See [STATUS.md](STATUS.md) for what has and has not landed yet.

## Credits

This fork preserves the architectural insight of upstream Pretext: do expensive text analysis once, keep layout cheap, and expose range-based manual layout APIs. The active runtime target here is terminal-cell layout rather than browser measurement.
