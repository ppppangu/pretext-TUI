// 补建说明：该文件为 R1 重构从 analysis.ts 拆出，承载公共入口 analyzeText / analyzeNormalizedText 及其 profile 编排（normalize → buildMergedSegmentation → keep-all → grapheme repair → chunks）；当前进度：行为冻结迁移。
import {
  buildMergedSegmentation,
  getWhiteSpaceProfile,
  normalizeWhitespaceNormal,
  normalizeWhitespacePreWrap,
  type AnalysisProfile,
  type WhiteSpaceMode,
  type WhiteSpaceProfile,
  type WordBreakMode,
} from './analysis-segmentation.js'
import {
  compileAnalysisChunks,
  mergeKeepAllTextSegments,
  mergeLeadingGraphemeContinuations,
  type TextAnalysis,
} from './analysis-merge-rules.js'

export function analyzeText(
  text: string,
  profile: AnalysisProfile,
  whiteSpace: WhiteSpaceMode = 'normal',
  wordBreak: WordBreakMode = 'normal',
): TextAnalysis {
  const whiteSpaceProfile = getWhiteSpaceProfile(whiteSpace)
  const normalized = whiteSpaceProfile.mode === 'pre-wrap'
    ? normalizeWhitespacePreWrap(text)
    : normalizeWhitespaceNormal(text)
  return analyzeNormalizedTextWithProfile(normalized, profile, whiteSpaceProfile, wordBreak)
}

export function analyzeNormalizedText(
  normalized: string,
  profile: AnalysisProfile,
  whiteSpace: WhiteSpaceMode = 'normal',
  wordBreak: WordBreakMode = 'normal',
): TextAnalysis {
  return analyzeNormalizedTextWithProfile(
    normalized,
    profile,
    getWhiteSpaceProfile(whiteSpace),
    wordBreak,
  )
}

function analyzeNormalizedTextWithProfile(
  normalized: string,
  profile: AnalysisProfile,
  whiteSpaceProfile: WhiteSpaceProfile,
  wordBreak: WordBreakMode,
): TextAnalysis {
  if (normalized.length === 0) {
    return {
      normalized,
      chunks: [],
      len: 0,
      texts: [],
      isWordLike: [],
      kinds: [],
      starts: [],
    }
  }
  const mergedSegmentation = buildMergedSegmentation(normalized, profile, whiteSpaceProfile)
  const segmentationBeforeGraphemeRepair = wordBreak === 'keep-all'
    ? mergeKeepAllTextSegments(normalized, mergedSegmentation, profile.breakKeepAllAfterPunctuation)
    : mergedSegmentation
  const segmentation = mergeLeadingGraphemeContinuations(segmentationBeforeGraphemeRepair)
  return {
    normalized,
    chunks: compileAnalysisChunks(segmentation, whiteSpaceProfile),
    ...segmentation,
  }
}
