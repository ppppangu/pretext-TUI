<!-- 补建说明：该文件为后续补建，用于综合宣传 swarm 对 pretext-TUI 开发者传播、公司采用、技术评审和反夸大口径的路线建议；当前进度：首版 playbook，尚未代表已发布宣传物料。 -->
# Adoption Growth Playbook

This playbook turns the marketing swarm review into launch-ready positioning while keeping every claim tied to technical evidence.

## Core Story

Use this one-sentence positioning:

```text
pretext-TUI is a host-neutral terminal-cell text layout core for long terminal text: prepare once, seek rows by range, and materialize only the viewport the host needs.
```

Use this sharper hook when the audience is developer-heavy:

```text
Long terminal text should not rewrap an entire buffer just to draw one viewport.
```

Always keep the boundary nearby:

```text
Not a renderer. Not a terminal emulator. Not a full TUI framework.
```

## Why Developers Should Care

Modern terminal apps increasingly behave like text-heavy products:

- transcript panes
- review prose
- tool logs
- stack traces
- patches and diffs
- rich ANSI logs
- multilingual text with CJK, emoji, tabs, links, and copy/search/source-offset needs

The old path is to keep wrapping strings. The `pretext-TUI` path is to make rows/ranges first and materialize strings only when the viewport asks.

## Viral Angles

Use these angles, but keep them technically bounded:

- Long terminal text is outgrowing string wrapping.
- Render rows, not whole transcripts.
- Pretext's best idea, rebuilt for terminal cells.
- No DOM. No Canvas. No browser-pixel mythology.
- For CLIs that scroll like apps, not scripts.
- The text-layout core your serious terminal app should not reinvent.
- Built for the places terminal apps actually hurt, especially long prepared buffers and viewport seeking.

Avoid implying that `pretext-TUI` is already integrated with any named terminal host. Describe workload patterns generically, such as "structured terminal transcripts", "multiplexer-like panes", "editor-like source preview panes", "log viewers", or "terminal dashboards".

## Claim Review Table

| Claim | Use? | Safe wording |
| --- | --- | --- |
| Terminal-cell text layout primitives for long CLIs/TUIs | Yes | `terminal-cell text layout core for long-text CLIs and TUIs` |
| Not a renderer/emulator/framework | Yes | Put this near all launch copy |
| Prepare once, ranges before strings | Yes | Describe as architecture, not an automatic performance promise |
| Standalone benchmark headline | No | Cite the exact local hot-cache report id and workload id without copying numbers |
| Broad wrapper comparison | No | Keep claims bounded to measured workloads and report ids |
| Named-host integration | No | Say `style`, `like`, or `patterns`, and state no integration is included |
| Chunked append storage | Incubating | Append-only chunked storage is internal behind `PreparedTerminalCellFlow`; no arbitrary editing, destructive prefix eviction, or broad streaming-speed claim |
| Secure ANSI rendering | Narrowly | Say `rich metadata has policy-bound defaults: unsupported controls are rejected or sanitized, diagnostics are redacted, and ANSI reconstruction is explicit opt-in`; do not imply terminal-emulator security |

## Benchmark Copy

Use this shape only after rerunning the benchmark on a clean commit. Do not paste timing numbers into launch copy; cite the report and workload instead.

```md
In local optional text-layout evidence report `<report-id>`, workload `<workload-id>` shows hot fixed-column large-page seek with prepared text, sparse row index, and page cache reuse. See the JSON report for raw samples, timing stats, dependency versions, and comparator semantic caveats.
```

Required qualifiers:

- local benchmark
- exact generated timestamp
- git commit and dirty state
- OS, CPU, runtime versions
- exact comparator dependency versions
- text-layout primitives only
- hot cache
- fixed columns
- prepared/index/cache reused
- not a renderer/event-loop benchmark
- not a release guarantee
- comparator semantics are not identical

Do not reuse old numbers in launch copy. Dynamic timing values stay in the JSON report.

## README Conversion Plan

Recommended README order:

