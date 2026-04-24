<!-- 补建说明：该目录为后续补建，用于保存 pretext-TUI 可复现证据资料的规则与入口；当前进度：Task 4 首版，建立 benchmark evidence source-of-truth，动态数字只允许存在于 JSON reports。 -->
# Evidence

This directory is the home for reproducible evidence that supports public claims about `pretext-TUI`.

Evidence is not the same as a release gate:

- `bun run benchmark-check:tui` is a conservative package regression gate.
- `bun run benchmark:competitive:tui` is an optional local text-layout comparison.
- `bun run benchmark:evidence:tui` writes a local JSON evidence report under `docs/evidence/benchmark-reports/`.

Dynamic benchmark numbers must live in JSON reports that use schema `pretext-tui-benchmark-evidence@1`. Public docs may cite a report id and workload id, but should not copy `ms`, ratio, p50, p95, or ops/sec values into prose.

## Citation Flow

JSON evidence reports under `benchmark-reports/` are the sole benchmark-number source.

Claim notes, README, and marketing copy may cite report ids and workload ids, but they are not independent numeric truth sources. They should direct readers back to JSON for raw samples, timing stats, ratios, environment metadata, and comparator semantic caveats.

Dirty local reports are useful for development, but they are not claimable public evidence. A claimable report should come from a clean commit and include raw samples, stats, source hashes, runtime metadata, dependency versions, and the semantic matrix.
