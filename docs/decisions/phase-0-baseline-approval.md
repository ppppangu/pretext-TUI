<!-- 补建说明：该文件为后续补建，用于记录 pretext-TUI 通用终端文本内核 Phase 0 baseline checkpoint 审批；当前进度：首版记录 dirty preflight 范围、focused gates 与未阻塞 residual risk。 -->
# Phase 0 Baseline Approval

## Scope

Phase 0 reviews the existing reader-store parity dirty checkpoint and keeps it classified as Batch 6 preflight work only.

The reviewed dirty files are:

- `scripts/public-api-contract.ts`
- `src/terminal-reader-store.ts`
- `tests/tui/single-store-reader-parity.test.ts`

## Decision

Approval: approve with documented residual risk.

The dirty runtime change introduces synthetic composite reader stores derived from an already-prepared reader. It does not implement chunked append storage, append tails, prefix eviction, or incremental normalization. Public contract checks keep the new reader-store helpers private.

## Focused Gates

Run on April 26, 2026:

- `bun run typecheck:tui`
- `bun test tests/tui/single-store-reader-parity.test.ts`
- `bun run api-snapshot-check`

All three passed.

## Residual Risk

Owner: terminal text kernel maintainer.

Risk: `createComposite*` helper names can be misread as true chunked append storage if they leak into public docs or declarations.

Why it does not block Phase 1/2: the helpers are internal, public API contract checks forbid the names in public declarations/root types, and docs continue to state append remains full reprepare plus bounded invalidation metadata.

Follow-up gate: keep `bun run api-snapshot-check`, `bun run package-smoke-test`, and a README/docs claim scan in every phase that changes append, storage, or public facade language.

## Forbidden Claims

Do not claim:

- true chunked append storage
- named-host integration
- broad ANSI safety beyond the documented rich sidecar policy
- broad or universal speed superiority

