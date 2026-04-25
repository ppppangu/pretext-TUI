<!-- 补建说明：该文件为后续补建，用于冻结 pretext-TUI 的纯 TUI 终端语义、运行时边界与失败判据；当前进度：作为当前终端语义规范，后续实现必须以此为准。 -->
# Terminal Contract

## Purpose

`pretext-TUI` is a pure terminal-cell text layout package.

The active runtime is not a browser text measurement engine. It does not use `window`, `document`, `navigator`, `Canvas`, `OffscreenCanvas`, CSS layout, web pages, web demos, or browser automation as part of the package contract.

The package exists to answer one question:

```text
Given visible terminal text and terminal layout options,
what rows, ranges, source offsets, and materialized terminal fragments result?
```

## Runtime Boundary

`pretext-TUI` owns:

- Unicode text analysis
- terminal cell-width measurement
- terminal wrapping
- source offset mapping
- line/range walking
- visible-line materialization
- optional rich inline metadata for style/link/copy semantics
- optional paging/cache primitives for very large text flows

Consumers own:

- rendering frameworks
- focus and input routing
- scroll state
- consumer-owned project state
- persistence
- command execution
- visual themes
- application-specific interactions

The package must stay data-in/data-out and side-effect-free.

## Units

Width is measured in integer terminal cells.

Height is measured in integer terminal rows.

`columns` is the maximum number of terminal cells available on a row.

`rows` is derived from emitted terminal lines.

The terminal lane has no pixels, font strings, CSS `lineHeight`, CSS `letter-spacing`, browser fit tolerance, or font-specific correction.

## Core API Contract

The core API is terminal-first:

```ts
prepareTerminal(text, { whiteSpace?, widthProfile?, tabSize?, wordBreak? })
layoutTerminal(prepared, { columns, startColumn? })
measureTerminalLineStats(prepared, { columns, startColumn? })
walkTerminalLineRanges(prepared, { columns, startColumn? }, onLine)
layoutNextTerminalLineRange(prepared, cursor, { columns, startColumn? })
materializeTerminalLineRange(prepared, range)
```

`tabSize` and `widthProfile` are prepare-time identity.

`columns` and `startColumn` are layout-time constraints.

## Input Text Contract

The plain core accepts sanitized visible text, not raw escape-laden terminal output.

Allowed raw text controls before whitespace normalization:

- `\n`
- `\t`
- `\r`
- `\f`

Normalization happens before source offsets are frozen.

`whiteSpace` decides how those controls are interpreted:

- in `normal`, ASCII space, tab, newline, CR, and FF are collapsible whitespace input
- in `pre-wrap`, CRLF, bare CR, and FF normalize to LF; LF is a hard break and tab remains a structural tab segment

All other C0/C1 controls must be rejected or sanitized before layout.

ESC, CSI, OSC, DCS, PM, APC, and other terminal controls must not enter the plain core.

Unsupported controls must never be interpreted during layout.

## Whitespace Modes

`whiteSpace: "normal"`:

- collapses ASCII space, tab, newline, CR, and FF runs to one space before source offsets are frozen
- trims leading/trailing collapsible ASCII spaces
- treats collapsed wrap spaces as break opportunities
- does not paint collapsed spaces at line start/end

`whiteSpace: "pre-wrap"`:

- preserves ordinary spaces
- preserves tabs
- preserves LF hard breaks
- normalizes CRLF, bare CR, and FF to LF before source offsets are frozen
- treats preserved spaces as real terminal cells

There is no browser-style trailing-space hanging behavior in the active TUI contract unless a future contract update explicitly adds it with tests.

Consecutive hard breaks emit empty rows.

A final LF terminates the current row but does not create an extra trailing empty row after the end of input. Interior consecutive LFs still create empty rows.

## Tabs

`tabSize` is a positive integer. The default is `8`.

Tabs remain structural `kind: "tab"` segments in prepared data.

Tab advance is computed at layout time from the current visible column:

```text
advance = tabSize - (currentColumn % tabSize)
```

For full-block layout APIs, `startColumn` affects only the first emitted row and its tab expansion. Subsequent wrapped rows start at column `0` unless an API explicitly says otherwise.

For `layoutNextTerminalLineRange()`, `startColumn` applies only to the single line being laid out by that call. Callers continuing from a prior returned cursor should pass `startColumn: 0` unless they are intentionally laying out into a nonzero column on that next line.

Materialized terminal render text should expand tabs to spaces, while source/copy mapping preserves the original tab.

