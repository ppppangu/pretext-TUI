<!-- 补建说明：该文件为后续补建，用于在 Phase 0-10 全部批准后给出内核精炼、目录分层迁移与 agent-TUI 工作负载导向的中长期发展规划；当前进度：首版规划，作为 post-Phase-10 方向性计划，不改变既有契约与 non-goals。 -->
# Kernel Refinement And Agent-TUI Workload Roadmap

## Purpose

This plan describes the post-Phase-10 direction for `pretext-TUI`. It assumes the
[post-publishability master plan](2026-04-24-post-publishability-master-plan.md)
batches are complete and approved with documented residual risk.

The goal of this plan, stated once:

```text
Keep pretext-TUI a single, focused, host-neutral terminal-cell text kernel
that any TUI host can adopt, with agent-transcript-shaped workloads treated
as first-class evidence targets rather than as host integrations.
```

"Agent transcript" here is a workload shape — streaming append, tail follow,
long scrollback seek, resize reflow, search, selection, structured blocks,
rich ANSI — not a product or a named host. All existing contracts,
non-goals, and claim guardrails remain binding.

This plan does not change the terminal contract, the host boundary, or the
public API boundary. It sequences work; each track still needs its own
review/approval record before landing.

## Current Architecture Snapshot (As Built)

Layering of the active runtime, bottom to top. The layers exist today only in
the import graph; the source tree is flat.

| Layer | Modules | Phase |
| --- | --- | --- |
| L0 Unicode data | `src/generated/bidi-data.ts`, codepoint tables inside `terminal-string-width.ts` | data |
| L1 Width | `terminal-width-profile.ts`, `terminal-string-width.ts`, `measurement.ts` | prepare |
| L2 Analysis | `analysis.ts` (normalize, segment, glue, CJK/kinsoku), `bidi.ts` (metadata only) | prepare |
| L3 Wrap core | `line-break.ts` (arithmetic walking), `layout.ts` (prepare orchestration), `line-text.ts` (lazy text) | prepare/layout |
| L4 Reader boundary | `terminal-prepared-reader.ts`, `terminal-reader-store.ts`, `terminal-grapheme-geometry.ts`, `terminal-normalized-source.ts` | prepared state |
| L5 Terminal facade | `terminal.ts`, `terminal-line-source.ts`, `terminal-plain-input.ts` | public core |
| L6 Virtual text | `terminal-line-index.ts`, `terminal-page-cache.ts`, `terminal-source-offset-index.ts`, `terminal-layout-bundle.ts`, `terminal-materialize.ts`, `terminal-cell-flow.ts` | layout/materialize |
| L7 Semantic helpers | `terminal-coordinate-projection.ts`, `terminal-selection.ts`, `terminal-search-session.ts`, `terminal-range-index.ts` | data APIs |
| L8 Rich sidecar | `ansi-tokenize.ts`, `terminal-rich-policy.ts`, `terminal-rich-span-index.ts`, `terminal-rich-inline.ts`, `terminal-control-policy.ts` | opt-in |
| Cross-cutting | `terminal-performance-counters.ts`, `terminal-memory-budget.ts` | telemetry |
| Exit surface | `public-index.ts`, `public-terminal-rich-inline.ts`, `index.ts` | publish |

Structural debts observed in the current tree (kept as facts, not blame):

- `analysis.ts` (~1,400 lines) carries normalization, segmentation, glue
  rules, URL/number merging, and CJK/kinsoku in one file.
- `layout.ts` duplicates part of the CJK unit logic that conceptually belongs
  to analysis.
- Grapheme segmenter singletons are maintained separately in at least five
  modules, each with its own cache-clear entry point.
- Tab advance modulo arithmetic exists both in `line-break.ts` and
  `terminal-string-width.ts`.
- Two naming generations coexist: pre-migration names (`analysis.ts`,
  `layout.ts`, `line-break.ts`, `line-text.ts`, `measurement.ts`, `bidi.ts`)
  next to the `terminal-*` generation. `tsconfig.tui.json` `include` globs
  (`src/terminal*.ts`) currently encode the flat naming as a typecheck
  boundary.
- `accuracy/tui-reference.json` goldens and the export allowlists in
  `scripts/public-api-contract.ts` are hand-maintained with no regeneration
  or AST-derived check.

