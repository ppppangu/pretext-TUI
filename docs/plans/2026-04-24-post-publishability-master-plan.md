<!-- 补建说明：该文件为后续补建，用于把 API 稳定、安全生产可用、recipes、benchmark 证据、性能优化与 chunked append 的多 swarm 讨论结果固化为后续集群执行总方案；当前进度：首版 master plan，作为后续分阶段执行、审核和返工的主入口。 -->
# Post-Publishability Master Plan Implementation Plan

> **For executor:** REQUIRED WORKFLOW: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Turn the current publishable `pretext-TUI` package into an adoption-ready terminal-cell text layout core with stable public API boundaries, production/security posture, host-neutral recipes, reproducible benchmark evidence, measured performance improvements, and eventually true chunked append.

**Architecture:** Keep `pretext-TUI` host-neutral: the package owns terminal text preparation, layout, ranges, source offsets, rich metadata, virtual text indexes, page caches, and validation evidence. Host applications continue to own rendering, input, panes, focus, command execution, link opening, clipboard, persistence, and product behavior. The execution order is gate-driven: lock public contracts and production/security boundaries before recipes, benchmark evidence before performance work, and parity/evidence before chunked append claims.

**Tech Stack:** Bun, TypeScript, ESM package exports, `Intl.Segmenter`, deterministic terminal width profiles, package smoke tests, API declaration snapshots, TUI oracle/corpus/fuzz gates, benchmark raw reports, and swarm-based implementation/review with strict file ownership.

---

## Master Order

The corrected phase order is:

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

The important correction from review is that production/security readiness must move forward. It cannot remain after performance and append because rich ANSI behavior, diagnostics, OSC8 links, raw retention, DoS limits, and support policy affect public API, recipes, benchmark claims, and enterprise trial safety.

## Non-Negotiable Rules

- Do not add named-host integration subpaths such as `pretext-tui/<host-name>`.
- Do not add renderer, pane, focus, keybinding, PTY, tmux control mode, nvim RPC, command runner, filesystem, clipboard, or link-opening behavior to the package.
- Do not reintroduce browser, DOM, Canvas, web page, browser automation, or monkey-patched browser globals into active runtime or validation.
- Do not claim chunked append storage until full reprepare cost is actually removed and proven with parity tests and counters.
- Do not publish standalone local speedup numbers, universal speed-superiority, broad ANSI security claims, or broad company-readiness claims.
- Do not let recipes, docs, tests, or public declarations depend on `src/*` or `dist/internal/*`.
- Do not use wall-clock speedups alone as performance acceptance; require counters that show fewer segmentations, replays, scans, or allocations.
- New files must start with `补建说明`; new directories must include a `README.md` with purpose and progress.

## Fact-Source Hierarchy

Use this hierarchy to prevent README, roadmap, benchmark, and marketing drift:

1. Executable reality: `src/`, tests, scripts, package exports, `package.json`.
2. Normative contracts: `docs/contracts/terminal-contract.md` and `docs/contracts/host-app-boundary.md`.
3. Evidence: validation dashboards, benchmark configs, and generated clean benchmark reports.
4. `README.md`: public package story derived from contracts and evidence.
5. `STATUS.md`: compact current-state snapshot only.
6. `TODO.md`: active execution queue only.
7. `docs/roadmap/*`: future intent only.
8. `docs/marketing/*`: copy templates and launch guardrails only, never the source of truth.

Dynamic benchmark numbers should live in evidence reports, not hardcoded in multiple public narrative files.

## Batch 0: Baseline And Fact-Source Lock

**Goal:** Freeze the current first-wave outputs before launching more workers from a dirty worktree.

**Why this is first:** The current tree already includes new roadmap, marketing, competitive benchmark, README, package, and docs changes. Later swarms should fork from a known baseline, not from a moving pile of partially integrated artifacts.

**Workstreams:**

- Explorer-0A: list dirty and untracked files and classify them as previous release work, competitive benchmark work, marketing work, roadmap work, or unrelated.
- Reviewer-0B: check README/marketing/roadmap for stale hardcoded benchmark numbers and overbroad claims.
- Coordinator-0C: after user confirmation, freeze the baseline with a branch or commit before spawning implementation workers.
- Docs-0D: plan future fact-source split: `docs/evidence/`, `docs/recipes/`, `docs/production/`, and slimmer `docs/roadmap/`.

