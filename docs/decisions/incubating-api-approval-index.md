<!-- 补建说明：该文件为后续补建，用于集中索引 pretext-TUI incubating public API 的阶段审批状态、证据入口与稳定化阻塞项；当前进度：Phase 10 launch-readiness 已记录 approve with documented residual risk，未提升任何 incubating API 到 stable 0.1。 -->
# Incubating API Approval Index

This index keeps the advanced public API story reviewable while `pretext-TUI` moves toward launch-readiness. It is not a stable `0.1` promotion record.

The stable candidate core remains `prepare -> layout/range -> materialize`. Every API below is still public but incubating unless a future approval record explicitly promotes it.

## Approval Matrix

| Area | Public surface | Current phase status | Evidence anchors | Still blocked before stable `0.1` |
| --- | --- | --- | --- | --- |
| Coordinate and source mapping | source-offset indexes, row/cursor projection, source-range fragments | Phase 1/2 approved with follow-up gates | [Phase 1/2 approval](phase-1-2-coordinate-projection-approval.md), [public API boundary](../contracts/public-api-boundary.md) | API snapshot review, package smoke coverage, stable projection error semantics |
| Layout bundle | `TerminalLayoutBundle` convenience handle | Phase 3 approved with residual review obligations | [Phase 3 approval](phase-3-layout-bundle-approval.md), [large text paging README section](../../README.md#large-text-paging) | Stable invalidation semantics and handle compatibility review |
| Generic range sidecar | `TerminalRangeIndex` and range lookup helpers | Phase 4 approved as inert host-owned metadata | [Phase 4 approval](phase-4-range-sidecar-approval.md), [structured transcript recipe](../recipes/transcript-viewport.md) | Memory/search interaction review and frozen data-shape policy |
| Source-first search | `TerminalSearchSession` and source-range match helpers | Phase 5 approved as source-first data APIs | [Phase 5 approval](phase-5-search-session-approval.md), [Phase 9 memory evidence](phase-9-performance-memory-evidence-approval.md) | Bounded or streamed search design before any low-memory/stable search claim |
| Selection and extraction | coordinate/source selection helpers and extraction data | Phase 6 approved as immutable data APIs | [Phase 6 approval](phase-6-selection-extraction-approval.md), [editor source mapping recipe](../recipes/editor-source-mapping.md) | Stable copy-format policy remains host-owned; extraction shape needs final declaration review |
| Rich inline sidecar | `pretext-tui/terminal-rich-inline` | Phase 7 approved with documented residual risk | [Phase 7 approval](phase-7-rich-metadata-hardening-approval.md), [terminal security profile](../contracts/terminal-security-profile.md), [rich ANSI recipe](../recipes/log-viewer-rich-ansi.md) | Production/support notes, provenance/audit API decision, and richer threat-model evidence |
| Append-only cell flow | `PreparedTerminalCellFlow` append path and invalidation metadata | Phase 8 approved with documented residual risk | [Phase 8 approval](phase-8-true-chunked-append-approval.md), [generic agent transcript recipe](../recipes/agent-transcript-generic.md), [transcript viewport recipe](../recipes/transcript-viewport.md) | Long-unbroken-tail memory work, no arbitrary editing, no destructive prefix eviction |
| Performance and memory evidence | release counters and modelled kernel memory budgets | Phase 9 approved with documented residual risk | [Phase 9 approval](phase-9-performance-memory-evidence-approval.md), [evidence README](../evidence/README.md), [benchmark claim guardrails](../evidence/benchmark-claims.md) | Optional heap/allocation evidence path and clean-report policy for any stronger memory claim |
| Adoption evidence and launch-readiness | API matrix, recipes, evidence pack, launch-copy guardrails | Phase 10 approved with documented residual risk | [Phase 10 approval](phase-10-adoption-evidence-launch-readiness-approval.md), [adoption evidence pack](../evidence/adoption-evidence-pack.md), [kernel capability matrix](../evidence/kernel-capability-matrix.md), [correctness matrix](../evidence/correctness-matrix.md), [recipes](../recipes/README.md), report `competitive-tui-20260427-b7106de-clean-a9dfeebf` | Future stable `0.1` approval, fresh clean report after benchmark-source changes, and manual launch-copy review |

## Phase 10 Review Rule

Phase 10 may conclude that the package has enough bounded evidence for a cautious launch-readiness note. It must not by itself:

- promote incubating APIs to stable `0.1`
- claim named-host integrations
- claim renderer, terminal-emulator, PTY, clipboard, filesystem, or app-shell behavior
- treat optional competitive benchmark evidence as release-wide proof
- convert modelled memory budgets into process heap claims
- claim arbitrary editing, destructive prefix eviction, or host retention policy

Any future stable `0.1` approval must update this index, [public-api-boundary.md](../contracts/public-api-boundary.md), API snapshots, package smoke coverage, and the phase approval record that owns the promoted surface.
