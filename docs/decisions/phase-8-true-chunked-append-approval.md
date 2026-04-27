<!-- 补建说明：该文件为后续补建，用于记录 Phase 8 append-only chunked storage 的 design/execution/review 审批、残余风险与 claim 边界；当前进度：Phase 8 review 状态为 approve with documented residual risk，stage closeout gates 已通过。 -->
# Phase 8 Append-Only Chunked Storage Approval

## Scope

Phase 8 targets append-only chunked storage behind the existing `PreparedTerminalCellFlow` public handle.

Approved direction for implementation:

- internal sealed chunks plus one open normalization/segmentation tail
- global UTF-16 source offsets over sanitized visible source text
- prepared-reader backed output through the existing capability boundary
- source-first append invalidation that continues to drive line index, page cache, and layout bundle invalidation
- counters and benchmark workloads that prove append no longer reprepares the full accumulated buffer on every append

Not approved in this phase:

- arbitrary insert/delete/replace editing
- destructive prefix eviction
- named-host adapters or exports
- renderer, PTY, clipboard, filesystem, browser, DOM, or Canvas behavior
- a second public prepare/layout/materialize pipeline
- broad README or marketing claims beyond the narrow append-only chunked storage evidence

## Design Status

Implemented. Phase 8 design swarm reviewed:

- storage architecture and safe sealing boundaries
- normalization and segmentation overlap strategy
- source offset/cursor identity across chunk boundaries
- invalidation semantics for line/page/layout-bundle caches
- benchmark counters and workload shape
- docs/status/claim restrictions

Implementation summary:

- `appendTerminalCellFlow()` now appends through internal normalized source state instead of concatenating full raw text and calling full `prepareTerminal()` on every append.
- The flow stores sealed prepared chunks plus one open normalized tail.
- Prepared output remains reader-backed through the existing `PreparedTerminalReader` capability boundary.
- `TerminalAppendStrategy` gained chunked strategy literals while preserving the existing invalidation record shape.
- Internal debug stats and benchmark counters track append calls, analyzed source units, full-reprepare fallbacks, chunk count, final source units, and open-tail units.

## Focused Gates

Required before Phase 8 closeout:

- `bun run typecheck:tui` — passed
- `bun run typecheck:tui-validation` — passed
- `bun test tests/tui/chunked-append-parity.test.ts tests/tui/single-store-reader-parity.test.ts tests/tui/virtual-text.test.ts tests/tui/layout-bundle.test.ts` — passed
- `bun run benchmark-check:tui` — passed
- `bun run tui-static-gate` — passed

Broader gates run for the current narrow README/status wording:

- `bun run test:tui` — passed
- `bun run tui-oracle-check` — passed
- `bun run tui-corpus-check` — passed
- `bun run tui-fuzz --seed=ci --cases=2000` — passed
- `bun run terminal-demo-check` — passed
- `bun run api-snapshot-check` — passed
- `bun run package-smoke-test` — passed with extended timeout
- `bun run prepublishOnly` — passed after lint-warning cleanup

## Claim Restrictions

Do not claim:

- universal append speedups
- arbitrary editing support
- lossy prefix eviction
- host runtime integration
- named-host transcript integration
- benchmark conclusions without reproducible counter evidence

## Residual Risks

- Open-tail sealing is conservative and can keep long unbroken URL/numeric/text runs in the tail until a safe boundary appears. Owner: Phase 9 performance owner. Follow-up gate: append memory/perf evidence over long unbroken runs. Why non-blocking: parity is preserved and benchmark evidence covers bounded append-heavy transcript-like workloads without full-reprepare fallback.
- `reprepareSourceCodeUnits` now means analyzed source units for the append path, not final prepared source length, when strategy starts with `chunked-append-`. Owner: API/package owner. Follow-up gate: API snapshot/package smoke plus README/contract review before stable `0.1`. Why non-blocking: the strategy literal disambiguates semantics and layout-bundle validation handles both full and chunked strategies.
- Internal debug stats are intentionally private and imported only by validation/benchmark code. Owner: public API owner. Follow-up gate: `api-snapshot-check` and package smoke private import checks. Why non-blocking: canonical public facade does not export chunk internals.
- Composite reader stores still copy segment metadata when composing the reader-backed prepared handle. Owner: Phase 9 performance owner. Follow-up gate: memory/perf evidence must distinguish chunked append from O(1) append claims. Why non-blocking: the public API remains host-neutral and correctness gates prove no full accumulated reprepare fallback on the covered append workloads.

## Review Status

Review swarm conclusion: `approve with documented residual risk`.

- Architecture/API review: approve with documented residual risk.
- Tests/performance/evidence review: approve after fixing append-sequence `prepareCalls` accounting and parity-checkpoint validation.
- Docs/status/claim review: approve with documented residual risk after syncing status, claim wording, and gate records.

Downstream Phase 9 may begin from the documented residual risks and append/memory evidence work.
