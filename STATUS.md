# Migration Status

This repository is being migrated into `pretext-TUI`, a pure terminal-cell text layout package.

## Current Phase

Task 5 has retargeted the package root and `./terminal` exports to the terminal facade, removed private migration mode, and hardened package smoke tests around the terminal API surface.

Task 6 has landed the terminal rich metadata sidecar under `./terminal-rich-inline`.

## Target Package Status

| Area | Status |
| --- | --- |
| Terminal contract | Initial contract landed |
| Host boundary | Initial boundary landed |
| Browser product surface | Removed from active package/scripts/workflows |
| Terminal API | Initial facade landed |
| Terminal width backend | Initial backend landed |
| TUI validation stack | Core tests landed; broader stack pending |
| Package export surface | Terminal root and `./terminal` exports landed |
| Package smoke test | Terminal API and tarball surface covered |
| Terminal rich sidecar | Initial `./terminal-rich-inline` landed |
| TUI demo | Pending |
| Publishable tarball hygiene | Core package surface landed; broader release gate pending |

## Current Sources Of Truth

- [README.md](README.md)
- [TODO.md](TODO.md)
- [DEVELOPMENT.md](DEVELOPMENT.md)
- [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md)
- [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md)
- [docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md](docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md)

## Future TUI Dashboards

The implementation plan reserves these future status files:

- `status/tui-dashboard.json`
- `accuracy/tui-reference.json`
- `benchmarks/tui.json`
- `corpora/tui-step10.json`

They do not exist yet as active release gates.

## Removed Product Surface

Browser pages, demo workflow, browser check scripts, and browser snapshot dashboards are no longer part of the active product surface. Git history remains the archive for removed source-project product material.
