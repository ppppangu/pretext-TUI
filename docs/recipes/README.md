<!-- 补建说明：该目录为后续补建，用于保存只依赖公开 API 的 host-neutral adoption recipes；当前进度：Task 3 首版，覆盖结构化视图、resize、source mapping 与 rich log viewer 四类通用宿主场景。 -->
# Host-Neutral Recipes

These recipes show how a host can compose `pretext-TUI` as a terminal text algorithm layer without turning the package into a renderer, pane manager, command runner, or application framework.

The recipes are intentionally generic. They describe reusable host patterns for structured terminal text, log viewers, transcript-like streams, and editor-like panes. They do not describe bundled integrations for any specific application.

## Incubating API Note

Several recipes use advanced public surfaces such as sparse line indexes, page caches, source-offset indexes, append invalidation metadata, and rich inline metadata. Those surfaces are public and copyable, but still incubating before the first stable `0.1` contract.

Use these recipes as adoption patterns, not as a promise that every advanced type name is frozen forever. The stable core remains `prepare -> layout/range -> materialize`.

## Recipe Rules

- Import only public package entry points: `pretext-tui`, `pretext-tui/terminal`, or `pretext-tui/terminal-rich-inline`.
- Treat prepared text, indexes, and caches as opaque handles.
- Let the host own rendering, input, scroll state, persistence, command execution, clipboard behavior, link opening, and product decisions.
- Keep rich output fragment-first. Reconstructed ANSI text must stay explicit and policy-bound.
- Prefer semantic anchors such as source offsets or host block ids over physical scroll rows.

## Recipes

- [Structured Transcript Viewport](transcript-viewport.md): concatenate host blocks into a source stream, page visible rows, and map rows back to block ranges.
- [Terminal Pane Resize](terminal-pane-resize.md): rebuild width-dependent indexes while keeping a semantic source-offset anchor stable.
- [Editor Source Mapping](editor-source-mapping.md): map host-owned source positions to terminal wrapped rows and terminal rows back to source ranges.
- [Log Viewer With Rich ANSI](log-viewer-rich-ansi.md): sanitize SGR/OSC8 input, page rich fragments, and keep link/action behavior outside the package.
