<!-- 补建说明：该文件为后续补建，用于在当前会话无法继续 compact 时，把 pretext-TUI 通用 TUI 文本内核计划、已执行状态、当前阻塞点和新窗口续接提示尽量无损交接；当前进度：记录 Task 4 Coordinate Projection API 已完成后的续接状态。 -->
# New Window Handoff: pretext-TUI Universal Terminal Text Kernel

Created: 2026-04-25

Workspace: repository root for `pretext-TUI`

Purpose: this file is the continuation anchor for a new implementation window. It preserves the original execution plan and the current per-point state without requiring the next window to recover it from compacted chat history.

## Critical Direction

The project direction is **not** to become an adapter for any named host application. The target is a host-neutral algorithm package:

> Give any TUI, CLI, log viewer, transcript viewer, editor pane, or terminal-like host a stable, incremental, indexed, mappable text coordinate system.

pretext-TUI should own terminal text preparation, terminal cell layout, ranges, source offsets, sparse row indexes, page caches, rich sidecar metadata, future search sessions, future selections, and future chunked append storage. Host applications should own rendering, panes, input events, focus, commands, files, PTYs, clipboard, link opening, persistence, product state, and UX policy.

This means agent CLIs are important adoption examples, but they must remain examples of the general problem. Do not add runtime surfaces like `pretext-tui/codex`, `pretext-tui/claude-code`, `pretext-tui/nvim`, `pretext-tui/tmux`, or renderer adapters as core package exports.

## Non-Negotiable Guardrails

- Keep the package host-neutral and algorithm-first.
- No named-host runtime integrations or named-host package subpaths.
- No renderer, pane manager, focus manager, keybinding layer, PTY runner, filesystem integration, clipboard integration, browser automation, nvim RPC, tmux control mode, link opener, or command runner in core runtime.
- Public API truth source should be `src/public-index.ts`; `src/index.ts` should remain a thin public re-export.
- Avoid two code paths or two documentation truth sources. If a temporary boundary exists, document why and how it aligns back to the architecture.
- Dynamic benchmark numbers belong in JSON evidence reports, not copied public prose.
- Do not claim true chunked append until full accumulated reprepare cost is removed and proven by parity tests and counters.
- All newly added files must start with a short `补建说明` comment. Newly added directories need a `README.md` with the same purpose/progress note.
- For subagents in the main thread, use `xhigh` as required by project instructions.

## Original Master Plan

The original plan is saved in:

`docs/plans/2026-04-24-post-publishability-master-plan.md`

That plan should remain the master gate sequence. Its corrected order is:

```text
Batch 0: Baseline And Fact-Source Lock
Batch 1: Boundary/API Gate
Batch 2: Production/Security Gate
Batch 3: Host-Neutral Recipes
Batch 4: Benchmark Evidence Gate
Batch 5: Counter-Proven Performance Work
Batch 6: True Chunked Append
Batch 7: Adoption Evidence And Launch Readiness
```

### Batch 0: Baseline And Fact-Source Lock

Goal: freeze the current first-wave outputs before launching more workers from a dirty worktree.

Original workstreams:

- classify dirty and untracked files
- review README/marketing/roadmap for stale benchmark numbers and overbroad claims
- freeze accepted baseline with branch or commit after user confirmation
- split future fact sources into evidence, recipes, production, roadmap

Current state:

- The current worktree is dirty and not a clean checkpoint.
- A commit was requested in the parent conversation before the side-window boundary, but this side handoff did not commit anything.
- New window should inspect `git status --short` before continuing and should not assume the current worktree is committed.

### Batch 1: Boundary/API Gate

Goal: prevent internal storage and unstable helpers from becoming accidental public API.

Original workstreams:

- API stability matrix for stable, incubating, private, unsupported surfaces
- opaque `PreparedTerminalText` public boundary using a branded handle and internal capability storage
- declaration/API snapshot checks for root and subpath declarations
- package smoke tests with exact export allowlists and private subpath rejection
- documentation for root and `./terminal` alias semantics

Current state:

- Implemented in the dirty tree.
- `src/public-index.ts` is the public facade and type source.
- `src/index.ts` is now a thin re-export from `./public-index.js`.
- `scripts/public-api-contract.ts` centralizes runtime/export/declaration allowlists and forbidden private tokens.
- `scripts/api-snapshot-check.ts` and `scripts/package-smoke-test.ts` were changed to use the shared public contract.
- Opaque prepared handles are tested by `tests/tui/prepared-reader-boundary.test.ts`.
- `src/terminal-prepared-reader.ts` holds internal capability access and debug snapshot behavior.
- `bun run typecheck:tui` passes as of this handoff.

