<!-- 补建说明：该文件为后续补建，用于记录 Track R3 第 5 项 destructive prefix eviction 的设计 RFC（仅决策记录，不含实现与公共 API 变更）；当前进度：首版 RFC，给出坐标域三个候选方案的诚实取舍、推荐方向、淘汰边界约束与落地前的证据/审批要求。 -->
# Prefix Eviction Design RFC (R3 Item 5 — Design Record Only)

Status: **design record only — no API change**; implementation requires its
own approval record in `docs/decisions/`. Until then the contract's "future
explicit API" sentence and Phase 8's not-approved list remain binding.

## Problem

Agent transcript workloads append for the life of a session, and the
append-only chunked flow (`src/virtual/terminal-cell-flow.ts`) retains every
sanitized source code unit ever appended; every dependent index grows with it.
A host wanting bounded scrollback retention today has two options: keep
everything, or full re-prepare over truncated text — destroying every prepared
handle, generation chain, index, stored offset, cursor, search session, and
selection the host holds. That is a restart, not retention. The kernel should
expose explicit eviction so hosts can keep modelled footprint within their own
budget; the kernel exposes the mechanism only, hosts own when and how much.

## The Core Tension

UTF-16 source offsets over sanitized visible source text are the kernel's one
canonical coordinate domain; everything durable (range sidecar entries, search
hits, selections, projections, invalidation records) is expressed in it.
Destructive eviction forces the question: after content is dropped, what does
offset `0` mean? Any answer reshapes the data contract for every offset
holder, so this is a coordinate-domain decision first, storage second.

## Blast Radius

| Surface | Effect of prefix eviction |
| --- | --- |
| `PreparedTerminalText` handles | A new prepared per eviction (append already produces a new prepared per call); old prepared stays usable over old content until dropped. |
| Cell-flow generations (`terminal-cell-flow.ts`) | Eviction must advance the generation and emit a record in the existing invalidation lineage; downstream replay protection must distinguish "prefix removed" from "suffix appended". |
| Source-offset index (`terminal-source-offset-index.ts`) | Boundary table is bound to prepared identity; rebuilt against the new prepared. Lookups below the eviction boundary need an explicit result, not a silent clamp to `0`. |
| Line index (`terminal-line-index.ts`) | Row anchors store cursor + source offset; the row-0 anchor hardcodes `sourceOffset: 0` and `TERMINAL_START_CURSOR`. Rows shift up, so suffix anchors are not salvageable: full rebuild, same cost class as resize. |
| Page cache (`terminal-page-cache.ts`) | Pages are row-keyed for a fixed column count; all rows shift, all pages invalid. |
| Layout bundle (`terminal-layout-bundle.ts`) | Needs one eviction-aware invalidation entry that rebuilds/rebinds line index, page cache, and source index while keeping forged-handle and stale-generation rejection. |
| Range sidecar (`terminal-range-index.ts`) | Prepared-neutral by design: the host syncs offsets with visible source. Eviction makes the host responsible for rebasing or retiring its own ranges; the kernel never edits a host range index. |
| Search sessions (`terminal-search-session.ts`) | Bound to a prepared handle; sessions over the old prepared stay valid for that handle; new sessions cover resident text only. |
| Selections (`terminal-selection.ts`) | Immutable data with row projections; row data is stale after eviction and must be re-projected through new indexes. |
| Coordinate projection (`terminal-coordinate-projection.ts`) | Projects through source + line indexes; requests below the boundary need the same explicit evicted/clamped disposition as raw lookups. |
| Rich sidecar (`terminal-rich-span-index.ts`, raw-visible maps) | Spans and raw-visible ranges are offsets over sanitized visible source. No rich flow exists today, so v1 is plain-flow-only; any future rich flow must adopt the same coordinate decision. |
| Terminal cursors | Replay tokens carry store-global segment indexes; dropping leading chunks renumbers segments, so cursors do not survive eviction under any candidate. The durable cross-eviction coordinate is the source offset; hosts re-derive cursors via the new source-offset index. |

