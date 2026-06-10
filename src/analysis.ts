// 补建说明：该文件为 R1 重构后的 analysis 门面，仅做再导出：字符判定/标点表来自 analysis-text-predicates，类型/空白归一化/分词来自 analysis-segmentation，段流后处理来自 analysis-merge-rules，公共入口来自 analysis-analyze；当前进度：行为冻结迁移，对外导出面与拆分前完全一致。
export {
  canContinueKeepAllTextRun,
  endsWithClosingQuote,
  isCJK,
  isNumericRunSegment,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
} from './analysis-text-predicates.js'
export {
  clearAnalysisCaches,
  DEFAULT_TERMINAL_ANALYSIS_PROFILE,
  normalizeWhitespaceNormal,
  setAnalysisLocale,
} from './analysis-segmentation.js'
export type {
  AnalysisProfile,
  MergedSegmentation,
  SegmentBreakKind,
  WhiteSpaceMode,
  WordBreakMode,
} from './analysis-segmentation.js'
export type {
  AnalysisChunk,
  TextAnalysis,
} from './analysis-merge-rules.js'
export {
  analyzeNormalizedText,
  analyzeText,
} from './analysis-analyze.js'
export { groupKeepAllRuns } from './analysis-keep-all.js'
