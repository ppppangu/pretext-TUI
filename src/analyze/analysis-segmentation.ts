// 补建说明：该文件为 R1 重构从 analysis.ts 拆出，承载类型、空白归一化、共享分词器接入、break-kind 切分与 buildMergedSegmentation 第一遍合并；当前进度：行为冻结迁移。
import {
  combiningMarkRe,
  containsArabicScript,
  endsWithClosingQuote,
  endsWithMyanmarMedialGlue,
  forwardStickyGlue,
  getLastCodePoint,
  getRepeatableSingleCharRunChar,
  hasArabicNoSpacePunctuation,
  isCJK,
  joinTextParts,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
  materializeDeferredSingleCharRun,
} from './analysis-text-predicates.js'
import {
  carryTrailingForwardStickyAcrossCJKBoundary,
  mergeAsciiPunctuationChains,
  mergeGlueConnectedTextRuns,
  mergeNumericRuns,
  mergeUrlLikeRuns,
  mergeUrlQueryRuns,
  splitHyphenatedNumericRuns,
} from './analysis-merge-rules.js'
import {
  clearGraphemeSegmenters,
  getLocaleGraphemeSegmenter,
  getLocaleWordSegmenter,
  setSegmenterLocale,
} from '../unicode/grapheme-segmenter.js'

export type WhiteSpaceMode = 'normal' | 'pre-wrap'
export type WordBreakMode = 'normal' | 'keep-all'

export type SegmentBreakKind =
  | 'text'
  | 'space'
  | 'preserved-space'
  | 'tab'
  | 'glue'
  | 'zero-width-break'
  | 'soft-hyphen'
  | 'hard-break'

type SegmentationPiece = {
  text: string
  isWordLike: boolean
  kind: SegmentBreakKind
  start: number
}

export type MergedSegmentation = {
  len: number
  texts: string[]
  isWordLike: boolean[]
  kinds: SegmentBreakKind[]
  starts: number[]
}

export type AnalysisProfile = {
  carryCJKAfterClosingQuote: boolean
  breakKeepAllAfterPunctuation: boolean
}

export const DEFAULT_TERMINAL_ANALYSIS_PROFILE: AnalysisProfile = {
  carryCJKAfterClosingQuote: false,
  breakKeepAllAfterPunctuation: true,
}

const collapsibleWhitespaceRunRe = /[ \t\n\r\f]+/g
const needsWhitespaceNormalizationRe = /[\t\n\r\f]| {2,}|^ | $/

export type WhiteSpaceProfile = {
  mode: WhiteSpaceMode
  preserveOrdinarySpaces: boolean
  preserveHardBreaks: boolean
}

export function getWhiteSpaceProfile(whiteSpace?: WhiteSpaceMode): WhiteSpaceProfile {
  const mode = whiteSpace ?? 'normal'
  return mode === 'pre-wrap'
    ? { mode, preserveOrdinarySpaces: true, preserveHardBreaks: true }
    : { mode, preserveOrdinarySpaces: false, preserveHardBreaks: false }
}

export function normalizeWhitespaceNormal(text: string): string {
  if (!needsWhitespaceNormalizationRe.test(text)) return text

  let normalized = text.replace(collapsibleWhitespaceRunRe, ' ')
  if (normalized.charCodeAt(0) === 0x20) {
    normalized = normalized.slice(1)
  }
  if (normalized.length > 0 && normalized.charCodeAt(normalized.length - 1) === 0x20) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function normalizeWhitespacePreWrap(text: string): string {
  if (!/[\r\f]/.test(text)) return text
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\r\f]/g, '\n')
}

export function clearAnalysisCaches(): void {
  clearGraphemeSegmenters()
}

export function setAnalysisLocale(locale?: string): void {
  setSegmenterLocale(locale)
}

function isLeftStickyPunctuationSegment(segment: string): boolean {
  if (isEscapedQuoteClusterSegment(segment)) return true
  let sawPunctuation = false
  for (const ch of segment) {
    if (leftStickyPunctuation.has(ch)) {
      sawPunctuation = true
      continue
    }
    if (sawPunctuation && combiningMarkRe.test(ch)) continue
    return false
  }
  return sawPunctuation
}

