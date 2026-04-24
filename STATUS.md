# Migration Status

This repository now has a publishable `pretext-TUI` terminal-cell text layout package baseline. Current work hardens it into a broader host-neutral terminal text kernel with clearer API boundaries, production/security posture, benchmark evidence, performance work, and future chunked append storage.

## Current Phase

Task 10 has landed the final publishable tarball hygiene pass. The package now has typed validation scripts, static no-browser gating, reference goldens, corpus invariants, deterministic fuzzing, benchmark guardrails, tarball smoke verification, a deterministic terminal demo, fixed-column helpers for large text seek/page/source/append workflows with runtime-opaque handles, and a root `dist/` surface limited to public entry wrappers.

Post-publishability Task 1 through Task 5 have landed: public API boundaries are declaration-checked, the rich sidecar has host-neutral security profiles, host-neutral adoption recipes show public-only composition, the optional competitive benchmark now emits raw-sample evidence reports with provenance and semantic caveats, and the release benchmark gate now tracks prepared geometry reuse plus remaining materialization-time segmentation. Remaining roadmap items are still planning and review artifacts, not claims that host integrations or chunked append storage are already implemented.

## Target Package Status

| Area | Status |
| --- | --- |
| Terminal contract | Initial contract landed |
| Host boundary | Initial boundary landed |
| Browser product surface | Removed from active package/scripts/workflows |
| Terminal API | Initial facade landed |
| Terminal width backend | Initial backend landed |
| TUI validation stack | Static gate, tests, oracle, corpus, fuzz, benchmark, CI landed |
| Package export surface | Terminal root and `./terminal` exports landed |
| Package smoke test | Terminal API and tarball surface covered |
| Terminal rich sidecar | Initial `./terminal-rich-inline` landed with production/security profiles and opt-in ANSI materialization |
| TUI demo | Mixed transcript fixture and terminal-demo script landed |
| Virtual text primitives | Opaque sparse line index, page cache, source lookup, and append invalidation landed |
| Publishable tarball hygiene | Complete; implementation modules are internalized under `dist/internal/` and root `dist/` only exposes public wrappers |
| Competitive benchmark harness | Optional local text-layout primitive comparison landed; not a release gate or renderer benchmark |
| Adoption and marketing roadmap | Initial technical roadmap and claim-guarded launch playbook landed |
| Post-publishability master plan | Landed as the next execution entry point; implementation swarms should start from its gated batch order |
| Public API boundary gate | Complete; runtime exports, package subpaths, opaque handles, and declarations are checked |
| Production/security gate | Complete for rich sidecar defaults; broader support/provenance notes remain future adoption work |
| Host-neutral recipes | Complete for Task 3; recipes are docs/test examples only and do not add host adapters |
| Benchmark evidence gate | Complete for Task 4; competitive benchmark is optional and emits `pretext-tui-benchmark-evidence@1` reports |
| Hot-path instrumentation and first optimizations | Initial Task 5 pass complete; prepared geometry is reused across layout/source/append paths, page-cache misses walk sequentially, anchor/source insertion avoids per-anchor sorting, and benchmark counters expose remaining materialization segmentation |

## Current Sources Of Truth

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
