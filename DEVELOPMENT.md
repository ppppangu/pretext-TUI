# Development

This repository is migrating toward a publishable pure TUI text layout package.

The active development target is terminal-cell layout. Browser-oriented scripts and pages from the source project are migration context only until they are removed from the active package surface.

## Setup

Install dependencies once in a fresh worktree:

```sh
bun install
```

## Current Package Gate

The currently enforced package gate is:

```sh
bun run check
bun run test:tui
bun run package-smoke-test
```

## Later TUI Validation Surface

Later migration tasks add the broader TUI validation surface:

```sh
bun run typecheck:tui
bun run test:tui
bun run tui-static-gate
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run package-smoke-test
bun run test:tui
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

Current package publish gate:

```sh
bun run check
bun run test:tui
bun run package-smoke-test
```

Broader TUI release gates such as the static no-browser sweep, oracle/corpus/fuzz checks, and benchmark checks land in later tasks of the migration plan.

## Packaging Target

The publishable package must expose terminal-first APIs only.

The final package smoke test must verify:

- supported terminal exports load from the packed tarball
- removed demo/assets subpaths fail
- package files do not ship obsolete browser product surfaces
- type declarations match the terminal API surface

## Source Of Truth

Use these documents while the migration is in progress:

- [README.md](README.md) — public package story
- [STATUS.md](STATUS.md) — current migration state
- [TODO.md](TODO.md) — current task order
- [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md) — terminal semantics
- [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md) — host boundary
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md) — detailed implementation plan

## Active Engineering Rules

- Keep `layoutTerminal()` arithmetic-only.
- Keep measurement out of layout-time hot paths.
- Keep prepared source data width-independent.
- Keep width-dependent caches separate.
- Keep line/range APIs non-materializing by default.
- Do not monkey-patch web globals to pass tests.
- Do not add host-specific adapters to this package.
- Do not keep parallel browser and terminal public stories.

## Archived Source Material

Use git history as the archive for removed source-project browser/demo material. Do not use old browser-era claims as active product-health signals for the TUI package.
