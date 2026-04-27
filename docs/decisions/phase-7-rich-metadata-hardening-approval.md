<!-- 补建说明：该文件为后续补建，用于记录 Phase 7 rich metadata hardening 的审批、残余风险与 claim 边界；当前进度：recovery blockers 已修复，focused gates 已完成，状态为 approve with documented residual risk。 -->
# Phase 7 Rich Metadata Hardening Approval

## Scope

Phase 7 hardens the incubating rich sidecar without expanding public API.

Approved internal changes:

- runtime validation for `PreparedTerminalRichInline` handles created by `prepareTerminalRichInline()`
- internal rich span interval index for line materialization and rich selection extraction
- internal raw-visible range index for range lookup over sanitized visible source offsets and raw offsets
- benchmark counters for rich span/raw-visible index build, lookup, steps, and matches
- runtime validation for rich materialization options before policy downgrade
- benchmark config validation for known counters, exact schema fields, mode combinations, and type/range constraints

No new public entry point, public subpath, root export, or rich sidecar export is approved in this phase.

## Host Boundary

The package owns policy-bound parsing of supported inline `SGR` and `OSC8`, redacted diagnostics, sanitized visible text, rich style/link fragments, internal span/raw-visible indexes, and opt-in ANSI reconstruction for package-created rich handles.

Hosts own rendering, themes, link opening, trust policy, copy formatting, clipboard writes, raw terminal storage, active selection state, and domain payload behavior.

## Claim Restrictions

Do not claim:

- stable rich sidecar API
- broad ANSI safety
- secure renderer behavior
- terminal-emulator security
- raw terminal secrecy beyond the documented default no-full-raw-retention policy
- public raw-visible lookup API
- named-host integration
- rich performance claims without benchmark evidence
- true chunked append storage

## Focused Gates

- `bun test src/terminal-rich-inline.test.ts tests/tui/rich-inline.test.ts tests/tui/rich-security-gate.test.ts tests/tui/selection-extraction.test.ts tests/tui/search-session.test.ts tests/tui/benchmark-config.test.ts`
- `bun run typecheck:tui`
- `bun run typecheck:tui-validation`
- `bun run tui-static-gate`
- `bun run benchmark-check:tui`
- `bun run api-snapshot-check`
- `bun run package-smoke-test`

## Residual Risks

- Raw-visible lookup remains internal and is not WeakMap-capability-backed. Owner: Phase 9/public API owner. Gate before any public exposure.
- Raw-visible lookup returns whole overlapping stored ranges, not clipped query ranges. Owner: rich metadata owner. Revisit only if clipped semantics are proposed.
- `ansiText` is canonical reconstruction from sanitized style/link metadata, not raw ANSI replay. Hosts must fall back to fragments if output is capped.
- OSC8 validation does not make links trusted. Hosts own link-opening policy.

## Review Status

Approve with documented residual risk. Recovery review swarm completed; prototype-pollution, OSC8 credential validation, late-range benchmark proof, `wordBreak` parser parity, and stale roadmap counter blockers were fixed before closeout.
