// 补建说明：该文件为 R1 重构从 analysis.ts 拆出，集中 URL/数字/ASCII 链/glue 合并与 keep-all、grapheme-continuation、CJK 边界 carry 等段流后处理规则；当前进度：行为冻结迁移。
import {
  containsCJKText,
  isCJK,
  isNumericRunSegment,
  isTextRunBoundary,
  joinTextParts,
  segmentContainsDecimalDigit,
  splitTrailingForwardStickyCluster,
} from './analysis-text-predicates.js'
import { groupKeepAllRuns } from './analysis-keep-all.js'
import type { MergedSegmentation, SegmentBreakKind, WhiteSpaceProfile } from './analysis-segmentation.js'

export type AnalysisChunk = {
  startSegmentIndex: number
  endSegmentIndex: number
  consumedEndSegmentIndex: number
}

export type TextAnalysis = { normalized: string, chunks: AnalysisChunk[] } & MergedSegmentation

const urlSchemeSegmentRe = /^[A-Za-z][A-Za-z0-9+.-]*:$/

function isUrlLikeRunStart(segmentation: MergedSegmentation, index: number): boolean {
  const text = segmentation.texts[index]!
  if (text.startsWith('www.')) return true
  return (
    urlSchemeSegmentRe.test(text) &&
    index + 1 < segmentation.len &&
    segmentation.kinds[index + 1] === 'text' &&
    segmentation.texts[index + 1] === '//'
  )
}

function isUrlQueryBoundarySegment(text: string): boolean {
  return text.includes('?') && (text.includes('://') || text.startsWith('www.'))
}