function isCJKLineStartProhibitedSegment(segment: string): boolean {
  for (const ch of segment) {
    if (!kinsokuStart.has(ch) && !leftStickyPunctuation.has(ch)) return false
  }
  return segment.length > 0
}

function isForwardStickyClusterSegment(segment: string): boolean {
  if (isEscapedQuoteClusterSegment(segment)) return true
  for (const ch of segment) {
    if (!kinsokuEnd.has(ch) && !forwardStickyGlue.has(ch) && !combiningMarkRe.test(ch)) return false
  }
  return segment.length > 0
}

function isEscapedQuoteClusterSegment(segment: string): boolean {
  let sawQuote = false
  for (const ch of segment) {
    if (ch === '\\' || combiningMarkRe.test(ch)) continue
    if (kinsokuEnd.has(ch) || leftStickyPunctuation.has(ch) || forwardStickyGlue.has(ch)) {
      sawQuote = true
      continue
    }
    return false
  }
  return sawQuote
}

function splitLeadingSpaceAndMarks(segment: string): { space: string, marks: string } | null {
  if (segment.length < 2 || segment[0] !== ' ') return null
  const marks = segment.slice(1)
  if (/^\p{M}+$/u.test(marks)) {
    return { space: ' ', marks }
  }
  return null
}

export function classifySegmentBreakCode(code: number, whiteSpaceProfile: WhiteSpaceProfile): SegmentBreakKind {
  if (whiteSpaceProfile.preserveOrdinarySpaces || whiteSpaceProfile.preserveHardBreaks) {
    if (code === 0x20) return 'preserved-space'
    if (code === 0x09) return 'tab'
    if (whiteSpaceProfile.preserveHardBreaks && code === 0x0a) return 'hard-break'
  }
  if (code === 0x20) return 'space'
  if (code === 0x00a0 || code === 0x202f || code === 0x2060 || code === 0xfeff) {
    return 'glue'
  }
  if (code === 0x200b) return 'zero-width-break'
  if (code === 0x00ad) return 'soft-hyphen'
  return 'text'
}

// Mirrors the full set of code units classifySegmentBreakCode maps to a
// non-'text' kind; must stay in sync with that classifier.
function isSegmentBreakCode(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x00a0 ||
    code === 0x00ad ||
    code === 0x200b ||
    code === 0x202f ||
    code === 0x2060 ||
    code === 0xfeff
  )
}

function joinReversedPrefixParts(prefixParts: string[], tail: string): string {
  const parts: string[] = []
  for (let i = prefixParts.length - 1; i >= 0; i--) {
    parts.push(prefixParts[i]!)
  }
  parts.push(tail)
  return joinTextParts(parts)
}

