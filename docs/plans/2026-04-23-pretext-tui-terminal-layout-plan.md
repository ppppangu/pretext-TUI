<!-- 补建说明：该文件为后续补建，用于把 pretext-TUI 从浏览器/Canvas 文本布局库迁移为纯 TUI 终端 cell 布局库的详细执行方案固化下来；当前进度：已根据多轮 5.4 xhigh swarms 审稿完成第二版详细执行计划。 -->
# Pretext-TUI Terminal Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Turn `pretext-TUI` into a pure TUI terminal-cell text layout package that preserves Pretext’s strong `prepare -> layout -> range -> materialize` architecture while removing browser/Canvas/DOM runtime assumptions.

**Architecture:** Keep the text-semantics pipeline in `src/analysis.ts`, `src/line-break.ts`, and `src/line-text.ts`, but replace browser measurement with a terminal-width profile boundary and expose a new terminal-first public API. Remove browser demos/oracles from the shipped product surface, add deterministic TUI tests and benchmarks, and preserve host-app extensibility through host-neutral data/layout primitives only.

**Tech Stack:** Bun, TypeScript, `Intl.Segmenter`, deterministic terminal cell-width rules, typed-array-friendly prepared data, package smoke tests, TUI-only oracles, and host-neutral adapter-ready APIs with no first-party host-app integration in this project.

**Execution CWD:** Run every command in this plan from `D:\Projects\claude-code-main\pretext-TUI`.

**Repository Rules:**
- Every new file must start with a `补建说明` header comment.
- Every new directory must include a `README.md` explaining purpose and current progress.
- Sync docs before every commit.
- Do not monkey-patch browser globals to “make TUI tests pass”.

**Fixed Decisions For This Plan:**
- The active package target is TUI-only. Browser/Canvas/DOM code becomes archived reference, not active runtime.
- Core TUI APIs use terminal units only: `columns`, `rows`, `tabSize`, `startColumn`, and width profile.
- `prepareTerminal()` accepts visible text, not raw escape-laden ANSI strings.
- ANSI/OSC8 support lives in the rich/metadata path, not in the plain text core.
- Tabs remain dynamic `kind: 'tab'` segments measured at layout time from the current visible column.
- Terminal fitting is exact integer-cell math. No browser-style epsilon fit logic in the TUI lane.
- Width-independent prepared state and width-dependent line/page caches must remain separate.
- `tabSize` and width profile are prepare-time inputs stored in prepared data; `columns` and `startColumn` are layout-time inputs.
- Canonical source mapping uses UTF-16 code unit offsets over sanitized visible source text, with grapheme/range cursors layered on top for layout and copy/search mapping.
- This project will not implement host-specific products, renderer integrations, component frameworks, pane shells, file navigators, project workspaces, or host-app adapters. It only exposes stable terminal layout primitives that future host apps can consume.
- The final publishable package must not ship two product tracks. Browser material may survive only as historical source control context until removed, not as active docs, exports, package files, or default validation.

---

### Task 1: Freeze The TUI Contract And Boundary Notes

**Files:**
- Create: `docs/contracts/README.md`
- Create: `docs/contracts/terminal-contract.md`
- Create: `docs/contracts/host-app-boundary.md`
- Modify: `README.md`
- Modify: `DEVELOPMENT.md`
- Modify: `TODO.md`
- Modify: `STATUS.md`
- Modify: `AGENTS.md`

**Step 1: Write `docs/contracts/terminal-contract.md`**

Define, in writing, the terminal semantics that all later tasks must follow:
- width unit = integer terminal cells
- height unit = terminal rows
- trailing spaces and `pre-wrap` behavior
- `tabSize` and `startColumn` semantics
- `ZWSP`, `NBSP`, `SHY`, hard breaks, glue segments
- combining marks, VS16, ZWJ, emoji clusters, ambiguous-width policy
- supported control sequences: only inline `SGR` and `OSC8` in rich/metadata paths
- rejected/sanitized control sequences: cursor movement, erase, alt screen, title changes, mouse modes, etc.

**Step 2: Write `docs/contracts/host-app-boundary.md`**

