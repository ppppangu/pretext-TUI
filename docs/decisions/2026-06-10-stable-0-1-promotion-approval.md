<!-- 补建说明：该文件为后续补建，用于记录 core seven 终端 API 的 stable 0.1 promotion 范围、semver 承诺、显式 non-promotion、证据引用与残余风险；当前进度：approve with documented residual risk，仅提升 core seven，其余 surface 仍 incubating。 -->
# Stable 0.1 Promotion Approval

This record promotes the core terminal-cell layout surface — the seven runtime
names plus their travelling option and result shapes — to a stable `0.1`
contract. Everything else stays incubating until its own promotion record exists.

## Scope

The promoted runtime names are the seven from
`terminalStableRuntimeExportNames` in `scripts/public-api-contract.ts`:

- `TERMINAL_START_CURSOR`
- `layoutNextTerminalLineRange`
- `layoutTerminal`
- `materializeTerminalLineRange`
- `measureTerminalLineStats`
- `prepareTerminal`
- `walkTerminalLineRanges`

The following travelling types move with that surface and are promoted with it:

- `TerminalPrepareOptions`
- `TerminalLayoutOptions`
- `TerminalFixedLayoutOptions`
- `TerminalWidthProfileInput`
- `TerminalWidthProfile`
- `AmbiguousWidthPolicy`
- `EmojiWidthPolicy`
- `RegionalIndicatorPolicy`
- `ControlCharPolicy`
- `TerminalLayoutResult`
- `TerminalLineStats`
- `TerminalLineRange`
- `TerminalLineBreak`
- `TerminalCursor`
- `MaterializedTerminalLine`
- `PreparedTerminalText`

`PreparedTerminalText` is promoted ONLY as an opaque handle: hosts may receive
it, hold it, and pass it back into the promoted functions. Its internals stay
private under the existing forbidden-token gates (`forbiddenPreparedHandleDeclarationTokens`,
`forbiddenPublicDeclarationTokens`, and the reader-boundary static gate). No
field, anchor, segment store, reader, or geometry on the handle is promoted.

## Semver Commitment

Within the `0.1.x` line, the promoted names and listed option/result shapes will
not be removed or break; additive backward-compatible changes are allowed.
Pre-`1.0`, any breaking change to the promoted surface requires a minor version
bump and an updating approval record. Opaque-handle internals, error message
strings, and incubating surfaces are out of this promise.

## Explicit Non-Promotions

This record does not promote anything in
`terminalIncubatingRuntimeExportNames`. Those families stay incubating:

- the layout bundle family (`createTerminalLayoutBundle()`,
  `getTerminalLayoutBundlePage()`, `getTerminalLayoutBundleTailPage()`,
  `measureTerminalLayoutBundleRows()`, `invalidateTerminalLayoutBundle()`)
- the sparse line index family (`createTerminalLineIndex()`,
  `getTerminalLineRangeAtRow()`, `getTerminalLineIndexTailRanges()`,
  invalidation and metadata helpers)
- the fixed-column page cache family (`createTerminalPageCache()`,
  `getTerminalLinePage()`, `materializeTerminalLinePage()`, page-cache stats and
  invalidation)
- the source-offset index family (`createTerminalSourceOffsetIndex()`,
  `getTerminalCursorForSourceOffset()`, `getTerminalSourceOffsetForCursor()`)
- the coordinate/source/row projection family (`projectTerminalSourceOffset()`,
  `projectTerminalCursor()`, `projectTerminalRow()`,
  `projectTerminalCoordinate()`, `projectTerminalSourceRange()`)
- the generic range sidecar family, including `appendTerminalRanges()`
  (`createTerminalRangeIndex()`, `getTerminalRangesAtSourceOffset()`,
  `getTerminalRangesForSourceRange()`)
- source-first search sessions, including the `matchLimit` cap and stats
  (`createTerminalSearchSession()`, `getTerminalSearchSessionStats()`, the
  source-range and directional match helpers)
- selection and extraction helpers (`createTerminalSelectionFromCoordinates()`,
  `extractTerminalSourceRange()`, `extractTerminalSelection()`)
- the append-only cell flow family (`prepareTerminalCellFlow()`,
  `appendTerminalCellFlow()`, cell-flow generation/prepared accessors)
- tail-follow row queries for follow-mode viewports
- custom terminal width profiles supplied through prepare-time overrides
- the `pretext-tui/terminal-rich-inline` subpath in its entirety

## Evidence

The promoted surface is exercised and frozen by the existing gates, cited by
command:

- `bun run tui-oracle-check`
- `bun run tui-corpus-check`
- `bun run tui-fuzz --seed=ci --cases=2000`
- `bun run api-snapshot-check`
- `bun run package-smoke-test`
- `bun run release-gate:tui`

Byte-drift of the layout/width goldens is held by
`bun run tui-reference-regenerate --check`. The stable/incubating partition is
asserted exactly — not just the union — by `tests/tui/public-api-boundary.test.ts`
against the source facade, with the name lists owned by
`scripts/public-api-contract.ts`.

Benchmark evidence is the currently accepted clean report
`competitive-tui-20260610-360289b-clean-634d0394` under
`docs/evidence/benchmark-reports/`. Report ids change per commit; treat the
current accepted clean report under `docs/evidence/benchmark-reports/` as the
citation target rather than pinning this string forever.

## Residual Risk

- This is an API-shape commitment only. It carries no performance promise and no
  memory promise; the modelled budgets and benchmark counters stay evidence, not
  guarantees.
- Opaque-handle internals may evolve freely. Hosts that reach into handle
  internals are outside the contract.
- Incubating inputs that the promoted functions accept — notably width-profile
  overrides — may still change their own incubating parts. The promoted core
  behavior for the default `terminal-unicode-narrow@1` profile is what is frozen.

Approval: approve with documented residual risk.
