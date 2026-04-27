<!-- 补建说明：该目录为后续补建，用于保存 pretext-TUI 可复现证据资料的规则与入口；当前进度：Phase 10 evidence entry points 已 approve with documented residual risk，并保持动态数字只存在于 JSON reports。 -->
# Evidence

This directory is the home for reproducible evidence that supports public claims about `pretext-TUI`.

Evidence is not the same as a release gate:

- `bun run benchmark-check:tui` is a conservative package regression gate.
- `bun run memory-budget-check:tui` is a modelled kernel-owned structure budget gate.
- `bun run benchmark:competitive:tui` is an optional local text-layout comparison.
- `bun run benchmark:evidence:tui` writes a local JSON evidence report under `docs/evidence/benchmark-reports/`.

Dynamic benchmark numbers must live in JSON reports that use schema `pretext-tui-benchmark-evidence@1`. Public docs may cite a report id and workload id, but should not copy `ms`, ratio, p50, p95, or ops/sec values into prose.

Phase 10 evidence entry points are approved with documented residual risk. They do not promote incubating APIs to stable `0.1`.

- [Kernel Capability Matrix](kernel-capability-matrix.md): current public capability areas, evidence anchors, stability status, and adoption boundaries.
- [Correctness Matrix](correctness-matrix.md): validation coverage and residual risk by correctness area.
- [Adoption Evidence Pack](adoption-evidence-pack.md): reviewer-facing bundle of claim shapes, clean report citation, approved launch-readiness checklist, and residual risks.
- [Benchmark Claim Guardrails](benchmark-claims.md): wording rules for optional comparison evidence.
- [Benchmark Reports](benchmark-reports/): JSON reports that remain the numeric source of truth.

## Citation Flow

JSON evidence reports under `benchmark-reports/` are the sole benchmark-number source.

Claim notes, README, and marketing copy may cite report ids and workload ids, but they are not independent numeric truth sources. They should direct readers back to JSON for raw samples, timing stats, ratios, environment metadata, and comparator semantic caveats.

Dirty local reports are useful for development, but they are not claimable public evidence. A claimable report should come from a clean commit and include raw samples, stats, source hashes, runtime metadata, dependency versions, and the semantic matrix.

Current clean report id available in this directory:

- `competitive-tui-20260427-b7106de-clean-a9dfeebf`

Use that id for citations only. Do not copy dynamic values from the JSON into Markdown prose.

## Memory Budget Evidence

`benchmarks/tui-memory-budgets.json` and `scripts/tui-memory-budget-check.ts` model package-owned structures only: layout bundles, source/range indexes, search sessions, selection extraction, rich sidecars, and append-only cell-flow chunks. The model is intentionally deterministic and reviewable. It does not measure a whole application footprint or external host-owned structures.

Memory-budget results may support release-readiness notes for package-owned structures. They are not standalone public performance claims, and they should not be used to imply an end-to-end memory profile.
