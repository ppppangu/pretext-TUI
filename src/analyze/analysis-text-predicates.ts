// 补建说明：该文件为 R1 重构从 analysis.ts 拆出，集中字符级判定与 CJK/kinsoku 标点表（isCJK、kinsoku、sticky punctuation、码点辅助），不改变任何判定逻辑；当前进度：行为冻结迁移，保持 release gate 与 golden 字节一致。
import type { SegmentBreakKind } from './analysis-segmentation.js'

const arabicScriptRe = /\p{Script=Arabic}/u
export const combiningMarkRe = /\p{M}/u
const decimalDigitRe = /\p{Nd}/u

export function containsArabicScript(text: string): boolean {
  return arabicScriptRe.test(text)
}

function isCJKCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4E00 && codePoint <= 0x9FFF) ||
    (codePoint >= 0x3400 && codePoint <= 0x4DBF) ||
    (codePoint >= 0x20000 && codePoint <= 0x2A6DF) ||
    (codePoint >= 0x2A700 && codePoint <= 0x2B73F) ||
    (codePoint >= 0x2B740 && codePoint <= 0x2B81F) ||
    (codePoint >= 0x2B820 && codePoint <= 0x2CEAF) ||
    (codePoint >= 0x2CEB0 && codePoint <= 0x2EBEF) ||
    (codePoint >= 0x2EBF0 && codePoint <= 0x2EE5D) ||
    (codePoint >= 0x2F800 && codePoint <= 0x2FA1F) ||
    (codePoint >= 0x30000 && codePoint <= 0x3134F) ||
    (codePoint >= 0x31350 && codePoint <= 0x323AF) ||
    (codePoint >= 0x323B0 && codePoint <= 0x33479) ||
    (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
    (codePoint >= 0x3000 && codePoint <= 0x303F) ||
    (codePoint >= 0x3040 && codePoint <= 0x309F) ||
    (codePoint >= 0x30A0 && codePoint <= 0x30FF) ||
    (codePoint >= 0x3130 && codePoint <= 0x318F) ||
    (codePoint >= 0xAC00 && codePoint <= 0xD7AF) ||
    (codePoint >= 0xFF00 && codePoint <= 0xFFEF)
  )
}

export function isCJK(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const first = s.charCodeAt(i)
    if (first < 0x3000) continue

    if (first >= 0xD800 && first <= 0xDBFF && i + 1 < s.length) {
      const second = s.charCodeAt(i + 1)
      if (second >= 0xDC00 && second <= 0xDFFF) {
        const codePoint = ((first - 0xD800) << 10) + (second - 0xDC00) + 0x10000
        if (isCJKCodePoint(codePoint)) return true
        i++
        continue
      }
    }

    if (isCJKCodePoint(first)) return true
  }
  return false
}

function endsWithLineStartProhibitedText(text: string): boolean {
  const last = getLastCodePoint(text)
  return last !== null && (kinsokuStart.has(last) || leftStickyPunctuation.has(last))
}

const keepAllGlueChars = new Set([
  ' ',
  ' ',
  '⁠',
  '﻿',
])

const keepAllDashBreakChars = new Set([
  '-',
  '‐',
  '–',
  '—',
])

export function containsCJKText(text: string): boolean {
  return isCJK(text)
}

function endsWithKeepAllGlueText(text: string): boolean {
  const last = getLastCodePoint(text)
  return last !== null && keepAllGlueChars.has(last)
}

function endsWithKeepAllDashBreakText(text: string): boolean {
  const last = getLastCodePoint(text)
  return last !== null && keepAllDashBreakChars.has(last)
}

export function canContinueKeepAllTextRun(previousText: string, breakAfterPunctuation: boolean): boolean {
  if (endsWithKeepAllGlueText(previousText)) return false
  if (!breakAfterPunctuation) return true
  if (endsWithLineStartProhibitedText(previousText)) return false
  if (endsWithKeepAllDashBreakText(previousText)) return false
  return true
}

export const kinsokuStart = new Set([
  '，',
  '．',
  '！',
  '：',
  '；',
  '？',
  '、',
  '。',
  '・',
  '）',
  '〕',
  '〉',
  '》',
  '」',
  '』',
  '】',
  '〗',
  '〙',
  '〛',
  'ー',
  '々',
  '〻',
  'ゝ',
  'ゞ',
  'ヽ',
  'ヾ',
])

