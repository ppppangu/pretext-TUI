<!-- 补建说明：该目录说明为后续补建，用于记录 semantic 层；当前进度：R2 目录分层迁移首版，包含 terminal-coordinate-projection.ts、terminal-selection.ts、terminal-search-session.ts、terminal-range-index.ts。 -->
# Semantic

Coordinate projection, selection, search sessions, and range indexing over materialized terminal lines (rank 7).

It may import from lower layers (virtual, core, prepared, unicode, telemetry); the rich layer and above build on its coordinates and ranges.
