<!-- 补建说明：该目录说明为后续补建，用于记录 TUI benchmark 配置；当前进度：已包含发布门禁 benchmark 与人工 competitive benchmark 配置。 -->
# Benchmarks

This directory stores terminal-only benchmark workloads and thresholds.

Benchmarks use package APIs and harness-level counters. They do not require browser renderers or runtime instrumentation in the public package.

`tui.json` is the conservative release benchmark gate. Its wall-clock numbers and thresholds are regression diagnostics, not public evidence.

`competitive-tui.json` is an optional local comparison harness for text-layout primitives such as `wrap-ansi` and `string-width`; it is intentionally not a release gate. `iterations` means iterations per sample, and `samples` controls the raw sample count used by the evidence report schema.

Use `bun run benchmark:evidence:tui` to write a local `pretext-tui-benchmark-evidence@1` JSON report under `docs/evidence/benchmark-reports/`. Dynamic benchmark numbers belong in those JSON reports, not copied into README or marketing prose.
