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
- optional rich inline metadata for current style/link spans
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

## Coordinate Domains

The terminal kernel distinguishes these coordinate domains:

- raw input before plain or rich sanitization
- sanitized visible source text after normalization
- UTF-16 source offsets over sanitized visible source text
- grapheme-boundary package cursors
- terminal cursor replay tokens
- zero-based terminal rows
- integer terminal cell columns
- fixed-column layout identity for `columns`, `startColumn`, `tabSize`, and width profile
- generation numbers for append-only prepared flows and invalidation metadata
- optional generic range sidecar metadata over sanitized visible source text
- optional rich sidecar ranges over sanitized visible source text

Hosts may store public handles, source offsets, rows, columns, and returned cursors, but they must not infer private segment, anchor, page, or chunk storage from those values.

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
- source-first search hits
- materialization
- future paging

Terminal cursors are package-owned replay tokens with segment/grapheme fields. Hosts may store and pass them back to package APIs, but should not treat those fields as raw source offsets or mutable implementation state.

Source-offset lookup results distinguish the original requested UTF-16 offset from the normalized boundary offset. Out-of-range requests may clamp to `0` or EOF, but `exact` is true only when the original requested offset was already a projectable source boundary. Runtime bias values must be one of `before`, `after`, or `closest`; invalid JavaScript values must be rejected.

The current incremental contract is append-only. `PreparedTerminalCellFlow` exposes generation and invalidation metadata for growing text through an opaque handle backed by internal chunked storage. Arbitrary insert, delete, or replace editing is a separate future buffer design. Destructive prefix eviction is also a future explicit API because it would change global source-offset meaning.

Ranges expose:

- visible start/end
- UTF-16 source start/end
- hard/soft break provenance
- terminal width
- optional overflow metadata
- optional discretionary-hyphen metadata

## Coordinate Projection

Coordinate projection is a host-neutral convenience layer over the public source-offset index and fixed-column line index. It must not expose prepared segments, row anchors, page caches, raw source storage, or mutable implementation state.

The agreed public shape is incubating until the API snapshot, package smoke tests, and focused projection tests cover the full bidirectional mapping surface:

```ts
projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, sourceOffset, biasOrOptions?)
projectTerminalSourceOffset(prepared, { sourceIndex, lineIndex }, sourceOffset, options?)
projectTerminalCursor(prepared, sourceIndex, lineIndex, cursor, options?)
projectTerminalCursor(prepared, { sourceIndex, lineIndex }, cursor, options?)
projectTerminalRow(prepared, lineIndex, row)
projectTerminalCoordinate(prepared, { sourceIndex, lineIndex }, { row, column, bias? })
projectTerminalSourceRange(prepared, { sourceIndex, lineIndex }, { sourceStart, sourceEnd })
```

`projectTerminalSourceOffset()` maps a UTF-16 source offset to a grapheme-safe source boundary, then projects that boundary into the fixed-column layout represented by `lineIndex`.

`projectTerminalCursor()` maps an opaque terminal cursor back through the same source/line indexes and returns the matching terminal coordinate.

`projectTerminalRow()` maps a terminal row to the line range and row extent for that fixed-column layout, or `null` when the row is outside the emitted row set.

`projectTerminalCoordinate()` maps a zero-based terminal row and absolute terminal cell column back to a grapheme-safe UTF-16 source offset for mouse hit-test, hover, and caret-like host workflows. It returns data only; hosts own pointer state, caret policy, selection state, and rendering.

`projectTerminalSourceRange()` maps a source range to terminal row fragments. Fragments are over generic source ranges only; transcript messages, logs, diffs, tests, code blocks, diagnostics, or agent/tool semantics remain host-owned metadata layered above the kernel.

Selection constructors and extraction helpers are incubating host-neutral surfaces. They are source-first data APIs, not UI state or clipboard behavior.

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

`exact` is evaluated against the original requested source offset before clamping or boundary normalization. Out-of-range requests may clamp `sourceOffset` to `0` or EOF, but must report `exact: false`.

Runtime bias values must be one of `before`, `after`, or `closest`; invalid JavaScript values must be rejected. When multiple replay cursors share the same source offset, `before` selects the earliest cursor at that offset, while `after` and `closest` select the latest replay-safe cursor.

A row projection result must include:

- `kind: "terminal-row-projection@1"`
- `row`
- `line`
- `sourceStart` and `sourceEnd`
- `startColumn` and `endColumn`

Projection columns are terminal-cell columns, not UTF-16 columns. Tabs expand from the current terminal column, wide graphemes advance by their terminal width, combining marks stay inside their base grapheme cell, and zero-width break/glue characters never add visible columns.

