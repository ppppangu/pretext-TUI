<!-- 补建说明：该目录为后续补建，用于存放 pretext-TUI 终端一致性套件的纯数据用例（package-neutral，任何宿主或非 JS 复刻实现都可运行并逐字段对比）；当前进度：首版覆盖 width/wrap/offset 三域种子用例与从引擎生成的 expecteds，repo-only，未进入 release gate。 -->
# Terminal Conformance Kit

This directory holds the `pretext-TUI` terminal conformance kit: package-neutral,
data-only conformance cases. Any host, or any non-JavaScript reimplementation of the
same terminal-cell layout semantics, can load these cases, run the inputs through its
own implementation, and compare the results field by field.

## What it is

Each case is a plain input plus the expected result that the current engine produces
for the `terminal-unicode-narrow@1` width profile at Unicode `17.0.0`. The cases are
hand-curated seeds; the expecteds are generated from the engine, not hand-written.

## File map

| File | Schema | Contents |
| --- | --- | --- |
| `manifest.json` | `pretext-tui-terminal-conformance-kit@1` | Lists the domain files and the terminal-contract clauses each case pins. |
| `width-cases.json` | `pretext-tui-terminal-conformance-kit@1` | Cell-width cases over the width profile (`expectedWidth` is an integer cell count). |
| `wrap-cases.json` | `pretext-tui-terminal-conformance-kit@1` | Whitespace, tab, break, and source-range layout cases (`expected` is a per-row layout snapshot). |
| `offset-cases.json` | `pretext-tui-terminal-conformance-kit@1` | Source-offset projection cases (`expected` is `{ row, column, sourceOffset, exact, atEnd }`). |

Every file carries a top-level `metadata` object first, including the `schema`,
`profile` (`terminal-unicode-narrow@1`), and `unicodeVersion` (`17.0.0`) identity.

## How to consume

1. Load the JSON for a domain and read its `cases` array.
2. For each case, run the listed input fields through your implementation:
   - width: measure `text` (honoring any `widthProfile` override) and compare to `expectedWidth`.
   - wrap: lay out `text` with the given `prepare`/`layout` options and compare each `expected` field.
   - offset: project `sourceOffset` (with any `bias`) and compare `row`, `column`, `sourceOffset`, `exact`, and `atEnd`.
3. Compare expecteds field by field; any difference is a conformance mismatch.

The JavaScript reference runner is `bun run conformance-kit-check`, which re-evaluates
every case against the current engine. Regenerate expecteds with
`bun run scripts/tui-conformance-kit-generate.ts`.

## Non-claims

- This kit is not a certification or a compliance badge.
- It pins exactly `terminal-unicode-narrow@1` at Unicode `17.0.0`; a different profile or Unicode version is out of scope and must get its own kit version.
- The cases describe text-layout data only and do not imply any renderer, terminal-emulator, or host application behavior; No terminal product or host is named or targeted.
- The kit is repository-only data and is not part of the published npm tarball; it may be promoted into the release gate later, but it is not a release gate today.
