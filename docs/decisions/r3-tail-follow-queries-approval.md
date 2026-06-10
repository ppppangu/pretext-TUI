<!-- 补建说明：该文件为后续补建，用于记录 R3 tail-follow row queries 的范围、批准导出、内部 tail-anchored 度量决策、claim 限制与残余风险；当前进度：line-index/bundle tail 导出与 counter 守门已落地并通过 focused/broader gates，状态为 approve with documented residual risk。 -->
# R3 Tail-Follow Queries Approval

## Scope

R3 adds read-only tail-row lookups to the incubating fixed-column helpers introduced in [Phase 3](phase-3-layout-bundle-approval.md). They let a follow-mode host that appends through `PreparedTerminalCellFlow` ask for "the last N rows at the current generation" without first deriving the total row count by hand and paging backward.

The four exported names are:

- `getTerminalLineIndexTailRanges(prepared, index, request)` — line-index primitive returning the final rows as raw `TerminalLineRange` data with no page cache or page-size involvement.
- `getTerminalLayoutBundleTailPage(prepared, bundle, request)` — bundle convenience returning the final rows page-shaped through the existing page cache.
- `measureTerminalLayoutBundleRows(prepared, bundle)` — bundle row-count accessor that delegates to the line index.
- `TerminalLineIndexTailRequest` — the `{ rowCount }` request shape shared by both tail entry points.

The tail path stays host-neutral and data-only. It does not add a viewport, scroll model, follow/stick policy, or any new mutation. Tail queries are read-only lookups of the current generation and never advance the generation.

## Internal Tail-Anchored Measure Decision

Resolving a tail derives the total row count first. The load-bearing change is that `measureTerminalLineIndexRows()` no longer restarts row counting from row zero when its cached total is invalidated. Post-append total-row measurement replays from the last surviving anchor instead of row zero, with the replay distance counter-gated in the release benchmark. The row-zero anchor always survives invalidation, so the anchor array is never empty, and append invalidation keeps anchors strictly before the invalidation boundary, so the forward walk only reflows the invalidated-plus-appended tail rows plus at most one anchor interval.

Row totals are preserved bit-for-bit for every input, including the empty-source and trailing-newline cases: the forward walk fixes the same total the row-zero loop produced because both terminate on the first null line. The replay-distance stat is recorded per sparse-anchor segment, so the existing `maxReplayRows` bound is unchanged. Tail row totals match the eager `collectTerminalLines()` ground truth.

## Counter-Gated Bound

Two release counters back the tail path: `terminalTailQueries` increments once per tail lookup, and `terminalMeasureReplayRows` accumulates the rows replayed by the tail-anchored measure fast path. A new benchmark workload `chunked-append-1000-small-tail-follow` reads the bundle tail page after each of 1000 appends and asserts `terminalTailQueries` fires on every append, `appendFullReprepareFallbacks` stays at zero, and `terminalMeasureReplayRows` stays under a conservative ceiling derived empirically. The ceiling is set roughly twice the observed fast-path value and comfortably below the replay total a row-zero-per-append regression would record, so reintroducing that regression fails the gate loudly.

## Claim Restrictions

Do not claim constant-time, input-independent, instant, or zero-cost tail lookups, and do not claim fast scroll or fast resize. The approved framing is the counter-gated one above: post-append total-row measurement replays from the last surviving anchor instead of row zero, with the replay distance counter-gated in the release benchmark. The tail cost is a function of the reflowed tail rows and the anchor interval, not a fixed constant.

## Non-Goals

- No scroll state, viewport controller, or rendered output.
- No auto-stick or follow policy; the host decides whether a viewport pins to the tail.
- No retention or eviction behavior; the tail reuses the existing internal row memo and the existing anchor and page-cache accounting, with no new memory budget entry.

## Review Status

Approval: approve with documented residual risk.

Residual risk: the post-append tail cost bound depends on anchors surviving invalidation. The current append invalidation keeps anchors strictly before the boundary and always retains the row-zero anchor, so the replay stays bounded by the reflowed tail; a future invalidation strategy that discarded more anchors would widen the replay and must re-derive the benchmark ceiling.

Residual risk: at the bundle level the tail page inherits the page cache's `rowCount <= pageSize` constraint, so a tail wider than the configured page size throws the existing page error. Hosts that need a wider tail use the line-index primitive, which carries no page-size cap. This record does not promote the fixed-column helpers to stable `0.1`; the [Phase 3](phase-3-layout-bundle-approval.md) residual review obligations continue to apply unchanged.
