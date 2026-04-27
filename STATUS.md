# Migration Status

This repository has a publishable `pretext-TUI` terminal-cell text layout package baseline. Active work keeps the package host-neutral while tightening API boundaries, production/security posture, benchmark evidence, performance telemetry, and append-storage evidence.

## Current Snapshot

The package has typed validation scripts, static no-browser gating, reference goldens, corpus invariants, deterministic fuzzing, benchmark guardrails, tarball smoke verification, a deterministic terminal demo, fixed-column helpers for large text seek/page/source/coordinate-projection/append workflows with runtime-opaque handles, an incubating unified layout bundle for coordinated page/projection invalidation, an incubating generic source range sidecar index, incubating source-first search sessions, incubating selection/extraction helpers, and a root `dist/` surface limited to public entry wrappers.

Current hardening covers declaration-checked public API boundaries, host-neutral rich-sidecar security profiles, rich handle and materialize-option validation, internal rich span/raw-visible indexes, public-only adoption recipes, optional raw-sample benchmark evidence reports with provenance and semantic caveats, and release benchmark telemetry for prepared geometry reuse plus rich/search/selection index behavior. Phase 7 is approved with documented residual risk. Phase 8 is approved with documented residual risk after landing an internal append-only chunked storage path behind `PreparedTerminalCellFlow`, with focused parity tests and release benchmark counters covering 1,000 small appends without full-reprepare fallback. Phase 9 is approved with documented residual risk after adding search/selection/range counters, modelled memory-budget telemetry for kernel-owned structures, and release-gate consistency checks. Phase 10 adoption-evidence and launch-readiness work is approved with documented residual risk after linking the API boundary, incubating API index, evidence matrices, recipes, production notes, and report `competitive-tui-20260427-3e95bef-clean-8760e911`; it does not claim stable `0.1`. Search and selection helpers are source-first data APIs only; search UI, active selection behavior, clipboard/copy integration, named-host integration, arbitrary editing, destructive prefix eviction, and host retention policy remain outside the package scope.

## Target Package Status

| Area | Status |
| --- | --- |
| Terminal contract | Documented and active |
| Host boundary | Documented and active |
| Browser product surface | Removed from active package/scripts/workflows |
| Terminal API | Public facade available |
| Terminal width backend | Available |
| TUI validation stack | Static gate, tests, oracle, corpus, fuzz, benchmark, and CI available |
| Package export surface | Terminal root and `./terminal` exports available |
| Package smoke test | Terminal API and tarball surface covered |
| Terminal rich sidecar | Incubating `./terminal-rich-inline` available with production/security profiles, capability-backed rich handles, internal span/raw-visible indexes, and opt-in ANSI materialization |
| TUI demo | Mixed transcript fixture and terminal-demo script available |
| Virtual text primitives | Opaque sparse line index, page cache, source lookup, incubating layout bundle, and append invalidation available |
| Coordinate projection | Source-offset, cursor, and row projection available over prepared/source/line handles or a layout bundle |
| Coordinate/source mapping tier | Incubating; row+column hit-test and source-range fragments are host-neutral data helpers, not UI behavior |
| Generic range sidecar | Incubating; generic source range indexes available with inert ids, kinds, tags, and data |
| Source-first search sessions | Incubating; literal/regex search returns source ranges with optional projection data and no UI state |
| Selection/extraction helpers | Incubating; coordinate/source ranges extract immutable source/visible fragments with no clipboard or active selection state |
| Publishable tarball hygiene | Complete; implementation modules are internalized under `dist/internal/` and root `dist/` only exposes public wrappers |
| Competitive benchmark harness | Optional local text-layout primitive comparison available; not a release gate or renderer benchmark |
| Adoption and marketing roadmap | Technical roadmap and claim-guarded launch playbook available |
| Post-publishability master plan | Reference plan for remaining gated work; not an implementation claim |
| Public API boundary gate | Complete; runtime exports, package subpaths, opaque handles, and declarations are checked |
| Production/security gate | Complete for rich sidecar defaults and Phase 7 handle/index hardening; broader support/provenance notes remain future adoption work |
| Host-neutral recipes | Public-only docs/test examples; no host adapters |
| Benchmark evidence gate | Optional competitive benchmark emits `pretext-tui-benchmark-evidence@1` reports |
| Hot-path instrumentation and first optimizations | Prepared geometry is reused across layout/source/append paths, page-cache misses walk sequentially, anchor/source insertion avoids per-anchor sorting, and benchmark counters expose line/rich/search/selection index behavior |
| Append-only chunked storage | Phase 8 approved with documented residual risk behind the existing flow handle; incubating and evidence-gated, with no arbitrary editing or destructive prefix eviction |
| Memory budget gate | Phase 9 approved with documented residual risk; `memory-budget-check:tui` models kernel-owned layout/search/selection/rich/range/chunked structures without host UI memory |
| Phase 10 launch-readiness | Approved with documented residual risk; API matrix, evidence matrices, recipes, production notes, and benchmark report-id anchors are available; no stable `0.1` or named integration claim |

## Reference Map

Start with [docs/README.md](docs/README.md) for the fact-source hierarchy. The links below are the compact working reference map:

- [README.md](README.md)
- [TODO.md](TODO.md)
- [DEVELOPMENT.md](DEVELOPMENT.md)
- [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md)
- [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md)
- [docs/contracts/public-api-boundary.md](docs/contracts/public-api-boundary.md)
- [docs/contracts/terminal-security-profile.md](docs/contracts/terminal-security-profile.md)
- [docs/evidence/README.md](docs/evidence/README.md)
- [docs/evidence/benchmark-claims.md](docs/evidence/benchmark-claims.md)
- [docs/evidence/adoption-evidence-pack.md](docs/evidence/adoption-evidence-pack.md)
- [docs/evidence/kernel-capability-matrix.md](docs/evidence/kernel-capability-matrix.md)
- [docs/evidence/correctness-matrix.md](docs/evidence/correctness-matrix.md)
- [docs/production/README.md](docs/production/README.md)
- [docs/production/security-support-provenance-matrix.md](docs/production/security-support-provenance-matrix.md)
- [docs/recipes/README.md](docs/recipes/README.md)
- [docs/decisions/incubating-api-approval-index.md](docs/decisions/incubating-api-approval-index.md)
- [docs/decisions/phase-10-adoption-evidence-launch-readiness-approval.md](docs/decisions/phase-10-adoption-evidence-launch-readiness-approval.md)
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md)
- [docs/plans/2026-04-24-post-publishability-master-plan.md](docs/plans/2026-04-24-post-publishability-master-plan.md)
- [docs/roadmap/library-adoption-performance-roadmap.md](docs/roadmap/library-adoption-performance-roadmap.md)
- [docs/marketing/README.md](docs/marketing/README.md)
- [docs/marketing/adoption-growth-playbook.md](docs/marketing/adoption-growth-playbook.md)

## Active TUI Validation Data

- `status/tui-dashboard.json`
- `accuracy/tui-reference.json`
- `benchmarks/tui.json`
- `benchmarks/tui-memory-budgets.json`
- `corpora/tui-step10.json`

These files are active validation inputs/status data for the current release gate.

## Removed Product Surface

Browser pages, demo workflow, browser check scripts, and browser snapshot dashboards are no longer part of the active product surface. Git history remains the archive for removed source-project product material.