Define the future host-app boundary clearly and early so the package API does not drift:
- `pretext-TUI` owns terminal text preparation, wrapping, source mapping, materialization, rich inline metadata, paging/cache primitives, and deterministic terminal semantics
- host apps own rendering frameworks, pane trees, focus, input routing, scroll state, workspace/file concepts, command execution, persistence, and app-specific interaction behavior
- extensibility must be through plain typed APIs, opaque cursors/ranges, metadata spans, and optional out-of-tree adapters
- no host-specific dependency, import, example adapter, or integration task belongs in this implementation plan

**Step 3: Rewrite top-level docs for the TUI target**

Update `README.md`, `DEVELOPMENT.md`, `TODO.md`, `STATUS.md`, and `AGENTS.md` so they no longer describe the active runtime as browser-first.

**Step 4: Run a contradiction pass**

Review these exact files for contradictions:
- `README.md`
- `DEVELOPMENT.md`
- `TODO.md`
- `STATUS.md`
- `AGENTS.md`

**Step 5: Validate**

Run:

```bash
rg -n "Canvas|OffscreenCanvas|DOM|browser|SVG|WebGL|getBoundingClientRect|font string|lineHeight" README.md DEVELOPMENT.md TODO.md STATUS.md AGENTS.md docs/contracts/terminal-contract.md docs/contracts/host-app-boundary.md
rg -n "Claude Code|claude-code|Ink|React|pane tree|workspace|file browser|app shell|@anthropic-ai" README.md DEVELOPMENT.md TODO.md STATUS.md AGENTS.md docs/contracts/terminal-contract.md docs/contracts/host-app-boundary.md
```

Expected:
- only intentional archive/migration notes remain

**Step 6: Sync docs and commit**

```bash
git add README.md DEVELOPMENT.md TODO.md STATUS.md AGENTS.md docs/README.md docs/contracts/README.md docs/contracts/terminal-contract.md docs/contracts/host-app-boundary.md docs/plans/README.md docs/plans/2026-04-23-pretext-tui-terminal-layout-plan.md
git commit -m "docs: freeze terminal contract and host boundary"
```

### Task 2: Remove Browser Product Surface And Split Build Configs

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `tsconfig.build.json`
- Create: `tsconfig.tui.json`
- Create: `tsconfig.browser-archive.json`
- Modify: `.github/workflows/pages.yml`

**Step 1: Make the browser removal policy explicit**

Choose one path and implement it consistently:
- browser files are removed from active docs, scripts, package files, exports, and workflows
- historical browser behavior stays available through git history, not a shipped parallel product
- GitHub Pages is not part of this package's active product surface

This plan chooses:
- remove browser product surface from package metadata and default scripts
- delete or disable browser demo/page workflows from active CI
- keep only reusable non-browser source/corpus material needed by the TUI package

**Step 2: Split config boundaries**

Create:
- `tsconfig.tui.json` for active TUI runtime/build/test coverage
- `tsconfig.browser-archive.json` for archived browser sources if they must continue to typecheck separately

Do **not** remove DOM from the primary config until the terminal measurement/profile split is in place.

**Step 3: Put the package into safe migration mode**

In `package.json`:
- set `private: true` during the migration window
- keep current root `main` / `types` / `exports["."]` untouched for now
- do not retarget root exports until Task 5 lands

**Step 4: Remove active browser product references**

Ensure active package/docs/workflows no longer expose:
- browser demos/assets exports
- GitHub Pages product workflow
- browser accuracy/benchmark scripts as active commands
- browser snapshot dashboards as active package status

**Step 5: Validate**

Run:

```bash
bunx tsc --noEmit -p tsconfig.json
bunx tsc --noEmit -p tsconfig.tui.json
```

Expected:
- current repo still typechecks
- a dedicated TUI config exists and can be used in later tasks

**Step 6: Sync docs and commit**

```bash
git add package.json tsconfig.json tsconfig.build.json tsconfig.tui.json tsconfig.browser-archive.json .github/workflows/pages.yml
git commit -m "build: remove browser product surface and split tui config"
```

### Task 3: Split Analysis Policy, Width Policy, And Measurement Boundary

**Files:**
- Modify: `src/analysis.ts`
- Modify: `src/line-break.ts`
- Modify: `src/measurement.ts`
- Modify: `src/layout.ts`
- Create: `src/terminal-width-profile.ts`
- Create: `src/terminal-string-width.ts`
- Create: `src/terminal-types.ts`