**Validation:**

```sh
git status --short
git diff --name-status
bun run check
bun run test:tui
bun run benchmark-check:tui
bun run package-smoke-test
```

Run full `bun run prepublishOnly` if the baseline is intended to become a release candidate or long-lived execution base.

**Exit criteria:**

- The working base is known and reproducible.
- Future worker swarms know which files are already part of the accepted baseline.
- README/marketing no longer contain unanchored performance claims if evidence reports do not exist yet.

## Batch 1: Boundary/API Gate

**Goal:** Prevent internal storage and unstable helpers from becoming accidental public API.

**Key decision:** This gate blocks recipes, external adoption, benchmark promotion, performance refactors, and chunked append implementation.

**Workstreams:**

- Worker-1A: write API stability matrix for stable, incubating, private, and unsupported surfaces.
- Worker-1B: make `PreparedTerminalText` opaque at the public type boundary. Use a branded handle and internal WeakMap/capability storage instead of exposing `PreparedTextWithSegments`.
- Worker-1C: add declaration/API snapshot checks for `dist/index.d.ts`, `dist/terminal.d.ts`, `dist/terminal-rich-inline.d.ts`, runtime export keys, and negative private import tests.
- Worker-1D: harden package smoke and static gates: exact export allowlist, private subpath rejection, package file inventory, and host-specific subpath rejection.
- Reviewer-1R: verify root and `./terminal` alias semantics are documented so maintainers do not confuse `./terminal` with a narrow `src/terminal.ts` wrapper.

**Stable candidates for `0.1`:**

- `prepareTerminal`
- `layoutTerminal`
- `measureTerminalLineStats`
- `walkTerminalLineRanges`
- `layoutNextTerminalLineRange`
- `materializeTerminalLineRange`
- `TerminalPrepareOptions.whiteSpace`, `wordBreak`, `tabSize`
- `TerminalLayoutOptions.columns`, `startColumn`
- terminal row/range/materialized line data shapes, with versioned `kind` tags

**Incubating candidates:**

- `./terminal-rich-inline`
- line index, page cache, source offset index, cell flow, append invalidation
- rich diagnostics, raw maps, `ansiText`
- width profile overrides beyond the default profile

**Private surfaces:**

- `src/*`
- `dist/internal/*`
- `layout`, `analysis`, `line-break`, `ansi-tokenize`, `terminal-string-width` internals
- scripts, benchmark harnesses, generated data internals

**Validation:**

```sh
bun run typecheck:tui
bun run typecheck:tui-validation
bun run package-smoke-test
bun run check
```

Add a future command such as:

```sh
bun run api-snapshot-check
```

**Exit criteria:**

- Public `.d.ts` no longer exposes `PreparedTextWithSegments`, prepared-handle structural fields such as `segments`, `sourceStarts`, `kinds`, `widths`, or `tabStopAdvance`, while `sourceText` remains allowed only on materialized line/fragment result objects as the visible source slice for that range.
- Private imports fail in package smoke and declaration tests.
- `package.json.exports` remains limited to `.`, `./terminal`, `./terminal-rich-inline`, and `./package.json`.
- API changes have explicit semver status and migration notes.

## Batch 2: Production/Security Gate

**Goal:** Make the rich transcript/log surface safe enough to document, trial, and review honestly.

**This gate blocks:** company pilot copy, broad readiness claims, broad launch copy, recipes that imply safe rich output, and any marketing that makes broad ANSI security claims.

**Workstreams:**

