// 补建说明：该文件为后续补建，用于把 splitSegmentByBreakKind 的 ASCII charCode 快路与 Intl.Segmenter 字素参考路径做永久差分对拍，防止快路语义漂移；当前进度：首版覆盖确定性随机语料与边界用例。
import { describe, expect, test } from 'bun:test'
import {
  classifySegmentBreakCode,
  getWhiteSpaceProfile,
  isSegmentBreakCode,
  splitSegmentByBreakKind,
  type SegmentBreakKind,
  type WhiteSpaceProfile,
} from '../../src/analyze/analysis-segmentation.js'

type Piece = {
  text: string
  isWordLike: boolean
  kind: SegmentBreakKind
  start: number
}

// 参考实现：与历史字素路径逐行同构（Intl.Segmenter 字素迭代 + 同一分类器），
// 作为可执行规范；运行时实现必须对任意输入与其完全一致。
function referenceSplit(
  segment: string,
  isWordLike: boolean,
  start: number,
  whiteSpaceProfile: WhiteSpaceProfile,
): Piece[] {
  const pieces: Piece[] = []
  let currentKind: SegmentBreakKind | null = null
  let currentText = ''
  let currentStart = start
  let currentWordLike = false
  let offset = 0

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment: grapheme } of segmenter.segment(segment)) {
    const kind = grapheme.length === 1
      ? classifySegmentBreakCode(grapheme.charCodeAt(0), whiteSpaceProfile)
      : 'text'
    const wordLike = kind === 'text' && isWordLike

    if (currentKind !== null && kind === currentKind && wordLike === currentWordLike) {
      currentText += grapheme
      offset += grapheme.length
      continue
    }
    if (currentKind !== null) {
      pieces.push({ text: currentText, isWordLike: currentWordLike, kind: currentKind, start: currentStart })
    }
    currentKind = kind
    currentText = grapheme
    currentStart = start + offset
    currentWordLike = wordLike
    offset += grapheme.length
  }
  if (currentKind !== null) {
    pieces.push({ text: currentText, isWordLike: currentWordLike, kind: currentKind, start: currentStart })
  }
  if (pieces.length === 0 || pieces.every(p => p.kind === 'text')) {
    // 历史路径对不含 break 字符的段走单片早退；参考实现必须保持同一形状。
    let hasBreakChar = false
    for (let i = 0; i < segment.length; i++) {
      if (classifySegmentBreakCode(segment.charCodeAt(i), whiteSpaceProfile) !== 'text') {
        hasBreakChar = true
        break
      }
    }
    if (!hasBreakChar) {
      return [{ text: segment, isWordLike, kind: 'text', start }]
    }
  }
  return pieces
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1103515245 + 12345) >>> 0
    return state / 0x100000000
  }
}

const asciiPool = 'abcXYZ019 .,:;!?-_\'"\t\n/\\()#@'
const mixedPool = `${asciiPool} ­​ ⁠﻿\r中文日本語한🚀é́`

function randomString(rng: () => number, pool: string, maxLen: number): string {
  const len = Math.floor(rng() * maxLen)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += pool[Math.floor(rng() * pool.length)]!
  }
  return out
}

const edgeCases = [
  '',
  ' ',
  'x',
  '   ',
  '\t\t',
  'a b\tc\nd',
  'a­b',
  '​​',
  ' x y⁠z﻿',
  'a\r\nb',
  '\rx',
  'r\r',
  'mixed 中文 a b',
  '🚀 x',
  'é combine',
  'word'.repeat(20),
  ' '.repeat(40),
]

const profiles: Array<['normal' | 'pre-wrap', WhiteSpaceProfile]> = [
  ['normal', getWhiteSpaceProfile('normal')],
  ['pre-wrap', getWhiteSpaceProfile('pre-wrap')],
]

describe('splitSegmentByBreakKind differential', () => {
  test('isSegmentBreakCode is exactly the union of non-text classifications over all profiles', () => {
    const normal = getWhiteSpaceProfile('normal')
    const preWrap = getWhiteSpaceProfile('pre-wrap')
    for (let code = 0; code <= 0xffff; code++) {
      const classifiesNonText =
        classifySegmentBreakCode(code, normal) !== 'text' ||
        classifySegmentBreakCode(code, preWrap) !== 'text'
      if (isSegmentBreakCode(code) !== classifiesNonText) {
        throw new Error(
          `isSegmentBreakCode desync at U+${code.toString(16).toUpperCase()}: ` +
          `set=${isSegmentBreakCode(code)} classifier=${classifiesNonText}`,
        )
      }
    }
  })

  test('matches the grapheme reference on edge cases', () => {
    for (const [, profile] of profiles) {
      for (const isWordLike of [true, false]) {
        for (const text of edgeCases) {
          expect(splitSegmentByBreakKind(text, isWordLike, 7, profile)).toEqual(
            referenceSplit(text, isWordLike, 7, profile),
          )
        }
      }
    }
  })

  test('matches the grapheme reference on deterministic random corpora', () => {
    const rng = makeRng(0x5eed)
    for (let round = 0; round < 1500; round++) {
      const pool = round % 3 === 0 ? mixedPool : asciiPool
      const text = randomString(rng, pool, 48)
      const start = Math.floor(rng() * 1000)
      const isWordLike = rng() < 0.5
      const profile = profiles[round % 2]![1]
      expect(splitSegmentByBreakKind(text, isWordLike, start, profile)).toEqual(
        referenceSplit(text, isWordLike, start, profile),
      )
    }
  })
})
