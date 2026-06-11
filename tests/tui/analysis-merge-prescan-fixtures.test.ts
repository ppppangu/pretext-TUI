// 补建说明：该文件为后续补建，用于机械化锁定 analysis-merge-rules 九个合并 pass 的 applicability 预扫描：
// 预扫描跳过时按引用返回输入对象，因此每个 pass 同时断言两个方向——firing fixture 必须产生新对象且
// 变换结果逐数组钉死（证明预扫描未错误跳过），near-miss skip fixture 必须按引用返回输入（证明预扫描
// 未错误触发）；另含 0x00..0x7F 全量探测，钉死 analysis-segmentation.ts all-ASCII 短路的谓词前提。
import { describe, expect, test } from 'bun:test'
import {
  carryTrailingForwardStickyAcrossCJKBoundary,
  mergeAsciiPunctuationChains,
  mergeGlueConnectedTextRuns,
  mergeKeepAllTextSegments,
  mergeLeadingGraphemeContinuations,
  mergeNumericRuns,
  mergeUrlLikeRuns,
  mergeUrlQueryRuns,
  splitHyphenatedNumericRuns,
} from '../../src/analyze/analysis-merge-rules.js'
import {
  containsArabicScript,
  endsWithMyanmarMedialGlue,
  isCJK,
} from '../../src/analyze/analysis-text-predicates.js'
import type { MergedSegmentation, SegmentBreakKind } from '../../src/analyze/analysis-segmentation.js'

type SegmentRow = [text: string, kind: SegmentBreakKind, isWordLike: boolean, start: number]

function buildSegmentation(rows: SegmentRow[]): MergedSegmentation {
  return {
    len: rows.length,
    texts: rows.map(row => row[0]),
    isWordLike: rows.map(row => row[2]),
    kinds: rows.map(row => row[1]),
    starts: rows.map(row => row[3]),
  }
}

// firing 方向：输出必须是新对象（预扫描触发）且与钉死的期望数组完全一致。
function expectFires(
  pass: (segmentation: MergedSegmentation) => MergedSegmentation,
  inputRows: SegmentRow[],
  expectedRows: SegmentRow[],
): void {
  const input = buildSegmentation(inputRows)
  const output = pass(input)
  expect(output).not.toBe(input)
  expect(output).toEqual(buildSegmentation(expectedRows))
}

// skip 方向：预扫描跳过必须按引用返回输入对象本身。
function expectSkips(
  pass: (segmentation: MergedSegmentation) => MergedSegmentation,
  inputRows: SegmentRow[],
): void {
  const input = buildSegmentation(inputRows)
  expect(pass(input)).toBe(input)
}

describe('mergeUrlLikeRuns prescan fixtures', () => {
  test('fires on a www.-prefixed run and stops at a non-text boundary', () => {
    expectFires(mergeUrlLikeRuns, [
      ['www.', 'text', false, 0],
      ['example', 'text', true, 4],
      ['.', 'text', false, 11],
      ['com', 'text', true, 12],
      [' ', 'space', false, 15],
      ['site', 'text', true, 16],
    ], [
      ['www.example.com', 'text', true, 0],
      [' ', 'space', false, 15],
      ['site', 'text', true, 16],
    ])
  })

  test('fires on a scheme segment followed by a "//" text segment', () => {
    expectFires(mergeUrlLikeRuns, [
      ['https:', 'text', true, 0],
      ['//', 'text', false, 6],
      ['example.com', 'text', true, 8],
    ], [
      ['https://example.com', 'text', true, 0],
    ])
  })

  test('fires and stops merging after a query-prefix ("?") segment', () => {
    expectFires(mergeUrlLikeRuns, [
      ['www.', 'text', false, 0],
      ['a?b', 'text', true, 4],
      ['tail', 'text', true, 7],
    ], [
      ['www.a?b', 'text', true, 0],
      ['tail', 'text', true, 7],
    ])
  })

  test('skips when "www." sits in a non-text kind', () => {
    expectSkips(mergeUrlLikeRuns, [
      ['www.', 'glue', false, 0],
      ['x', 'text', true, 4],
    ])
  })

  test('skips a scheme segment not followed by "//"', () => {
    expectSkips(mergeUrlLikeRuns, [
      ['https:', 'text', true, 0],
      ['example', 'text', true, 6],
    ])
  })
})