export function splitSegmentByBreakKind(
  segment: string,
  isWordLike: boolean,
  start: number,
  whiteSpaceProfile: WhiteSpaceProfile,
): SegmentationPiece[] {
  // One prepass replaces the former break-char regex test and additionally
  // detects ASCII-safe segments. \r is excluded from the fast path because
  // '\r\n' is a single grapheme while charCode iteration would see two units.
  let hasBreakChar = false
  let asciiSafe = true
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i)
    if (code >= 0x80 || code === 0x0d) {
      asciiSafe = false
      if (hasBreakChar) break
    }
    if (isSegmentBreakCode(code)) {
      hasBreakChar = true
      if (!asciiSafe) break
    }
  }

  if (!hasBreakChar) {
    return [{ text: segment, isWordLike, kind: 'text', start }]
  }

  const pieces: SegmentationPiece[] = []

  if (asciiSafe) {
    // Every ASCII code unit except \r forms its own grapheme, so run
    // grouping over charCodes matches the grapheme path exactly.
    let runStart = 0
    let runKind = classifySegmentBreakCode(segment.charCodeAt(0), whiteSpaceProfile)
    let runWordLike = runKind === 'text' && isWordLike
    for (let i = 1; i < segment.length; i++) {
      const kind = classifySegmentBreakCode(segment.charCodeAt(i), whiteSpaceProfile)
      const wordLike = kind === 'text' && isWordLike
      if (kind === runKind && wordLike === runWordLike) continue
      pieces.push({
        text: segment.slice(runStart, i),
        isWordLike: runWordLike,
        kind: runKind,
        start: start + runStart,
      })
      runStart = i
      runKind = kind
      runWordLike = wordLike
    }
    pieces.push({
      text: segment.slice(runStart),
      isWordLike: runWordLike,
      kind: runKind,
      start: start + runStart,
    })
    return pieces
  }

  let currentKind: SegmentBreakKind | null = null
  let currentTextParts: string[] = []
  let currentStart = start
  let currentWordLike = false
  let offset = 0

  for (const { segment: grapheme } of getLocaleGraphemeSegmenter().segment(segment)) {
    const kind = grapheme.length === 1
      ? classifySegmentBreakCode(grapheme.charCodeAt(0), whiteSpaceProfile)
      : 'text'
    const wordLike = kind === 'text' && isWordLike

    if (currentKind !== null && kind === currentKind && wordLike === currentWordLike) {
      currentTextParts.push(grapheme)
      offset += grapheme.length
      continue
    }

    if (currentKind !== null) {
      pieces.push({
        text: joinTextParts(currentTextParts),
        isWordLike: currentWordLike,
        kind: currentKind,
        start: currentStart,
      })
    }

    currentKind = kind
    currentTextParts = [grapheme]
    currentStart = start + offset
    currentWordLike = wordLike
    offset += grapheme.length
  }

  if (currentKind !== null) {
    pieces.push({
      text: joinTextParts(currentTextParts),
      isWordLike: currentWordLike,
      kind: currentKind,
      start: currentStart,
    })
  }

  return pieces
}