## Unicode Width Profile

The width profile is explicit and versioned.

The default profile is named `terminal-unicode-narrow@1`.

The profile identity must include:

- `name`
- `version`
- Unicode data version
- ambiguous-width policy
- emoji-width policy
- regional-indicator policy
- control-char policy
- tab-size default

Overrides are allowed only through explicit prepare-time options. Any override changes prepared-data identity and cache keys.

Defaults:

- ASCII printable characters are width `1`.
- Combining marks are width `0` inside their grapheme cluster.
- Variation selectors are width `0`.
- ZWJ and emoji modifiers are width `0` inside their cluster.
- East Asian Wide and Fullwidth graphemes are width `2`.
- East Asian Ambiguous defaults to narrow width `1`.
- Emoji presentation clusters, keycaps, regional-indicator flag pairs, and emoji ZWJ sequences default to width `2`.

Unsupported or unpaired clusters use deterministic fallback rules.

No runtime path may call a browser or font measurement API.

All widths are integers.

## Break Semantics

Layout is greedy over prepared segments.

Fitting uses exact integer comparison:

```text
candidateWidth <= columns
```

There is no fit epsilon.

Break opportunities include:

- collapsible spaces
- preserved spaces
- tabs
- zero-width spaces
- soft hyphens
- hard breaks
- language segmentation boundaries

Overlong text falls back to grapheme-boundary wrapping.

Atomic graphemes are never split. If one grapheme is wider than the available columns at line start, layout must emit one overflowing range with explicit overflow metadata or documented `width > columns` behavior.

CJK, kinsoku, and optional `keep-all` behavior belong in analysis, not in ad hoc layout branches.

## Special Characters

`ZWSP` is a zero-width break opportunity and is not materialized.

`NBSP` and `NNBSP` are visible non-breaking space-like glue cells.

`WJ` and `FEFF` are zero-width no-break glue.

`SHY` is invisible unless selected as the break. A selected soft hyphen materializes as visible `-` with width `1`.

Hard breaks consume no visible cell and create row boundaries.

## Source Mapping And Cursors

Canonical source offsets are UTF-16 code unit offsets over sanitized visible source text.

Prepared data must retain enough mapping for:

- copy
- search hits
- materialization
- future paging

Terminal cursors are package-owned replay tokens with segment/grapheme fields. Hosts may store and pass them back to package APIs, but should not treat those fields as raw source offsets or mutable implementation state.

Ranges expose:

- visible start/end
- UTF-16 source start/end
- hard/soft break provenance
- terminal width
- optional overflow metadata
- optional discretionary-hyphen metadata

## Coordinate Projection

Coordinate projection is a host-neutral convenience layer over the public source-offset index and fixed-column line index. It must not expose prepared segments, row anchors, page caches, raw source storage, or mutable implementation state.

The agreed public shape is:

```ts
projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, sourceOffset, biasOrOptions?)
projectTerminalSourceOffset(prepared, { sourceIndex, lineIndex }, sourceOffset, options?)
projectTerminalCursor(prepared, sourceIndex, lineIndex, cursor, options?)
projectTerminalCursor(prepared, { sourceIndex, lineIndex }, cursor, options?)
projectTerminalRow(prepared, lineIndex, row)
```

`projectTerminalSourceOffset()` maps a UTF-16 source offset to a grapheme-safe source boundary, then projects that boundary into the fixed-column layout represented by `lineIndex`.

`projectTerminalCursor()` maps an opaque terminal cursor back through the same source/line indexes and returns the matching terminal coordinate.

`projectTerminalRow()` maps a terminal row to the line range and row extent for that fixed-column layout, or `null` when the row is outside the emitted row set.

A coordinate projection result must include:

- `kind: "terminal-coordinate-projection@1"`
- `row`: zero-based terminal row in the fixed-column layout
- `column`: absolute terminal cell column on that row, including row `startColumn`
- `coordinate`: convenience mirror of `{ row, column }`; it must equal the top-level `row` and `column`
- `sourceOffset`: normalized UTF-16 source offset at a grapheme-safe boundary
- `requestedSourceOffset`: the originally requested source offset for source-offset projections
- `exact`: whether the requested offset was already a projectable source boundary
- `atEnd`: whether the projection denotes the logical end of the prepared source
- `cursor`: the opaque terminal cursor for replay
- `line`: the projected row's `TerminalLineRange`, or `null` for empty-source EOF and EOF endpoints after a final hard break. When a zero-width break, collapsed space, or other wrap delimiter is consumed as the boundary between rows, the projected coordinate may land on the next visible row while `sourceOffset` still denotes the consumed delimiter before that row's visible `sourceStart`.