describe('mergeUrlQueryRuns prescan fixtures', () => {
  test('fires after a "://"-style query boundary and merges the query run', () => {
    expectFires(mergeUrlQueryRuns, [
      ['https://e.com?', 'text', true, 0],
      ['q', 'text', true, 14],
      ['=', 'text', false, 15],
      ['1', 'text', true, 16],
      [' ', 'space', false, 17],
      ['after', 'text', true, 18],
    ], [
      ['https://e.com?', 'text', true, 0],
      ['q=1', 'text', true, 14],
      [' ', 'space', false, 17],
      ['after', 'text', true, 18],
    ])
  })

  test('fires after a "www."-style query boundary', () => {
    expectFires(mergeUrlQueryRuns, [
      ['www.e.com?', 'text', true, 0],
      ['a', 'text', false, 10],
      ['b', 'text', true, 11],
    ], [
      ['www.e.com?', 'text', true, 0],
      ['ab', 'text', true, 10],
    ])
  })

  test('skips a "?" segment without a "://" or "www." marker', () => {
    expectSkips(mergeUrlQueryRuns, [
      ['e.com?', 'text', true, 0],
      ['q', 'text', true, 6],
    ])
  })

  test('skips a URL-marked segment without a "?"', () => {
    expectSkips(mergeUrlQueryRuns, [
      ['https://e.com', 'text', true, 0],
      ['q', 'text', true, 13],
    ])
  })
})

describe('mergeNumericRuns prescan fixtures', () => {
  test('fires on a digit-bearing numeric run and absorbs joiner-only neighbors', () => {
    expectFires(mergeNumericRuns, [
      ['1,000', 'text', true, 0],
      ['.', 'text', false, 5],
      ['50', 'text', true, 6],
      [' ', 'space', false, 8],
      ['kg', 'text', true, 9],
    ], [
      ['1,000.50', 'text', true, 0],
      [' ', 'space', false, 8],
      ['kg', 'text', true, 9],
    ])
  })

  test('fires on a standalone numeric segment for the isWordLike rewrite alone', () => {
    expectFires(mergeNumericRuns, [
      ['42', 'text', false, 0],
    ], [
      ['42', 'text', true, 0],
    ])
  })

  test('fires on Arabic-Indic digits, proving the prescan covers all of \\p{Nd}', () => {
    expectFires(mergeNumericRuns, [
      ['٤٢', 'text', false, 0],
    ], [
      ['٤٢', 'text', true, 0],
    ])
  })

  test('skips when the only digit sits in a non-text kind', () => {
    expectSkips(mergeNumericRuns, [
      ['abc', 'text', true, 0],
      ['7', 'glue', false, 3],
    ])
  })

  test('skips non-Nd number characters (superscript two is \\p{No}, not \\p{Nd})', () => {
    expectSkips(mergeNumericRuns, [
      ['²', 'text', false, 0],
    ])
  })
})

describe('mergeAsciiPunctuationChains prescan fixtures', () => {
  test('fires on a joiner-ended word-like chain and merges while joiners continue', () => {
    expectFires(mergeAsciiPunctuationChains, [
      ['v1.', 'text', true, 0],
      ['2.', 'text', true, 3],
      ['3', 'text', true, 5],
    ], [
      ['v1.2.3', 'text', true, 0],
    ])
  })

  test('fires and stops the chain at a non-word-like follower', () => {
    expectFires(mergeAsciiPunctuationChains, [
      ['a.', 'text', true, 0],
      ['b', 'text', true, 2],
      ['.', 'text', false, 3],
    ], [
      ['a.b', 'text', true, 0],
      ['.', 'text', false, 3],
    ])
  })

  test('skips when the left segment does not end in a chain joiner', () => {
    expectSkips(mergeAsciiPunctuationChains, [
      ['foo', 'text', true, 0],
      ['bar', 'text', true, 3],
    ])
  })

  test('skips when the follower is not word-like', () => {
    expectSkips(mergeAsciiPunctuationChains, [
      ['foo.', 'text', true, 0],
      ['!', 'text', false, 4],
    ])
  })

  test('skips when the follower is not a text kind', () => {
    expectSkips(mergeAsciiPunctuationChains, [
      ['foo.', 'text', true, 0],
      [' ', 'space', false, 4],
    ])
  })

  test('skips when the joiner-ended segment is not word-like', () => {
    expectSkips(mergeAsciiPunctuationChains, [
      ['foo.', 'text', false, 0],
      ['bar', 'text', true, 4],
    ])
  })
})

