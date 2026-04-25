# Development

This repository has a publishable terminal-cell text layout package baseline. Active development keeps the API host-neutral while tightening security posture, benchmark evidence, performance telemetry, and future append-storage design.

The active development target is terminal-cell layout. Browser-oriented source material remains out of the active package surface.

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
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run terminal-demo-check
bun run api-snapshot-check
bun run package-smoke-test
```

## Full TUI Validation Surface

The full release validation surface is:

```sh
bun run typecheck:tui
bun run typecheck:tui-validation
bun run test:tui
bun run tui-static-gate
oxlint --type-aware src
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run terminal-demo-check
bun run api-snapshot-check
bun run package-smoke-test
```

`terminal-demo-check` gates the deterministic package-level vertical slice. It proves one prepare pass, resize reflow, JSON schema shape, fixture sandboxing, and bounded visible-window materialization without adding an interactive application shell.

The benchmark thresholds are intentionally conservative because the harness also runs invariants. The virtual text counters cover page hits/misses, source lookups, anchor replay distance, append invalidation size, full reprepare size, and invalidated pages. Explicit, default-off instrumentation also records prepared geometry reuse and remaining materialization-time grapheme/width work; these counters are release-regression telemetry, not public benchmark evidence.

## Competitive Benchmark

Run the optional local competitive benchmark manually when comparing `pretext-TUI` against mainstream text wrapping primitives:

```sh
bun run benchmark:competitive:tui
```

This command is intentionally not part of `prepublishOnly`. It depends on dev-only comparison packages such as `wrap-ansi`, `string-width`, and `strip-ansi`, measures local wall-clock time, and compares text-layout primitives rather than complete application renderers or event loops.

For report-shaped benchmark evidence that can be cited by report id and workload id, run:

```sh
bun run benchmark:evidence:tui
```

That command writes a local `pretext-tui-benchmark-evidence@1` JSON report under `docs/evidence/benchmark-reports/`. Dynamic timing numbers belong in the JSON report, not in README or marketing prose.

## Packaging Target

The publishable package must expose terminal-first APIs only.

The final package smoke test must verify:

- supported terminal exports load from the packed tarball
- removed demo/assets subpaths fail
- package files do not ship obsolete browser product surfaces
- root `dist/` contains only public wrappers; implementation modules ship only under `dist/internal/`
- type declarations match the terminal API surface
- rich sidecar declarations do not expose full raw terminal input, unsafe `sequence` fields, or implicit `ansiText`
- validation scripts stay typed and terminal-only

## Reference Map

Use [docs/README.md](docs/README.md) for the fact-source hierarchy. Use these references for active development:

- [README.md](README.md) — public package story
- [STATUS.md](STATUS.md) — current migration state
- [TODO.md](TODO.md) — current task order
- [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md) — terminal semantics
- [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md) — host boundary
- [docs/contracts/public-api-boundary.md](docs/contracts/public-api-boundary.md) — public/private API boundary
- [docs/contracts/terminal-security-profile.md](docs/contracts/terminal-security-profile.md) — rich sidecar security profile
- [docs/production/README.md](docs/production/README.md) — production-readiness notes
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md) — detailed implementation plan

## Active Engineering Rules

- Keep `layoutTerminal()` arithmetic-only.
- Keep measurement out of layout-time hot paths.
- Keep prepared source data width-independent.
- Keep width-dependent caches separate.
- Keep line/range APIs non-materializing by default.
- Keep virtual text caches fixed-column and range-only; materialize only requested rows.
- Keep virtual text handles opaque at runtime; anchor/page/source storage must stay behind capability boundaries.
- Keep rich metadata fragment-first; ANSI reconstruction must stay explicit and policy-bound.
- Do not monkey-patch web globals to pass tests.
- Do not add named-host integration layers to this package.
- Do not keep parallel browser and terminal public stories.

## Archived Source Material

Use git history as the archive for removed source-project browser/demo material. Do not use old browser-era claims as active product-health signals for the TUI package.