Source offsets inside a grapheme cluster must honor the requested bias (`before`, `after`, or `closest`) and project to an adjacent canonical boundary. Source offsets at or after consumed wrap delimiters may project to the next visible row when that delimiter was used as a wrap boundary.

EOF projection must be explicit. For ordinary text, EOF projects to the end column of the final emitted line. For text ending in a final LF, EOF projects to `{ row: rows, column: 0, line: null, atEnd: true }` after source-offset normalization, even when `before` selects an earlier replay cursor at the same EOF source offset; this must not fabricate an extra materialized row.

Resize is handled by rebuilding the width-dependent `TerminalLineIndex` for the new `columns` and projecting the same source offset through the new index. The prepared text and source-offset index remain width-independent unless the visible source text or prepare-time identity changes.

Forged handles and mismatched prepared/source/line index handles must be rejected through the same capability boundaries as the underlying public index APIs.

## Generic Range Sidecar Index

Generic range sidecar indexes are an incubating host-neutral metadata layer over UTF-16 offsets in sanitized visible source text. They are prepared-neutral by design: the host owns keeping the indexed source ranges in sync with the visible source passed to `prepareTerminal()`.

The agreed public shape is:

```ts
createTerminalRangeIndex(ranges)
getTerminalRangesAtSourceOffset(index, sourceOffset)
getTerminalRangesForSourceRange(index, { sourceStart, sourceEnd })
```

`TerminalRange` contains `id`, `kind`, `sourceStart`, `sourceEnd`, optional `tags`, and optional inert JSON-like `data`. The package validates, clones, freezes, indexes, and returns those ranges. It must not branch on, interpret, mutate, execute, or retain active behavior from `id`, `kind`, `tags`, or `data`.

Range semantics are:

- non-empty ranges are half-open: `[sourceStart, sourceEnd)`
- zero-length ranges are point ranges
- point lookup returns non-empty ranges containing the offset plus point ranges exactly at that offset
- non-collapsed range lookup returns overlapping non-empty ranges plus point ranges where `queryStart <= point < queryEnd`
- collapsed range lookup behaves like point lookup
- results are deterministic: `sourceStart` ascending, longer enclosing ranges first when starts match, then `id`, `kind`, and original order

The range sidecar does not implement transcript messages, log records, diff hunks, test results, editor buffers, diagnostics UX, search UI, highlighting, selection state, clipboard behavior, agent/tool semantics, or host actions. Hosts layer those meanings above returned generic ranges.

## Source-First Search Sessions

Search sessions are an incubating host-neutral lookup layer over sanitized visible source text. They search the same UTF-16 source coordinate domain used by `prepareTerminal()` and by coordinate projection. A search hit is canonical as a source range first; row, column, and fragment data are optional projections.

The agreed public shape is:

```ts
createTerminalSearchSession(prepared, query, options?)
getTerminalSearchSessionMatchCount(session)
getTerminalSearchMatchesForSourceRange(session, { sourceStart?, sourceEnd?, limit? }?)
getTerminalSearchMatchAfterSourceOffset(session, sourceOffset)
getTerminalSearchMatchBeforeSourceOffset(session, sourceOffset)
```

Supported query modes are literal and regex. A string query defaults to literal mode, and a `RegExp` query defaults to regex mode. `caseSensitive` defaults to `true`; passing `false` enables case-insensitive matching. `wholeWord` uses package-owned ASCII word boundaries (`A-Z`, `a-z`, `0-9`, and `_`) so it remains deterministic across runtimes. Regex searches must use non-empty patterns, run against sanitized visible source text, and reject zero-width matches.

Search scopes are generic source ranges. A scope may be an explicit source range, an array of explicit source ranges, or a range-index scope created with `createTerminalRangeIndex()`. Range-index scope ids become `scopeId` on returned hits, but the package does not inspect or branch on range `kind`, `tags`, or `data`.

`getTerminalSearchMatchesForSourceRange()` is an overlap query over search hits. Non-collapsed source-range queries return hits where `hit.sourceStart < query.sourceEnd` and `hit.sourceEnd > query.sourceStart`. Collapsed source-range queries behave like point lookup and return hits where `hit.sourceStart <= query.sourceStart < hit.sourceEnd`. Passing `scopeId` filters returned hits to that exact generic scope id. Passing `limit: 0` returns an empty immutable result.

`TerminalSearchMatch` returns immutable data:

