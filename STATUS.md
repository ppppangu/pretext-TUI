# Migration Status

This repository is being migrated into `pretext-TUI`, a pure terminal-cell text layout package.

## Current Phase

Task 9 has landed sparse-anchor virtual text primitives. The package now has typed validation scripts, static no-browser gating, reference goldens, corpus invariants, deterministic fuzzing, benchmark guardrails, tarball smoke verification, a deterministic terminal demo, and fixed-column helpers for large text seek/page/source/append workflows with runtime-opaque handles.

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
| Terminal rich sidecar | Initial `./terminal-rich-inline` landed |
| TUI demo | Mixed transcript fixture and terminal-demo script landed |
| Virtual text primitives | Opaque sparse line index, page cache, source lookup, and append invalidation landed |
| Publishable tarball hygiene | Release gate landed; internal legacy-shaped dist modules still need final Task 10 cleanup |

## Current Sources Of Truth

- [README.md](README.md)
- [TODO.md](TODO.md)
- [DEVELOPMENT.md](DEVELOPMENT.md)
- [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md)
- [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md)
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md)

## Active TUI Validation Data

- `status/tui-dashboard.json`
- `accuracy/tui-reference.json`
- `benchmarks/tui.json`
- `corpora/tui-step10.json`

These files are active validation inputs/status data for the current release gate.

## Removed Product Surface

Browser pages, demo workflow, browser check scripts, and browser snapshot dashboards are no longer part of the active product surface. Git history remains the archive for removed source-project product material.
