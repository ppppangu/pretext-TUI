<!-- 补建说明：该目录说明为后续补建，用于记录 public 层；当前进度：R2 目录分层迁移首版，包含 index.ts、public-index.ts、public-terminal-rich-inline.ts。 -->
# Public

The single outward entry layer (rank 9): the root barrel `index.ts`, the aggregated `public-index.ts`, and the public rich inline wrapper.

As the top layer it may import from every lower layer (rich, semantic, virtual, core, prepared, wrap, analyze, unicode, telemetry); nothing inside the package imports from it.