export function mergeUrlLikeRuns(segmentation: MergedSegmentation): MergedSegmentation {
  const texts = segmentation.texts.slice()
  const isWordLike = segmentation.isWordLike.slice()
  const kinds = segmentation.kinds.slice()
  const starts = segmentation.starts.slice()

  for (let i = 0; i < segmentation.len; i++) {
    if (kinds[i] !== 'text' || !isUrlLikeRunStart(segmentation, i)) continue

    const mergedParts = [texts[i]!]
    let j = i + 1
    while (j < segmentation.len && !isTextRunBoundary(kinds[j]!)) {
      mergedParts.push(texts[j]!)
      isWordLike[i] = true
      const endsQueryPrefix = texts[j]!.includes('?')
      kinds[j] = 'text'
      texts[j] = ''
      j++
      if (endsQueryPrefix) break
    }
    texts[i] = joinTextParts(mergedParts)
  }

  let compactLen = 0
  for (let read = 0; read < texts.length; read++) {
    const text = texts[read]!
    if (text.length === 0) continue
    if (compactLen !== read) {
      texts[compactLen] = text
      isWordLike[compactLen] = isWordLike[read]!
      kinds[compactLen] = kinds[read]!
      starts[compactLen] = starts[read]!
    }
    compactLen++
  }

  texts.length = compactLen
  isWordLike.length = compactLen
  kinds.length = compactLen
  starts.length = compactLen

  return {
    len: compactLen,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function mergeUrlQueryRuns(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  for (let i = 0; i < segmentation.len; i++) {
    const text = segmentation.texts[i]!
    texts.push(text)
    isWordLike.push(segmentation.isWordLike[i]!)
    kinds.push(segmentation.kinds[i]!)
    starts.push(segmentation.starts[i]!)

    if (!isUrlQueryBoundarySegment(text)) continue

    const nextIndex = i + 1
    if (
      nextIndex >= segmentation.len ||
      isTextRunBoundary(segmentation.kinds[nextIndex]!)
    ) {
      continue
    }

    const queryParts: string[] = []
    const queryStart = segmentation.starts[nextIndex]!
    let j = nextIndex
    while (j < segmentation.len && !isTextRunBoundary(segmentation.kinds[j]!)) {
      queryParts.push(segmentation.texts[j]!)
      j++
    }

    if (queryParts.length > 0) {
      texts.push(joinTextParts(queryParts))
      isWordLike.push(true)
      kinds.push('text')
      starts.push(queryStart)
      i = j - 1
    }
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

const asciiPunctuationChainSegmentRe = /^[A-Za-z0-9_]+[.,:;]*$/
const asciiPunctuationChainTrailingJoinersRe = /[.,:;]+$/

export function mergeNumericRuns(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  for (let i = 0; i < segmentation.len; i++) {
    const text = segmentation.texts[i]!
    const kind = segmentation.kinds[i]!

    if (kind === 'text' && isNumericRunSegment(text) && segmentContainsDecimalDigit(text)) {
      const mergedParts = [text]
      let j = i + 1
      while (
        j < segmentation.len &&
        segmentation.kinds[j] === 'text' &&
        isNumericRunSegment(segmentation.texts[j]!)
      ) {
        mergedParts.push(segmentation.texts[j]!)
        j++
      }

      texts.push(joinTextParts(mergedParts))
      isWordLike.push(true)
      kinds.push('text')
      starts.push(segmentation.starts[i]!)
      i = j - 1
      continue
    }

    texts.push(text)
    isWordLike.push(segmentation.isWordLike[i]!)
    kinds.push(kind)
    starts.push(segmentation.starts[i]!)
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function mergeAsciiPunctuationChains(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  for (let i = 0; i < segmentation.len; i++) {
    const text = segmentation.texts[i]!
    const kind = segmentation.kinds[i]!
    const wordLike = segmentation.isWordLike[i]!

    if (kind === 'text' && wordLike && asciiPunctuationChainSegmentRe.test(text)) {
      const mergedParts = [text]
      let endsWithJoiners = asciiPunctuationChainTrailingJoinersRe.test(text)
      let j = i + 1

      while (
        endsWithJoiners &&
        j < segmentation.len &&
        segmentation.kinds[j] === 'text' &&
        segmentation.isWordLike[j] &&
        asciiPunctuationChainSegmentRe.test(segmentation.texts[j]!)
      ) {
        const nextText = segmentation.texts[j]!
        mergedParts.push(nextText)
        endsWithJoiners = asciiPunctuationChainTrailingJoinersRe.test(nextText)
        j++
      }

      texts.push(joinTextParts(mergedParts))
      isWordLike.push(true)
      kinds.push('text')
      starts.push(segmentation.starts[i]!)
      i = j - 1
      continue
    }

    texts.push(text)
    isWordLike.push(wordLike)
    kinds.push(kind)
    starts.push(segmentation.starts[i]!)
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function splitHyphenatedNumericRuns(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  for (let i = 0; i < segmentation.len; i++) {
    const text = segmentation.texts[i]!
    if (segmentation.kinds[i] === 'text' && text.includes('-')) {
      const parts = text.split('-')
      let shouldSplit = parts.length > 1
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j]!
        if (!shouldSplit) break
        if (
          part.length === 0 ||
          !segmentContainsDecimalDigit(part) ||
          !isNumericRunSegment(part)
        ) {
          shouldSplit = false
        }
      }

      if (shouldSplit) {
        let offset = 0
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j]!
          const splitText = j < parts.length - 1 ? `${part}-` : part
          texts.push(splitText)
          isWordLike.push(true)
          kinds.push('text')
          starts.push(segmentation.starts[i]! + offset)
          offset += splitText.length
        }
        continue
      }
    }

    texts.push(text)
    isWordLike.push(segmentation.isWordLike[i]!)
    kinds.push(segmentation.kinds[i]!)
    starts.push(segmentation.starts[i]!)
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function mergeGlueConnectedTextRuns(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  let read = 0
  while (read < segmentation.len) {
    const textParts = [segmentation.texts[read]!]
    let wordLike = segmentation.isWordLike[read]!
    let kind = segmentation.kinds[read]!
    let start = segmentation.starts[read]!

    if (kind === 'glue') {
      const glueParts = [textParts[0]!]
      const glueStart = start
      read++
      while (read < segmentation.len && segmentation.kinds[read] === 'glue') {
        glueParts.push(segmentation.texts[read]!)
        read++
      }
      const glueText = joinTextParts(glueParts)

      if (read < segmentation.len && segmentation.kinds[read] === 'text') {
        textParts[0] = glueText
        textParts.push(segmentation.texts[read]!)
        wordLike = segmentation.isWordLike[read]!
        kind = 'text'
        start = glueStart
        read++
      } else {
        texts.push(glueText)
        isWordLike.push(false)
        kinds.push('glue')
        starts.push(glueStart)
        continue
      }
    } else {
      read++
    }

    if (kind === 'text') {
      while (read < segmentation.len && segmentation.kinds[read] === 'glue') {
        const glueParts: string[] = []
        while (read < segmentation.len && segmentation.kinds[read] === 'glue') {
          glueParts.push(segmentation.texts[read]!)
          read++
        }
        const glueText = joinTextParts(glueParts)

        if (read < segmentation.len && segmentation.kinds[read] === 'text') {
          textParts.push(glueText, segmentation.texts[read]!)
          wordLike = wordLike || segmentation.isWordLike[read]!
          read++
          continue
        }

        textParts.push(glueText)
      }
    }

    texts.push(joinTextParts(textParts))
    isWordLike.push(wordLike)
    kinds.push(kind)
    starts.push(start)
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function carryTrailingForwardStickyAcrossCJKBoundary(segmentation: MergedSegmentation): MergedSegmentation {
  const texts = segmentation.texts.slice()
  const isWordLike = segmentation.isWordLike.slice()
  const kinds = segmentation.kinds.slice()
  const starts = segmentation.starts.slice()

  for (let i = 0; i < texts.length - 1; i++) {
    if (kinds[i] !== 'text' || kinds[i + 1] !== 'text') continue
    if (!isCJK(texts[i]!) || !isCJK(texts[i + 1]!)) continue

    const split = splitTrailingForwardStickyCluster(texts[i]!)
    if (split === null) continue

    texts[i] = split.head
    texts[i + 1] = split.tail + texts[i + 1]!
    starts[i + 1] = starts[i]! + split.head.length
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

export function compileAnalysisChunks(segmentation: MergedSegmentation, whiteSpaceProfile: WhiteSpaceProfile): AnalysisChunk[] {
  if (segmentation.len === 0) return []
  if (!whiteSpaceProfile.preserveHardBreaks) {
    return [{
      startSegmentIndex: 0,
      endSegmentIndex: segmentation.len,
      consumedEndSegmentIndex: segmentation.len,
    }]
  }

  const chunks: AnalysisChunk[] = []
  let startSegmentIndex = 0

  for (let i = 0; i < segmentation.len; i++) {
    if (segmentation.kinds[i] !== 'hard-break') continue

    chunks.push({
      startSegmentIndex,
      endSegmentIndex: i,
      consumedEndSegmentIndex: i + 1,
    })
    startSegmentIndex = i + 1
  }

  if (startSegmentIndex < segmentation.len) {
    chunks.push({
      startSegmentIndex,
      endSegmentIndex: segmentation.len,
      consumedEndSegmentIndex: segmentation.len,
    })
  }

  return chunks
}

export function mergeKeepAllTextSegments(
  normalized: string,
  segmentation: MergedSegmentation,
  breakAfterPunctuation: boolean,
): MergedSegmentation {
  if (segmentation.len <= 1) return segmentation

  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  function pushOriginalText(index: number): void {
    texts.push(segmentation.texts[index]!)
    isWordLike.push(segmentation.isWordLike[index]!)
    kinds.push('text')
    starts.push(segmentation.starts[index]!)
  }

  function pushMergedText(start: number, end: number): void {
    let wordLike = false

    for (let i = start; i < end; i++) {
      wordLike = wordLike || segmentation.isWordLike[i]!
    }

    const sourceStart = segmentation.starts[start]!
    const sourceEnd = end < segmentation.len ? segmentation.starts[end]! : normalized.length
    texts.push(normalized.slice(sourceStart, sourceEnd))
    isWordLike.push(wordLike)
    kinds.push('text')
    starts.push(sourceStart)
  }

  // Drive the shared keep-all grouping over each maximal contiguous text run;
  // non-text segments break the run and pass through unchanged.
  let i = 0
  while (i < segmentation.len) {
    if (segmentation.kinds[i] !== 'text') {
      texts.push(segmentation.texts[i]!)
      isWordLike.push(segmentation.isWordLike[i]!)
      kinds.push(segmentation.kinds[i]!)
      starts.push(segmentation.starts[i]!)
      i++
      continue
    }

    const runStart = i
    while (i < segmentation.len && segmentation.kinds[i] === 'text') i++
    const runEnd = i

    groupKeepAllRuns(
      runEnd - runStart,
      (index) => segmentation.texts[runStart + index]!,
      (index) => containsCJKText(segmentation.texts[runStart + index]!),
      breakAfterPunctuation,
      (index) => pushOriginalText(runStart + index),
      (start, end) => pushMergedText(runStart + start, runStart + end),
    )
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}

const leadingGraphemeContinuationRe = /^[\p{M}\uFE00-\uFE0F\u20E3]/u

export function mergeLeadingGraphemeContinuations(segmentation: MergedSegmentation): MergedSegmentation {
  const texts: string[] = []
  const isWordLike: boolean[] = []
  const kinds: SegmentBreakKind[] = []
  const starts: number[] = []

  for (let i = 0; i < segmentation.len; i++) {
    const text = segmentation.texts[i]!
    const kind = segmentation.kinds[i]!
    const previousIndex = texts.length - 1
    if (
      kind === 'text' &&
      previousIndex >= 0 &&
      kinds[previousIndex] === 'text' &&
      leadingGraphemeContinuationRe.test(text)
    ) {
      texts[previousIndex] += text
      isWordLike[previousIndex] = isWordLike[previousIndex] || segmentation.isWordLike[i]!
      continue
    }

    texts.push(text)
    isWordLike.push(segmentation.isWordLike[i]!)
    kinds.push(kind)
    starts.push(segmentation.starts[i]!)
  }

  return {
    len: texts.length,
    texts,
    isWordLike,
    kinds,
    starts,
  }
}
