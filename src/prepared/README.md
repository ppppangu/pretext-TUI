<!-- 补建说明：该目录说明为后续补建，用于记录 prepared 层；当前进度：R2 目录分层迁移首版，包含 terminal-prepared-reader.ts、terminal-reader-store.ts、terminal-grapheme-geometry.ts。 -->
# Prepared

Prepared-source reader boundary, reader storage, and grapheme geometry over prepared text (rank 4).

It may import from lower layers (wrap, analyze, unicode, telemetry); the core layer and above consume the prepared reader surface.
