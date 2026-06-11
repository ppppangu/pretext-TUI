# TODO

Current priorities for maintaining the `0.1.0` `pretext-TUI` host-neutral terminal text kernel.

## Active Next

### Prepare-pipeline performance follow-ups (post behavior-frozen perf series 3a59aa6..206d1ec)

- ASCII word-scanner fast path: landed (`src/analyze/analysis-word-scanner.ts` behind the `buildMergedSegmentation` seam) — probe-parameterized per live `Intl.Segmenter` instance, permanently disables on any probe/verification mismatch (falling back to the original whole-string loop), and `tests/tui/analysis-word-scan-differential.test.ts` is the permanent differential gate that also asserts enablement on the gate runtime; future engine bumps that move ASCII word segmentation surface there first.
- kinds string-enum -> int/columnar storage: deferred; `SegmentBreakKind` strings reach the prepared reader, reader-store chunks, debug snapshots, and gate validation helpers, so conversion has cross-layer blast radius and needs its own behavior-frozen series with the A/B-net approach.
- Width-profile hardening: brand resolved profiles (e.g. module-private WeakSet populated by both `createProfile` and `createInjectedTerminalWidthProfile`) so the idempotent `resolveTerminalWidthProfile` early-return cannot trust a mutated structural copy's stale `cacheKey`; fold in deleting the now-unused `getTerminalWidthProfileCacheKey`. Blocked on the in-flight host-injected width-profile work that touches the same files.
- A/B snapshot-net axis gaps (for the next behavior-frozen series): vary `emojiWidth`, `regionalIndicator`, `controlChars`, `defaultTabSize`, and add an append/cell-flow case; today's net covers corpora x whiteSpace x wordBreak x ambiguousWidth/tabSize.
- `letterSpacing` exists on internal `PrepareOptions` and threads live branches through measurement/line-break, but `prepareTerminal` never forwards it and no public surface or test references it — decide promote-or-prune.
- `mergeUrlLikeRuns` contains a provable no-op write (`kinds[j] = 'text'` where the loop guard already requires `'text'`); removing it would make the pass's prescan argument self-evident.
- ASCII width fast path (measurement side): for printable-ASCII segment strings, `terminalSegmentMetrics`/`terminalGraphemeWidths` can return width===length without the grapheme walk (brute-force verified across all profile knobs; 99.9% of remaining metric-cache misses on log corpora are printable ASCII), guarded by `profile.graphemeWidth === undefined` so host-injected width profiles bypass it. Blocked on the in-flight host-injected width-profile work that owns those files; promote the throwaway width-table differential into tests/tui when it lands.
- Guarded space-bounded sub-span routing inside mixed lines (Tier-2b) and a pushMeasuredSegment/prepared-core columnar restructure: deferred until a post-scanner re-profile shows them as the dominant remaining costs; re-evaluate against the then-current distribution, not the pre-series one.
- Word-scanner buffer policy: the module-level scan buffers grow-double and never shrink, so one pathological multi-megabyte single line permanently retains its peak capacity (~9 bytes per segment slot); acceptable for now, revisit with a high-water reset if host telemetry ever shows it.
- WASM/icu4x analysis kernel: REJECTED as a structural second pipeline — icu4x is a third segmentation behavior that cannot be probe-pinned byte-identical to the live engine `Intl.Segmenter` over its non-ASCII value-add region, the tarball story is zero-runtime-dep, the wasm toolchain is absent from CI, and the measured WASM boundary cost (~11ms on a 3.9MB corpus) is immaterial either way. Re-open only if ALL THREE hold: (1) a workload where non-ASCII analysis dominates after the TS levers are exhausted, (2) a pinning strategy proving byte-identical behavior against the live engine across the gate matrix, (3) an approval record accepting the dependency/toolchain cost.

