<!-- 补建说明：该文件为后续补建，用于记录 Phase 6 selection/extraction 数据 API 的审批、残余风险与 claim 边界；当前进度：review swarm blocker 已修复，focused gates 已通过，状态为带记录残余风险批准。 -->
# Phase 6 Selection Extraction Approval

## Scope

Phase 6 adds incubating host-neutral selection and extraction helpers over sanitized visible source text.

Approved core runtime names:

- `createTerminalSelectionFromCoordinates`
- `extractTerminalSourceRange`
- `extractTerminalSelection`

Approved rich sidecar runtime names:

- `extractTerminalRichSourceRange`
- `extractTerminalRichSelection`

Approved core type names:

- `TerminalSelection`
- `TerminalSelectionCoordinate`
- `TerminalSelectionDirection`
- `TerminalSelectionExtraction`
- `TerminalSelectionExtractionFragment`
- `TerminalSelectionExtractionOptions`
- `TerminalSelectionMode`
- `TerminalSelectionRequest`
- `TerminalSourceRangeExtractionRequest`

Approved rich sidecar type names:

- `TerminalRichSelectionExtraction`
- `TerminalRichSelectionExtractionFragment`

These APIs are immutable data APIs. `TerminalSelection` is not an active state handle and does not own mouse, focus, caret, highlight, copy, or clipboard behavior.

## Host Boundary

The package owns coordinate-to-source selection projection, source-range extraction, deterministic visible/source fragments, optional generic range matches, and rich style/link fragment clipping through the rich sidecar.

Hosts own active selection state, drag behavior, focus, caret policy, rendering, highlight styling, copy formatting, clipboard writes, persistence, and domain semantics.

No `pretext-tui/selection`, clipboard API, renderer dependency, named-host adapter, mouse state machine, or host action surface is approved.

## Claim Restrictions

Do not claim:

- stable selection API
- selection UI
- mouse or keyboard behavior
- caret state
- highlight rendering
- copy formatting or clipboard integration
- rectangular/block selection
- host-specific integration
- browser selection parity
- selection performance claims without evidence

Selection/extraction APIs are incubating and source-first.

## Focused Gates

- `bun test tests/tui/selection-extraction.test.ts`
- `bun test tests/tui/coordinate-projection.test.ts tests/tui/rich-inline.test.ts tests/tui/range-index.test.ts tests/tui/search-session.test.ts`
- `bun run typecheck:tui`
- `bun run typecheck:tui-validation`
- `bun run api-snapshot-check`
- `bun run package-smoke-test`
- `bun run tui-static-gate`
- `bun run benchmark-check:tui`
- `bun run test:tui`
- `bun run tui-corpus-check`
- `bun run tui-fuzz --seed=ci --cases=2000`
- `bun run terminal-demo-check`

## Review Findings Resolved

- Rich selection fragments now reuse line source-boundary clamping before splitting style/link spans, so spans that start inside a grapheme cluster cannot duplicate visible text or advance columns twice.
- Selection extraction tests now cover collapsed whitespace under `whiteSpace: 'normal'`, rich source-range extraction, partial rich clipping through style/link spans, and invalid `options.indexes`.
- Benchmark validation now has a dedicated selection/extraction workload with explicit source-first counters.
- Static validation now rejects active UI, clipboard, PTY/emulator, renderer, and adapter drift while allowing guardrail tests to contain forbidden example strings.

## Review Status

Approve with documented residual risk.

## Residual Risk

- `TerminalSelection` is immutable data, not an opaque active-state capability. Extraction reprojects through caller-supplied indexes, so stale or forged selection-shaped data is bounded by projection validation, but hosts must treat the object as a selection snapshot rather than authority.
- Static gate host-boundary terms are intentionally allowlisted in the guardrail tests that assert those same terms are forbidden in public docs and recipes. This is a validation-test exception, not a runtime or package-surface exception.
