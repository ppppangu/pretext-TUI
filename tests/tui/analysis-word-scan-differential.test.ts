// 补建说明：该文件为后续补建，用于把 probe 参数化 ASCII 词扫描器与活体 Intl.Segmenter 永久差分对拍：
// 断言门禁运行时上 verdict 必须 ENABLED（bun/ICU 升级若移动 ASCII 分词行为会在 CI 大声失败——
// 处置路径：先用本文件的结构化电池定位移动的形式，参数空间能表示则探测自动重拟合，不能表示则
// 扫描器自动禁用且本断言转红，需要人工重新评估参数空间或接受禁用并更新本断言），并覆盖结构化
// 电池（含跨类 mid 形式与 C0 控制字符硬化）、种子化 ASCII fuzz、混排内容 fuzz 与 locale 切换。
import { describe, expect, test } from 'bun:test'
import {
  __setWordScanVerdictForTesting,
  buildWordScanProbeCases,
  buildWordScanProbeCorpus,
  getWordScanVerdict,
  predictHybridWordSegments,
  type WordScanVerdict,
} from '../../src/analyze/analysis-word-scanner.js'
import {
  clearAnalysisCaches,
  DEFAULT_TERMINAL_ANALYSIS_PROFILE,
  setAnalysisLocale,
  type WhiteSpaceMode,
  type WordBreakMode,
} from '../../src/analyze/analysis-segmentation.js'
import { analyzeText } from '../../src/analyze/analysis-analyze.js'
import { getLocaleWordSegmenter } from '../../src/unicode/grapheme-segmenter.js'

const disabledVerdict: WordScanVerdict = { enabled: false }

function liveWordStream(segmenter: Intl.Segmenter, text: string): { starts: number[], ends: number[], wordLike: number[] } {
  const starts: number[] = []
  const ends: number[] = []
  const wordLike: number[] = []
  for (const s of segmenter.segment(text)) {
    starts.push(s.index)
    ends.push(s.index + s.segment.length)
    wordLike.push(s.isWordLike === true ? 1 : 0)
  }
  return { starts, ends, wordLike }
}

function expectHybridStreamEqualsLive(segmenter: Intl.Segmenter, verdict: WordScanVerdict, text: string, label: string): void {
  if (!verdict.enabled) throw new Error(`${label}: verdict unexpectedly disabled`)
  const predicted = predictHybridWordSegments(text, verdict.midBits, verdict.wordLikeStatuses)
  const live = liveWordStream(segmenter, text)
  const count = Math.min(predicted.starts.length, live.starts.length)
  for (let i = 0; i < count; i++) {
    if (
      predicted.starts[i] !== live.starts[i] ||
      predicted.ends[i] !== live.ends[i] ||
      predicted.wordLike[i] !== live.wordLike[i]
    ) {
      throw new Error(
        `${label}: segment ${i} diverges: ` +
        `live=[${live.starts[i]},${live.ends[i]})${live.wordLike[i]} ` +
        `${JSON.stringify(text.slice(live.starts[i]!, live.ends[i]!))} vs ` +
        `scanner=[${predicted.starts[i]},${predicted.ends[i]})${predicted.wordLike[i]} ` +
        `${JSON.stringify(text.slice(predicted.starts[i]!, predicted.ends[i]!))}`,
      )
    }
  }
  if (predicted.starts.length !== live.starts.length) {
    throw new Error(`${label}: segment count diverges: live=${live.starts.length} scanner=${predicted.starts.length}`)
  }
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1103515245 + 12345) >>> 0
    return state / 0x100000000
  }
}

function randomFrom(rng: () => number, pool: string): string {
  return pool[Math.floor(rng() * pool.length)]!
}