- Use [docs/plans/2026-06-10-kernel-refinement-and-agent-tui-roadmap.md](docs/plans/2026-06-10-kernel-refinement-and-agent-tui-roadmap.md) as the post-Phase-10 direction record; tracks R1 (kernel refinement), R2 (directory layering), and R3 (streaming maturity) are complete, and track R4 (adoption surface) has landed its in-repo items with external proof-of-concept hosts remaining external.
- The prefix-eviction design RFC under docs/plans/ is a design record only; implementing eviction requires its own approval record per the RFC's evidence prerequisites.
- R4 adoption surface: external proof-of-concept host repositories live in separate repositories as adoption evidence and link back here; they never move into this package.
- R4 adoption surface: the terminal conformance kit under fixtures/conformance/ is repo-only data verified by `bun run conformance-kit-check`; promote it into release-gate:tui only after the kit stabilizes.
- R4 adoption surface: docs/production/unicode-upgrade-policy.md governs adopting new Unicode versions as new width-profile versions; no terminal-unicode-narrow@2 is adopted yet.
- Stable 0.1 promotion for the core seven has landed; the stable/incubating partition is asserted exactly (not just the union) in tests/tui/public-api-boundary.test.ts against the source facade, with the name lists owned by scripts/public-api-contract.ts.
- Maintain the Phase 10 adoption evidence pack as claims, recipes, and public API boundaries evolve.
- Use [docs/decisions/incubating-api-approval-index.md](docs/decisions/incubating-api-approval-index.md) to prevent accidental stable `0.1` promotion of incubating APIs.
- Keep append claims narrow: append-only chunked storage is internal and incubating; arbitrary editing, destructive prefix eviction, and host retention policy are not implemented.
- Keep Phase 8 benchmark counters inside Phase 9 memory/performance evidence instead of converting them into broad speed claims.
- Keep Phase 10 host-neutral: no renderer, PTY, clipboard, filesystem, named-host adapter, or second public pipeline.
- Treat `memory-budget-check:tui` as modelled kernel-owned structure evidence, not process heap or host UI evidence.
- Add memory/perf evidence only from reproducible counters and clean/declared benchmark baselines.
- Use the explicit benchmark instrumentation now in the release gate to reduce remaining line materialization, width-prefix, and rich fragment work only when counters justify it.
- Maintain launch assets and copy from `docs/marketing/` while keeping performance claims tied to clean benchmark reports.
- Refresh claimable benchmark evidence after release-source changes before citing a new report id in public copy.
- Cite report ids such as `competitive-tui-20260610-306debd-clean-fd7b8b9f` only with workload ids and semantic caveats; do not copy dynamic timing numbers into prose.

## Completed