**Step 1: Separate analysis policy from width policy**

Refactor so `src/analysis.ts` owns:
- segmentation
- whitespace normalization
- CJK/kinsoku/keep-all rules
- break kinds

and terminal width policy lives elsewhere.

`src/line-break.ts` must no longer import a browser-centric global measurement profile.

**Step 2: Add `TerminalWidthProfile`**

Define a stable, explicit terminal profile:
- ambiguous-width policy
- emoji width policy
- regional-indicator policy
- control-char policy
- `tabSize`
- `ansiMode`

Do **not** add browser-style runtime epsilon branching. Fitting is exact integer-cell math.

**Step 3: Add a self-contained terminal width backend**

Implement `src/terminal-string-width.ts` as the canonical terminal cell-width contract for this package.

It must cover:
- ASCII
- East Asian Width
- emoji ZWJ / flags / keycaps / VS16
- combining marks
- zero-width/control handling

**Step 4: Replace browser measurement internals**

Rewrite `src/measurement.ts` to use terminal width data and terminal segment caches instead of:
- `OffscreenCanvas`
- DOM canvas
- browser UA / vendor checks
- DOM emoji calibration

**Step 5: Validate with a terminal-core gate**

Create and run a small terminal-core test suite before the broader fuzz/corpus work lands.

Run:

```bash
bunx tsc --noEmit -p tsconfig.tui.json
rg -n "OffscreenCanvas|document|navigator|CanvasRenderingContext2D|measureText|getBoundingClientRect" src/analysis.ts src/line-break.ts src/measurement.ts src/layout.ts src/terminal-width-profile.ts src/terminal-string-width.ts src/terminal-types.ts
```

Expected:
- active TUI path no longer depends on browser measurement

**Step 6: Sync docs and commit**

```bash
git add src/analysis.ts src/line-break.ts src/measurement.ts src/layout.ts src/terminal-width-profile.ts src/terminal-string-width.ts src/terminal-types.ts
git commit -m "refactor: split terminal width policy from browser measurement"
```

### Task 4: Refactor Prepared Data, Cursor Model, And Core Terminal API

**Files:**
- Modify: `src/layout.ts`
- Modify: `src/line-break.ts`
- Modify: `src/line-text.ts`
- Modify: `src/layout.test.ts`
- Create: `src/index.ts`
- Create: `src/terminal.ts`
- Create: `src/terminal-core.test.ts`

**Step 1: Freeze the public terminal signatures**

Adopt terminal-first names and parameters:

```ts
prepareTerminal(text, { whiteSpace?, widthProfile?, tabSize?, wordBreak? })
layoutTerminal(prepared, { columns, startColumn? })
measureTerminalLineStats(prepared, { columns, startColumn? })
walkTerminalLineRanges(prepared, { columns, startColumn? }, onLine)
layoutNextTerminalLineRange(prepared, cursor, { columns, startColumn? })
materializeTerminalLineRange(prepared, range)
```

**Step 2: Freeze one stable opaque cursor/range model**

The model must survive both:
- single prepared blocks
- later paged/streaming flows

At minimum it must include:
- stable opaque cursor identity
- visible-range start/end
- UTF-16 source start/end offsets
- visible grapheme/range hooks
- hard/soft break provenance

**Step 3: Keep tabs dynamic**

Do **not** collapse tabs into fixed cached widths. Keep `kind: 'tab'` and compute tab advance at layout time from `startColumn` and current visible column.

**Step 4: Persist source mapping now**

Prepared data must already carry enough source-range identity for:
- copy
- search hit mapping
- later paged random access

Freeze the canonical offset space here:
- source offsets are UTF-16 code unit offsets over sanitized visible text
- layout cursors remain grapheme/range oriented
- later paged indices and rich-inline metadata must map back to the same canonical source offsets

Do not defer source mapping to the streaming/page-cache phase.

**Step 5: Add the first terminal package surface**

Create `src/index.ts` and `src/terminal.ts`, but do not retarget the package root export until validation passes.

**Step 6: Retire the old browser-first permanent suite from the default TUI path**

`src/layout.test.ts` currently encodes browser-oriented assumptions and fake `OffscreenCanvas` behavior. Before package-wide TUI gates can exist, do one of these explicitly:
- rewrite it into a TUI-compatible invariant suite, or
- rename/scope it as browser-archive coverage and exclude it from the default TUI test commands