describe('splitHyphenatedNumericRuns prescan fixtures', () => {
  test('fires on an all-numeric hyphenated segment and pins the split offsets', () => {
    expectFires(splitHyphenatedNumericRuns, [
      ['123-456', 'text', false, 0],
    ], [
      ['123-', 'text', true, 0],
      ['456', 'text', true, 4],
    ])
  })

  test('fires on a multi-hyphen run and leaves non-candidate neighbors alone', () => {
    expectFires(splitHyphenatedNumericRuns, [
      ['tel', 'text', true, 0],
      ['555-0100-99', 'text', false, 3],
    ], [
      ['tel', 'text', true, 0],
      ['555-', 'text', true, 3],
      ['0100-', 'text', true, 7],
      ['99', 'text', true, 12],
    ])
  })

  test('fires on Arabic-Indic hyphenated digits, proving the prescan covers \\p{Nd}', () => {
    expectFires(splitHyphenatedNumericRuns, [
      ['٤٢-٧', 'text', false, 0],
    ], [
      ['٤٢-', 'text', true, 0],
      ['٧', 'text', true, 3],
    ])
  })

  test('skips a hyphenated segment without any decimal digit', () => {
    expectSkips(splitHyphenatedNumericRuns, [
      ['a-b', 'text', true, 0],
    ])
  })

  test('skips a digit segment without any hyphen', () => {
    expectSkips(splitHyphenatedNumericRuns, [
      ['123', 'text', true, 0],
    ])
  })

  test('skips when the hyphen-digit segment sits in a non-text kind', () => {
    expectSkips(splitHyphenatedNumericRuns, [
      ['1-2', 'glue', false, 0],
    ])
  })

  test('skips non-Nd hyphenated number characters (superscripts are \\p{No})', () => {
    expectSkips(splitHyphenatedNumericRuns, [
      ['²-³', 'text', false, 0],
    ])
  })
})

describe('mergeGlueConnectedTextRuns prescan fixtures', () => {
  test('fires on text-glue-glue-text and ORs word-likeness across the join', () => {
    expectFires(mergeGlueConnectedTextRuns, [
      ['a', 'text', false, 0],
      ['⁠', 'glue', false, 1],
      ['﻿', 'glue', false, 2],
      ['b', 'text', true, 3],
    ], [
      ['a⁠﻿b', 'text', true, 0],
    ])
  })

  test('fires on a leading glue run absorbed into the following text segment', () => {
    expectFires(mergeGlueConnectedTextRuns, [
      ['⁠', 'glue', false, 0],
      ['b', 'text', true, 1],
    ], [
      ['⁠b', 'text', true, 0],
    ])
  })

  test('fires on a trailing glue run absorbed into the preceding text segment', () => {
    expectFires(mergeGlueConnectedTextRuns, [
      ['a', 'text', true, 0],
      ['⁠', 'glue', false, 1],
    ], [
      ['a⁠', 'text', true, 0],
    ])
  })

  test('fires on a lone glue segment to force isWordLike false', () => {
    expectFires(mergeGlueConnectedTextRuns, [
      ['⁠', 'glue', true, 0],
    ], [
      ['⁠', 'glue', false, 0],
    ])
  })

  test('skips when no glue kind is present', () => {
    expectSkips(mergeGlueConnectedTextRuns, [
      ['a', 'text', true, 0],
      [' ', 'space', false, 1],
      ['b', 'text', true, 2],
    ])
  })

  test('skips a glue character embedded inside a text kind', () => {
    expectSkips(mergeGlueConnectedTextRuns, [
      ['a⁠b', 'text', true, 0],
    ])
  })
})

describe('carryTrailingForwardStickyAcrossCJKBoundary prescan fixtures', () => {
  test('fires on a kinsoku-end opener at a CJK/CJK boundary', () => {
    expectFires(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['中「', 'text', true, 0],
      ['文', 'text', true, 2],
    ], [
      ['中', 'text', true, 0],
      ['「文', 'text', true, 1],
    ])
  })

  test('fires on trailing forward-sticky glue at a CJK/CJK boundary', () => {
    expectFires(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['日’', 'text', true, 0],
      ['本', 'text', true, 2],
    ], [
      ['日', 'text', true, 0],
      ['’本', 'text', true, 1],
    ])
  })

  test('fires when the trailing cluster ends in a combining mark', () => {
    expectFires(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['中「́', 'text', true, 0],
      ['文', 'text', true, 3],
    ], [
      ['中', 'text', true, 0],
      ['「́文', 'text', true, 1],
    ])
  })

  test('skips when the left segment ends in a non-sticky code point', () => {
    expectSkips(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['中', 'text', true, 0],
      ['文', 'text', true, 1],
    ])
  })

  test('skips a sticky-ended segment followed by a non-text kind', () => {
    expectSkips(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['中「', 'text', true, 0],
      [' ', 'space', false, 2],
    ])
  })

  test('skips a sticky-ended non-text segment before a text segment', () => {
    expectSkips(carryTrailingForwardStickyAcrossCJKBoundary, [
      ['中「', 'glue', false, 0],
      ['文', 'text', true, 2],
    ])
  })
})

