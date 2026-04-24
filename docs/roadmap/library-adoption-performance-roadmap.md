<!-- 补建说明：该文件为后续补建，用于综合技术 swarm 对 pretext-TUI 后续接入、性能、安全、API 与证据建设的路线评审；当前进度：首版路线图，尚未代表已完成的实现。 -->
# Library Adoption And Performance Roadmap

This roadmap turns the technical swarm review into staged work for making `pretext-TUI` a stronger terminal-cell text layout core for text-heavy TUI, CLI, log, transcript, and editor-pane hosts.

The north star is host-neutral adoption: any terminal host that already owns rendering, input, pane state, and product behavior should be able to use the layout core without this package becoming a renderer, terminal emulator, pane system, command runner, or named-host integration layer.

## Non-Negotiable Boundary

Keep these inside `pretext-TUI`:

- terminal-cell preparation and layout
- row/range walking
- source-offset and cursor lookup over sanitized visible text
- range/page materialization
- fixed-column sparse indexes and page caches
- rich inline metadata for `SGR` and `OSC8`
- sanitizer diagnostics and terminal contract tests
- host-neutral recipes and typed examples

Keep these outside this package:

- named-host integration code for transcript CLIs, terminal multiplexers, editor panes, Ink, Blessed, Ratatui, Bubble Tea, Textual, terminal-kit, or similar hosts
- PTY control, tmux control mode, nvim RPC, panes, focus, keybindings, command execution, session persistence, clipboard actions, link opening, and product behavior
- renderer FPS, input-loop, terminal-emulator, or app-shell benchmarks

The package can document how hosts compose the primitives, but it should not grow named-host subpaths like `pretext-tui/<host-name>`.

## Swarm Consensus

The technical swarm agreed on five priorities:

1. Stabilize the public contract before promoting broad adoption.
2. Measure and reduce repeated grapheme/width work in terminal hot paths.
3. Build real streaming append storage before claiming incremental append.
4. Strengthen security posture for transcript, log, and enterprise terminal contexts.
5. Turn benchmark evidence into reproducible reports with raw samples, not marketing-only numbers.

The marketing swarm agreed on the matching communication rule: performance claims must name the exact workload, cache state, runtime, comparator semantics, and limitations.

## Phase 0: Launch Trust Gate

Goal: make the current package credible before louder promotion.

Tasks:

- Keep README positioning explicit: `pretext-TUI` is a terminal-cell text layout core, not a renderer, emulator, or TUI framework.
- Keep the Pretext lineage transparent: inherited `prepare -> layout` and range-based layout ideas, changed runtime target to terminal cells.
- Preserve the current validation chain: typechecks, no-browser static gate, tests, oracle, corpus, fuzz, benchmark gate, demo check, and package smoke test.
- Treat `benchmark:competitive:tui` as optional evidence, not a release guarantee.
- Add a public API stability matrix before `0.1`: stable, incubating, private.
- Add a production-readiness note before company-facing launch: support policy, security posture, version pinning, and known limitations.

Definition of done:

- README and docs do not imply existing integrations for named hosts.
- No standalone unreproducible benchmark headline exists.
- Install instructions are kept in README; launch copy should not imply a release channel beyond the current package metadata.
- Launch copy links to benchmark reproduction steps and claim guardrails.

## Phase 1: Host-Neutral Adoption Recipes

Goal: make external hosts able to adopt the package without asking for named-host package code.

Add recipes that compose existing APIs:

- Transcript viewport: `prepareTerminalCellFlow`, `appendTerminalCellFlow`, line index invalidation, page cache invalidation, visible-row materialization.
- Terminal pane resize: reuse `PreparedTerminalText`, rebuild width-dependent index/cache per columns, avoid renderer or pane ownership.
- Editor/plugin source mapping: `createTerminalSourceOffsetIndex`, cursor lookup, search/copy/diagnostic mapping, no editor RPC dependency.
- log viewer rich text: `prepareTerminalRichInline`, page/range cache over `rich.prepared`, fragment materialization, optional ANSI re-emission.

Prefer docs and type examples first. Add runtime helper APIs only after repeated recipe code proves a stable shape.

Candidate typed shape:

```ts
type TerminalViewportRequest = Readonly<{
  startRow: number
  rowCount: number
}>

type TerminalViewportSnapshot = Readonly<{
  kind: 'terminal-viewport-snapshot@1'
  generation: number
  columns: number
  startRow: number
  rowCount: number
  ranges: readonly TerminalLineRange[]
  lines: readonly MaterializedTerminalLine[]
}>
```

Definition of done:

- Recipes use only public exports.
- Recipes do not import `dist/internal/*` or `src/*`.
- Recipes clearly state host-owned behavior.
- Package smoke tests or declaration snapshot tests cover the public export surface used by recipes.

## Phase 2: Performance Measurement Before Optimization

Status: initial release-gate instrumentation has landed. The package now exposes default-off internal counters to validation scripts for prepared geometry builds/cache hits, line-text materialization segmentation, terminal materialization segmentation, rich boundary segmentation, rich fragment segmentation, rich fragment width measurement, page/cache counters, anchor replay, source lookups, and append invalidation size. These are regression diagnostics, not public benchmark evidence.

Goal: keep proving where time goes before rewriting additional hot paths.

Maintain or extend instrumentation or benchmark counters for:

