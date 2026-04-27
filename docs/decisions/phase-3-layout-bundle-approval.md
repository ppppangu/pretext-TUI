<!-- 补建说明：该文件为后续补建，用于记录 Phase 3 unified layout bundle 的设计、执行与审查状态；当前进度：Phase 3 review blockers 已修复并完成 focused/broader gates，状态为 approved。 -->
# Phase 3 Layout Bundle Approval

## Scope

Phase 3 adds an incubating `TerminalLayoutBundle` capability that coordinates:

- fixed-column sparse line index
- fixed-column page cache
- prepared-bound source-offset index used by projection
- append invalidation generation checks

The bundle is host-neutral and data-only. It does not render, scroll, select, persist, or model host workflows.

## API State

Incubating runtime exports:

- `createTerminalLayoutBundle(prepared, options)`
- `getTerminalLayoutBundlePage(prepared, bundle, request)`
- `invalidateTerminalLayoutBundle(prepared, bundle, invalidation)`

Projection helpers also accept `TerminalLayoutBundle` directly. The bundle's internal source-offset index is lazy and is rebuilt after invalidation for the supplied prepared text.

## Guardrails

- Existing low-level primitives remain available; the bundle is a choreography helper, not a replacement subsystem.
- No `pretext-tui/terminal-layout-bundle` package subpath is exported.
- `getTerminalLayoutBundleProjectionIndexes()` remains internal and is not part of the root public runtime surface.
- Append remains full reprepare plus bounded invalidation metadata until true chunked storage passes its future evidence gates.
- Named-host semantics remain outside the package.

## Review Status

Design swarm inputs were synthesized into the stricter bundle shape:

- public bundle handles stay opaque
- page/projection calls require the current prepared handle
- invalidation rejects replayed generations and mismatched `previousGeneration`
- source-offset index refresh is unified with line/page invalidation

Review swarm blockers fixed before approval:

- append-shaped invalidation rejects stale prepared handles and wrong stable-prefix provenance
- append generation must advance exactly one step
- source-offset invalidation is canonical when callers also pass a stale or inconsistent row hint
- invalidation fields are validated before any bundle/index/cache mutation
- malformed append counters and unknown append strategies are rejected before mutation
- row projection through a bundle does not build the source-offset index

Approval: approved with documented residual risk.

Residual risk: benchmark bundle counters are regression guardrails, not broad performance claims. Bundle stats/helpers used by validation remain internal and are intentionally forbidden from the root public API until Phase 9 evidence work decides whether any stats belong on the public surface.
