<!-- 补建说明：该文件为后续补建，用于记录 Phase 4 generic range sidecar 的设计、执行与审查状态；当前进度：review blockers 已修复并完成 focused/broader gates，状态为 approved with documented residual risk。 -->
# Phase 4 Generic Range Sidecar Approval

## Scope

Phase 4 adds an incubating `TerminalRangeIndex` capability for generic UTF-16 source ranges over sanitized visible source text.

The sidecar is host-neutral and data-only. It indexes inert `id`, `kind`, `tags`, and JSON-like `data`, but it does not implement transcript, log, diff, test, editor, agent/tool, search, selection, highlighting, diagnostics UX, or host actions.

## API State

Incubating runtime exports:

- `createTerminalRangeIndex(ranges)`
- `getTerminalRangesAtSourceOffset(index, sourceOffset)`
- `getTerminalRangesForSourceRange(index, { sourceStart, sourceEnd })`

Incubating type exports:

- `TerminalRange`
- `TerminalRangeData`
- `TerminalRangeIndex`
- `TerminalRangeQuery`

## Guardrails

- No `pretext-tui/terminal-range-index`, `pretext-tui/range-index`, host adapter, search, selection, annotation, highlight, diagnostics, or named-host package subpath is exported.
- The handle is opaque at runtime and forged handles are rejected.
- Range `data` is cloned and frozen as inert JSON-like data; functions, accessors, symbols, non-enumerable fields, sparse or extended arrays, Proxy objects, prototype-pollution keys, non-plain objects, non-finite numbers, and cycles are rejected.
- The index is prepared-neutral; hosts own keeping ranges aligned to the same visible source passed to `prepareTerminal()`.
- Query ordering is deterministic source order: start ascending, longer enclosing range first when starts match, then id, kind, and original order.

## Review Status

Design swarm inputs converged on the prepared-neutral API shape from the phase plan. One proposed prepared-binding check was intentionally not adopted because `createTerminalRangeIndex(ranges)` indexes source-offset space, not prepared handles.

Review swarm blockers fixed before approval:

- active `tags`, `data`, and top-level `ranges` arrays now clone via descriptor-first validation instead of value-accessing `.map()`
- active array elements, sparse arrays, extra array properties, and Proxy payloads are rejected before user getters or proxy traps execute on supported Node/Bun runtimes
- Node package smoke covers packed/dist behavior for active range arrays and proxy trap counts

Approval: approved with documented residual risk.

Residual risk: Phase 4 intentionally does not add public range-index performance counters. Phase 9 owns cross-feature counters, memory budgets, and evidence reporting. This is not blocking Phase 4 because the sidecar API shape is opaque and can gain internal counters without public API churn.

Residual risk: Proxy trap avoidance depends on Node `process.getBuiltinModule('node:util').types.isProxy` or Bun-compatible `process.binding('util').isProxy`. Current Node and Bun package-smoke/focused probes pass with zero traps. A future unsupported runtime without either detector is outside the current evidence envelope and must be handled before claiming broader runtime support.