1. Hero: project name, one-line positioning, boundary, and demo asset.
2. Problem: long transcripts, resize, scroll jumps, source offsets, ANSI, Unicode.
3. Solution: `prepare -> range/page -> materialize`.
4. Quickstart: plain layout and large transcript paging.
5. Performance: benchmark card with exact qualifiers.
6. Terminal accuracy: contract, goldens, oracle, corpus, fuzz.
7. Boundaries: package owns versus host owns.
8. How it works: sparse anchors, page cache, source offsets, rich sidecar.
9. Limits: no renderer, no emulator, no host adapters, no arbitrary editing, no destructive prefix eviction.
10. Credits: Pretext lineage and what changed for terminal cells.

## Launch Assets

Create these before a loud launch:

- Terminal recording: run `bun run terminal-demo --columns=52 --fixture=mixed-terminal-session --window-start=0 --window-size=12` and show row counts, resize, and visible-window materialization.
- Benchmark card: title it `Hot fixed-column viewport seek`, not as a standalone benchmark headline.
- Pipeline diagram: `visible terminal text -> prepareTerminal -> layoutTerminal(columns) -> row ranges -> materialize visible rows`.
- Boundary diagram: package owns text layout primitives; host owns rendering/input/panes/product behavior.
- Short source-offset screenshot: show visible rows carrying source ranges for search/copy/debugging.

## Channel Plan

Hacker News:

- Title: `Show HN: pretext-tui, terminal-cell text layout primitives for long TUI buffers`
- Include install, minimal example, benchmark reproduction, and limitations.
- Prepare answers for Unicode width, ANSI, bidi, Pretext lineage, and why this is not a full TUI framework.

X/Twitter:

- Lead with the pain: `Long terminal text is outgrowing string wrapping.`
- Use a demo GIF or screenshot.
- Keep benchmark numbers out of launch prose; cite the report id and workload id, and link or attach the JSON report for raw samples and statistics.

DEV.to or long-form blog:

- Title: `Terminal UIs need text layout, not just string wrapping`
- Teach the problem: terminal cells, source offsets, rich metadata, page caches.
- Make the post useful even if the reader never installs the package.

Reddit and community forums:

- Ask a real question instead of dumping a link.
- Example: `How are you handling resize + source offsets in long CLI transcripts?`
- Customize per community and follow self-promotion rules.

Company/enterprise outreach:

- Treat this as blocked until the production/security gate has landed; use it as a future preparation note, not current launch copy.
- Start with adoption risk, not hype.
- Emphasize host-neutral primitives, package smoke tests, validation gates, and clear non-goals.
- Recommend a low-risk pilot: read-only transcript viewer, log pane, or history pane.

## Technical Review Checklist

Every public launch artifact should pass this checklist:

- Does it avoid claiming host integrations that do not exist?
- Does it avoid implying broad performance superiority beyond the cited workload?
- Does it state benchmark workload, cache state, runtime, and semantic differences?
- Does it keep append claims narrow, evidence-gated, and limited to append-only chunked storage?
- Does it keep the renderer/emulator/framework boundary explicit?
- Does it mention Pretext lineage without implying drop-in replacement?
- Does it point skeptical readers to validation commands and contracts?

## Copy Bank

Short post:

```text
Long terminal text is outgrowing string wrapping.

pretext-TUI is a host-neutral terminal-cell text layout core for long transcripts, log panes, terminal/editor panes, dashboards, and rich ANSI output.

Prepare once.
Seek by row range.
Materialize only the viewport.

Not a renderer. The engine under one.
```

Company-facing paragraph:

```text
pretext-TUI gives teams a host-neutral terminal text-layout core: terminal-cell widths, source-aware ranges, sparse row indexing, page caching, and opt-in SGR/OSC8 metadata. It does not own rendering, input, panes, command execution, or product behavior, so teams can adopt it under an existing CLI/TUI stack without replacing the app shell.
```

Reviewer-facing disclaimer:

```text
The competitive benchmark is a local text-layout primitive comparison, not a renderer/event-loop benchmark and not a release guarantee. Evidence reports include hot fixed-column viewport seeking over a prepared long buffer. Simple one-shot wrapping can still favor smaller semantics-lite baselines.
```
