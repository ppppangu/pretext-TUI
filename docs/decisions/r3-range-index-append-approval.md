<!-- 补建说明：该文件为后续补建，用于记录 R3 append-friendly incremental range-index maintenance 的范围、批准导出、parity 决策与残余风险；当前进度：append 导出已落地并通过 focused/broader gates，状态为 approve with documented residual risk。 -->
# R3 Range Index Append Approval

## Scope

R3 adds append-friendly incremental maintenance to the incubating generic range sidecar index introduced in [Phase 4](phase-4-range-sidecar-approval.md). It lets hosts grow an existing `TerminalRangeIndex` with additional generic source ranges without rebuilding the whole input or disturbing the existing handle.

The append path stays host-neutral and data-only. It does not change what a range means, does not interpret `id`, `kind`, `tags`, or `data`, and does not add transcript, log, diff, test, editor, agent/tool, search, selection, highlighting, diagnostics UX, or host actions.

## Approved Export

Incubating runtime export:

- `appendTerminalRanges(index, newRanges)`

It returns a new opaque frozen index handle. The input handle stays valid and queryable. No new public types are introduced; appended ranges are the existing `TerminalRange` shape and the result is the existing `TerminalRangeIndex` shape.

## Parity Decision

The hard contract is observational parity with one-shot construction: for any split of a range set into `[base, appended]`, `appendTerminalRanges(createTerminalRangeIndex(base), appended)` returns the same query results, in the same order, for every point and source-range query as `createTerminalRangeIndex([...base, ...appended])`. Appended ranges continue the same global ordering sequence the one-shot constructor would have assigned, and the two sorted runs are merged with the same comparator. Because range ids must be unique across the accumulated set, every distinct pair of ranges is strictly ordered before the order tiebreak, which makes the merge unconditionally parity-safe. A release benchmark workload pins `terminalRangeIndexRevalidatedRanges` at exactly `0` across a batched-append run to prove base ranges are never revalidated, and a memory-budget workload builds the same final set through batched appends and lands on the same modelled footprint as the one-shot baseline.

## Arbitrary-Offset Decision

Appended ranges may target any source offsets, including offsets earlier than ranges already in the index. The index is a sidecar over stable host-owned UTF-16 source offsets, so placement is by source position, not by append order. Hosts that append late ranges still receive a fully ordered index. Cross-batch and intra-batch duplicate ids are rejected with the same uniqueness error as one-shot construction, and a rejected append leaves the base index intact.

## Review Status

Approval: approve with documented residual risk.

Residual risk: the appended index reuses the base range element objects, but the sorted index arrays (the ordered range spine and its prefix-max-end companion) are rebuilt on each append. There is no structural spine sharing across appends, so per-append work is proportional to the total accumulated range count, and the appended index reports its full footprint with no shared-bytes discount. This is acceptable for the incubating sidecar because the element-reuse path already avoids re-validating and re-cloning base ranges, and the opaque handle can adopt a sharing-aware spine later without public API churn.

Residual risk: this record does not promote the range sidecar to stable `0.1`. Stabilization still depends on the Phase 4 memory/search-interaction review and frozen data-shape policy. The Phase 4 Proxy-detection runtime caveat continues to apply unchanged to the append validation path.