This plan chooses:
- keep `src/layout.test.ts` only if it is rewritten to TUI semantics
- otherwise move/rename it out of the default TUI test surface before Task 7

**Step 7: Validate**

Run:

```bash
bunx tsc --noEmit -p tsconfig.tui.json
bun test src/terminal-core.test.ts
```

Expected:
- terminal range/line/materialize invariants are proven without browser test harnesses

**Step 8: Sync docs and commit**

```bash
git add src/layout.ts src/line-break.ts src/line-text.ts src/layout.test.ts src/index.ts src/terminal.ts src/terminal-core.test.ts
git commit -m "feat: add stable terminal core api and cursor model"
```

### Task 5: Finalize The Package Surface And Smoke Tests

**Files:**
- Modify: `package.json`
- Modify: `scripts/package-smoke-test.ts`
- Modify: `tsconfig.build.json`

**Step 1: Freeze the public export matrix**

After Tasks 3-4 exist and validate, use this exact package surface:

- `main` -> `./dist/index.js`
- `types` -> `./dist/index.d.ts`
- `exports["."]` -> terminal core surface from `dist/index.*`
- `exports["./terminal"]` -> alias of the same terminal core surface
- `exports["./package.json"]` -> `./package.json`

Do **not** export demos/assets/browser helpers.
Do **not** add rich-inline exports yet; that happens in Task 6.

**Step 2: Strengthen the smoke test**

`scripts/package-smoke-test.ts` must:
- derive the package name from `package.json`
- positively test every supported export
- negatively test removed demo/assets subpaths
- verify tarball `files` contents
- verify that `.` and `./terminal` resolve to the same supported core API

**Step 3: Validate via packaged surface**

Run:

```bash
bun run package-smoke-test
```

Expected:
- package consumers can import the supported terminal exports
- removed browser subpaths fail as expected

**Step 4: Sync docs and commit**

```bash
git add package.json scripts/package-smoke-test.ts tsconfig.build.json
git commit -m "build: finalize terminal package exports and smoke tests"
```

### Task 6: Add Terminal Rich Inline And Metadata

**Files:**
- Modify: `src/rich-inline.ts`
- Create: `src/terminal-rich-inline.ts`
- Create: `src/ansi-tokenize.ts`
- Create: `src/terminal-rich-inline.test.ts`
- Modify: `package.json`
- Modify: `scripts/package-smoke-test.ts`

**Step 1: Freeze the raw ANSI boundary**

Choose and implement one rule:
- plain `prepareTerminal()` handles visible text only
- ANSI tokenization/state extraction happens in rich/metadata surfaces only

This plan chooses that rule.

**Step 2: Define a visible-range anchored span model**

Store style/link/select metadata against visible grapheme/fragment ranges, with optional raw-source mapping.

Keep core metadata limited to:
- style
- link
- `copyText`
- selection policy
- opaque payload ids

Do not add arbitrary click behavior into the core package.

**Step 3: Add `SGR` and `OSC8` tokenizer support**

Support only inline style/hyperlink metadata. Reject or sanitize non-inline terminal control sequences before analysis/materialization.

**Step 4: Add rich materializers**

Support:
- plain visible text
- fragment metadata
- ANSI text output where needed

**Step 5: Extend the public export matrix**

Add one explicit rich export:

- `exports["./terminal-rich-inline"]` -> `./dist/terminal-rich-inline.js`

Keep it separate from the core terminal surface so the package boundary stays obvious.

**Step 6: Validate**

Run:

```bash
bunx tsc --noEmit -p tsconfig.tui.json
bun test src/terminal-rich-inline.test.ts
bun run package-smoke-test
```

Expected:
- rich inline is DOM-free, package-exported correctly, and metadata-stable

**Step 7: Sync docs and commit**

```bash
git add src/rich-inline.ts src/terminal-rich-inline.ts src/ansi-tokenize.ts src/terminal-rich-inline.test.ts package.json scripts/package-smoke-test.ts
git commit -m "feat: add terminal rich inline and ansi metadata path"
```

### Task 7: Add TUI Validation Stack And CI

