<!-- 补建说明：该文件为后续补建，用于汇总 pretext-TUI terminal text kernel 的公开能力、证据入口与采用边界；当前进度：Phase 10 DOCS-A 首版，保持 host-neutral 且不复制动态 benchmark 数字。 -->
# Kernel Capability Matrix

This matrix is an adoption-facing map of what the package currently exposes, what evidence supports each area, and where the package boundary remains intentionally narrow.

Public capability claims should cite evidence IDs, commands, contracts, or tests. Timing values stay in JSON evidence reports, especially report `competitive-tui-20260427-3e95bef-clean-8760e911`.

| Capability area | Public surface | Evidence anchors | Current status | Adoption boundary |
| --- | --- | --- | --- | --- |
| Core terminal-cell layout | `prepareTerminal`, `layoutTerminal`, `walkTerminalLineRanges`, `layoutNextTerminalLineRange`, `materializeTerminalLineRange` | `src/terminal-core.test.ts`, `tests/tui/public-layout.test.ts`, `bun run tui-oracle-check`, `bun run tui-corpus-check`, `bun run tui-fuzz --seed=ci --cases=2000` | Stable candidate | Produces terminal-row data and materialized text fragments from visible text. |
| Width profile and Unicode handling | `TerminalWidthProfileInput`, terminal prepare options, string-width backend | `src/terminal-string-width.test.ts`, `src/terminal-core.test.ts`, corpus and fuzz gates | Stable candidate with configurable policy inputs | Exposes deterministic terminal-cell measurement policy; it does not define a visual theme or input system. |
| Source offsets and cursor mapping | `TerminalCursor`, `TerminalLineRange`, `createTerminalSourceOffsetIndex`, cursor/source lookup helpers | `tests/tui/coordinate-projection.test.ts`, `tests/tui/public-layout.test.ts`, `tests/tui/prepared-reader-boundary.test.ts` | Incubating around fixed-column indexes | Uses UTF-16 offsets over sanitized visible text; domain record meaning remains host-owned. |
| Fixed-column large-text helpers | `createTerminalLineIndex`, `createTerminalPageCache`, `createTerminalLayoutBundle`, related page/materialize helpers | `tests/tui/virtual-text.test.ts`, `tests/tui/layout-bundle.test.ts`, `tests/tui/performance-counters.test.ts`, `bun run benchmark-check:tui` | Incubating | Caches range metadata for requested rows; it does not manage panes, scrolling policy, or product state. |
| Append-only cell flow | `prepareTerminalCellFlow`, `appendTerminalCellFlow`, flow generation/prepared accessors | `tests/tui/chunked-append-parity.test.ts`, `tests/tui/layout-bundle.test.ts`, `bun run benchmark-check:tui`, `bun run memory-budget-check:tui` | Incubating | Supports append-only source growth behind an opaque handle; arbitrary insert/delete/replace and prefix eviction remain outside this package. |
| Generic source range sidecar | `createTerminalRangeIndex`, `getTerminalRangesAtSourceOffset`, `getTerminalRangesForSourceRange` | `tests/tui/range-index.test.ts`, `tests/tui/selection-extraction.test.ts`, `benchmarks/tui-memory-budgets.json` | Incubating | Stores inert source ranges, tags, and JSON-like data; it does not interpret domain records or actions. |
| Source-first search | `createTerminalSearchSession`, match count, source-range query, before/after lookup helpers | `tests/tui/search-session.test.ts`, `tests/tui/benchmark-config.test.ts`, `tests/tui/performance-counters.test.ts`, `bun run memory-budget-check:tui` | Incubating with documented residual risk | Returns immutable source-range matches and optional projections; query UI, active result policy, and result presentation remain above the kernel. |
| Selection and extraction data | `createTerminalSelectionFromCoordinates`, `extractTerminalSourceRange`, `extractTerminalSelection` | `tests/tui/selection-extraction.test.ts`, `tests/tui/coordinate-projection.test.ts`, `benchmarks/tui-memory-budgets.json` | Incubating | Converts caller-provided coordinates or source ranges into immutable extraction data; active interaction policy remains outside the package. |
| Rich inline metadata | `pretext-tui/terminal-rich-inline`, rich prepare, rich walk/layout/materialize, rich extraction helpers | `src/terminal-rich-inline.test.ts`, `tests/tui/rich-security-gate.test.ts`, `tests/tui/selection-extraction.test.ts` | Incubating and policy-bound | Keeps style/link metadata separate from core layout; reconstruction of control-decorated text is explicit and policy-bound. |
| Public package boundary | `pretext-tui`, `pretext-tui/terminal`, `pretext-tui/terminal-rich-inline`, `pretext-tui/package.json` | `tests/tui/public-api-boundary.test.ts`, `tests/tui/prepared-reader-boundary.test.ts`, `bun run api-snapshot-check`, `bun run package-smoke-test` | Current publish boundary | No private subpaths or bundled host adapters are part of the public contract. |

## Claim Rules

- Cite tests, release gates, contracts, or the clean report id before making adoption claims.
- Cite report `competitive-tui-20260427-3e95bef-clean-8760e911` for optional local comparison evidence, and leave timing values in the JSON.
- Treat incubating APIs as useful but not frozen for the first stable contract.
- Keep package claims about terminal text data. Host behavior, product lifecycle, and integration layers stay outside this matrix.

## Runtime Export Coverage

The package smoke test and API snapshot gate verify the same runtime names listed here.

Stable candidate root and terminal exports:

- `TERMINAL_START_CURSOR`
- `layoutNextTerminalLineRange`
- `layoutTerminal`
- `materializeTerminalLineRange`
- `measureTerminalLineStats`
- `prepareTerminal`
- `walkTerminalLineRanges`

Incubating root and terminal exports:

- `appendTerminalCellFlow`
- `createTerminalLineIndex`
- `createTerminalLayoutBundle`
- `createTerminalPageCache`
- `createTerminalRangeIndex`
- `createTerminalSearchSession`
- `createTerminalSelectionFromCoordinates`
- `createTerminalSourceOffsetIndex`
- `extractTerminalSelection`
- `extractTerminalSourceRange`
- `getTerminalCellFlowGeneration`
- `getTerminalCellFlowPrepared`
- `getTerminalCursorForSourceOffset`
- `getTerminalLayoutBundlePage`
- `getTerminalLineIndexMetadata`
- `getTerminalLineIndexStats`
- `getTerminalLinePage`
- `getTerminalLineRangeAtRow`
- `getTerminalPageCacheStats`
- `getTerminalRangesAtSourceOffset`
- `getTerminalRangesForSourceRange`
- `getTerminalSearchMatchAfterSourceOffset`
- `getTerminalSearchMatchBeforeSourceOffset`
- `getTerminalSearchMatchesForSourceRange`
- `getTerminalSearchSessionMatchCount`
- `getTerminalSourceOffsetForCursor`
- `invalidateTerminalLineIndex`
- `invalidateTerminalLayoutBundle`
- `invalidateTerminalPageCache`
- `materializeTerminalLinePage`
- `materializeTerminalLineRanges`
- `measureTerminalLineIndexRows`
- `prepareTerminalCellFlow`
- `projectTerminalCoordinate`
- `projectTerminalCursor`
- `projectTerminalRow`
- `projectTerminalSourceOffset`
- `projectTerminalSourceRange`

Incubating rich-inline exports:

- `extractTerminalRichSelection`
- `extractTerminalRichSourceRange`
- `layoutNextTerminalRichLineRange`
- `materializeTerminalRichLineRange`
- `prepareTerminalRichInline`
- `walkTerminalRichLineRanges`