describe('mergeKeepAllTextSegments prescan fixtures', () => {
  test('fires per contiguous text run and slices merged text out of normalized', () => {
    const normalized = '中文 日x'
    expectFires(s => mergeKeepAllTextSegments(normalized, s, true), [
      ['中', 'text', true, 0],
      ['文', 'text', true, 1],
      [' ', 'space', false, 2],
      ['日', 'text', false, 3],
      ['x', 'text', true, 4],
    ], [
      ['中文', 'text', true, 0],
      [' ', 'space', false, 2],
      ['日x', 'text', true, 3],
    ])
  })

  test('fires and breaks the group after kinsoku punctuation when the flag is set', () => {
    const normalized = '中。文字'
    expectFires(s => mergeKeepAllTextSegments(normalized, s, true), [
      ['中。', 'text', true, 0],
      ['文', 'text', true, 2],
      ['字', 'text', true, 3],
    ], [
      ['中。', 'text', true, 0],
      ['文字', 'text', true, 2],
    ])
  })

  test('fires and merges across kinsoku punctuation when the flag is unset', () => {
    const normalized = '中。文字'
    expectFires(s => mergeKeepAllTextSegments(normalized, s, false), [
      ['中。', 'text', true, 0],
      ['文', 'text', true, 2],
      ['字', 'text', true, 3],
    ], [
      ['中。文字', 'text', true, 0],
    ])
  })

  test('skips when no text segment contains CJK', () => {
    expectSkips(s => mergeKeepAllTextSegments('abc def', s, true), [
      ['abc', 'text', true, 0],
      [' ', 'space', false, 3],
      ['def', 'text', true, 4],
    ])
  })

  test('skips single-segment input even when it contains CJK', () => {
    expectSkips(s => mergeKeepAllTextSegments('中文', s, true), [
      ['中文', 'text', true, 0],
    ])
  })

  test('skips when CJK sits only in a non-text kind', () => {
    expectSkips(s => mergeKeepAllTextSegments('中ab', s, true), [
      ['中', 'glue', false, 0],
      ['ab', 'text', true, 1],
    ])
  })
})

describe('mergeLeadingGraphemeContinuations prescan fixtures', () => {
  test('fires on a combining-mark continuation and ORs word-likeness', () => {
    expectFires(mergeLeadingGraphemeContinuations, [
      ['e', 'text', false, 0],
      ['́', 'text', true, 1],
    ], [
      ['é', 'text', true, 0],
    ])
  })

  test('fires on a variation-selector/keycap continuation', () => {
    expectFires(mergeLeadingGraphemeContinuations, [
      ['1', 'text', true, 0],
      ['️⃣', 'text', false, 1],
    ], [
      ['1️⃣', 'text', true, 0],
    ])
  })

  test('fires and cascades successive continuations into one segment', () => {
    expectFires(mergeLeadingGraphemeContinuations, [
      ['a', 'text', false, 0],
      ['́', 'text', false, 1],
      ['̂', 'text', false, 2],
    ], [
      ['á̂', 'text', false, 0],
    ])
  })

  test('skips a continuation whose predecessor is not a text kind', () => {
    expectSkips(mergeLeadingGraphemeContinuations, [
      [' ', 'space', false, 0],
      ['́', 'text', false, 1],
    ])
  })

  test('skips a continuation at index zero with no predecessor', () => {
    expectSkips(mergeLeadingGraphemeContinuations, [
      ['́', 'text', false, 0],
    ])
  })

  test('skips adjacent text segments without a continuation opener', () => {
    expectSkips(mergeLeadingGraphemeContinuations, [
      ['e', 'text', true, 0],
      ['x', 'text', true, 1],
    ])
  })
})

describe('all-ASCII predicate short-circuit premise', () => {
  // 钉死 analysis-segmentation.ts appendWordSegmentPieces 的 pieceAllAscii 短路前提：
  // 被短路的三个谓词的字符表在 0x00..0x7F 内必须全部为否。
  test('isCJK, containsArabicScript, endsWithMyanmarMedialGlue reject every 7-bit code point', () => {
    for (let code = 0x00; code <= 0x7f; code++) {
      const ch = String.fromCharCode(code)
      expect(isCJK(ch)).toBe(false)
      expect(containsArabicScript(ch)).toBe(false)
      expect(endsWithMyanmarMedialGlue(ch)).toBe(false)
    }
  })
})
