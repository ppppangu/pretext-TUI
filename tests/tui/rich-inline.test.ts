// 补建说明：该文件为后续补建，用于验证 package-facing terminal-rich-inline public API 的 TUI-only metadata 行为；当前进度：Task 7 首版，覆盖 sanitized ANSI、OSC8、fragment/source 对齐与 ANSI 行重建安全性。
import { describe, expect, test } from 'bun:test'
import { TERMINAL_START_CURSOR, prepareTerminal, type TerminalLineRange } from '../../src/index.js'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from '../../src/terminal-rich-inline.js'
import {
  assert,
  hasUnsafeControls,
} from './validation-helpers.js'

describe('tui rich inline validation', () => {
  test('plain core rejects ANSI while rich sidecar preserves visible text metadata', () => {
    expect(() => prepareTerminal('\x1b[31mred\x1b[0m')).toThrow()
    const prepared = prepareTerminalRichInline('\x1b[31mred\x1b[0m')
    expect(prepared.visibleText).toBe('red')
    expect(prepared.prepared.sourceText).toBe('red')
    expect(prepared.spans.map(span => span.kind)).toEqual(['style'])
  })

  test('unsupported controls sanitize out and do not reappear in ansiText', () => {
    const prepared = prepareTerminalRichInline('a\x1b[2Kb\x1b]0;title\x07c\x1bPsecret\x1b\\d', {
      whiteSpace: 'pre-wrap',
    })
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
    assert(line !== null, 'expected rich line')
    const materialized = materializeTerminalRichLineRange(prepared, line)
    expect(prepared.visibleText).toBe('abcd')
    expect(prepared.diagnostics.length).toBeGreaterThanOrEqual(3)
    expect(materialized.text).toBe('abcd')
    expect(materialized.ansiText).toBe('abcd')
    expect(hasUnsafeControls(materialized.text)).toBe(false)
  })

  test('OSC8 URIs cannot inject controls in sanitize or reject mode', () => {
    const unsafeUri = '\x1b]8;;bad\x1b[31m\x1b\\x'
    const sanitized = prepareTerminalRichInline(unsafeUri)
    expect(sanitized.visibleText).toBe('x')
    expect(sanitized.diagnostics.some(diagnostic => diagnostic.kind === 'malformed-sequence')).toBe(true)
    expect(() =>
      prepareTerminalRichInline(unsafeUri, { unsupportedControlMode: 'reject' }),
    ).toThrow()
  })

  test('style and link state reopen safely across wraps', () => {
    const prepared = prepareTerminalRichInline('\x1b[31mAB\x1b]8;;https://e.test\x1b\\CDEF\x1b]8;;\x1b\\GH\x1b[0m', {
      whiteSpace: 'pre-wrap',
    })
    const lines: TerminalLineRange[] = []
    walkTerminalRichLineRanges(prepared, { columns: 3 }, line => lines.push(line))
    const materialized = lines.map(line => materializeTerminalRichLineRange(prepared, line))
    expect(materialized.map(line => line.text)).toEqual(['ABC', 'DEF', 'GH'])
    expect(materialized[1]?.ansiText).toContain('\x1b[31m')
    expect(materialized[1]?.ansiText).toContain('\x1b]8;;https://e.test\x1b\\')
    for (const line of materialized) {
      const retokenized = prepareTerminalRichInline(line.ansiText, { whiteSpace: 'pre-wrap' })
      expect(retokenized.visibleText).toBe(line.text)
      expect(retokenized.diagnostics).toHaveLength(0)
      expect(line.fragments.map(fragment => fragment.text).join('')).toBe(line.text)
    }
  })

  test('fragments remain grapheme-safe after whitespace normalization', () => {
    const prepared = prepareTerminalRichInline('a\x1b[31m\u0301 \t \x1b[0m👩‍💻', { whiteSpace: 'normal' })
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
    assert(line !== null, 'expected rich line')
    const materialized = materializeTerminalRichLineRange(prepared, line)
    expect(materialized.text).toBe('á 👩‍💻')
    expect(materialized.fragments.map(fragment => fragment.text).join('')).toBe(materialized.text)
    for (let i = 1; i < materialized.fragments.length; i++) {
      expect(materialized.fragments[i]!.columnStart).toBe(materialized.fragments[i - 1]!.columnEnd)
    }
  })
})