- Worker-2A: create production readiness documentation: maturity, supported surfaces, runtime support, support policy, known limitations, versioning, release cadence, package manager stance, and pilot criteria.
- Worker-2B: define host-neutral rich profiles such as `default`, `transcript`, and `audit-strict` without naming specific host applications.
- Worker-2C: design OSC8 URI policy: allowed schemes, absolute URL parsing, credential rejection, max URI length, canonicalization, redaction, and host-owned opening.
- Worker-2D: design bidi/format control policy: allow normal RTL text, but reject, escape, or annotate bidi format controls.
- Worker-2E: redesign diagnostics so defaults do not retain full dangerous control sequences. Prefer family, offsets, length, capped escaped sample, hash, redaction flag, and policy profile.
- Worker-2F: define raw retention and raw-to-sanitized provenance policy.
- Worker-2G: add DoS limits for raw input, control sequences, URI length, diagnostics, spans, raw-visible maps, ANSI reconstruction, page size, max pages, and cache memory.
- Worker-2H: add supply-chain posture: SBOM, license/provenance, lockfile hash, dependency audit, npm provenance/attestation, tarball inventory.
- Reviewer-2R: security review against Trojan Source, OSC8 dangerous schemes, OSC52/DCS/PM/APC, huge malformed controls, raw secret retention, and untrusted ANSI re-emission.

**Must-fix before enterprise-style launch:**

- Full raw terminal input must not be casually exposed as a safe default in rich public results.
- diagnostics must not default to full unsafe `sequence` retention.
- `ansiText` must be explicit opt-in and policy-bound, especially for OSC8.
- bidi/format control behavior must be tested and documented.
- DoS limits and overflow behavior must be documented and tested.
- `SECURITY.md` must describe supported versions, reporting path, response targets, disclosure, and backport stance.

**Validation:**

```sh
bun run typecheck:tui
bun test src/terminal-rich-inline.test.ts tests/tui/rich-inline.test.ts
bun run tui-static-gate
bun run tui-fuzz --seed=ci --cases=2000
```

Search for risky claims:

```sh
rg -n "ANSI safety claim|prevents terminal escape|broad company-readiness claim" README.md docs SECURITY.md
```

**Exit criteria:**

- Production readiness docs explain what is ready, what is not, and what is required for a safe pilot.
- Rich path safe defaults are defined and tested.
- Security-sensitive marketing wording is blocked or replaced with precise wording.
- Enterprise pilot entry and exit conditions are explicit.

## Batch 3: Host-Neutral Recipes

**Goal:** Show external hosts how to adopt public primitives without turning the package into an app-specific integration library.

**Allowed output:** docs, typed examples, and tests that compose public exports.

**Forbidden output:** runtime named-host integrations, new host-specific exports, host SDK imports, renderer dependencies, editor/tmux APIs, or app behavior.

**Workstreams:**

- Worker-3A: `docs/recipes/transcript-viewport.md`.
- Worker-3B: `docs/recipes/terminal-pane-resize.md`.
- Worker-3C: `docs/recipes/editor-source-mapping.md`.
- Worker-3D: `docs/recipes/log-viewer-rich-ansi.md`.
- Worker-3E: recipe tests and package smoke examples.
- Reviewer-3R: public-only import review and host-boundary review.

**Validation:**

```sh
bun run typecheck:tui
bun run typecheck:tui-validation
bun run package-smoke-test
rg -n "from ['\"].*(src/|dist/internal)" README.md docs tests scripts
rg -n "tmux control|nvim RPC|named-host integration|Ink|Blessed|React renderer" docs/recipes README.md
```

**Exit criteria:**

- Every recipe can be copied using only package public exports.
- Every recipe names host-owned behavior.
- No recipe implies an existing integration with any named host.

## Batch 4: Benchmark Evidence Gate

**Goal:** Upgrade performance evidence from local single-run signals to reproducible raw reports.

**Boundary:** `benchmark-check:tui` remains the release regression gate. `benchmark:competitive:tui` remains optional/manual/scheduled evidence and must not enter `prepublishOnly`.

**Workstreams:**

- Worker-4A: introduce raw report schema `pretext-tui-benchmark-evidence@1`.
- Worker-4B: add sample runner with warmups, `samples[]`, `p50`, `p95`, min, max, mean, stdev, coefficient of variation, and iterations per sample.
- Worker-4C: capture metadata: command, script/config hash, git commit, dirty flag, runtime versions, OS, CPU, memory, lockfile hash, dependency versions, corpus hash, effective input hash.
- Worker-4D: add semantic matrix per comparator: terminal width, grapheme safety, tabs, whitespace, source offsets, rich SGR, OSC8, sanitizer, range-only output, page cache, append invalidation.
- Worker-4E: generate Markdown summaries from JSON only; JSON is the source of truth.
- Worker-4F: add evidence docs such as `docs/evidence/benchmark-claims.md` and `docs/evidence/benchmark-reports/`.
- Reviewer-4R: claim review. README and marketing may only cite report IDs or use placeholders.

