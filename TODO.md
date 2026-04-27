# TODO

Current priorities for maintaining the `0.1.0-alpha.0` release-candidate `pretext-TUI` host-neutral terminal text kernel.

## Active Next

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
- Cite report ids such as `competitive-tui-20260427-3e95bef-clean-8760e911` only with workload ids and semantic caveats; do not copy dynamic timing numbers into prose.

## Completed

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