**Files:**
- Create: `tests/tui/README.md`
- Create: `tests/tui/fixtures/README.md`
- Create: `tests/tui/fixtures/goldens/README.md`
- Create: `tests/tui/fuzz-seeds/README.md`
- Create: `tests/tui/public-layout.test.ts`
- Create: `tests/tui/rich-inline.test.ts`
- Create: `scripts/tui-static-gate.ts`
- Create: `scripts/tui-reference-check.ts`
- Create: `scripts/tui-corpus-check.ts`
- Create: `scripts/tui-fuzz.ts`
- Create: `scripts/tui-benchmark-check.ts`
- Modify: `package.json`
- Create: `.github/workflows/ci-tui.yml`
- Create: `accuracy/tui-reference.json`
- Create: `benchmarks/tui.json`
- Create: `corpora/tui-step10.json`
- Create: `status/tui-dashboard.json`

**Step 1: Add the no-browser static gate**

Reject active TUI imports/usages of:
- `document`
- `window`
- `navigator`
- `OffscreenCanvas`
- browser automation helpers
- demo pages as runtime dependencies

**Step 2: Add layered oracles**

Do not rely on one giant reference implementation. Add:
- width/tokenization goldens
- a slow independent greedy wrap oracle over prepared segments
- differential checks across eager/core paths only
- offset/cursor round-trip checks
- no paged/append assertions yet; those are added in Task 9

**Step 3: Define the exact fate of old browser artifacts**

This plan chooses:
- old browser `accuracy/*`, `benchmarks/*`, browser-specific scripts/pages, and `status/dashboard.json` are removed from active package/docs/default validation before publish; reusable corpora text may stay only if used by TUI validation
- new TUI snapshots live at:
  - `accuracy/tui-reference.json`
  - `benchmarks/tui.json`
  - `corpora/tui-step10.json`
  - `status/tui-dashboard.json`
- reusable fixture/golden inputs live at:
  - `tests/tui/fixtures/`
  - `tests/tui/fixtures/goldens/`
  - `tests/tui/fuzz-seeds/`
- browser artifacts are not part of default TUI validation or published package files

**Step 4: Add fuzzing and deterministic perf gates**

Fuzzing must persist minimized seeds. Perf gates must use both wall-clock and deterministic counters:
- eager/core cache hits
- tokenizer hits/misses
- materialization counts
- wrap/layout call counts

Paged/append counters are added only after Task 9 lands.

**Step 5: Add a real TUI CI workflow**

`ci-tui.yml` should run:
- `bun run typecheck:tui`
- `bun run test:tui`
- static gate
- reference/corpus/fuzz
- TUI benchmark check

**Step 6: Canonicalize the package scripts**

Add these exact scripts to `package.json`:

```json
{
  "typecheck:tui": "bunx tsc --noEmit -p tsconfig.tui.json",
  "test:tui": "bun test src/terminal-core.test.ts src/terminal-rich-inline.test.ts tests/tui",
  "tui-static-gate": "bun run scripts/tui-static-gate.ts",
  "tui-oracle-check": "bun run scripts/tui-reference-check.ts",
  "tui-corpus-check": "bun run scripts/tui-corpus-check.ts",
  "tui-fuzz": "bun run scripts/tui-fuzz.ts",
  "benchmark-check:tui": "bun run scripts/tui-benchmark-check.ts"
}
```

**Step 7: Validate using real scripts**

Run:

```bash
bun run typecheck:tui
bun run tui-static-gate
bun run test:tui
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
```

Expected:
- deterministic TUI-only correctness and perf signals exist before vertical slice and streaming work

**Step 8: Sync docs and commit**

```bash
git add tests/tui scripts/tui-static-gate.ts scripts/tui-reference-check.ts scripts/tui-corpus-check.ts scripts/tui-fuzz.ts scripts/tui-benchmark-check.ts package.json .github/workflows/ci-tui.yml accuracy/tui-reference.json benchmarks/tui.json corpora/tui-step10.json status/tui-dashboard.json
git commit -m "test: add tui-only validation stack and ci"
```

### Task 8: Build The Minimal Vertical Slice Demo

**Files:**
- Create: `fixtures/README.md`
- Create: `fixtures/mixed-terminal-session.txt`
- Create: `scripts/terminal-demo.ts`
- Modify: `package.json`

