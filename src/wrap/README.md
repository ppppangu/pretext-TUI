<!-- 补建说明：该目录说明为后续补建，用于记录 wrap 层；当前进度：R2 目录分层迁移首版，包含 line-break.ts、layout.ts、line-text.ts、measurement.ts。 -->
# Wrap

Line-walking core, arithmetic-only layout, lazy line materialization, and the terminal-width measurement adapter (rank 3).

It may import from lower layers (analyze, unicode, telemetry); the prepared layer and above drive its line breaking and layout.