## Workload-To-Capability Map

The agent-TUI interaction loop, expressed as kernel workloads:

| Workload | Kernel status today | Gap |
| --- | --- | --- |
| Streaming token append | Append-only chunked storage behind `PreparedTerminalCellFlow`; 1,000-small-append benchmark counters | Tail-follow row queries; documented append batching guidance backed by counters |
| Viewport seek over long scrollback | Sparse anchors + fixed-column page cache + layout bundle | None structural; keep counter-driven |
| Resize reflow | Width-independent prepared state; rebuild width-dependent indexes | None structural |
| Bounded scrollback retention | Not implemented | Destructive prefix eviction is an explicit future API (changes source-offset meaning); needs its own design record |
| Rich ANSI transcript | SGR/OSC8 sidecar with security profiles | Coverage growth stays policy-bound and metadata-only |
| Search over transcript | Source-first search sessions (literal/regex) | Bounded/streamed match storage before stable low-memory claims |
| Selection and copy extraction | Linear selection + deterministic extraction | Rectangular/block selection remains host-owned future work |
| Structured blocks (messages, tool calls, diffs) | Generic range sidecar with inert metadata | Incremental range-index maintenance under append |
| Editable input line | Out of scope (append-only) | Arbitrary insert/delete/replace is a separate future buffer design |
| Multilingual + emoji width | `terminal-unicode-narrow@1` profile, corpus + fuzz gates | Additional profiles and a Unicode-version upgrade policy |
| Bidi text | Logical-order metadata only | Deeper bidi evidence; visual reordering stays host-owned |

This table is the prioritization source for the tracks below: structural
strengths are maintained by gates; gaps become track items.

## Track R1 — Kernel Refinement (alpha -> beta hygiene)

Internal-only work. No public API change, no behavior change; every step must
keep `bun run release-gate:tui` green and goldens byte-identical.

1. **Unify duplicated primitives.**
   - Single shared grapheme-segmenter module with one cache-clear entry point.
   - Single tab-advance helper (`terminal-string-width.ts` owns it;
     `line-break.ts` imports it).
2. **Split `analysis.ts` by responsibility** into normalize / segment /
   merge-rule units (CJK and kinsoku rules co-located in one place; remove the
   duplicated CJK unit logic from `layout.ts`).
3. **Decompose `measureAnalysis()`** in `layout.ts` into CJK and non-CJK
   measurement helpers with explicit in/out contracts.
4. **Golden regeneration tooling.** Add a script that regenerates
   `accuracy/tui-reference.json` from case definitions, with a diff-review
   workflow, so reference updates stop being hand-edited JSON.
5. **Contract-table generation check.** Derive (or at least cross-check) the
   runtime export allowlists in `scripts/public-api-contract.ts` from the
   `src/public-index.ts` facade so the constant tables cannot drift silently.

Validation per step: full release gate plus a no-diff check on
`accuracy/tui-reference.json`, demo JSON output, and the API snapshot.

## Track R2 — Directory Layering Migration

Make the physical tree match the logical layers. One move, planned, not
incremental drift. Target layout:

```text
src/
  public/      index.ts, public-index.ts, public-terminal-rich-inline.ts
  unicode/     terminal-width-profile.ts, terminal-string-width.ts, generated/, bidi.ts
  analyze/     analysis split units
  wrap/        line-break.ts, layout.ts (prepare orchestration), line-text.ts, measurement.ts
  prepared/    terminal-prepared-reader.ts, terminal-reader-store.ts,
               terminal-grapheme-geometry.ts, terminal-normalized-source.ts
  core/        terminal.ts, terminal-line-source.ts, terminal-plain-input.ts,
               terminal-control-policy.ts, terminal-types.ts
  virtual/     terminal-line-index.ts, terminal-page-cache.ts,
               terminal-source-offset-index.ts, terminal-layout-bundle.ts,
               terminal-materialize.ts, terminal-cell-flow.ts
  semantic/    terminal-coordinate-projection.ts, terminal-selection.ts,
               terminal-search-session.ts, terminal-range-index.ts
  rich/        ansi-tokenize.ts, terminal-rich-policy.ts,
               terminal-rich-span-index.ts, terminal-rich-inline.ts
  telemetry/   terminal-performance-counters.ts, terminal-memory-budget.ts
```

