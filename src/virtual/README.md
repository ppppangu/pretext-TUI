<!-- 补建说明：该目录说明为后续补建，用于记录 virtual 层；当前进度：R2 目录分层迁移首版，包含 terminal-line-index.ts、terminal-page-cache.ts、terminal-source-offset-index.ts、terminal-layout-bundle.ts、terminal-materialize.ts、terminal-cell-flow.ts。 -->
# Virtual

Fixed-column virtual text caches: row anchor index, range-only page cache, source offset index, layout bundle, bounded materialization, and appendable cell flow (rank 6).

It may import from lower layers (core, prepared, telemetry); the semantic layer and above consume its materialized lines and indices.