- Track R3 streaming maturity has landed as incubating data APIs with approval records: tail-follow row queries with a tail-anchored measure fast path, explicit search match-count limits with a stats accessor, append-friendly incremental range indexes with one-shot parity, and a prefix-eviction design RFC.
- Track R4 in-repo adoption surface has landed: the core seven are promoted to stable 0.1 with an exact partition assertion, a repo-only terminal conformance fixture kit is generated and checked from the engine, and the Unicode upgrade policy governs future width-profile versions.
- Track R2 directory layering has landed behavior-frozen: src is split into ten ranked layer directories with per-directory READMEs, all cross-directory imports point strictly downward, and the static gate now enforces the layering DAG and rejects upward or escaping relative imports.
- Track R1 kernel refinement has landed behavior-frozen: one shared grapheme-segmenter module, one tab-advance owner, a layered `analysis-*` module split behind the `analysis` facade, a shared keep-all grouping rule, decomposed measurement helpers, golden regeneration tooling with a byte-drift `--check` mode, and a source-level runtime export check for the rich public facade.
- Initial package contracts are frozen.
- Browser product surface has been removed from active package exports, scripts, workflow, and status docs.
- Initial terminal width backend and measurement boundary have landed.
- Initial terminal-first API facade and TUI core tests have landed.
- Package exports and smoke tests now target the terminal API surface.
- Initial terminal rich metadata sidecar has landed.
- TUI-only validation stack and CI have landed.
- Terminal vertical slice demo has landed with a mixed transcript fixture, row-count precomputation, resize reflow, and visible-window materialization.
- Sparse-anchor virtual text primitives have landed with opaque handles, source-offset lookup, fixed-column page caching, append invalidation metadata, and benchmark counters.
- Unified layout bundles have landed as incubating opaque handles that coordinate source-offset, line-index, and page-cache invalidation for page/projection workflows.
- Generic range sidecar indexes have landed as incubating opaque handles for host-neutral source range lookup with inert metadata only.
- Source-first search sessions have landed as incubating opaque handles over sanitized visible source text with literal/regex modes, generic scopes, optional projection data, and no UI state.
- Selection/extraction helpers have landed as incubating immutable data APIs for coordinate/source selection projection, deterministic source/visible extraction, generic range matches, and rich sidecar fragments without clipboard or active selection state.
- Rich metadata hardening has landed internally: rich handles and materialize options are runtime validated, span/raw-visible maps have indexed range lookup, and release benchmarks track rich index counters without expanding public API.
- Holistic release pass has internalized legacy public-looking dist modules under `dist/internal/`, hardened package smoke, and verified docs/package exports/tarball contents tell one terminal-first story.
- Initial competitive benchmark harness, marketing guardrails, adoption-growth playbook, and post-publishability technical roadmap have landed.
- Post-publishability master plan has landed to coordinate future API, security, recipes, benchmark, performance, append, and launch-readiness swarms.
- Public API boundary gate has landed with opaque prepared handles, declaration snapshots, runtime export allowlists, and negative package smoke checks.
- Production/security rich sidecar gate has landed with host-neutral profiles, raw retention policy, redacted diagnostics, OSC8/bidi/DoS policy, and opt-in ANSI reconstruction.
- Host-neutral recipes have landed for structured transcript-like viewports, terminal pane resize, editor source mapping, and rich ANSI log viewers, with public-import scanning and incubating API labels.
- Benchmark evidence gate has landed: the optional competitive benchmark emits `pretext-tui-benchmark-evidence@1` JSON with raw samples, p50/p95 policy, hashes, runtime/dependency metadata, and comparator semantic matrices.
- Initial terminal hot-path performance pass has landed: prepared grapheme/source geometry is reused across layout/source/append paths, page-cache misses seek once then walk sequentially, anchor/source lookup insertion avoids per-anchor sorting, and release benchmark counters now expose line/rich lookup behavior instead of relying on wall-clock timing alone.
- Phase 7 rich metadata hardening recovery has landed with approval status `approve with documented residual risk`.
- Phase 8 append-only chunked storage has landed behind `PreparedTerminalCellFlow` with focused parity, seam, invalidation, benchmark evidence, and review status `approve with documented residual risk`.
- Phase 9 performance, memory-budget, and evidence work has landed with approval status `approve with documented residual risk`: search/selection/range counters, modelled memory budgets, `memory-budget-check:tui`, release-gate consistency tests, and claim guardrails are implemented.
- Phase 10 adoption evidence and launch-readiness work has landed with approval status `approve with documented residual risk`: capability/correctness/security matrices, incubating API approval index, generic agent transcript recipe, clean local evidence report citation, recipe public-import scan, package-smoke recipe consumer coverage, and launch-copy guardrails are implemented.
- Release-candidate polish has landed for `0.1.0-alpha.0`: versioned package metadata, alpha changelog wording, package `SECURITY.md`, and a local compare feel demo.

## Not Worth Doing Now

- Do not chase browser pixel parity.
- Do not add Canvas or DOM fallback.
- Do not monkey-patch web globals.
- Do not build a host app framework.
- Do not add renderer-specific dependencies.
- Do not expose host-specific security profiles or adapter-specific knobs.
- Do not keep duplicate public docs for old and new products.

## Fixed Decisions

- The default width profile is `terminal-unicode-narrow@1`.
- Rich materialization exposes structured metadata by default and emits ANSI text only through explicit, policy-bound opt-in.
- Root-level `dist/` is reserved for public wrappers; implementation modules ship only under `dist/internal/` for declaration/runtime resolution.