## Candidate Designs

### A. Epoch + frozen basis offset (offsets stay global)

Eviction advances an epoch/generation and freezes a monotonic `basisOffset`.
Offsets keep their global meaning forever: offset `N` denotes the same code
unit before and after eviction; what changes is reachability. The resident
window is `[basisOffset, sourceLength)`. Lookups and projections below
`basisOffset` return an explicit `evicted` disposition: the clamp floor moves
from `0` to `basisOffset`, and the result says so rather than pretending
exactness (extending the requested-vs-normalized lookup semantics).

- Host cost: lowest. Range-sidecar entries at/after the boundary stay
  numerically correct; entries before it are retired with one comparison
  against `basisOffset`; stored offsets remain comparable across evictions.
- Kernel cost: real and internal. Reader/store composition, the boundary
  table, the hardcoded row-0 anchor, materialization, and projection all need
  base-offset translation; every `0`/`sourceLength` assumption gets audited;
  historical-end vs resident-extent lengths must be kept straight; offsets
  grow for the flow's life, so integer headroom gets stated and fuzzed.
- Contract effect: this is the model that does **not** change what offset `0`
  means — it answers the contract's stated concern directly.

### B. Rebase to zero (offsets renumber)

After eviction the resident text renumbers from `0`. Kernel-simplest: drop
chunks and re-derive everything, no translation layer. But the host contract
is the hardest and the failure mode the worst available: every host-held
offset, sidecar range, search hit, selection bound, and scroll anchor becomes
silently wrong rather than detectably stale — an old integer is still a valid
index into the new domain, now denoting different text. Capability checks
catch stale handles, never stale integers, and the prepared-neutral range
sidecar means the kernel cannot even see the host's stale entries. Wrong data
by default contradicts the kernel's deterministic-coordinates identity.

### C. New-handle return (lifecycle, not coordinates)

`evictTerminalCellFlowPrefix()` (name provisional) returns a new flow handle
plus an eviction record, exactly as `appendTerminalCellFlow()` already returns
`{ flow, invalidation }`. The old handle stays valid-but-frozen until dropped;
sealed-chunk structural sharing means retained chunks are shared while evicted
chunks are kept alive only by old handles, so memory is reclaimed when the
last old handle becomes garbage — an honest double-residency window that
memory-budget evidence must model, not hide. The catch: C is a lifecycle
answer, not a coordinate answer; the new handle's offsets must still follow A
or B. Standalone (renumbered offsets) it inherits B's silent-wrong-integer
hazard the moment a host carries one offset across handles — and carrying
offsets across the eviction is the entire point of evicting in place.

## Recommendation

Adopt **A's coordinate model delivered through C's handle lifecycle**; reject
B. Eviction returns a new flow handle plus a source-domain eviction record
(frozen `basisOffset`, evicted code units, generation lineage); offsets stay
global and monotonic; stale offsets get explicit `evicted` results; old
handles stay frozen-valid until dropped. This matches the repo's existing
shape — opaque WeakMap-backed capability handles, generation-advancing
invalidation records, append's new-handle-per-mutation pattern, a
prepared-neutral range sidecar whose host work shrinks to retire-only — and
agent-transcript reality: hosts evict at block boundaries they choose, so
host-held block ranges surviving numerically is the dominant convenience. The
record stays source-domain only; row shifts are derived per fixed-column index
by rebuilding, as append carries `firstInvalidSourceOffset` rather than rows.

## Eviction-Boundary Constraints

- **Grapheme-safe by construction.** The boundary must be a canonical source
  boundary; eviction must never split a grapheme cluster.
