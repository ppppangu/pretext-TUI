<!-- 补建说明：该文件为后续补建，用于记录 benchmark claim guardrails 与 report-id 引用模板；当前进度：Task 4 首版，不包含动态性能数字。 -->
# Benchmark Claim Guardrails

Benchmark claims must be tied to a JSON evidence report with schema `pretext-tui-benchmark-evidence@1`.

Allowed wording:

- "See report `competitive-tui-YYYYMMDD-<commit>-clean-<runid>` for raw samples and semantic caveats."
- "Report `<report-id>` includes workload `<workload-id>` for hot fixed-column viewport seeking."
- "This is local text-layout evidence, not a full renderer or event-loop benchmark."

Forbidden wording in README, marketing, roadmap, and prose summaries even when a clean report id exists:

- fixed `ms`, ratio, p50, p95, ops/sec, or benchmark tables
- broad benchmark supremacy wording
- overclaim terms covered by `tests/tui/benchmark-claim-guard.test.ts`
- claims that hide cache state, corpus hash, runtime, dependency versions, or comparator semantic gaps

Concrete timing values belong in the JSON report. Public prose should cite `reportId`, workload id, adapter id, and semantic caveats, then direct readers to the JSON for numbers.

`benchmark-check:tui` output is release-regression telemetry. It must not be promoted as public benchmark evidence.
