# Changelog

## Unreleased

- Speeds up `prepareTerminal()` text analysis with no API or behavior change: width-profile resolution is idempotent and threaded through the width caches, pure-ASCII segments take a charCode fast path around the grapheme iterator, the merge pipeline drops its per-piece allocations, duplicate segment-metrics lookups are gone, and merge passes skip themselves when they provably cannot fire. Local 3.9MB mixed CJK/ASCII transcript prepare improves roughly 40% (about 50% for pure-ASCII logs); output is verified byte-identical across a 280-case corpus/options snapshot net plus a new permanent ASCII-split differential test.

## 0.1.0 - 2026-06-10

First stable `0.1` release of the core terminal-cell layout surface.

- Promotes the seven core terminal APIs (`prepareTerminal`, `layoutTerminal`, `measureTerminalLineStats`, `walkTerminalLineRanges`, `layoutNextTerminalLineRange`, `materializeTerminalLineRange`, `TERMINAL_START_CURSOR`) and their option/result types to stable `0.1`; breaking changes to them before `1.0` require a minor version bump.
- Adds incubating tail-follow row queries (`getTerminalLineIndexTailRanges`, `getTerminalLayoutBundleTailPage`, `measureTerminalLayoutBundleRows`) so follow-mode viewports can fetch the last rows of a growing transcript without re-deriving totals after every append.
- Adds an incubating `appendTerminalRanges` so hosts with growing transcripts can extend a generic range index by validating only the newly appended ranges, with results identical to one-shot construction.
- Adds an incubating opt-in `matchLimit` for search sessions plus `getTerminalSearchSessionStats`, so stored search matches follow an explicit configured limit with detectable truncation instead of growing with transcript length.
- Restructures `src/` into ranked layer directories (`unicode`, `analyze`, `wrap`, `core`, `prepared`, `virtual`, `semantic`, `rich`, `telemetry`, `public`) with a hardened layering gate; package exports and the public API surface are unchanged.
- Adds a host-neutral conformance kit (`fixtures/conformance/`) with width, wrap, and offset cases plus generation and check tooling.
- Adds a documented Unicode upgrade policy and a prefix-eviction design RFC.

## 0.1.0-alpha.0 - 2026-04-27

Initial host-neutral terminal text kernel alpha release.

- Exposes a terminal-first package story under `pretext-tui`.
- Retargets the active package surface toward terminal cells, rows, ranges, and lazy materialization.
- Removes browser demos, browser validation scripts, and browser snapshot dashboards from the active package surface.
- Adds deterministic terminal width profiles and terminal API facade work as the basis for upcoming releases.
- Adds the `./terminal-rich-inline` sidecar for inline SGR/OSC8 metadata.
- Adds TUI-only validation gates covering static checks, goldens, corpus invariants, fuzzing, benchmarks, CI, and package smoke.
- Adds a deterministic terminal demo that shows prepare, resize reflow, and visible-window materialization over a mixed terminal transcript.
- Adds runtime-opaque sparse-anchor virtual text primitives for fixed-column page caching, source-offset lookup, and append invalidation metadata.
- Adds internal append-only cell-flow storage, source-first search/selection/range counters, and a modelled memory-budget release gate for package-owned structures.
- Adds Phase 10 launch-readiness evidence: capability/correctness/security matrices, public-only recipes, incubating API approval index, and a local-evidence-only benchmark report citation.
- Adds a local feel demo for comparing a conventional full-wrap viewport loop with a `pretext-TUI` prepared/page-cache viewport loop.
- Fixes source-offset lookup/projection exactness so out-of-range requests clamp to a safe boundary with `exact: false`, and rejects invalid runtime bias values.
- Ships a clean publishable tarball with only public root `dist/` wrappers and implementation modules internalized under `dist/internal/`.

This version is intentionally pre-1.0 alpha while advanced public APIs remain incubating.
