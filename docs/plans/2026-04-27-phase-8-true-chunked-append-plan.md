<!-- 补建说明：该文件为后续补建，用于记录 Phase 8 append-only chunked storage 的设计与执行计划；当前进度：Phase 8 implementation 已落地，review 状态为 approve with documented residual risk。 -->
# Phase 8 Append-Only Chunked Storage Plan

## Status

Phase 7 rich metadata hardening is treated as complete with approval status `approve with documented residual risk`.

Phase 8 has implemented the transition from `full reprepare + bounded invalidation metadata` to append-only chunked storage behind the existing public `PreparedTerminalCellFlow` handle.

README, marketing, and public contract text may describe the narrow implemented capability only: append-only chunked storage behind an opaque flow handle, with focused parity tests and benchmark counters. They must not claim arbitrary editing, destructive eviction, host retention, or universal speed.

## Objective

Remove the full accumulated reprepare cost from append-heavy flows while preserving the current public API, host-neutral boundary, sanitized visible source offset contract, and prepared-reader capability boundary.

The target is 1,000 small appends without reparsing/repreparing the full accumulated buffer on every append, while every intermediate flow remains behaviorally equal to `prepareTerminal(fullRaw)` for layout, materialization, source lookup, row projection, page invalidation, and source offsets.

## Non-Negotiable Boundaries

- Keep `PreparedTerminalCellFlow` as the only public append handle.
- Keep `appendTerminalCellFlow()` and `getTerminalCellFlowPrepared()` source-compatible.
- Do not add named-host exports or adapters.
- Do not add renderer, input, pane, focus, PTY, clipboard, filesystem, link opening, persistence, browser, DOM, or Canvas behavior.
- Do not create a second public prepare/layout/materialize pipeline.
- Keep destructive prefix eviction out of Phase 8; only lossless compaction is allowed.
- Keep all source offsets as global UTF-16 offsets over sanitized visible source text.
- Keep append-only semantics; arbitrary insert/delete/replace remains a future buffer design.

## Architecture Direction

Use the existing reader-backed prepared capability as the insertion point:

1. Keep array-backed `prepareTerminal()` unchanged as the full-reference oracle.
2. Add an internal chunked flow state with sealed chunks plus one open tail.
3. Prepare only the open tail and a bounded overlap window needed to preserve normalization and segmentation around append boundaries.
4. Seal stable prefix chunks once their normalization/segmentation can no longer be affected by future appends.
5. Expose the resulting prepared text through `createPreparedTerminalTextFromReader()`, so layout, materialization, source indexes, line indexes, page caches, search, selection, and projection continue to read through the existing `PreparedTerminalReader`.
6. Keep invalidation source-first. The first invalid source offset must snap to a previous safe boundary and drive line-index/page-cache/layout-bundle invalidation.
7. Record counters that distinguish full prepares, tail prepares, sealed chunks, open-tail source units, and append reprepare source units.

The first implementation should favor correctness and explicit evidence over aggressive compaction. Lossless compaction may merge sealed chunks without changing global source offsets or cursor identity.

## Seam Parity Matrix

Each append parity case must compare every intermediate flow against `prepareTerminal(fullRaw)`:

- CRLF split across appends
- normal whitespace collapse across appends
- tab at chunk boundary
- soft hyphen across chunk boundary
- zero-width break across chunk boundary
- WJ, NBSP, NNBSP, and BOM glue
- combining mark split after a base character
- variation selector and keycap continuation
- ZWJ emoji sequence split
- regional flag split
- CJK punctuation and kinsoku carry
- URL-like run split
- numeric run split
- consecutive LFs and final LF

For each case, compare:

- row count and walked ranges
- line widths and break kinds
- materialized text and source text
- sourceStart/sourceEnd values
- cursor/source round trips
- source range projection fragments
- line index pages
- page cache invalidation behavior
- layout bundle invalidation behavior

## Initial Write Set

Expected implementation files:

- `src/terminal-cell-flow.ts`
- `src/terminal-reader-store.ts`
- `src/terminal-prepared-reader.ts`
- `src/terminal-performance-counters.ts`
- append-specific tests under `tests/tui/`
- `tests/tui/single-store-reader-parity.test.ts`
- `tests/tui/virtual-text.test.ts`
- `scripts/tui-benchmark-check.ts`
- `benchmarks/tui.json`
- `docs/decisions/phase-8-true-chunked-append-approval.md`
- `TODO.md`
- `STATUS.md`

Files that should not change unless evidence forces it:

- `src/public-index.ts`
- `src/index.ts`
- `scripts/public-api-contract.ts`
- package exports
- README append wording

## Execution Loop

1. Design swarm
   - Architecture explorer: chunk store, open tail, normalization boundary, prepared-reader integration.
   - API/contracts explorer: public facade compatibility, claim restrictions, approval record.
   - Tests/perf explorer: parity matrix, counters, benchmark workload.
2. Implementation
   - One owner for append/storage core at a time.
   - One owner for counters/benchmark schema at a time.
   - One owner for docs/status/approval at a time.
3. Focused gates
   - `bun run typecheck:tui`
   - `bun run typecheck:tui-validation`
   - new Phase 8 chunked append parity suite
   - `bun test tests/tui/single-store-reader-parity.test.ts tests/tui/virtual-text.test.ts`
   - `bun run benchmark-check:tui`
   - `bun run tui-static-gate`
4. Broader gates
   - `bun run test:tui`
   - `bun run tui-oracle-check`
   - `bun run tui-corpus-check`
   - `bun run tui-fuzz --seed=ci --cases=2000`
   - `bun run terminal-demo-check`
   - `bun run api-snapshot-check`
   - `bun run package-smoke-test`
5. Review swarm
   - Code cleanliness
   - API boundary
   - correctness matrix completion
   - benchmark evidence
   - claim drift
   - technical debt

Phase 8 cannot be marked complete until review returns `approve` or `approve with documented residual risk`.

## Claim Restrictions

After implementation and until launch readiness:

- README must keep append wording narrow and evidence-backed.
- Marketing must not turn append storage into broad streaming-speed claims.
- Benchmark docs may cite focused append counters, not broad superiority claims.
- `appendReprepareCodeUnits` must not be reinterpreted to hide full reprepare behavior; new counters must make the storage strategy clear.

After Phase 8 exits, README wording may upgrade only if the evidence proves append no longer reprepares the full accumulated buffer on every append.
