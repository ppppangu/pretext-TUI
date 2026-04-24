// 补建说明：该文件为后续补建，用于验证 package-facing terminal public layout API 的 TUI-only 行为；当前进度：Task 7 首版，覆盖 pipeline 一致性、source offsets、startColumn 与独立 greedy oracle。
import { describe, expect, test } from 'bun:test'
import {
  layoutTerminal,
  prepareTerminal,
} from '../../src/index.js'
import {
  assertDeepEqual,
  assertTerminalInvariants,
  collectTerminalLines,
  collectTerminalLinesByNext,
  computePreparedGreedyOracle,
} from './validation-helpers.js'

describe('tui public layout validation', () => {
  test('walk, next, layout, stats, materialize and invariants agree', () => {
    const prepared = prepareTerminal('A\tB 世界 e\u0301 😀\ntrans\u00ADatlantic', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    })
    assertTerminalInvariants(prepared, { columns: 8, startColumn: 2 })
  })

  test('layoutNext resets startColumn only when caller asks for continuation semantics', () => {
    const prepared = prepareTerminal('abcdef', { whiteSpace: 'pre-wrap' })
    const walked = collectTerminalLines(prepared, { columns: 6, startColumn: 2 }).map(line => line.materialized.text)
    const next = collectTerminalLinesByNext(prepared, { columns: 6, startColumn: 2 }).map(line => line.width)
    expect(walked).toEqual(['abcd', 'ef'])
    expect(next).toEqual([4, 2])
    expect(layoutTerminal(prepared, { columns: 6, startColumn: 2 }).rows).toBe(2)
  })

  test('startColumn-aware tab fitting breaks at the correct source offset', () => {
    const prepared = prepareTerminal('abc\td', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const lines = collectTerminalLines(prepared, { columns: 6, startColumn: 1 })
    expect(lines.map(line => line.materialized.text)).toEqual(['abc', '    d'])
    expect(lines.map(line => [line.range.sourceStart, line.range.sourceEnd])).toEqual([[0, 3], [3, 5]])
    assertTerminalInvariants(prepared, { columns: 6, startColumn: 1 })
  })

  test('source offsets stay on UTF-16 grapheme boundaries', () => {
    const prepared = prepareTerminal('A😀e\u0301👩‍💻B', { whiteSpace: 'pre-wrap' })
    const lines = collectTerminalLines(prepared, { columns: 3 })
    expect(lines.map(line => [line.range.sourceStart, line.range.sourceEnd])).toEqual([
      [0, 3],
      [3, 10],
      [10, 11],
    ])
  })

  test('plain terminal core rejects raw terminal controls', () => {
    expect(() => prepareTerminal('\x1b[31mred\x1b[0m')).toThrow()
    expect(() => prepareTerminal('ok\x07bad')).toThrow()
  })

  test('keep-all URL merging never swallows structural tab or soft-hyphen segments', () => {
    const prepared = prepareTerminal('https://example.test/path?q=1\tworld\u00ADnext', {
      whiteSpace: 'pre-wrap',
      wordBreak: 'keep-all',
      tabSize: 2,
    })
    expect(prepared.kinds).toContain('tab')
    expect(prepared.kinds).toContain('soft-hyphen')
    assertTerminalInvariants(prepared, { columns: 6 })
  })

  test('pre-wrap preserved trailing spaces remain visible before soft hyphen and hard break', () => {
    const prepared = prepareTerminal('नमस्ते  \u00AD\nnext', {
      whiteSpace: 'pre-wrap',
      wordBreak: 'keep-all',
    })
    const first = collectTerminalLines(prepared, { columns: 20 })[0]
    expect(first?.materialized.text).toBe('नमस्ते  ')
    expect(first?.range.width).toBe(5)
    assertTerminalInvariants(prepared, { columns: 20 })
  })

  test('normal trailing spaces hidden across soft hyphen boundaries do not count in range width', () => {
    const prepared = prepareTerminal('AB \u00AD next', { whiteSpace: 'normal' })
    const first = collectTerminalLines(prepared, { columns: 3 })[0]
    expect(first?.materialized.text).toBe('AB')
    expect(first?.range.width).toBe(2)
    assertTerminalInvariants(prepared, { columns: 3 })
  })

  test('break-kind splitting preserves keycap grapheme clusters', () => {
    const prepared = prepareTerminal('\u202F1️⃣。', { whiteSpace: 'normal' })
    expect(prepared.segments.some(segment => segment.includes('1️⃣'))).toBe(true)
    expect(prepared.segments.every(segment => !/^[\p{M}\uFE00-\uFE0F\u20E3]/u.test(segment))).toBe(true)
    assertTerminalInvariants(prepared, { columns: 5 })
  })

  test('slow greedy oracle agrees with public output on representative terminal cases', () => {
    const cases = [
      {
        text: 'hello world from tui',
        prepare: { whiteSpace: 'normal' as const },
        layout: { columns: 7 },
      },
      {
        text: 'abc\td',
        prepare: { whiteSpace: 'pre-wrap' as const, tabSize: 4 },
        layout: { columns: 6, startColumn: 1 },
      },
      {
        text: 'x\t世界\ny',
        prepare: { whiteSpace: 'pre-wrap' as const, tabSize: 4 },
        layout: { columns: 8, startColumn: 2 },
      },
      {
        text: 'trans\u00ADatlantic',
        prepare: { whiteSpace: 'normal' as const },
        layout: { columns: 6 },
      },
      {
        text: 'A界e\u0301😀B',
        prepare: { whiteSpace: 'pre-wrap' as const },
        layout: { columns: 3 },
      },
    ]

    for (const item of cases) {
      const prepared = prepareTerminal(item.text, item.prepare)
      const actual = collectTerminalLines(prepared, item.layout).map(line => ({
        text: line.materialized.text,
        sourceText: line.materialized.sourceText,
        sourceStart: line.range.sourceStart,
        sourceEnd: line.range.sourceEnd,
        width: line.range.width,
        breakKind: line.range.break.kind,
        overflow: line.range.overflow,
      }))
      const oracle = computePreparedGreedyOracle(prepared, item.layout)
      assertDeepEqual(actual, oracle, `slow greedy oracle for ${item.text}`)
    }
  })
})
