# TUI Corpus Status

The corpus directory is currently a fixture source for the terminal migration.

## Current Role

- Keep reusable text fixtures.
- Remove browser snapshot status from the active package story.
- Feed the active TUI corpus manifest used by the release gate.

## Active TUI Outputs

The active validation files are:

- `corpora/tui-step10.json`
- `status/tui-dashboard.json`

`corpora/tui-step10.json` references existing `*.txt` fixtures instead of copying large text payloads.

## Not Active

Browser width sweeps, browser mismatch fields, and browser dashboard counts are no longer active corpus status for this package.
