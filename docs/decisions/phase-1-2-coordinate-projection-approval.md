<!-- 补建说明：该文件为后续补建，用于记录 pretext-TUI 通用终端文本内核 Phase 1/2 坐标契约与双向 projection API 审批；当前进度：首版记录已落地 API、review 修正、验证 gate 与 residual risk。 -->
# Phase 1/2 Coordinate Projection Approval

## Scope

Phase 1 documents the universal coordinate domains and public API tiers. Phase 2 adds incubating host-neutral projection helpers:

- `projectTerminalCoordinate(prepared, { sourceIndex, lineIndex }, { row, column, bias? })`
- `projectTerminalSourceRange(prepared, { sourceIndex, lineIndex }, { sourceStart, sourceEnd })`

These helpers return data only. They do not implement renderer behavior, pointer state, selection state, search UI, clipboard, highlighting, or host-specific structure semantics.

## Decision

Approval: approve with documented residual risk.

The runtime implementation stays behind existing prepared/source/line capability boundaries. Public declarations expose only terminal rows, cell columns, source offsets, cursors, and generic source-range fragments. Internal reader-store and geometry details remain private.

Review-requested changes were resolved:

- out-of-range coordinate hit-test now validates the source-index handle before returning `null`
- reader-store parity now covers row+column projection and source-range projection
- host boundary now marks coordinate/rich/page helpers as incubating
- claim guards now cover `STATUS.md`, `TODO.md`, and `docs/decisions`
- package smoke now type-smokes and executes the new projection exports

## Gates

Run on April 26, 2026:

- `bun run check`
- `bun run test:tui`
- `bun run api-snapshot-check`
- `bun run package-smoke-test`
- `bun run terminal-demo-check`
- `bun run benchmark-check:tui`
- `bun run tui-oracle-check`
- `bun run tui-corpus-check`
- `bun run tui-fuzz --seed=ci --cases=2000`

All passed.

## Residual Risk

Owner: terminal text kernel maintainer.

Risk: source-range fragments are intentionally generic and currently project through existing sparse row indexes. They are suitable for hit-test, hover, selection planning, and source-aware host features, but they are not yet a full search session, selection/extraction model, or range sidecar index.

Why it does not block the next phase: docs and API contract classify the helpers as incubating, tests cover forged/mismatched handles and reader-backed parity, and host behavior remains outside the package boundary.

Follow-up gate: future search, selection, and range-sidecar phases must add their own approval records, focused tests, package smoke coverage, and claim scans before any stable API promotion.