- grapheme segmentation calls
- width calculations
- rows replayed from nearest anchor
- page cache hits and misses
- materialized row count
- rich span scans
- source-offset lookup build time and p95 lookup time
- append total input size versus appended suffix size
- allocation and heap snapshots where available

Extend `benchmark:competitive:tui` with:

- raw `samples[]`
- `p50`, `p95`, `min`, `max`, `mean`, `stdev`
- warmup count and iterations per sample
- corpus hash, lockfile hash, git commit, dirty flag, runtime, OS, CPU, dependency versions
- semantic matrix for each comparator: width profile, ANSI support, source mapping, rich metadata, page cache, append invalidation

Do not report p95 with too few samples. If samples are below the threshold, label p95 as approximate or omit it.

Definition of done:

- Every public performance claim has a matching raw report.
- Reports distinguish release regression gates from competitive benchmarks.
- Benchmarks make semantic gaps visible instead of pretending `wrap-ansi`, a greedy `string-width` loop, and `pretext-TUI` do identical work.

## Phase 3: Hot Path Improvements

Goal: make long transcript viewport seek, resize, and rich materialization faster without weakening correctness.

Priority tasks:

1. Landed: reuse prepared grapheme metadata in terminal range walking.
2. Landed: store prepared-time grapheme offsets, widths, and source boundaries so layout-time code avoids repeated `Intl.Segmenter` work for prepared geometry.
3. Landed: change page-cache miss construction to seek once, then walk rows sequentially inside the page.
4. Landed initially: use append-ordered/binary insertion for anchor structures and binary source-anchor lookup where profiling showed linear scans.
5. Next: reduce materialization-time grapheme segmentation now exposed by `lineTextGraphemeSegmentations`, `terminalMaterializeGraphemeSegmentations`, `richBoundaryGraphemeSegmentations`, and `richFragmentGraphemeSegmentations`.
6. Next: build rich span interval cursors so rich materialization does not scan all spans for every line.
7. Next: move source-offset lookup storage toward compact tables or typed arrays when object allocation shows up in profiles.
8. Next: split optional bidi/source metadata from cold terminal prepare work if the plain path does not need it.

Definition of done:

- Oracle, corpus, fuzz, rich, source-offset, and package smoke tests still pass.
- New benchmark counters show fewer segmentations/replays/scans, not just lower wall-clock on one machine.
- Public runtime shape remains host-neutral and browser-free.

## Phase 4: Real Streaming Append

Goal: replace full reprepare append cost with chunked append-only storage while preserving current invalidation semantics.

Design requirements:

- chunked prepared storage for append-only transcripts
- generation-based invalidation
- bounded memory and chunk compaction strategy
- lazy source-offset indexes
- correctness equivalence against full reprepare
- clear behavior for normalization boundaries, tabs, soft breaks, hard breaks, and trailing whitespace
- immutable resolved prepare options so mutated caller objects cannot change later append semantics

Definition of done:

- 1,000 small appends over a growing transcript do not reprepare the full buffer each time.
- Every append step can be checked against full prepare/layout/materialize output.
- README can honestly upgrade from "full reprepare plus bounded invalidation metadata" to the narrower implemented claim.

## Phase 5: Security And Enterprise Readiness

Goal: make the package safer for transcripts, logs, editor panes, and company environments.

Current status: the first rich sidecar security gate has landed. Host-neutral profiles, raw retention policy, redacted diagnostics, OSC8 policy, bidi format-control policy, DoS limits, and opt-in ANSI reconstruction are implemented and tested. The remaining work is broader production evidence: support matrix, provenance notes, recipe-level threat model callouts, and richer adoption materials.

Blocking review items before an enterprise-style launch:

- Broaden production docs with runtime/support matrix, provenance, and recipe-level threat model notes.
- Decide whether raw-to-sanitized provenance should stay as raw-visible maps or grow a named audit API.
- Extend DoS accounting from rich input limits into cache-memory budgets when page/index APIs get memory budgets.
- Freeze or deeply resolve width profiles and prepare options used by append flows.

Definition of done:

- Security docs include threat model, supported versions, and reporting policy.
- Tests cover Trojan Source-style bidi controls, dangerous `OSC8` schemes, OSC52/DCS redaction, huge malformed controls, and SGR out-of-range inputs.
- Marketing avoids broad ANSI security claims; use "keeps supported rich metadata separate from layout and rejects or sanitizes unsupported terminal controls."

## Phase 6: Adoption Evidence Pack

Goal: give external developers and companies enough proof to try the package.

Evidence pack contents:

- correctness matrix: terminal width profiles, CJK, emoji, combining marks, tabs, source offsets, rich sanitizer, oracle, corpus, fuzz
- benchmark reports: clean commit, raw samples, p50/p95, hardware/runtime/dependency metadata, cross-runtime notes
- semantic matrix: what each comparator does and does not support
- host-neutral recipes: transcript viewport, terminal pane resize, editor source mapping, log viewer
- production readiness: API stability, security posture, support policy, license/provenance, package smoke results
- known limitations: no renderer, no emulator, no named-host integration layer, no chunked append storage yet, no broad benchmark supremacy wording

Definition of done:

- A skeptical maintainer can reproduce the cited benchmark and understand its limits.
- A company reviewer can identify support/security/version risks without reverse-engineering the repo.
- Developers can copy a recipe into their host without depending on private internals.
