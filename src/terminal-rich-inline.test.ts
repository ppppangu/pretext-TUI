// 补建说明：该文件为后续补建，用于验证 terminal-rich-inline 子路径的 ANSI tokenizer、metadata span 对齐与逐行 ANSI 重建；当前进度：Task 6 首版，覆盖 SGR/OSC8、清洗/拒绝控制序列与按行重建。
import { describe, expect, test } from 'bun:test'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from './terminal-rich-inline.js'
import { TERMINAL_START_CURSOR } from './terminal.js'

describe('terminal rich inline tokenizer', () => {
  test('captures SGR style spans on visible offsets', () => {
    const prepared = prepareTerminalRichInline('\x1b[31mred\x1b[0m')
    expect(prepared.visibleText).toBe('red')
    expect(prepared.spans).toHaveLength(1)
    expect(prepared.spans[0]).toMatchObject({
      kind: 'style',
      sourceStart: 0,
      sourceEnd: 3,
    })
  })

  test('supports colon-form SGR colors', () => {
    const prepared = prepareTerminalRichInline('\x1b[38:2:255:0:0mred\x1b[0m')
    expect(prepared.spans.find(span => span.kind === 'style')).toMatchObject({
      sourceStart: 0,
      sourceEnd: 3,
      style: { fg: 'rgb:255,0,0' },
    })
  })

  test('supports colon-form RGB with omitted color-space slot', () => {
    const prepared = prepareTerminalRichInline('\x1b[38:2::255:0:0mred\x1b[0m')
    expect(prepared.spans.find(span => span.kind === 'style')).toMatchObject({
      sourceStart: 0,
      sourceEnd: 3,
      style: { fg: 'rgb:255,0,0' },
    })
  })

  test('treats colon-form underline variants as underline metadata', () => {
    const prepared = prepareTerminalRichInline('\x1b[4:3mred\x1b[0m')
    const span = prepared.spans.find((item): item is Extract<typeof prepared.spans[number], { kind: 'style' }> => item.kind === 'style')
    expect(span?.sourceStart).toBe(0)
    expect(span?.sourceEnd).toBe(3)
    expect(span?.style).toEqual({ underline: true })
  })

  test('rejects malformed extended-color SGR payloads', () => {
    expect(() => prepareTerminalRichInline('\x1b[38;2;1;2mX', { unsupportedControlMode: 'reject' })).toThrow()
    expect(() => prepareTerminalRichInline('\x1b[48;5mX', { unsupportedControlMode: 'reject' })).toThrow()
  })

  test('captures OSC8 links with BEL and ST terminators', () => {
    const bel = prepareTerminalRichInline('\x1b]8;;https://e.test\x07id\x1b]8;;\x07')
    const st = prepareTerminalRichInline('\x1b]8;;https://e.test\x1b\\go\x1b]8;;\x1b\\')
    expect(bel.spans.find(span => span.kind === 'link')).toMatchObject({ sourceStart: 0, sourceEnd: 2 })
    expect(st.spans.find(span => span.kind === 'link')).toMatchObject({ sourceStart: 0, sourceEnd: 2 })
  })

  test('sanitizes unsupported controls by default', () => {
    const prepared = prepareTerminalRichInline('a\x1b[2Kb')
    expect(prepared.visibleText).toBe('ab')
    expect(prepared.diagnostics).toHaveLength(1)
  })

  test('default whitespace matches the terminal core canonical space', () => {
    const prepared = prepareTerminalRichInline('A\x1b[31m \t \x1b[0mB')
    expect(prepared.visibleText).toBe(prepared.prepared.sourceText)
    expect(prepared.visibleText).toBe('A B')
  })

  test('can reject unsupported controls', () => {
    expect(() => prepareTerminalRichInline('a\x1b[2Kb', { unsupportedControlMode: 'reject' })).toThrow()
  })

  test('does not swallow printable text after non-letter CSI finals', () => {
    const prepared = prepareTerminalRichInline('a\x1b[200~paste\x1b[201~b')
    expect(prepared.visibleText).toBe('apasteb')
    expect(prepared.diagnostics.length).toBeGreaterThan(0)
  })

  test('treats private CSI m payloads as malformed instead of SGR', () => {
    const prepared = prepareTerminalRichInline('\x1b[31mred\x1b[?25mblue')
    expect(prepared.diagnostics.some(d => d.kind === 'malformed-sequence')).toBe(true)
  })

  test('diagnoses malformed OSC8 and can reject it', () => {
    const prepared = prepareTerminalRichInline('\x1b]8;;https://x.testunterminated')
    expect(prepared.diagnostics.some(d => d.kind === 'malformed-sequence')).toBe(true)
    expect(() => prepareTerminalRichInline('\x1b]8;;https://x.testunterminated', { unsupportedControlMode: 'reject' })).toThrow()
  })

  test('rejects malformed OSC8 field structure', () => {
    expect(() => prepareTerminalRichInline('\x1b]8;bad\x1b\\x', { unsupportedControlMode: 'reject' })).toThrow()
  })

  test('accepts C1 ST terminated OSC8 links', () => {
    const prepared = prepareTerminalRichInline('\x1b]8;;https://e.test\x9Cok\x1b]8;;\x9C')
    expect(prepared.visibleText).toBe('ok')
    expect(prepared.spans.find(span => span.kind === 'link')).toMatchObject({ sourceStart: 0, sourceEnd: 2 })
  })

  test('sanitizes bare C0 and single-byte C1 controls', () => {
    const prepared = prepareTerminalRichInline('a\x07b\x9B31mc')
    expect(prepared.visibleText).toBe('abc')
    expect(prepared.diagnostics.length).toBeGreaterThanOrEqual(2)
  })

  test('sanitizes unsupported C1 OSC terminated by C1 ST without swallowing trailing text', () => {
    const prepared = prepareTerminalRichInline('a\x9D0;title\x9Cb')
    expect(prepared.visibleText).toBe('ab')
    expect(prepared.diagnostics.length).toBeGreaterThan(0)
  })

  test('sanitizes unsupported string control families', () => {
    const prepared = prepareTerminalRichInline('a\x1bPSECRET\x1b\\b\x90HIDDEN\x9Cb')
    expect(prepared.visibleText).toBe('abb')
    expect(prepared.diagnostics.length).toBeGreaterThanOrEqual(2)
  })

  test('rebases style spans through whitespace normalization', () => {
    const prepared = prepareTerminalRichInline('A\x1b[31m \t \x1b[0mB', { whiteSpace: 'normal' })
    expect(prepared.visibleText).toBe('A B')
    expect(prepared.spans.find(span => span.kind === 'style')).toMatchObject({
      sourceStart: 1,
      sourceEnd: 2,
    })
  })
})

