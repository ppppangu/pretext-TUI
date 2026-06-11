<!-- 补建说明：该目录说明为后续补建，用于记录 analyze 层；当前进度：R2 目录分层迁移首版，包含 analysis.ts、analysis-text-predicates.ts、analysis-segmentation.ts、analysis-merge-rules.ts、analysis-keep-all.ts、analysis-analyze.ts。 -->
# Analyze

Width-independent text analysis (rank 2): normalization, segmentation, glue/merge rules, and keep-all run grouping, fronted by `analysis.ts`.

It may import from lower layers (unicode, telemetry); the wrap layer and above consume its segmentation output.

Ownership contract: the merge passes in `analysis-merge-rules.ts` may return their input `MergedSegmentation` by reference when an applicability prescan proves the pass cannot fire. Callers must treat pass inputs as consumed — never retain a pass input and mutate it (or the pass output) in place, except where the caller exclusively owns every array involved (as `buildMergedSegmentation` does for its trailing Arabic-marks fixup).
