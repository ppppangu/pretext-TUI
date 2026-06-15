# Changelog

## 0.2.1 - 2026-06-15

- Makes `appendTerminalCellFlow()` cost O(window) per append instead of O(N²). The prepared reader store is now an immutable-append structure (`appendPreparedTerminalReaderStoreChunk`) that shares prior chunk arrays by reference and validates only the newly sealed chunk, so a stream of N appends copies the open-tail window per append rather than re-materializing every chunk of the whole accumulated store. Bisimulation output is byte-identical — the append≡reprepare parity net is unchanged — and a new length-independence falsifier (`terminalReaderStoreCopiedSegments`) pins the per-append copy count flat as the stream grows, where it previously grew with total length.
- Hardens the layout math spine with three load-bearing falsifiers and no API or behavior change: width-independence `reuse≡fresh` (a reused prepared lays out byte-identically to a fresh `prepareTerminal` at every width, with column-independent geometry built exactly once across relayouts), the consolidated projection round-trip fixpoint (`π*∘π` recovers the offset the projection chose, bias-parameterized, with the section/retraction branch forced by a multi-UTF-16-code-unit grapheme fixture so it cannot silently degrade to identity), and `append≡reprepare` re-pinned under a non-trivial injected width profile. Collapses the layout-row projection helper to a single shared definition.

## 0.2.0 - 2026-06-14

- Adds a host-injectable width capability: `createInjectedTerminalWidthProfile({ id, graphemeWidth })` builds a width profile whose per-grapheme function overrides the built-in width classification at the single `terminalGraphemeWidth` choke point, after the control/bidi safety gate, so a host reproduces its own terminal-tuned widths exactly. Cache identity follows the function identity plus `id`, so same-`id`/different-function profiles never poison the shared width caches. Also exports `measureTerminalTextWidth` (the grapheme-summed width primitive) and `sanitizePlainTerminalInput`, which strips exactly the code points the plain layout path rejects via the same single reject-set predicate as `assertPlainTerminalInput`. Adds the normative `docs/contracts/host-integration.md`.
- Prices the chosen soft-hyphen glyph from one source: its visible width is read from `discretionaryHyphenWidth` (threaded onto the prepared reader alongside `tabStopAdvance`) at every layout, materialize, and coordinate-projection site instead of a hardcoded one cell, so an injected non-unit hyphen width lays out and projects correctly. The default profile is byte-identical.
- Fixes a break-kind mislabel: a long word split across rows immediately after a soft hyphen no longer reports a `soft-hyphen` break or re-materializes a phantom `-` mid-line.
- Speeds up `prepareTerminal()` text analysis with no API or behavior change: width-profile resolution is idempotent and threaded through the width caches, pure-ASCII segments take a charCode fast path around the grapheme iterator, the merge pipeline drops its per-piece allocations, duplicate segment-metrics lookups are gone, and merge passes skip themselves when they provably cannot fire. On a local 3.9MB mixed CJK/ASCII transcript, prepare drops to roughly three-fifths of its previous time (about half for pure-ASCII logs); output is verified byte-identical across a 280-case corpus/options snapshot net plus a new permanent ASCII-split differential test.
- Adds a probe-parameterized ASCII word scanner and a per-prepare CJK unit memo on top of the same behavior freeze: newline-bounded pure-ASCII spans are segmented by a DFA whose parameters are extracted from and verified against the live `Intl.Segmenter` at first use (any mismatch permanently disables it for that segmenter instance and the original path runs verbatim), and repeated CJK segment texts share their unit arrays within one prepare. A permanent differential gate pins the scanner against the live engine, including cross-class, control-character, and locale-switch batteries. Combined with the series above, the local mixed-corpus prepare is now under half its pre-series time.

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
