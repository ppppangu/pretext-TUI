# Migration Status

This repository has a publishable `pretext-TUI` terminal-cell text layout package baseline. Active work keeps the package host-neutral while tightening API boundaries, production/security posture, benchmark evidence, performance telemetry, and future append-storage design.

## Current Snapshot

The package has typed validation scripts, static no-browser gating, reference goldens, corpus invariants, deterministic fuzzing, benchmark guardrails, tarball smoke verification, a deterministic terminal demo, fixed-column helpers for large text seek/page/source/coordinate-projection/append workflows with runtime-opaque handles, and a root `dist/` surface limited to public entry wrappers.

Current hardening covers declaration-checked public API boundaries, host-neutral rich-sidecar security profiles, public-only adoption recipes, optional raw-sample benchmark evidence reports with provenance and semantic caveats, and release benchmark telemetry for prepared geometry reuse plus remaining materialization-time segmentation. Remaining roadmap items are planning and review artifacts, not claims that host integrations or chunked append storage are implemented.

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
| Terminal rich sidecar | Incubating `./terminal-rich-inline` available with production/security profiles and opt-in ANSI materialization |
| TUI demo | Mixed transcript fixture and terminal-demo script available |
| Virtual text primitives | Opaque sparse line index, page cache, source lookup, and append invalidation available |
| Coordinate projection | Source-offset, cursor, and row projection available over prepared/source/line handles |
| Publishable tarball hygiene | Complete; implementation modules are internalized under `dist/internal/` and root `dist/` only exposes public wrappers |
| Competitive benchmark harness | Optional local text-layout primitive comparison available; not a release gate or renderer benchmark |
| Adoption and marketing roadmap | Technical roadmap and claim-guarded launch playbook available |
| Post-publishability master plan | Reference plan for remaining gated work; not an implementation claim |
| Public API boundary gate | Complete; runtime exports, package subpaths, opaque handles, and declarations are checked |
| Production/security gate | Complete for rich sidecar defaults; broader support/provenance notes remain future adoption work |
| Host-neutral recipes | Public-only docs/test examples; no host adapters |
| Benchmark evidence gate | Optional competitive benchmark emits `pretext-tui-benchmark-evidence@1` reports |
| Hot-path instrumentation and first optimizations | Prepared geometry is reused across layout/source/append paths, page-cache misses walk sequentially, anchor/source insertion avoids per-anchor sorting, and benchmark counters expose remaining materialization segmentation |

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
- [docs/production/README.md](docs/production/README.md)
- [docs/recipes/README.md](docs/recipes/README.md)
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md)
- [docs/plans/2026-04-24-post-publishability-master-plan.md](docs/plans/2026-04-24-post-publishability-master-plan.md)
- [docs/roadmap/library-adoption-performance-roadmap.md](docs/roadmap/library-adoption-performance-roadmap.md)
- [docs/marketing/README.md](docs/marketing/README.md)
- [docs/marketing/adoption-growth-playbook.md](docs/marketing/adoption-growth-playbook.md)

## Active TUI Validation Data

- `status/tui-dashboard.json`
- `accuracy/tui-reference.json`
- `benchmarks/tui.json`
- `corpora/tui-step10.json`

These files are active validation inputs/status data for the current release gate.

## Removed Product Surface

Browser pages, demo workflow, browser check scripts, and browser snapshot dashboards are no longer part of the active product surface. Git history remains the archive for removed source-project product material.