A row projection result must include:

- `kind: "terminal-row-projection@1"`
- `row`
- `line`
- `sourceStart` and `sourceEnd`
- `startColumn` and `endColumn`

Projection columns are terminal-cell columns, not UTF-16 columns. Tabs expand from the current terminal column, wide graphemes advance by their terminal width, combining marks stay inside their base grapheme cell, and zero-width break/glue characters never add visible columns.

Source offsets inside a grapheme cluster must honor the requested bias (`before`, `after`, or `closest`) and project to an adjacent canonical boundary. Source offsets at or after consumed wrap delimiters may project to the next visible row when that delimiter was used as a wrap boundary.

EOF projection must be explicit. For ordinary text, EOF projects to the end column of the final emitted line. For text ending in a final LF, EOF projects to `{ row: rows, column: 0, line: null, atEnd: true }`; this must not fabricate an extra materialized row.

Resize is handled by rebuilding the width-dependent `TerminalLineIndex` for the new `columns` and projecting the same source offset through the new index. The prepared text and source-offset index remain width-independent unless the visible source text or prepare-time identity changes.

Forged handles and mismatched prepared/source/line index handles must be rejected through the same capability boundaries as the underlying public index APIs.

## Rich Metadata Boundary

Plain core APIs do not parse ANSI.

The rich path may accept inline SGR and OSC8 only.

SGR maps to style metadata over visible ranges.

OSC8 maps to hyperlink metadata over visible ranges.

Rich metadata may include:

- style
- link
- copy text
- inert selection metadata
- opaque payload ids

Rich metadata defaults are fragment-first. Reconstructed ANSI output is not emitted unless materialization is called with an explicit `ansiText` mode, and the prepared policy may still cap or disable that output.

Rich diagnostics are structured and redacted. They should not retain full unsafe control sequences by default.

The core package must not encode application click behavior.

Selection metadata is descriptive data for consumers. It is not selection behavior, focus behavior, key handling, clipboard behavior, or interaction policy.

## Rejected Terminal Controls

The package must reject or sanitize:

- cursor movement
- cursor save/restore
- erase display/line
- insert/delete char/line
- scroll commands
- alt screen
- title changes
- focus events
- mouse modes
- bracketed paste
- clipboard controls
- DCS/PM/APC/SOS
- raw BEL/BS/CR/ESC
- all OSC except OSC8

Unsupported controls must not contribute width, source-visible text, or materialized output.

Trojan Source-style bidi format controls are unsafe visible terminal text for this package. The plain core rejects them; the rich path sanitizes or rejects them according to policy.

## Bidi And Rendering Boundary

Line breaking is logical-order terminal text layout.

No DOM bidi, glyph positioning, canvas shaping, or CSS inline formatting belongs in the active runtime.

Bidi levels may exist as metadata only. Consumers own any visual reordering policy.

## Cache Boundary

Prepared state is width-independent.

Width profile and `tabSize` are prepare-time identity.

`columns`, `startColumn`, and row/page caches are layout-time.

Width-dependent line/page caches must be separate from prepared source data.

## Validation Requirements

The active TUI validation stack must include:

- static gate for browser globals and web pages in active runtime
- width goldens
- whitespace tests
- tab tests
- hard-break tests
- `ZWSP`, `NBSP`, `SHY`, and `WJ` tests
- emoji and CJK tests
- combining-mark tests
- UTF-16 source offset tests
- materialization tests
- rich sanitizer boundary tests
- deterministic terminal benchmarks

Browser snapshots are not an active correctness oracle for this package.

## Kill Criteria

Stop and redesign if any active terminal runtime path requires DOM, Canvas, browser automation, or monkey-patched browser globals.

Stop and redesign if terminal APIs expose font strings, CSS pixels, CSS `lineHeight`, browser demos, or browser oracle claims as active contract.

Stop and redesign if line fitting uses floats, epsilon, browser engine profiles, or font-specific correction.

Stop and redesign if tabs are precomputed as fixed widths during prepare.

Stop and redesign if terminal control sequences can reach core layout or materialized output.

Stop and redesign if source mapping is not UTF-16 over sanitized visible text.

Stop and redesign if prepared data mixes width-independent source state with width-dependent page/line caches.

Stop and redesign if materialization drops visible text, splits grapheme clusters, or emits unsafe controls.