**Validation:**

```sh
bun run benchmark:competitive:tui
bun run benchmark-check:tui
bun run typecheck:tui-validation
rg -n "unreproducible speedup|release guarantee|renderer event loop|universal speed" README.md docs benchmarks
```

**Exit criteria:**

- Each non-skipped benchmark result has raw samples and stats.
- p95 is omitted or marked approximate when sample count is too low.
- README performance claims link to evidence reports or avoid fixed numbers.
- Comparator semantic gaps are explicit.

## Batch 5: Counter-Proven Performance Work

**Goal:** Improve hot paths only after measurement proves the problem and after benchmarks can prove the improvement.

**Entry criteria:** Batch 4 complete.

**Workstreams:**

- Worker-5A: add instrumentation counters for segmentation, width prefix hits, page seeks, replay rows, rich span visits, source lookup steps, allocation indicators, and append reprepare units.
- Worker-5B: prepared grapheme and width prefix sidecar for terminal ranges. Tabs remain layout-time because tab advance depends on current column.
- Worker-5C: page miss seek-once sequential walk.
- Worker-5D: anchor/source lookup improvements, binary search, append-ordered insertion, and compact structures where measured.
- Worker-5E: rich span interval cursor or binary-search overlap index, replacing line-by-line full span scans.
- Worker-5F: source lookup compact tables or typed arrays where allocation is proven hot.
- Integrator-5I: update benchmark counters and thresholds only when evidence supports them.
- Reviewer-5R: correctness and performance regression review.

**Validation:**

```sh
bun run typecheck:tui
bun run test:tui
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run terminal-demo-check
```

Run `bun run prepublishOnly` after phase integration or any major change to `src/terminal.ts`, `src/layout.ts`, `src/line-break.ts`, or `src/terminal-string-width.ts`.

**Exit criteria:**

- Correctness gates stay green.
- Counters show fewer segmentations, replays, scans, or allocations.
- No layout hot path materializes strings unnecessarily.
- No public API or terminal contract semantics are weakened.

## Batch 6: True Chunked Append

**Goal:** Replace full reprepare append cost with real chunked append while preserving source offsets, normalization, invalidation, and correctness.

**Entry criteria:** Batch 1, Batch 2, and Batch 4 complete. Batch 5 instrumentation should exist.

**Architecture direction:**

- Keep `PreparedTerminalCellFlow` as the public append handle.
- Add internal prepared-source reader/capability boundary so terminal layout, page cache, line index, and source index do not depend on physical `segments/sourceText/sourceStarts` arrays.
- Represent append storage as sealed chunks plus an open normalization/segmentation tail.
- Preserve global UTF-16 source offsets and global cursor identity.
- Treat compaction as lossless at first; destructive prefix eviction requires a future explicit API because it changes global offset meaning.

**Workstreams:**

- Explorer-6A: map current append invalidation and generation invariants.
- Worker-6B: internal prepared reader with no behavior change.
- Worker-6C: refactor terminal/source/page helpers to use the reader.
- Worker-6D: suffix prepare and open-tail model for `normal` and `pre-wrap`.
- Worker-6E: chunked flow implementation and generation invalidation.
- Worker-6F: lazy source boundary pages and LRU limits.
- Worker-6G: lossless chunk compaction.
- Worker-6H: append parity benchmark and 1,000-small-append stress test.
- Reviewer-6R: claim gate before README updates.

**Append correctness cases:**

- `hello` + space + `world`
- CRLF split across appends
- tab at chunk seam
- `trans\u00AD` + `atlantic`
- `hello\u200B` + `world`
- combining mark split
- emoji ZWJ and regional flag split
- CJK punctuation
- URL/numeric run merging
- NBSP and WJ glue
- consecutive LFs
- final LF

**Validation:**

```sh
bun run typecheck:tui
bun run test:tui
bun run tui-oracle-check
bun run tui-corpus-check
bun run tui-fuzz --seed=ci --cases=2000
bun run benchmark-check:tui
bun run terminal-demo-check
bun run prepublishOnly
```