describe('analysis word scanner differential', () => {
  test('the scanner verdict is ENABLED on the gate runtime', () => {
    // If this turns red after an engine upgrade, ASCII word segmentation
    // moved underneath us: the probe either re-fitted (still enabled) or the
    // behavior left the parameter space (disabled). See the header for the
    // triage path; never weaken this assertion to "no-crash".
    const verdict = getWordScanVerdict(getLocaleWordSegmenter())
    expect(verdict.enabled).toBe(true)
  })

  test('a fresh segmenter instance re-probes automatically', () => {
    const before = getLocaleWordSegmenter()
    try {
      __setWordScanVerdictForTesting(before, disabledVerdict)
      expect(getWordScanVerdict(before).enabled).toBe(false)
      clearAnalysisCaches()
      const after = getLocaleWordSegmenter()
      expect(after).not.toBe(before)
      expect(getWordScanVerdict(after).enabled).toBe(true)
    } finally {
      __setWordScanVerdictForTesting(before, null)
    }
  })

  test('structured battery: hybrid stream equals live Intl on the composite corpus and every case', () => {
    const segmenter = getLocaleWordSegmenter()
    const verdict = getWordScanVerdict(segmenter)
    expect(verdict.enabled).toBe(true)
    // The composite probe corpus (designer battery + cross-class mid forms +
    // C0-control/DEL forms + span-driver newline emissions) plus every case
    // segmented standalone, so the '\n'-join protocol itself stays pinned.
    expectHybridStreamEqualsLive(segmenter, verdict, buildWordScanProbeCorpus(), 'composite corpus')
    for (const probeCase of buildWordScanProbeCases()) {
      expectHybridStreamEqualsLive(segmenter, verdict, probeCase, `case ${JSON.stringify(probeCase)}`)
    }
  })

  test('seeded fuzz: 2000+ random ASCII strings, hybrid stream equals whole-string Intl stream', () => {
    const segmenter = getLocaleWordSegmenter()
    const verdict = getWordScanVerdict(segmenter)
    expect(verdict.enabled).toBe(true)
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const pool =
      letters + letters + letters +
      '01234567890123456789' +
      '______' +
      ".,;:'.,;:'.,;:'" +
      '          ' +
      `"'"'"'` +
      '\n\n\n\r\t\t' +
      '!?-()[]{}@#$%^&*+=/\\<>|~`' +
      '\x00\x01\x1b\x1f\x7f\x0b\x0c'
    const rng = makeRng(0x5ca0)
    let totalLength = 0
    for (let round = 0; round < 2000; round++) {
      const length = 64 + Math.floor(rng() * 960)
      let text = ''
      for (let i = 0; i < length; i++) text += randomFrom(rng, pool)
      totalLength += text.length
      expectHybridStreamEqualsLive(segmenter, verdict, text, `fuzz round ${round}`)
    }
    expect(totalLength).toBeGreaterThan(512 * 1024)
  })

  test('mixed-content fuzz: analyzeText output is identical with the scanner enabled and force-disabled', () => {
    const segmenter = getLocaleWordSegmenter()
    const realVerdict = getWordScanVerdict(segmenter)
    expect(realVerdict.enabled).toBe(true)
    const asciiPool = "abcdefghijklmnopqrstuvwxyz0123456789_.,;:' \"!?-/()"
    const exoticPool = ['中', '文', '日', '本', '語', '한', '국', '🚀', '👍', '👨‍👩‍👧‍👦', '🇯🇵', 'é', 'x̀́', 'ä', '́', '⃣', '​', '­', ' ', '　']
    const rng = makeRng(0x31ced)
    try {
      for (let round = 0; round < 200; round++) {
        const lineCount = 1 + Math.floor(rng() * 8)
        const lines: string[] = []
        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
          let line = ''
          const chunkCount = 1 + Math.floor(rng() * 6)
          for (let chunk = 0; chunk < chunkCount; chunk++) {
            if (rng() < 0.55) {
              const span = 1 + Math.floor(rng() * 12)
              for (let i = 0; i < span; i++) line += randomFrom(rng, asciiPool)
            } else {
              const span = 1 + Math.floor(rng() * 4)
              for (let i = 0; i < span; i++) line += exoticPool[Math.floor(rng() * exoticPool.length)]!
            }
          }
          lines.push(line)
        }
        // Interleave non-ASCII content directly at newline boundaries.
        const joiner = rng() < 0.7 ? '\n' : '\r\n'
        const text = lines.join(joiner)
        const whiteSpace: WhiteSpaceMode = round % 2 === 0 ? 'pre-wrap' : 'normal'
        const wordBreak: WordBreakMode = round % 3 === 0 ? 'keep-all' : 'normal'
        __setWordScanVerdictForTesting(segmenter, realVerdict)
        const enabledOut = analyzeText(text, DEFAULT_TERMINAL_ANALYSIS_PROFILE, whiteSpace, wordBreak)
        __setWordScanVerdictForTesting(segmenter, disabledVerdict)
        const disabledOut = analyzeText(text, DEFAULT_TERMINAL_ANALYSIS_PROFILE, whiteSpace, wordBreak)
        expect(enabledOut).toEqual(disabledOut)
      }
    } finally {
      __setWordScanVerdictForTesting(segmenter, null)
    }
  })

  test('setAnalysisLocale re-probes per instance and stays output-identical either way', () => {
    const samples = [
      "tietokone: sana-analyysi 3.14 don't 1,000 x86_64 a_.b\nrivi kaksi  \tvälilyönti",
      'mixed 中文 fi-locale line\r\nsecond line with url https://example.test/a_b?x=1',
    ]
    try {
      setAnalysisLocale('fi')
      const fiSegmenter = getLocaleWordSegmenter()
      const fiVerdict = getWordScanVerdict(fiSegmenter)
      if (fiVerdict.enabled) {
        // Re-probe fitted fi parameters: they must reproduce the live fi
        // stream over the full battery, same as the default locale.
        expectHybridStreamEqualsLive(fiSegmenter, fiVerdict, buildWordScanProbeCorpus(), 'fi composite corpus')
      }
      // Enabled or disabled, the analyze output must match the force-disabled
      // path exactly under the fi locale.
      for (const text of samples) {
        for (const whiteSpace of ['normal', 'pre-wrap'] as const) {
          __setWordScanVerdictForTesting(fiSegmenter, fiVerdict)
          const probedOut = analyzeText(text, DEFAULT_TERMINAL_ANALYSIS_PROFILE, whiteSpace)
          __setWordScanVerdictForTesting(fiSegmenter, disabledVerdict)
          const disabledOut = analyzeText(text, DEFAULT_TERMINAL_ANALYSIS_PROFILE, whiteSpace)
          __setWordScanVerdictForTesting(fiSegmenter, null)
          expect(probedOut).toEqual(disabledOut)
        }
      }
    } finally {
      setAnalysisLocale(undefined)
    }
  })
})