- `kind: "terminal-search-match@1"`
- `matchIndex`
- `sourceStart`
- `sourceEnd`
- `matchText`
- optional `scopeId`
- optional `projection` when `indexes` were supplied at session creation

Search sessions do not implement search UI, active-match navigation state, highlighting, selections, result panes, keyboard shortcuts, clipboard behavior, or host-specific semantics. Hosts layer those workflows above returned source ranges and optional projections.

## Selection And Extraction

Selection and extraction helpers are an incubating host-neutral data layer over coordinate projection and source-range projection. They construct recoverable source ranges from terminal coordinates and extract deterministic source/visible fragments. They do not implement active selection state.

The agreed public core shape is:

```ts
createTerminalSelectionFromCoordinates(prepared, indexes, { anchor, focus, mode: "linear" })
extractTerminalSourceRange(prepared, { sourceStart, sourceEnd }, { indexes, rangeIndex? })
extractTerminalSelection(prepared, selection, { indexes, rangeIndex? })
```

`TerminalSelection` is immutable data, not an opaque state handle. It contains the projected anchor, projected focus, direction, collapsed flag, normalized `sourceStart/sourceEnd`, `rowStart/rowEnd`, and the source-range projection that made those values. The only supported mode is `linear`; rectangular/block selection is host-owned future work.

`TerminalSelectionExtraction` returns:

- `kind: "terminal-selection-extraction@1"`
- requested and normalized source bounds
- `rowStart` and `rowEnd`
- `sourceText` over sanitized visible source text
- deterministic `visibleRows` and `visibleText`
- row fragments with terminal columns and source spans
- optional generic `rangeMatches` when a `TerminalRangeIndex` is supplied

`visibleText` is extraction data only. It is not clipboard policy, copy formatting, or host UI behavior. Hosts own drag state, focus, caret policy, highlighting, active selection state, copy commands, clipboard writes, and persistence.

Rich extraction helpers live under `pretext-tui/terminal-rich-inline`. They return clipped style/link fragments in addition to the core extraction data. They must not expose full raw terminal input, unsafe control sequences, link opening behavior, or ANSI reconstruction unless a separate rich materialization option explicitly asks for ANSI text.

## Layout Bundle Invalidation

Layout bundles are an incubating convenience layer over the existing fixed-column line index, page cache, and source-offset index. They reduce handle plumbing for host viewports without replacing the lower-level primitives.

The agreed public shape is:

```ts
createTerminalLayoutBundle(prepared, { columns, startColumn?, generation?, anchorInterval?, pageSize?, maxPages? })
getTerminalLayoutBundlePage(prepared, bundle, { startRow, rowCount })
invalidateTerminalLayoutBundle(prepared, bundle, invalidation)
projectTerminalSourceOffset(prepared, bundle, sourceOffset, options?)
projectTerminalCursor(prepared, bundle, cursor, options?)
projectTerminalRow(prepared, bundle, row)
projectTerminalCoordinate(prepared, bundle, { row, column, bias? })
projectTerminalSourceRange(prepared, bundle, { sourceStart, sourceEnd })
```

`invalidateTerminalLayoutBundle()` applies line-index invalidation, page-cache invalidation, and source-offset index refresh for the supplied prepared text. Bundle invalidation must reject forged bundle handles, stale prepared handles for page/projection calls, layout identity mismatches, replayed generations, and `previousGeneration` values that do not match the bundle's current generation.

Layout bundles do not render, scroll, select, persist, open links, own clipboard state, or implement host behavior. Append invalidation may come from the append-only chunked flow, but bundle invalidation remains source-first and must continue to reject forged handles, stale generations, and mismatched prepared text.

## Rich Metadata Boundary

Plain core APIs do not parse ANSI.

The rich path may accept inline SGR and OSC8 only.

SGR maps to style metadata over visible ranges.

OSC8 maps to hyperlink metadata over visible ranges.

Rich metadata currently includes:

- style
- link

Copy text, opaque payload ids, and domain-specific selection metadata belong in host-owned state or the generic range sidecar, not in the rich ANSI metadata surface.

Rich metadata defaults are fragment-first. Reconstructed ANSI output is not emitted unless materialization is called with an explicit `ansiText` mode, and the prepared policy may still cap or disable that output.

Rich diagnostics are structured and redacted. They should not retain full unsafe control sequences by default.

Rich prepared handles may expose public snapshot arrays such as spans and raw-visible maps, but runtime helpers must use package-owned capability state for internal indexes. Span and raw-visible range indexes are implementation details; returned offsets remain UTF-16 offsets over sanitized visible source text.

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