- **Hard-break aligned.** The boundary must sit immediately after a hard
  break: such a boundary is a row start at every column count, so it is
  width-independent and every retained row lays out identically before and
  after eviction at any width — the parity oracle compares rows one-to-one.
  Mid-paragraph eviction (a soft wrap point of one particular width) re-wraps
  the seam paragraph from its cut, so seam rows differ per width; it buys
  little for transcript workloads, whose blocks end with hard breaks, and
  costs the row-parity story. Recommendation: hard-break-aligned only.
- **`whiteSpace: "normal"` is out of v1 scope.** Normal mode has no hard
  breaks (newlines collapse), so v1 scopes eviction to `pre-wrap` flows and
  keeps normal-mode eviction an open question instead of a silent variant.
- **Whole-chunk eviction is the cheap path.** Pre-wrap chunk sealing already
  cuts immediately after an LF (`findTerminalCellFlowSealOffset`), so sealed
  chunk starts are hard-break-aligned candidates today. v1 quantizes the
  requested boundary down to the nearest sealed-chunk boundary — evicting at
  most what was asked, never more — and reports the actual `basisOffset`;
  splitting a straddling chunk is deferred. Eviction never touches the open
  tail or normalizer state, so eviction and append never interact at the seam.

## What This Must Not Become

- **Not host retention policy.** No watermarks, no auto-evict on append, no
  prepare-time retention options; the kernel exposes the mechanism and reports
  what happened, hosts own when and what at block boundaries they choose.
- **Not a second coordinate domain.** One global UTF-16 offset domain; no
  resident-relative offsets in any public result; rows remain zero-based per
  fixed-column layout over resident text.
- **Not arbitrary editing through the back door.** Prefix-only, quantized to
  boundaries, monotonic (`basisOffset` never decreases), unrecoverable through
  the new handle; no insert/delete/replace, history rewrite, or snapshot/undo.

## Evidence Required Before Landing

- **Counter set.** Eviction calls, requested vs actual basis offset
  (quantization slack), evicted chunks/code units, resident chunk count, and
  dependent-index rebuilds, via the existing debug-stats and
  performance-counter patterns; report ids only, no numbers in prose.
- **Memory-budget workloads.** Extend the modelled estimates
  (`getTerminalCellFlowMemoryEstimate` plus index estimates) with an
  append+evict long-transcript workload: the gate must show modelled footprint
  staying within a fixed retention envelope where the no-eviction control
  grows, and must model the double-residency window while old handles remain.
- **Parity and fuzz strategy.** Oracle: an evict+append flow versus fresh
  `prepareTerminal()` over the retained suffix text — identical rows,
  materialization, and projections modulo the frozen basis offset; randomized
  evict/append interleavings; boundary fuzz (non-boundary requests quantize
  deterministically or reject); stale-handle/stale-generation/forged-record
  fuzz mirroring existing bundle-invalidation tests.
- **Approval record.** A design+review approval record in `docs/decisions/`,
  an incubating-API index entry, and the contract-text update to Source
  Mapping And Cursors land with the implementation — none before approval.

## Open Questions For The Approval Review

1. Exact-boundary eviction by splitting the straddling sealed chunk: worth the
   re-prepare complexity, or is whole-chunk quantization enough?
2. Normal-mode flows: reject eviction entirely, or define a collapsed-space
   boundary rule with a documented seam re-wrap caveat?
3. Evicted-lookup surface: new result kind versus a disposition field on
   `TerminalSourceLookupResult` and projection results?
4. Eviction record shape: extend the `TerminalAppendStrategy` lineage or a
   distinct `terminal-evict-invalidation@1` kind? Bundle replay protection
   must distinguish prefix removal from suffix append either way.
5. Should debug stats and memory estimates expose lifetime-appended vs
   resident totals so hosts can verify retention without new API?
6. Plain-flow-only first, with any future rich flow adopting the same
   coordinate decision — confirmed as v1 scope?

## Status

Design record only — no API change, no implementation in this RFC; it requires
its own approval record before any implementation begins.
