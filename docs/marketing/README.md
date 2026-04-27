<!-- 补建说明：该目录说明为后续补建，用于保存 pretext-TUI 发布宣传、性能口径与 launch copy；当前进度：首版记录可复用文案、benchmark 边界和禁用 claim。 -->
# Marketing Notes

This document keeps launch copy and performance-claim guardrails for `pretext-TUI`.

For the fuller channel plan, README conversion plan, claim review table, and launch asset checklist, see [adoption-growth-playbook.md](adoption-growth-playbook.md).

## Positioning

`pretext-TUI` is a terminal-cell text layout core for CLIs and TUIs that handle long text:

- long logs, tool output, stack traces, patches, and diffs
- structured terminal transcripts, command/session logs, review streams, notebooks, and source preview panes
- multiplexer-like panes and terminal dashboards
- editor plugins and source preview panes
- rich ANSI log and transcript viewers
- multilingual terminal text with CJK, emoji, tabs, and links

It is not a renderer, terminal emulator, pane framework, input system, command runner, or app shell.

## Performance Claim Source

Use [adoption-growth-playbook.md](adoption-growth-playbook.md#benchmark-copy) as the single benchmark-copy template. Public prose should cite report ids and workload ids, while dynamic timing numbers stay in the JSON report. Do not reuse stale local numbers as if they were a stable package guarantee, and do not turn a local report into a general headline.

## Claims To Avoid

- Do not say `pretext-TUI` is the fastest terminal wrapper overall.
- Do not imply cold start, one-shot full wrapping, or rich SGR wrapping are the headline speed wins.
- Do not imply `wrap-ansi`, `string-width`, and `pretext-TUI` have identical semantics.
- Do not turn append-only chunked storage into broad streaming-speed claims; cite evidence gates and keep arbitrary editing/destructive eviction out of scope.
- Do not imply integration with any named terminal host already exists.
- Do not call it a renderer, terminal emulator, or full TUI framework.
- Do not present `benchmark-check:tui` thresholds as public performance benchmarks.

## README-Style Copy

```md
Host-neutral terminal-cell text layout primitives for TUIs, CLIs, log viewers, transcript panes, editor panes, terminal dashboards, and other text-heavy terminal hosts.

`pretext-TUI` takes the best idea from Pretext - separate text analysis from layout and materialization - and moves it from browser pixels into terminal cells.
```

## Launch Post

```md
Long terminal text is outgrowing string wrapping.

`pretext-tui` is a host-neutral terminal-cell text layout package for TUI, CLI, log, transcript, editor-pane, and dashboard hosts.

No DOM. No Canvas. No browser-pixel mythology.

It gives you terminal rows, ranges, source offsets, lazy materialization, rich SGR/OSC8 metadata, and fixed-column page/cache primitives for long text.

Not a renderer. Not a TUI framework. Just the text layout core your serious terminal app should not have to reinvent.
```

This copy describes workload patterns, not existing integrations. The package does not include named-host adapters.

## Benchmark Reproduction

Run report-shaped benchmark evidence from the repository, not from the installed npm package:

```sh
bun install
bun run benchmark:evidence:tui
```

Before publishing a performance claim, rerun the evidence command on a clean commit and cite the emitted report id plus workload id. The JSON report carries generated timestamp, git commit, dirty state, OS, CPU, Bun/Node versions, exact comparator package versions, raw samples, statistics, and semantic caveats.
