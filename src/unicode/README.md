<!-- 补建说明：该目录说明为后续补建，用于记录 unicode 层；当前进度：R2 目录分层迁移首版，包含 terminal-width-profile.ts、terminal-string-width.ts、grapheme-segmenter.ts、bidi.ts、terminal-control-policy.ts 与 generated/。 -->
# Unicode

Unicode cell-width, grapheme segmentation, bidi level, and control-code policy primitives (rank 1), including the generated bidi data table under `generated/`.

It may import only from lower layers (telemetry); analyze, wrap, and everything above build their text behavior on top of it.
