<!-- 补建说明：该目录说明为后续补建，用于记录 core 层；当前进度：R2 目录分层迁移首版，包含 terminal.ts、terminal-line-source.ts、terminal-plain-input.ts、terminal-types.ts、terminal-normalized-source.ts。 -->
# Core

Terminal public API surface, line source, plain-input handling, shared terminal types, and normalized-source generation (rank 5).

It may import from any lower-ranked layer; it currently uses prepared, wrap, analyze, and unicode. The virtual layer and above build their caches on top of it.