export function buildMergedSegmentation(
  normalized: string,
  profile: AnalysisProfile,
  whiteSpaceProfile: WhiteSpaceProfile,
): MergedSegmentation {
  const wordSegmenter = getLocaleWordSegmenter()
  let mergedLen = 0
  const mergedTexts: string[] = []
  const mergedTextParts: string[][] = []
  const mergedWordLike: boolean[] = []
  const mergedKinds: SegmentBreakKind[] = []
  const mergedStarts: number[] = []
  // Track repeatable single-char punctuation runs structurally so identical
  // merges stay O(1) instead of re-scanning the accumulated segment each time.
  const mergedSingleCharRunChars: (string | null)[] = []
  const mergedSingleCharRunLengths: number[] = []
  const mergedContainsCJK: boolean[] = []
  const mergedContainsArabicScript: boolean[] = []
  const mergedEndsWithClosingQuote: boolean[] = []
  const mergedEndsWithMyanmarMedialGlue: boolean[] = []
  const mergedHasArabicNoSpacePunctuation: boolean[] = []

  for (const s of wordSegmenter.segment(normalized)) {
    for (const piece of splitSegmentByBreakKind(s.segment, s.isWordLike ?? false, s.index, whiteSpaceProfile)) {
      const isText = piece.kind === 'text'
      const repeatableSingleCharRunChar = getRepeatableSingleCharRunChar(piece.text, piece.isWordLike, piece.kind)
      const pieceContainsCJK = isCJK(piece.text)
      const pieceContainsArabicScript = containsArabicScript(piece.text)
      const pieceLastCodePoint = getLastCodePoint(piece.text)
      const pieceEndsWithClosingQuote = endsWithClosingQuote(piece.text)
      const pieceEndsWithMyanmarMedialGlue = endsWithMyanmarMedialGlue(piece.text)
      const prevIndex = mergedLen - 1

      function appendPieceToPrevious(): void {
        if (mergedSingleCharRunChars[prevIndex] !== null) {
          mergedTextParts[prevIndex] = [
            materializeDeferredSingleCharRun(
              mergedTexts,
              mergedSingleCharRunChars,
              mergedSingleCharRunLengths,
              prevIndex,
            ),
          ]
          mergedSingleCharRunChars[prevIndex] = null
        }
        mergedTextParts[prevIndex]!.push(piece.text)
        mergedWordLike[prevIndex] = mergedWordLike[prevIndex]! || piece.isWordLike
        mergedContainsCJK[prevIndex] = mergedContainsCJK[prevIndex]! || pieceContainsCJK
        mergedContainsArabicScript[prevIndex] =
          mergedContainsArabicScript[prevIndex]! || pieceContainsArabicScript
        mergedEndsWithClosingQuote[prevIndex] = pieceEndsWithClosingQuote
        mergedEndsWithMyanmarMedialGlue[prevIndex] = pieceEndsWithMyanmarMedialGlue
        mergedHasArabicNoSpacePunctuation[prevIndex] = hasArabicNoSpacePunctuation(
          mergedContainsArabicScript[prevIndex]!,
          pieceLastCodePoint,
        )
      }

      // First-pass keeps: no-space script-specific joins and punctuation glue
      // that depend on the immediately preceding text run.
      if (
        profile.carryCJKAfterClosingQuote &&
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        pieceContainsCJK &&
        mergedContainsCJK[prevIndex] &&
        mergedEndsWithClosingQuote[prevIndex]!
      ) {
        appendPieceToPrevious()
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        isCJKLineStartProhibitedSegment(piece.text) &&
        mergedContainsCJK[prevIndex]
      ) {
        appendPieceToPrevious()
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        mergedEndsWithMyanmarMedialGlue[prevIndex]
      ) {
        appendPieceToPrevious()
      } else if (
        isText &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        piece.isWordLike &&
        pieceContainsArabicScript &&
        mergedHasArabicNoSpacePunctuation[prevIndex]
      ) {
        appendPieceToPrevious()
        mergedWordLike[prevIndex] = true
      } else if (
        repeatableSingleCharRunChar !== null &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        mergedSingleCharRunChars[prevIndex] === repeatableSingleCharRunChar
      ) {
        mergedSingleCharRunLengths[prevIndex] = (mergedSingleCharRunLengths[prevIndex] ?? 1) + 1
      } else if (
        isText &&
        !piece.isWordLike &&
        mergedLen > 0 &&
        mergedKinds[prevIndex] === 'text' &&
        !mergedContainsCJK[prevIndex] &&
        (
          isLeftStickyPunctuationSegment(piece.text) ||
          (piece.text === '-' && mergedWordLike[prevIndex]!)
        )
      ) {
        appendPieceToPrevious()
      } else {
        mergedTexts[mergedLen] = piece.text
        mergedTextParts[mergedLen] = [piece.text]
        mergedWordLike[mergedLen] = piece.isWordLike
        mergedKinds[mergedLen] = piece.kind
        mergedStarts[mergedLen] = piece.start
        mergedSingleCharRunChars[mergedLen] = repeatableSingleCharRunChar
        mergedSingleCharRunLengths[mergedLen] = repeatableSingleCharRunChar === null ? 0 : 1
        mergedContainsCJK[mergedLen] = pieceContainsCJK
        mergedContainsArabicScript[mergedLen] = pieceContainsArabicScript
        mergedEndsWithClosingQuote[mergedLen] = pieceEndsWithClosingQuote
        mergedEndsWithMyanmarMedialGlue[mergedLen] = pieceEndsWithMyanmarMedialGlue
        mergedHasArabicNoSpacePunctuation[mergedLen] = hasArabicNoSpacePunctuation(
          pieceContainsArabicScript,
          pieceLastCodePoint,
        )
        mergedLen++
      }
    }
  }

  for (let i = 0; i < mergedLen; i++) {
    if (mergedSingleCharRunChars[i] !== null) {
      mergedTexts[i] = materializeDeferredSingleCharRun(
        mergedTexts,
        mergedSingleCharRunChars,
        mergedSingleCharRunLengths,
        i,
      )
      continue
    }
    mergedTexts[i] = joinTextParts(mergedTextParts[i]!)
  }

  // Later passes operate on the merged text stream itself: contextual escaped
  // quote glue, forward-sticky carry, compaction, then the broader URL/numeric
  // and Arabic-leading-mark fixes.
  for (let i = 1; i < mergedLen; i++) {
    if (
      mergedKinds[i] === 'text' &&
      !mergedWordLike[i]! &&
      isEscapedQuoteClusterSegment(mergedTexts[i]!) &&
      mergedKinds[i - 1] === 'text' &&
      !mergedContainsCJK[i - 1]
    ) {
      mergedTexts[i - 1] += mergedTexts[i]!
      mergedWordLike[i - 1] = mergedWordLike[i - 1]! || mergedWordLike[i]!
      mergedTexts[i] = ''
    }
  }

  const forwardStickyPrefixParts: (string[] | null)[] = Array.from({ length: mergedLen }, () => null)
  let nextLiveIndex = -1

  for (let i = mergedLen - 1; i >= 0; i--) {
    const text = mergedTexts[i]!
    if (text.length === 0) continue

    if (
      mergedKinds[i] === 'text' &&
      !mergedWordLike[i]! &&
      isForwardStickyClusterSegment(text) &&
      nextLiveIndex >= 0 &&
      mergedKinds[nextLiveIndex] === 'text'
    ) {
      const prefixParts = forwardStickyPrefixParts[nextLiveIndex] ?? []
      prefixParts.push(text)
      forwardStickyPrefixParts[nextLiveIndex] = prefixParts
      mergedStarts[nextLiveIndex] = mergedStarts[i]!
      mergedTexts[i] = ''
      continue
    }

    nextLiveIndex = i
  }

  for (let i = 0; i < mergedLen; i++) {
    const prefixParts = forwardStickyPrefixParts[i]
    if (prefixParts == null) continue
    mergedTexts[i] = joinReversedPrefixParts(prefixParts, mergedTexts[i]!)
  }

  let compactLen = 0
  for (let read = 0; read < mergedLen; read++) {
    const text = mergedTexts[read]!
    if (text.length === 0) continue
    if (compactLen !== read) {
      mergedTexts[compactLen] = text
      mergedWordLike[compactLen] = mergedWordLike[read]!
      mergedKinds[compactLen] = mergedKinds[read]!
      mergedStarts[compactLen] = mergedStarts[read]!
    }
    compactLen++
  }

  mergedTexts.length = compactLen
  mergedWordLike.length = compactLen
  mergedKinds.length = compactLen
  mergedStarts.length = compactLen

  const compacted = mergeGlueConnectedTextRuns({
    len: compactLen,
    texts: mergedTexts,
    isWordLike: mergedWordLike,
    kinds: mergedKinds,
    starts: mergedStarts,
  })
  const withMergedUrls = carryTrailingForwardStickyAcrossCJKBoundary(
    mergeAsciiPunctuationChains(
      splitHyphenatedNumericRuns(mergeNumericRuns(mergeUrlQueryRuns(mergeUrlLikeRuns(compacted)))),
    ),
  )

  for (let i = 0; i < withMergedUrls.len - 1; i++) {
    const split = splitLeadingSpaceAndMarks(withMergedUrls.texts[i]!)
    if (split === null) continue
    if (
      (withMergedUrls.kinds[i] !== 'space' && withMergedUrls.kinds[i] !== 'preserved-space') ||
      withMergedUrls.kinds[i + 1] !== 'text' ||
      !containsArabicScript(withMergedUrls.texts[i + 1]!)
    ) {
      continue
    }

    withMergedUrls.texts[i] = split.space
    withMergedUrls.isWordLike[i] = false
    withMergedUrls.kinds[i] = withMergedUrls.kinds[i] === 'preserved-space' ? 'preserved-space' : 'space'
    withMergedUrls.texts[i + 1] = split.marks + withMergedUrls.texts[i + 1]!
    withMergedUrls.starts[i + 1] = withMergedUrls.starts[i]! + split.space.length
  }

  return withMergedUrls
}
