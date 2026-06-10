<!-- 补建说明：该目录说明为后续补建，用于记录 analyze 层；当前进度：R2 目录分层迁移首版，包含 analysis.ts、analysis-text-predicates.ts、analysis-segmentation.ts、analysis-merge-rules.ts、analysis-keep-all.ts、analysis-analyze.ts。 -->
# Analyze

Width-independent text analysis (rank 2): normalization, segmentation, glue/merge rules, and keep-all run grouping, fronted by `analysis.ts`.

It may import from lower layers (unicode, telemetry); the wrap layer and above consume its segmentation output.