**Step 1: Add a realistic transcript fixture**

Include:
- ASCII
- CJK
- Arabic
- emoji
- URL-like runs
- tabs
- hard newlines
- CLI-like mixed terminal text, including prompts, logs, status lines, wrapped prose, tables/lists, URLs, and multilingual content

**Step 2: Add a package-level demo script**

Expose a real script name such as:

```json
{
  "terminal-demo": "bun run scripts/terminal-demo.ts"
}
```

**Step 3: Prove the value now**

The demo must show:
- row-count precomputation
- resize reflow
- visible window materialization

This vertical slice becomes the design target for later paging/streaming work.

**Step 4: Validate using the actual script**

Run:

```bash
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

Expected:
- deterministic wrapped terminal output with no browser runtime dependency

**Step 5: Sync docs and commit**

```bash
git add fixtures/README.md fixtures/mixed-terminal-session.txt scripts/terminal-demo.ts package.json
git commit -m "feat: add terminal demo vertical slice"
```

### Task 9: Add Streaming And Virtual Text Primitives

**Files:**
- Create: `src/terminal-source-offset-index.ts`
- Create: `src/terminal-cell-flow.ts`
- Create: `src/terminal-line-index.ts`
- Create: `src/terminal-page-cache.ts`
- Create: `src/terminal-materialize.ts`
- Modify: `src/terminal.ts`

**Step 1: Keep prepared state width-independent**

`PreparedCellFlow` must contain immutable prepared source chunks/pages and source mapping.

Width-dependent line/page caches must live separately under keys like:

```ts
{ columns, profileVersion, generation }
```

**Step 2: Use sparse anchors, not global eager pages**

Store line-number to cursor/source-offset anchors every `K` lines.

Build page bodies from the nearest anchor when needed.

**Step 3: Add a separate source offset index**

Do not imply source offset lookup from the line index. Add it explicitly now.

**Step 4: Add bounded tail rebuild on append**

On append:
- roll back to the last committed source chunk boundary or repair window
- invalidate forward only
- keep stable prefix untouched

**Step 5: Scope paging correctly**

Paged random access is for fixed-column viewport queries only.

Variable-width `layoutNextTerminalLineRange()` remains the uncached cursor path.

**Step 6: Validate**

Run:

```bash
bun run typecheck:tui
bun run benchmark-check:tui
bun run tui-oracle-check
```

Expected:
- large-text seek/materialize/append behavior is proven without forcing whole-text materialization
- paged/append counters are now available and checked here, not earlier

**Step 7: Sync docs and commit**

```bash
git add src/terminal-source-offset-index.ts src/terminal-cell-flow.ts src/terminal-line-index.ts src/terminal-page-cache.ts src/terminal-materialize.ts src/terminal.ts
git commit -m "feat: add sparse-anchor virtual text primitives"
```

### Task 10: Holistic Pass And Release Gate

**Files:**
- Modify: any touched files from Tasks 1-9 only if simplification is justified

**Step 1: Run the full TUI gate**

```bash
bunx tsc --noEmit -p tsconfig.tui.json
bun run test:tui
bun run package-smoke-test
bun run tui-static-gate
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run terminal-demo --columns=52 --fixture=mixed-terminal-session
```

**Step 2: Run repository hygiene checks**

```bash
rg -n "document|window|navigator|OffscreenCanvas|CanvasRenderingContext2D|measureText|getBoundingClientRect" src tests/tui scripts/tui-*.ts
rg -n "@chenglou/pretext|chenglou.me|pages/demos|site:build|Claude Code|claude-code|Ink|React|@anthropic-ai" README.md DEVELOPMENT.md TODO.md STATUS.md AGENTS.md package.json .github/workflows/ci-tui.yml docs/contracts
git diff --stat
```

Expected:
- active TUI runtime, docs, package surface, and default validation surface are browser-free and host-app-neutral

**Step 3: Holistic simplification pass**

Verify:
- no monkey-patch remains
- browser assumptions are not hiding behind compatibility wrappers
- duplicate width logic is not split across multiple modules
- range walkers and materializers still share one truth source

If simplifications are found, apply them and note them clearly.

**Step 4: Sync docs and commit**

```bash
git add .
git commit -m "feat: land terminal-only pretext-tui core and validation stack"
```
