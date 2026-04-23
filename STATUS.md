# Migration Status

This repository is being migrated into `pretext-TUI`, a pure terminal-cell text layout package.

## Current Phase

Task 3 has replaced the active measurement boundary with deterministic terminal cell-width measurement and expanded the TUI typecheck boundary over the migrated runtime.

The public API names are still the compatibility `prepare/layout` surface. Task 4 owns adding terminal-first API names and cursor/range source mapping.

## Target Package Status

| Area | Status |
| --- | --- |
| Terminal contract | Initial contract landed |
| Host boundary | Initial boundary landed |
| Browser product surface | Removed from active package/scripts/workflows |
| Terminal API | Pending |
| Terminal width backend | Initial backend landed |
| TUI validation stack | Pending |
| Package export surface | Private migration mode; final exports pending |
| TUI demo | Pending |
| Publishable tarball hygiene | Pending |

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