Important files:

- `src/public-index.ts`
- `src/index.ts`
- `src/terminal-prepared-reader.ts`
- `scripts/public-api-contract.ts`
- `scripts/api-snapshot-check.ts`
- `scripts/package-smoke-test.ts`
- `tests/tui/public-api-boundary.test.ts`
- `tests/tui/prepared-reader-boundary.test.ts`
- `docs/contracts/public-api-boundary.md`

### Batch 2: Production/Security Gate

Goal: make rich transcript/log surfaces safe enough to document, trial, and review honestly.

Original workstreams:

- production readiness docs
- host-neutral rich profiles: default, transcript, audit-strict
- OSC8 URI policy
- bidi/format-control policy
- diagnostics redesign that does not retain full dangerous sequences by default
- raw retention and raw-to-sanitized provenance policy
- DoS limits and overflow behavior
- supply-chain posture notes

Current state:

- Represented as complete in `STATUS.md` for rich sidecar defaults.
- Broader support/provenance notes remain future adoption work.
- `docs/contracts/terminal-security-profile.md` exists.
- `docs/production/README.md` exists.
- Rich sidecar public/import boundaries are guarded by public API contract checks.

Important files:

- `src/terminal-rich-inline.ts`
- `src/terminal-rich-inline.test.ts`
- `docs/contracts/terminal-security-profile.md`
- `docs/production/README.md`
- `SECURITY.md`

### Batch 3: Host-Neutral Recipes

Goal: show adoption patterns using only public primitives without adding app-specific integrations.

Original recipes:

- transcript viewport
- terminal pane resize
- editor source mapping
- log viewer rich ANSI
- package smoke examples and public-only recipe checks

Current state:

- Recipes exist and are public-only docs/examples, not runtime adapters.
- `docs/recipes/editor-source-mapping.md` has already been updated for coordinate projection API usage.
- Recipes must not imply existing integrations with named hosts.

Important files:

- `docs/recipes/README.md`
- `docs/recipes/transcript-viewport.md`
- `docs/recipes/terminal-pane-resize.md`
- `docs/recipes/editor-source-mapping.md`
- `docs/recipes/log-viewer-rich-ansi.md`
- `scripts/package-smoke-test.ts`

### Batch 4: Benchmark Evidence Gate

Goal: turn local benchmark signals into reproducible raw evidence reports.

Original workstreams:

- report schema `pretext-tui-benchmark-evidence@1`
- raw samples, warmups, p50/p95/min/max/mean/stdev/CV
- metadata: command, script/config hash, git commit, dirty flag, runtime, OS, CPU, memory, lockfile, dependency versions, corpus hash, input hash
- semantic matrix per comparator
- Markdown summaries derived from JSON only
- evidence docs and claim guardrails

Current state:

- Represented as complete in `STATUS.md`.
- Optional benchmark evidence scripts/docs exist.
- `benchmark-check:tui` remains the release regression gate.
- `benchmark:competitive:tui` and `benchmark:evidence:tui` remain optional/manual evidence commands, not `prepublishOnly` gates.

Important files/directories:

- `docs/evidence/README.md`
- `docs/evidence/benchmark-claims.md`
- `docs/evidence/benchmark-reports/README.md`
- `scripts/tui-benchmark-evidence.ts`
- `scripts/tui-benchmark-evidence-summary.ts`
- `scripts/tui-benchmark-check.ts`
- `benchmarks/tui.json`

### Batch 5: Counter-Proven Performance Work

Goal: only optimize hot paths after evidence and counters can prove the improvement.

Original workstreams:

- instrumentation counters
- prepared grapheme and width prefix sidecars
- page miss seek-once sequential walk
- anchor/source lookup improvements
- rich span overlap improvements
- compact source lookup where allocations are proven hot

Current state:

- Represented in `STATUS.md` as first optimizations complete:
  - prepared geometry reused across layout/source/append paths
  - page-cache misses walk sequentially
  - anchor/source insertion avoids per-anchor sorting
  - benchmark counters expose remaining materialization-time segmentation
- This is not a claim that all performance work is complete.

Important files:

- `src/layout.ts`
- `src/terminal.ts`
- `src/terminal-line-index.ts`
- `src/terminal-source-offset-index.ts`
- `src/terminal-cell-flow.ts`
- `src/terminal-performance-counters.ts`
- `src/terminal-grapheme-geometry.ts`
- `scripts/tui-benchmark-check.ts`
- `benchmarks/tui.json`

### Batch 6: True Chunked Append

Goal: replace full reprepare append cost with true chunked append while preserving global source offsets and correctness.

Original architecture direction:

- keep `PreparedTerminalCellFlow` as the public append handle
- add internal prepared-source reader/capability boundary
- represent storage as sealed chunks plus an open normalization/segmentation tail
- preserve global UTF-16 source offsets and global cursor identity
- keep compaction lossless at first

Current state:

- Not complete.
- Do not claim true chunked append.
- Existing append remains a bounded/full-reprepare strategy with invalidation metadata.
- Batch 6 should only start after current public API/projection work is stable and reviewed.

### Batch 7: Adoption Evidence And Launch Readiness

Goal: package correctness, security, recipes, benchmark evidence, limitations, and launch copy into a reviewable adoption kit.

Current state:

- Not complete as a final launch/adoption gate.
- Some prerequisites are present, but clean-commit benchmark evidence and final claims review still need a later pass.

## Current Dirty Worktree Snapshot

Observed with `git status --short` in the `pretext-TUI` repository root:

```text
 M .github/workflows/ci-tui.yml
 M DEVELOPMENT.md
 M README.md
 M SECURITY.md
 M STATUS.md
 M benchmarks/tui.json
 M docs/README.md
 M docs/contracts/host-app-boundary.md
 M docs/contracts/public-api-boundary.md
 M docs/contracts/terminal-contract.md
 M docs/marketing/README.md
 M docs/plans/2026-04-24-post-publishability-master-plan.md
 M docs/recipes/editor-source-mapping.md
 M scripts/api-snapshot-check.ts
 M scripts/package-smoke-test.ts
 M scripts/tui-benchmark-check.ts
 M src/index.ts
 M src/layout.ts
 M src/public-index.ts
 M src/terminal-core.test.ts
 M src/terminal-line-index.ts
 M src/terminal-prepared-reader.ts
 M src/terminal-rich-inline.test.ts
 M src/terminal-rich-inline.ts
 M src/terminal.ts
 M tests/tui/public-api-boundary.test.ts
 M tests/tui/public-layout.test.ts
 M tests/tui/validation-helpers.ts
 M tests/tui/virtual-text.test.ts
 M tsconfig.tui.json
?? scripts/public-api-contract.ts
?? src/terminal-coordinate-projection.ts
?? src/terminal-line-source.ts
?? tests/tui/coordinate-projection.test.ts
?? tests/tui/prepared-reader-boundary.test.ts
```

This handoff file itself will also appear as untracked after creation:

```text
?? docs/plans/2026-04-25-new-window-handoff.md
```

## Completed Micro-Task: Coordinate Projection

**Task 4: Coordinate Projection API** is implemented and validated in the current worktree.

Goal:

- expose a host-neutral mapping layer:
  - source offset -> terminal row/column/source-safe cursor
  - terminal cursor -> source offset and terminal row/column
  - terminal row -> terminal line range/source range
- preserve opaque public handles
- avoid materializing full line text in runtime projection
- keep resize behavior stable by rebuilding width-dependent line indexes

Implemented files:

- `src/terminal-coordinate-projection.ts`
- `src/public-index.ts`
- `src/index.ts`
- `docs/contracts/terminal-contract.md`
- `docs/recipes/editor-source-mapping.md`
- `tests/tui/coordinate-projection.test.ts`
- `scripts/package-smoke-test.ts`
- `scripts/public-api-contract.ts`
- `tsconfig.tui.json`

API introduced:

```ts
projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, sourceOffset, bias?)
projectTerminalSourceOffset(prepared, { sourceIndex, lineIndex }, sourceOffset, options?)

projectTerminalCursor(prepared, sourceIndex, lineIndex, cursor, options?)
projectTerminalCursor(prepared, { sourceIndex, lineIndex }, cursor, options?)

projectTerminalRow(prepared, lineIndex, row)
```

Types introduced:

```ts
TerminalCellCoordinate
TerminalProjectionIndexes
TerminalSourceProjectionOptions
TerminalSourceProjection
TerminalCoordinateProjection
TerminalRowProjection
```