describe('terminal rich inline materialization', () => {
  test('rebuilds ANSI per wrapped line for style spans', () => {
    const prepared = prepareTerminalRichInline('\x1b[31mabcdef\x1b[0m', { whiteSpace: 'pre-wrap' })
    const lines = []
    walkTerminalRichLineRanges(prepared, { columns: 3 }, line => lines.push(line))
    const line0 = materializeTerminalRichLineRange(prepared, lines[0]!)
    const line1 = materializeTerminalRichLineRange(prepared, lines[1]!)
    expect(line0.text).toBe('abc')
    expect(line1.text).toBe('def')
    expect(line0.ansiText).toContain('\x1b[31m')
    expect(line0.ansiText).toContain('\x1b[0m')
    expect(line1.ansiText).toContain('\x1b[31m')
    expect(line1.ansiText).toContain('\x1b[0m')
  })

  test('reopens link state per wrapped line', () => {
    const prepared = prepareTerminalRichInline('\x1b]8;;https://x.test\x1b\\abcdef\x1b]8;;\x1b\\', {
      whiteSpace: 'pre-wrap',
    })
    const lines = []
    walkTerminalRichLineRanges(prepared, { columns: 3 }, line => lines.push(line))
    const line0 = materializeTerminalRichLineRange(prepared, lines[0]!)
    const line1 = materializeTerminalRichLineRange(prepared, lines[1]!)
    expect(line0.ansiText).toContain('\x1b]8;;https://x.test\x1b\\')
    expect(line1.ansiText).toContain('\x1b]8;;https://x.test\x1b\\')
  })

  test('fragments align to source offsets and visible text', () => {
    const prepared = prepareTerminalRichInline('A\x1b[31mBC\x1b[0mD', { whiteSpace: 'pre-wrap' })
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 10 })!
    const materialized = materializeTerminalRichLineRange(prepared, line)
    expect(materialized.fragments.map(fragment => fragment.text).join('')).toBe(materialized.text)
    expect(materialized.fragments[1]).toMatchObject({
      sourceText: 'BC',
      sourceStart: 1,
      sourceEnd: 3,
    })
  })

  test('does not emit empty fragments for non-selected trailing soft hyphen', () => {
    const prepared = prepareTerminalRichInline('B\x1b]8;;https://x.test\x1b\\ \x1b]8;;\x1b\\\u00AD\u200B', {
      whiteSpace: 'normal',
    })
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 10 })!
    const materialized = materializeTerminalRichLineRange(prepared, line)
    expect(materialized.text).toBe('B ')
    expect(materialized.fragments.every(fragment => fragment.text !== '')).toBe(true)
  })

  test('does not reintroduce wrap-hidden space into fragments', () => {
    const prepared = prepareTerminalRichInline('A\x1b[31m \x1b[0mBB', { whiteSpace: 'normal' })
    const lines = []
    walkTerminalRichLineRanges(prepared, { columns: 1 }, line => lines.push(line))
    const materialized = materializeTerminalRichLineRange(prepared, lines[1]!)
    expect(materialized.text).toBe('B')
    expect(materialized.fragments.map(fragment => fragment.text).join('')).toBe('B')
  })

  test('does not split a grapheme cluster across fragments', () => {
    const prepared = prepareTerminalRichInline('a\x1b[31m\u0301\x1b[0m', { whiteSpace: 'pre-wrap' })
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 10 })!
    const materialized = materializeTerminalRichLineRange(prepared, line)
    expect(materialized.fragments).toHaveLength(1)
    expect(materialized.text).toBe('á')
    expect(materialized.fragments[0]?.style).not.toBeNull()
  })

  test('zero-width-only pre-wrap chunks stay line-safe in rich path', () => {
    const prepared = prepareTerminalRichInline('\u200B\n\u200B\n\u200B', { whiteSpace: 'pre-wrap' })
    const lines = []
    walkTerminalRichLineRanges(prepared, { columns: 5 }, line => lines.push(line))
    expect(lines).toHaveLength(3)
    const materialized = lines.map(line => materializeTerminalRichLineRange(prepared, line))
    expect(materialized.map(line => line.text)).toEqual(['', '', ''])
  })
})