Migration constraints (verified against the current tree):

- Update all relative `.js` import specifiers; keep runtime-honest specifiers.
- Update `tsconfig.tui.json` (`files` list and `include` globs currently bound
  to flat `src/terminal*.ts` naming), `tsconfig.tui-validation.json`,
  `tsconfig.build.json`.
- Update `readerBoundaryRuntimeFiles` and related path lists in
  `scripts/public-api-contract.ts`, plus static-gate file classification.
- `scripts/build-package.ts` emits `dist/internal/` mirroring `src/`; root
  `dist/` wrappers and the public API snapshot must stay byte-identical, which
  is the primary success check for the move.
- Every new directory gets a `README.md` with purpose and progress, per the
  repository rule.
- Import direction rule after the move: a layer may import only from lower
  layers; `public/` is the only exit surface. Add a static-gate check for
  cross-layer upward imports so layering is enforced, not aspirational.

R2 lands after R1 (smaller files move more cleanly). One PR, release gate
green, API snapshot unchanged.

## Track R3 — Streaming Maturity (agent-transcript evidence targets)

Public-surface work; each item needs its own approval record and stays
incubating until promoted.

1. **Tail-follow queries.** Host-neutral "last N rows of the current
   generation" lookup over a layout bundle or line index, so follow-mode
   viewports do not re-derive total row counts per append. Counter-gated.
2. **Append batching evidence.** Extend the benchmark workloads with
   burst-append patterns (many small appends per frame window) and document
   counter-backed guidance in a recipe; no wall-clock claims in prose.
3. **Bounded search sessions.** Match-count limits or windowed match storage
   so long transcripts cannot grow session memory unbounded; modelled in the
   memory-budget gate before any low-memory claim.
4. **Incremental range-index maintenance.** An append-friendly way for hosts
   to extend a `TerminalRangeIndex` without full rebuilds, still inert
   metadata only.
5. **Prefix-eviction design record (RFC only).** Destructive eviction changes
   global source-offset meaning; this track produces a design document and
   explicit approval gate, not an implementation.

## Track R4 — Adoption Surface ("any TUI can use it")

The adoption path is kernel + recipes + conformance evidence, not bundled
adapters. Named-host adapter code stays out of this repository permanently.

1. **Stable `0.1` promotion review** for the core six APIs plus
   `TERMINAL_START_CURSOR`, via the incubating API approval index.
2. **Conformance fixture kit.** Package-neutral, data-only fixture/expectation
   sets (width cases, wrap cases, offset cases) that an external host or even
   a non-JS reimplementation can run against. Published from this repo as
   data, not as a framework.
3. **External proof-of-concept hosts.** Two or three minimal viewers in
   separate repositories (for example: log pager, agent-transcript pane,
   editor preview) used as adoption evidence and recipe validation. They link
   back here; they never move in here.
4. **Unicode upgrade policy.** A documented procedure for adopting new
   Unicode versions behind new width-profile versions
   (`terminal-unicode-narrow@2`, ...) without breaking prepared-data identity
   semantics.
5. **Docs site continuity.** `website/` stays a repository-only static site
   outside the npm files allowlist; it documents, it does not become a second
   product story.

## Explicitly Out Of Band

Unchanged from existing decisions; restated so this plan cannot be read as
reopening them:

- No renderer, PTY, input handling, focus model, pane system, or component
  library in this package.
- No named-host integration subpaths.
- No arbitrary insert/delete/replace editing in the current flow design.
- No destructive prefix eviction without its own approval record.
- No dynamic benchmark numbers in prose; report ids only.
- No second public pipeline or parallel product story.

## Sequencing And Validation

Suggested order: R1 -> R2 -> (R3 and R4 in parallel). R1/R2 are
behavior-frozen refactors gated on byte-identical public outputs; R3/R4 items
each carry their own plan, tests, counters, and approval record, following the
phase pattern already used in `docs/decisions/`.

Every track keeps the full release gate green:

```sh
bun run release-gate:tui
```

Progress tracking for this plan belongs in `TODO.md` ("Active Next") and
`STATUS.md` once a track starts; this document stays the direction record.