Implementation notes:

- Runtime uses existing `createTerminalSourceOffsetIndex()` and `createTerminalLineIndex()`.
- Runtime validates/fails forged prepared/source/line handles through existing internal WeakMap/capability checks.
- `projectTerminalColumn()` uses prepared geometry and line source range; it does not materialize complete terminal lines.
- `projectTerminalRow()` returns the existing `TerminalLineRange` plus row/source/column extent metadata.
- EOF after final hard break is treated as a terminal endpoint without fabricating a rendered row.

## Current Validation Results

Commands run in this side handoff:

```sh
bun run typecheck:tui
```

Result:

```text
PASS
```

Command:

```sh
bun test tests\tui\coordinate-projection.test.ts
```

Result:

```text
PASS
```

Resolution:

- TypeScript shape is valid.
- Handle rejection behavior is valid.
- Resize re-projection and EOF endpoint behavior are valid.
- The tab+CJK+combining fixture disagreement was a lower-level layout issue, not a projection issue.
- The root fix moved text-to-text language break candidates into prepared analysis metadata and kept terminal layout as a consumer of that metadata.
- The expected line ranges for the fixture are:

```text
row 0: [0, 3] / "A  B"
row 1: [3, 6] / "界é"
row 2: [7, 11] / "tail"
```

Validation now includes:

- focused coordinate projection tests
- terminal-core language-boundary and no-break glue tests
- public API snapshot
- package smoke projection calls
- release gates listed in the final task review

## Suggested New Window Prompt

Use this prompt in the new window:

```text
Read this handoff file first.

Continue from the current dirty pretext-TUI worktree. Do not restart the master plan. Task 4, the host-neutral coordinate projection API, is implemented and should be treated as completed unless a later review finds a regression.

First verify git status and inspect:
- src/terminal-coordinate-projection.ts
- tests/tui/coordinate-projection.test.ts
- src/terminal-line-index.ts
- src/terminal.ts
- src/public-index.ts
- docs/contracts/terminal-contract.md
- docs/recipes/editor-source-mapping.md

Current known state:
- Task 4 projection API is implemented.
- The root cause was a missing analysis-approved text segment break candidate, not projection math.
- Final validation should be checked from the latest task summary before moving to the next master-plan item or committing the integrated checkpoint.
```

## Forward Feature Waves After Coordinate Projection

These are the larger universal-kernel features from the original vision. They should stay host-neutral:

1. Search sessions
   - literal, case-insensitive, regex, whole-word
   - scoped by source range/block range
   - lazy next/prev
   - hit returns source range first, terminal row/column via projection second
   - future chunk summaries or trigram indexes for huge logs

2. Selection model
   - row/column anchor+focus -> source range
   - grapheme-safe and wrap-aware
   - can extract visible text, original source slice, and future rich fragments
   - can provide context windows without host-specific semantics

3. Structure/block sidecar
   - generic block IDs and kinds supplied by host
   - ranges carry origin metadata but pretext does not understand named host product semantics
   - enables transcript/log/diff/test/code-block grouping without host adapters

4. True chunked append
   - sealed chunks plus open tail
   - no full accumulated reprepare on small appends
   - global UTF-16 offsets preserved
   - strict parity with full prepare

5. Rich visible/raw mapping hardening
   - search visible text
   - preserve raw/rich sidecars only under policy
   - safe defaults for diagnostics and ANSI re-emission

6. Launch/adoption evidence
   - clean-commit benchmark evidence reports
   - final claims review
   - public-only recipes
   - no overbroad speed/security/company-readiness claims

## Review Rules For Each Task

For each task:

1. Write or restate the precise API and invariant.
2. Implement in one coherent path, not a duplicate fallback path.
3. Run focused validation first.
4. Run broader validation after integration.
5. Review code cleanliness, public/private boundary, docs consistency, and technical debt.
6. Fix root causes before moving on.
7. If residual risk remains, document why it is acceptable and which future gate owns it.

Before calling a phase complete, check:

- public docs match runtime behavior
- recipes use only public package exports
- package exports are still limited to `.`, `./terminal`, `./terminal-rich-inline`, and `./package.json`
- no host-specific runtime behavior entered the package
- no benchmark claim lacks evidence
- no chunked append claim is made before Batch 6 is truly complete
- no private prepared storage is exposed in public declarations