export const kinsokuEnd = new Set([
  '"',
  '(', '[', '{',
  '“', '‘', '«', '‹',
  '（',
  '〔',
  '〈',
  '《',
  '「',
  '『',
  '【',
  '〖',
  '〘',
  '〚',
])

export const forwardStickyGlue = new Set([
  "'", '’',
])

export const leftStickyPunctuation = new Set([
  '.', ',', '!', '?', ':', ';',
  '،',
  '؛',
  '؟',
  '।',
  '॥',
  '၊',
  '။',
  '၌',
  '၍',
  '၏',
  ')', ']', '}',
  '%',
  '"',
  '”', '’', '»', '›',
  '…',
])

const arabicNoSpaceTrailingPunctuation = new Set([
  ':',
  '.',
  '،',
  '؛',
])

const myanmarMedialGlue = new Set([
  '၏',
])

const closingQuoteChars = new Set([
  '”', '’', '»', '›',
  '」',
  '』',
  '】',
  '》',
  '〉',
  '〕',
  '）',
])

function previousCodePointStart(text: string, end: number): number {
  const last = end - 1
  if (last <= 0) return Math.max(last, 0)

  const lastCodeUnit = text.charCodeAt(last)
  if (lastCodeUnit < 0xDC00 || lastCodeUnit > 0xDFFF) return last

  const maybeHigh = last - 1
  if (maybeHigh < 0) return last

  const highCodeUnit = text.charCodeAt(maybeHigh)
  return highCodeUnit >= 0xD800 && highCodeUnit <= 0xDBFF ? maybeHigh : last
}

export function getLastCodePoint(text: string): string | null {
  if (text.length === 0) return null
  const start = previousCodePointStart(text, text.length)
  return text.slice(start)
}

export function splitTrailingForwardStickyCluster(text: string): { head: string, tail: string } | null {
  const chars = Array.from(text)
  let splitIndex = chars.length

  while (splitIndex > 0) {
    const ch = chars[splitIndex - 1]!
    if (combiningMarkRe.test(ch)) {
      splitIndex--
      continue
    }
    if (kinsokuEnd.has(ch) || forwardStickyGlue.has(ch)) {
      splitIndex--
      continue
    }
    break
  }

  if (splitIndex <= 0 || splitIndex === chars.length) return null
  return {
    head: chars.slice(0, splitIndex).join(''),
    tail: chars.slice(splitIndex).join(''),
  }
}

export function getRepeatableSingleCharRunChar(
  text: string,
  isWordLike: boolean,
  kind: SegmentBreakKind,
): string | null {
  return kind === 'text' && !isWordLike && text.length === 1 && text !== '-' && text !== '—'
    ? text
    : null
}

export function materializeDeferredSingleCharRun(
  texts: string[],
  chars: (string | null)[],
  lengths: number[],
  index: number,
): string {
  const ch = chars[index]
  const text = texts[index]!
  if (ch == null) return text

  const length = lengths[index]!
  if (text.length === length) return text

  const materialized = ch.repeat(length)
  texts[index] = materialized
  return materialized
}

export function hasArabicNoSpacePunctuation(
  containsArabic: boolean,
  lastCodePoint: string | null,
): boolean {
  return containsArabic && lastCodePoint !== null && arabicNoSpaceTrailingPunctuation.has(lastCodePoint)
}

export function endsWithMyanmarMedialGlue(segment: string): boolean {
  const lastCodePoint = getLastCodePoint(segment)
  return lastCodePoint !== null && myanmarMedialGlue.has(lastCodePoint)
}

export function endsWithClosingQuote(text: string): boolean {
  let end = text.length
  while (end > 0) {
    const start = previousCodePointStart(text, end)
    const ch = text.slice(start, end)
    if (closingQuoteChars.has(ch)) return true
    if (!leftStickyPunctuation.has(ch)) return false
    end = start
  }
  return false
}

const numericJoinerChars = new Set([
  ':', '-', '/', '×', ',', '.', '+',
  '–',
  '—',
])

export function segmentContainsDecimalDigit(text: string): boolean {
  return decimalDigitRe.test(text)
}

export function isNumericRunSegment(text: string): boolean {
  if (text.length === 0) return false
  for (const ch of text) {
    if (decimalDigitRe.test(ch) || numericJoinerChars.has(ch)) continue
    return false
  }
  return true
}

export function joinTextParts(parts: string[]): string {
  return parts.length === 1 ? parts[0]! : parts.join('')
}

export function isTextRunBoundary(kind: SegmentBreakKind): boolean {
  return kind !== 'text'
}
