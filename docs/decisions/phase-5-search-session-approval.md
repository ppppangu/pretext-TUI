<!-- 补建说明：该文件为后续补建，用于记录 Phase 5 source-first search session 的审批、残余风险与 claim 边界；当前进度：review swarm 后批准为 incubating API，保留已记录的非阻塞残余风险。 -->
# Phase 5 Search Session Approval

## Scope

Phase 5 adds incubating source-first terminal search sessions over sanitized visible source text.

Approved public runtime names:

- `createTerminalSearchSession`
- `getTerminalSearchSessionMatchCount`
- `getTerminalSearchMatchesForSourceRange`
- `getTerminalSearchMatchAfterSourceOffset`
- `getTerminalSearchMatchBeforeSourceOffset`

Approved public type names:

- `TerminalSearchSession`
- `TerminalSearchMatch`
- `TerminalSearchMode`
- `TerminalSearchQuery`
- `TerminalSearchOptions`
- `TerminalSearchScope`
- `TerminalSearchRangeIndexScope`
- `TerminalSearchSourceRangeQuery`

The public handle stays opaque and runtime-frozen. Search hits are immutable data over UTF-16 source ranges, with optional projection metadata when indexes are supplied.

## Host Boundary

The package owns literal and regex lookup over sanitized visible text, case sensitivity, ASCII whole-word filtering, generic source scopes, range-index scopes, match counting, bounded source-range retrieval, and before/after lookup by source offset.

Hosts own query UI, active-match state, highlighting, result panes, keyboard shortcuts, scroll policy, persistence, filters, and domain semantics.

No `pretext-tui/search`, named-host adapter, renderer dependency, clipboard behavior, or host action surface is approved.

## Claim Restrictions

Do not claim:

- stable search API
- search UI
- highlight rendering
- active result navigation state
- background indexing
- streaming incremental search refresh
- arbitrary edit-buffer search invalidation
- host-specific search integration

Search sessions are incubating and source-first. Append flows currently require a new session for the new prepared source.

## Focused Gates

- `bun test tests/tui/search-session.test.ts`
- `bun test tests/tui/recipe-public-imports.test.ts`
- `bun run typecheck:tui`
- `bun run typecheck:tui-validation`
- `bun run api-snapshot-check`
- `bun run tui-corpus-check`
- `bun run tui-fuzz --seed=ci --cases=2000`
- `bun run benchmark-check:tui`
- `bun run package-smoke-test`

Focused gates passed during Phase 5 closure.

## Review Findings Resolved

- `scopeId` in `TerminalSearchSourceRangeQuery` now filters returned matches instead of only validating the field.
- `getTerminalSearchMatchesForSourceRange()` now has explicit overlap semantics, point-query behavior for collapsed ranges, and `limit: 0` handling.
- Mutable index-pair containers are snapshotted at session creation. Opaque index and bundle handles remain capability handles owned by the package.
- Focused tests now cover scope-id filtering, overlap and collapsed range queries, malformed query objects, invalid modes, empty scopes, invalid `scopeId`, invalid limits, invalid offsets, reversed ranges, mismatched projection indexes, and index-pair container mutation.

## Residual Risks

Owner: Phase 6/9 implementation owner.

- Benchmark evidence covers one projected literal search workload. Regex, whole-word, scoped, rich-visible, and append-recreation search paths are covered by tests, but not by separate benchmark workloads yet. This is acceptable because Phase 9 is the planned counter and evidence expansion phase.
- Projection uses package-owned opaque index and bundle handles. The session snapshots mutable index-pair containers, but hosts should recreate search sessions after replacing prepared text or invalidating layout handles. This is acceptable for the incubating API because append invalidation already requires a new session over the new prepared source.
- Search sessions currently scan the prepared visible source when a session is created. Background or incremental search indexing is not claimed and remains future work.

Follow-up gate: Phase 9 must revisit search counters and benchmark evidence before any stable search claim.

## Review Status

Approve with documented residual risk.
