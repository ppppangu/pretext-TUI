# Migration Status

This repository is being migrated into `pretext-TUI`, a pure terminal-cell text layout package.

## Current Phase

Task 1 has frozen the initial package contracts and rewritten the active documentation.

The current source tree still contains upstream browser-oriented implementation and tooling. Those files are not the final product surface.

## Target Package Status

| Area | Status |
| --- | --- |
| Terminal contract | Initial contract landed |
| Host boundary | Initial boundary landed |
| Terminal API | Pending |
| Terminal width backend | Pending |
| TUI validation stack | Pending |
| Package export surface | Pending |
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

## Archived Source Context

Existing source-project browser snapshots and reports may remain in the tree until removal tasks land, but they are no longer the active product-health signal for this package.
