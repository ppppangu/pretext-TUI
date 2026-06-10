<!-- 补建说明：该文件为后续补建，用于记录 R3 bounded search session 的范围、批准导出、截断语义决策、claim 限制与残余风险；当前进度：matchLimit 与 stats 导出已落地并通过 focused/broader gates，状态为 approve with documented residual risk。 -->
# R3 Bounded Search Approval

## Scope

R3 adds explicit match-count limits to the incubating source-first search session introduced in [Phase 5](phase-5-search-session-approval.md). It lets a host cap how many matches a single session stores so that session storage stays a function of the configured limit rather than of transcript length.

The bounded path stays host-neutral and data-only. It does not change what a match means, does not add search UI, active-match state, highlighting, result panes, keyboard handling, or host actions, and it does not change the existing query, scope, or projection semantics.

## Approved Names

- `matchLimit` option on `TerminalSearchOptions` — an optional positive integer cap on stored matches. Omitting it preserves the existing unbounded behaviour bit-for-bit.
- `getTerminalSearchSessionStats(session)` — a new incubating runtime accessor returning frozen `TerminalSearchSessionStats`.
- `TerminalSearchSessionStats` — frozen data of shape `{ kind: 'terminal-search-session-stats@1'; matchLimit: number | null; storedMatchCount: number; truncated: boolean }`.

No existing names change behaviour. `getTerminalSearchSessionMatchCount()` keeps its `number` signature and now returns the stored count, which equals the uncapped total whenever no `matchLimit` is configured.

## Truncation Semantics Decision

The cap is applied after scope assignment and after the canonical sort (`sourceStart` ascending, then `sourceEnd` ascending, then `scopeId`, reusing the existing comparator). A session keeps the first `matchLimit` entries of that ordered, scope-assigned sequence, and `truncated` is `true` when the scope-assigned total exceeded the cap. Because the cap runs after scope fan-out, one raw match that fans into several scoped matches can be split by the boundary.

Truncation is explicit and detectable. Dropped matches do not exist in the session and there is no later rescan: the stored count is authoritative, source-range queries beyond the boundary return empty results, and before/after navigation past the boundary returns `null`. The per-query `limit` on `getTerminalSearchMatchesForSourceRange()` stays orthogonal and only slices the already-stored set, so it can never resurrect a dropped match. A host that needs the next window creates a fresh session scoped to start at the last stored match's `sourceEnd`.

`matchLimit` validation rejects `0`, negatives, and non-integers with an inline error naming `matchLimit`, matching the file's existing message conventions.

## Claim Restrictions

Do not claim constant, zero, or input-independent memory. The approved framing is that explicit match-count limits keep modelled search-session memory a function of the configured `matchLimit` rather than transcript length, proven by the memory-budget gate. A memory-budget workload builds a pathological many-match corpus with a small `matchLimit`; it passes only because the stored set is capped, and that is the bounded-storage evidence. A benchmark workload over the same shape asserts the truncation counters fire and that stored matches equal the configured cap across iterations.

## Review Status

Approval: approve with documented residual risk.

Residual risk: this record does not implement lazy or streamed scanning. Each session creation still performs a full per-creation scan of sanitized visible source text and a full scope-assignment pass before the cap is applied; only stored payload is bounded by `matchLimit`, not the transient scan work. Lazy and streamed scanning remain future work and stay outside this record.

Residual risk: this record does not promote the search session to stable `0.1`. Stabilization still depends on the Phase 5 search-interaction review and the bounded-or-streamed search design obligation. The Phase 5 host-neutral non-goals continue to apply unchanged to the bounded path.
