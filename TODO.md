# TODO

Current priorities for turning `pretext-TUI` into a publishable terminal-cell layout package.

## 1. Freeze Package Contracts

- Keep [docs/contracts/terminal-contract.md](docs/contracts/terminal-contract.md) current.
- Keep [docs/contracts/host-app-boundary.md](docs/contracts/host-app-boundary.md) current.
- Remove host-specific language from active package docs.
- Keep one public package story: terminal cells, rows, ranges, materialization.

## 2. Remove Browser Product Surface

- Remove web demo exports from the package surface.
- Remove browser scripts from default command paths.
- Remove web pages from publishable package files.
- Replace source-project status dashboards with TUI status data.

## 3. Replace Measurement Boundary

- Split analysis policy from terminal width policy.
- Replace browser measurement with deterministic terminal cell width.
- Add explicit width profiles.
- Preserve fast prepare/layout separation.

## 4. Expose Terminal APIs

- Add `prepareTerminal()`.
- Add `layoutTerminal()`.
- Add line stats, line range walking, next-line range, and materialization APIs.
- Freeze cursor/range/source-offset semantics before adding paging.

## 5. Add TUI Validation

- Add no-browser static gate.
- Add terminal width goldens.
- Add whitespace, tab, hard-break, CJK, emoji, combining-mark, and source-offset tests.
- Add deterministic corpus/fuzz/benchmark scripts.
- Add package smoke tests for terminal exports.

## 6. Add Vertical Slice Demo

- Add a mixed terminal session fixture.
- Show row-count precomputation.
- Show resize reflow.
- Show visible-window materialization.

## 7. Add Optional Rich And Large-Text Primitives

- Add terminal rich metadata for SGR and OSC8.
- Add source-mapped spans for style/link/copy semantics.
- Add sparse anchors for large text.
- Add page caches only after the core API is stable.

## Not Worth Doing Now

- Do not chase browser pixel parity.
- Do not add Canvas or DOM fallback.
- Do not monkey-patch web globals.
- Do not build a host app framework.
- Do not add renderer-specific dependencies.
- Do not expose many knobs before the terminal profile model is stable.
- Do not keep duplicate public docs for old and new products.

## Open Questions

- Which corpus rows should become the permanent TUI release gate?
- What performance counters best predict large-text responsiveness?

## Fixed Decisions

- The default width profile is `terminal-unicode-narrow@1`.
- Rich materialization should expose structured metadata and may also emit ANSI text for consumers that need terminal strings.
