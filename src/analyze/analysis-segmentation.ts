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
import {
  getWordScanBuffers,
  getWordScanVerdict,
  scanAsciiWordSegments,
} from './analysis-word-scanner.js'

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
// non-'text' kind under any white-space profile; the exhaustive sync probe
// in tests/tui/analysis-ascii-split-differential.test.ts pins this contract.
export function isSegmentBreakCode(code: number): boolean {
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
  // One prepass computes both routing flags. \r is excluded from the fast
  // path because '\r\n' is a single grapheme while charCode iteration would
  // see two units.
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

type MergedPieceAccumulator = {
  texts: string[]
  textParts: (string[] | null)[]
  wordLike: boolean[]
  singleCharRunChars: (string | null)[]
  singleCharRunLengths: number[]
  containsCJK: boolean[]
  containsArabicScript: boolean[]
  endsWithClosingQuote: boolean[]
  endsWithMyanmarMedialGlue: boolean[]
  hasArabicNoSpacePunctuation: boolean[]
}

// Field semantics that must not drift: wordLike/containsCJK/
// containsArabicScript OR-accumulate, the ends-with flags overwrite, and
// hasArabicNoSpacePunctuation must read the post-OR Arabic flag together
// with the appended piece's last code point.
function appendPieceToMergedPrevious(
  merged: MergedPieceAccumulator,
  prevIndex: number,
  pieceText: string,
  pieceIsWordLike: boolean,
  pieceContainsCJK: boolean,
  pieceContainsArabicScript: boolean,
  pieceEndsWithClosingQuote: boolean,
  pieceEndsWithMyanmarMedialGlue: boolean,
  pieceLastCodePoint: string | null,
): void {
  if (merged.singleCharRunChars[prevIndex] !== null) {
    materializeDeferredSingleCharRun(
      merged.texts,
      merged.singleCharRunChars,
      merged.singleCharRunLengths,
      prevIndex,
    )
    merged.singleCharRunChars[prevIndex] = null
    merged.textParts[prevIndex] = null
  }
  // Parts arrays are created lazily: texts[prevIndex] holds the sole part
  // until a second part actually arrives here.
  let parts = merged.textParts[prevIndex]
  if (parts == null) {
    parts = [merged.texts[prevIndex]!]
    merged.textParts[prevIndex] = parts
  }
  parts.push(pieceText)
  merged.wordLike[prevIndex] = merged.wordLike[prevIndex]! || pieceIsWordLike
  merged.containsCJK[prevIndex] = merged.containsCJK[prevIndex]! || pieceContainsCJK
  merged.containsArabicScript[prevIndex] =
    merged.containsArabicScript[prevIndex]! || pieceContainsArabicScript
  merged.endsWithClosingQuote[prevIndex] = pieceEndsWithClosingQuote
  merged.endsWithMyanmarMedialGlue[prevIndex] = pieceEndsWithMyanmarMedialGlue
  merged.hasArabicNoSpacePunctuation[prevIndex] = hasArabicNoSpacePunctuation(
    merged.containsArabicScript[prevIndex]!,
    pieceLastCodePoint,
  )
}

type MergedSegmentationBuilder = MergedPieceAccumulator & {
  len: number
  kinds: SegmentBreakKind[]
  starts: number[]
}

// Per-segment consumption body shared by both word-segment sources (the
// probe-pinned ASCII scanner span driver and the whole-string Intl loop):
// break-kind split, then the first-pass merge branches. Behavior-frozen from
// the previously inlined buildMergedSegmentation loop body.
function appendWordSegmentPieces(
  builder: MergedSegmentationBuilder,
  profile: AnalysisProfile,
  whiteSpaceProfile: WhiteSpaceProfile,
  segText: string,
  segWordLike: boolean,
  segIndex: number,
): void {
  for (const piece of splitSegmentByBreakKind(segText, segWordLike, segIndex, whiteSpaceProfile)) {
    const isText = piece.kind === 'text'
    const pieceText = piece.text
    // All-ASCII pieces skip predicates whose character tables contain no
    // code point below 0x80 (CJK, Arabic script, Myanmar medial glue).
    // endsWithClosingQuote walks back through leftStickyPunctuation, which
    // has ASCII members, so it always runs; getLastCodePoint stays live
    // because arabicNoSpaceTrailingPunctuation includes ASCII ':' and '.'.
    let pieceAllAscii = true
    for (let i = 0; i < pieceText.length; i++) {
      if (pieceText.charCodeAt(i) >= 0x80) {
        pieceAllAscii = false
        break
      }
    }
    const repeatableSingleCharRunChar = getRepeatableSingleCharRunChar(pieceText, piece.isWordLike, piece.kind)
    const pieceContainsCJK = pieceAllAscii ? false : isCJK(pieceText)
    const pieceContainsArabicScript = pieceAllAscii ? false : containsArabicScript(pieceText)
    const pieceLastCodePoint = getLastCodePoint(pieceText)
    const pieceEndsWithClosingQuote = endsWithClosingQuote(pieceText)
    const pieceEndsWithMyanmarMedialGlue = pieceAllAscii ? false : endsWithMyanmarMedialGlue(pieceText)
    const prevIndex = builder.len - 1

    // First-pass keeps: no-space script-specific joins and punctuation glue
    // that depend on the immediately preceding text run. The branches only
    // pick an action; the single append call site sits after the chain.
    let appendToPrevious = false
    let forceWordLikeAfterAppend = false
    if (
      profile.carryCJKAfterClosingQuote &&
      isText &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      pieceContainsCJK &&
      builder.containsCJK[prevIndex] &&
      builder.endsWithClosingQuote[prevIndex]!
    ) {
      appendToPrevious = true
    } else if (
      isText &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      isCJKLineStartProhibitedSegment(pieceText) &&
      builder.containsCJK[prevIndex]
    ) {
      appendToPrevious = true
    } else if (
      isText &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      builder.endsWithMyanmarMedialGlue[prevIndex]
    ) {
      appendToPrevious = true
    } else if (
      isText &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      piece.isWordLike &&
      pieceContainsArabicScript &&
      builder.hasArabicNoSpacePunctuation[prevIndex]
    ) {
      appendToPrevious = true
      forceWordLikeAfterAppend = true
    } else if (
      repeatableSingleCharRunChar !== null &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      builder.singleCharRunChars[prevIndex] === repeatableSingleCharRunChar
    ) {
      builder.singleCharRunLengths[prevIndex] = (builder.singleCharRunLengths[prevIndex] ?? 1) + 1
    } else if (
      isText &&
      !piece.isWordLike &&
      builder.len > 0 &&
      builder.kinds[prevIndex] === 'text' &&
      !builder.containsCJK[prevIndex] &&
      (
        isLeftStickyPunctuationSegment(pieceText) ||
        (pieceText === '-' && builder.wordLike[prevIndex]!)
      )
    ) {
      appendToPrevious = true
    } else {
      const mergedLen = builder.len
      builder.texts[mergedLen] = pieceText
      builder.textParts[mergedLen] = null
      builder.wordLike[mergedLen] = piece.isWordLike
      builder.kinds[mergedLen] = piece.kind
      builder.starts[mergedLen] = piece.start
      builder.singleCharRunChars[mergedLen] = repeatableSingleCharRunChar
      builder.singleCharRunLengths[mergedLen] = repeatableSingleCharRunChar === null ? 0 : 1
      builder.containsCJK[mergedLen] = pieceContainsCJK
      builder.containsArabicScript[mergedLen] = pieceContainsArabicScript
      builder.endsWithClosingQuote[mergedLen] = pieceEndsWithClosingQuote
      builder.endsWithMyanmarMedialGlue[mergedLen] = pieceEndsWithMyanmarMedialGlue
      builder.hasArabicNoSpacePunctuation[mergedLen] = hasArabicNoSpacePunctuation(
        pieceContainsArabicScript,
        pieceLastCodePoint,
      )
      builder.len = mergedLen + 1
    }

    if (appendToPrevious) {
      appendPieceToMergedPrevious(
        builder,
        prevIndex,
        pieceText,
        piece.isWordLike,
        pieceContainsCJK,
        pieceContainsArabicScript,
        pieceEndsWithClosingQuote,
        pieceEndsWithMyanmarMedialGlue,
        pieceLastCodePoint,
      )
      if (forceWordLikeAfterAppend) {
        builder.wordLike[prevIndex] = true
      }
    }
  }
}

export function buildMergedSegmentation(
  normalized: string,
  profile: AnalysisProfile,
  whiteSpaceProfile: WhiteSpaceProfile,
): MergedSegmentation {
  const wordSegmenter = getLocaleWordSegmenter()
  const mergedTexts: string[] = []
  const mergedTextParts: (string[] | null)[] = []
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
  const builder: MergedSegmentationBuilder = {
    len: 0,
    texts: mergedTexts,
    textParts: mergedTextParts,
    wordLike: mergedWordLike,
    kinds: mergedKinds,
    starts: mergedStarts,
    singleCharRunChars: mergedSingleCharRunChars,
    singleCharRunLengths: mergedSingleCharRunLengths,
    containsCJK: mergedContainsCJK,
    containsArabicScript: mergedContainsArabicScript,
    endsWithClosingQuote: mergedEndsWithClosingQuote,
    endsWithMyanmarMedialGlue: mergedEndsWithMyanmarMedialGlue,
    hasArabicNoSpacePunctuation: mergedHasArabicNoSpacePunctuation,
  }

  const scanVerdict = getWordScanVerdict(wordSegmenter)
  if (scanVerdict.enabled) {
    // Span driver: partition at [\r\n] code units ('\r\n' pair one segment,
    // '\n' and lone '\r' one segment each, never word-like — emissions pinned
    // against the live segmenter by the probe battery). Pure-ASCII spans run
    // the probe-fitted scanner; any other span keeps the live segmenter with
    // index offsets. One charCode pass per span decides purity.
    const midBits = scanVerdict.midBits
    const wordLikeStatuses = scanVerdict.wordLikeStatuses
    const scanBuffers = getWordScanBuffers()
    const normalizedLength = normalized.length
    let cursor = 0
    while (cursor < normalizedLength) {
      let spanEnd = cursor
      let spanAllAscii = true
      while (spanEnd < normalizedLength) {
        const code = normalized.charCodeAt(spanEnd)
        if (code === 0x0a || code === 0x0d) break
        if (code >= 0x80) spanAllAscii = false
        spanEnd++
      }
      if (spanEnd > cursor) {
        if (spanAllAscii) {
          const segmentCount = scanAsciiWordSegments(normalized, cursor, spanEnd, midBits, wordLikeStatuses)
          const segmentStarts = scanBuffers.starts
          const segmentEnds = scanBuffers.ends
          const segmentWordLike = scanBuffers.wordLike
          for (let j = 0; j < segmentCount; j++) {
            const segStart = segmentStarts[j]!
            appendWordSegmentPieces(
              builder,
              profile,
              whiteSpaceProfile,
              normalized.slice(segStart, segmentEnds[j]!),
              segmentWordLike[j] === 1,
              segStart,
            )
          }
        } else {
          const spanText = cursor === 0 && spanEnd === normalizedLength
            ? normalized
            : normalized.slice(cursor, spanEnd)
          for (const s of wordSegmenter.segment(spanText)) {
            appendWordSegmentPieces(builder, profile, whiteSpaceProfile, s.segment, s.isWordLike ?? false, cursor + s.index)
          }
        }
      }
      if (spanEnd === normalizedLength) break
      let next = spanEnd + 1
      let newlineText = '\n'
      if (normalized.charCodeAt(spanEnd) === 0x0d) {
        if (next < normalizedLength && normalized.charCodeAt(next) === 0x0a) {
          next++
          newlineText = '\r\n'
        } else {
          newlineText = '\r'
        }
      }
      appendWordSegmentPieces(builder, profile, whiteSpaceProfile, newlineText, false, spanEnd)
      cursor = next
    }
  } else {
    // Disabled verdict (probe or verification mismatch on this segmenter
    // instance): the original whole-string Intl loop runs verbatim.
    for (const s of wordSegmenter.segment(normalized)) {
      appendWordSegmentPieces(builder, profile, whiteSpaceProfile, s.segment, s.isWordLike ?? false, s.index)
    }
  }

  const mergedLen = builder.len

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
    // Entries that never received an append keep their original single text.
    const parts = mergedTextParts[i]
    if (parts != null) {
      mergedTexts[i] = joinTextParts(parts)
    }
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