**Exit criteria:**

- 1,000 small appends do not reprepare the full accumulated buffer each time.
- Each append step matches full `prepareTerminal(fullRaw)` for rows, ranges, widths, break kind, source offsets, materialized text, source lookup, line index pages, and page cache invalidation.
- README can honestly update append wording.

## Batch 7: Adoption Evidence And Launch Readiness

**Goal:** Package correctness, security, recipes, benchmark evidence, limitations, and launch copy into a reviewable adoption kit.

**Workstreams:**

- Worker-7A: correctness matrix across terminal width profiles, CJK, emoji, combining marks, tabs, source offsets, rich sanitizer, oracle, corpus, and fuzz.
- Worker-7B: benchmark evidence reports from clean commits.
- Worker-7C: production readiness bundle: API matrix, security profile, support policy, SBOM/provenance, runtime matrix, known limitations.
- Worker-7D: recipe bundle and public-only smoke examples.
- Worker-7E: marketing copy update using only evidence IDs and placeholders.
- Reviewer-7R: final claims and technical-debt review.

**Validation:**

```sh
bun run prepublishOnly
bun run benchmark:competitive:tui
git status --short
rg -n "universal speed|chunked append storage claim|named-host integration|tmux integration|nvim integration|broad company-readiness claim" README.md docs
```

**Exit criteria:**

- A skeptical maintainer can reproduce the strongest benchmark claim.
- A company reviewer can see support/security/version risks without reverse-engineering the repo.
- Developers can copy recipes without private imports.
- Marketing copy does not exceed technical evidence.

## Swarm Execution Template

Every swarm task should include:

- `task_id`
- phase and gate
- owned files
- forbidden files
- read-only context files
- exact acceptance criteria
- required tests and expected result
- known risk areas
- debt handling rule
- reviewer role and review checklist

Explorer output must include findings with file references, recommended write set, risks, tests needed, and design blockers.

Worker output must include changed files, behavior change summary, test command summary, public API or claim evidence, residual risks, and docs integrator follow-up needs.

Reviewer output must start with findings by severity and end with one of:

- approve
- approve with documented residual risk
- request changes
- block downstream phase

## File Lock Rules

Use file locks to avoid swarm collisions:

- `README.md`: docs integrator only.
- `STATUS.md` and `TODO.md`: docs integrator only.
- `package.json` and `bun.lock`: package-surface owner only.
- `src/index.ts`: API owner only.
- `src/terminal.ts`, `src/layout.ts`, `src/line-break.ts`: one performance/API worker at a time.
- `src/terminal-rich-inline.ts` and `src/ansi-tokenize.ts`: security/rich owner only.
- `scripts/competitive-tui-benchmark.ts` and benchmark JSON: benchmark owner only.
- golden/snapshot/benchmark files: validation owner only.

Workers must not use `git add .`. Integrators handle final docs sync and full validation.

## Technical Debt Rules

Acceptable temporary debt:

- incubating APIs marked as incubating in docs and tests
- measured performance opportunities that do not affect public claims yet
- recipe abstractions deferred until repeated twice
- future enhancements with phase owner, gate, and cleanup path

Must be fixed before downstream phases:

- public docs contradict implementation
- security defaults retain unsafe raw payloads without explicit policy
- recipes depend on private internals
- host-specific behavior enters runtime
- full reprepare is marketed as incremental append
- benchmark claims lack raw evidence
- monkey patches, shims, hardcoded snapshot exceptions, or disabled tests are used to pass gates

## Final Review Rule

Before any phase is called complete:

1. Run that phase's focused validation.
2. Review all touched files for simplification and boundary consistency.
3. Check docs and claims against the fact-source hierarchy.
4. Decide whether any residual risk is acceptable, must be fixed, or must block downstream work.
5. Only then move to the next phase.

Report holistic simplification truthfully when applicable:

```text
I DID A HOLISTIC PASS AND FOUND SIMPLIFICATIONS
```

Report root-cause handling truthfully when applicable:

```text
I SOLVED THE ROOT CAUSE NOT THE SYMPTOM
```
