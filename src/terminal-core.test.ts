// 补建说明：该文件为后续补建，用于替代旧浏览器/像素导向的 layout 测试，验证 terminal-first 公共 API 的核心不变量；当前进度：Task 4 首版覆盖 layout/walk/next/materialize 一致性。
import { describe, expect, test } from 'bun:test'
import {
  TERMINAL_START_CURSOR,
  layoutNextTerminalLineRange,
  layoutTerminal,
  materializeTerminalLineRange,
  measureTerminalLineStats,
  prepareTerminal,
  walkTerminalLineRanges,
  type PreparedTerminalText,
  type TerminalLayoutOptions,
  type TerminalLineRange,
} from './terminal.js'

function collectWalked(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLineRange[] {
  const lines: TerminalLineRange[] = []
  walkTerminalLineRanges(prepared, options, line => lines.push(line))
  return lines
}

function collectNext(
  prepared: PreparedTerminalText,
  options: TerminalLayoutOptions,
): TerminalLineRange[] {
  const lines: TerminalLineRange[] = []
  let cursor = TERMINAL_START_CURSOR
  while (true) {
    const line = layoutNextTerminalLineRange(prepared, cursor, options)
    if (line === null) break
    lines.push(line)
    cursor = line.end
  }
  return lines
}

function assertPipelinesAgree(
  text: string,
  prepareOptions: Parameters<typeof prepareTerminal>[1],
  layoutOptions: TerminalLayoutOptions,
): TerminalLineRange[] {
  const prepared = prepareTerminal(text, prepareOptions)
  const walked = collectWalked(prepared, layoutOptions)
  const next = collectNext(prepared, layoutOptions)
  const layoutResult = layoutTerminal(prepared, layoutOptions)
  const stats = measureTerminalLineStats(prepared, layoutOptions)

  expect(layoutResult.rows).toBe(walked.length)
  expect(stats.rows).toBe(walked.length)
  expect(stats.maxLineWidth).toBe(Math.max(0, ...walked.map(line => line.width)))
  expect(next.map(line => line.width)).toEqual(walked.map(line => line.width))
  expect(next.map(line => line.sourceStart)).toEqual(walked.map(line => line.sourceStart))
  expect(next.map(line => line.sourceEnd)).toEqual(walked.map(line => line.sourceEnd))

  for (let i = 0; i < walked.length - 1; i++) {
    expect(walked[i]!.end).toEqual(walked[i + 1]!.start)
  }

  for (const line of walked) {
    expect('text' in line).toBe(false)
    const materialized = materializeTerminalLineRange(prepared, line)
    expect(materialized.width).toBe(line.width)
    expect(hasUnsafeControls(materialized.text)).toBe(false)
  }

  return walked
}

function hasUnsafeControls(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x08 || (code >= 0x0b && code <= 0x1f) || code === 0x7f) {
      return true
    }
  }
  return false
}

describe('terminal core api', () => {
  test('normal whitespace collapses before layout', () => {
    const lines = assertPipelinesAgree(
      '  Hello\t \r\n World  ',
      { whiteSpace: 'normal' },
      { columns: 20 },
    )
    expect(lines).toHaveLength(1)
  })

  test('pre-wrap hard breaks are deterministic and no trailing empty row is invented', () => {
    const prepared = prepareTerminal('a\n\nb\n', { whiteSpace: 'pre-wrap' })
    const lines = collectWalked(prepared, { columns: 10 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['a', '', 'b'])
    expect(layoutTerminal(prepared, { columns: 10 }).rows).toBe(3)
    expect(lines[0]?.break.kind).toBe('hard')
    expect(lines[0] && materializeTerminalLineRange(prepared, lines[0]).sourceText).toBe('a')
  })

  test('zero-width-only pre-wrap chunks still emit empty rows', () => {
    const prepared = prepareTerminal('\u200B\n\u200B\n\u200B', { whiteSpace: 'pre-wrap' })
    const lines = collectWalked(prepared, { columns: 5 })
    expect(layoutTerminal(prepared, { columns: 5 }).rows).toBe(3)
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['', '', ''])
  })

  test('startColumn reduces first-row capacity and is reflected in overflow', () => {
    const prepared = prepareTerminal('abcdef', { whiteSpace: 'pre-wrap' })
    const lines = collectWalked(prepared, { columns: 6, startColumn: 2 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['abcd', 'ef'])
    expect(lines[0]?.startColumn).toBe(2)
    expect(lines[1]?.startColumn).toBe(0)
  })

  test('materializes tabs as spaces using startColumn', () => {
    const prepared = prepareTerminal('x\tz', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const [line] = collectWalked(prepared, { columns: 8, startColumn: 2 })
    expect(line && materializeTerminalLineRange(prepared, line).text).toBe('x z')
    expect(line?.width).toBe(3)
  })

  test('startColumn and tabs fit against actual terminal columns', () => {
    const prepared = prepareTerminal('x\tz', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const lines = collectWalked(prepared, { columns: 8, startColumn: 3 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['x    ', 'z'])
    expect(lines[0]?.overflow).toBeNull()
  })

  test('startColumn can make a leading tab narrower than column-zero layout', () => {
    const prepared = prepareTerminal('\tabcde', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const lines = collectWalked(prepared, { columns: 9, startColumn: 3 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual([' abcde'])
    expect(lines[0]?.overflow).toBeNull()
  })

  test('custom width profile is reflected in public range metadata', () => {
    const prepared = prepareTerminal('αX', { widthProfile: { ambiguousWidth: 'wide' } })
    const [line] = collectWalked(prepared, { columns: 1 })
    expect(line?.width).toBe(2)
    expect(line?.overflow).toEqual({ width: 2, columns: 1 })
  })

  test('preserves visible trailing tab cells', () => {
    const prepared = prepareTerminal('\t', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const [line] = collectWalked(prepared, { columns: 8 })
    expect(line && materializeTerminalLineRange(prepared, line).text).toBe('    ')
    expect(line?.width).toBe(4)
  })

  test('zero-width break is not materialized', () => {
    const prepared = prepareTerminal('alpha\u200Bbeta', { whiteSpace: 'pre-wrap' })
    const lines = collectWalked(prepared, { columns: 5 })
    const rendered = lines.map(line => materializeTerminalLineRange(prepared, line).text).join('')
    expect(rendered).toBe('alphabeta')
  })

  test('normal wrap spaces are consumed but not painted', () => {
    const prepared = prepareTerminal('hello world', { whiteSpace: 'normal' })
    const [first] = collectWalked(prepared, { columns: 5 })
    expect(first && materializeTerminalLineRange(prepared, first).text).toBe('hello')
    expect(first && materializeTerminalLineRange(prepared, first).sourceText).toBe('hello')
  })

  test('consumed break segments do not corrupt source offsets on later wraps', () => {
    const prepared = prepareTerminal('A BB', { whiteSpace: 'normal' })
    const lines = collectWalked(prepared, { columns: 1 })
    expect(lines[1]?.sourceStart).toBe(2)
    expect(lines[1]?.sourceEnd).toBe(3)
    expect(lines[1] && materializeTerminalLineRange(prepared, lines[1]).text).toBe('B')
    expect(lines[1]?.width).toBe(1)
  })

  test('soft hyphen materializes only on the selected break line', () => {
    const prepared = prepareTerminal('trans\u00ADatlantic', { whiteSpace: 'normal' })
    const lines = collectWalked(prepared, { columns: 6 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).not.toContain('-atlant')
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['trans-', 'atlant', 'ic'])
  })

  test('non-selected trailing soft hyphen does not add visible width', () => {
    const prepared = prepareTerminal('B \u00AD\u200B', { whiteSpace: 'normal' })
    const [line] = collectWalked(prepared, { columns: 10 })
    const materialized = line && materializeTerminalLineRange(prepared, line)
    expect(line?.width).toBe(2)
    expect(materialized?.text).toBe('B ')
  })

  test('grouped soft hyphen segment still counts the selected hyphen width', () => {
    const prepared = prepareTerminal('B\u00AD\u00ADB', { whiteSpace: 'normal' })
    const [line] = collectWalked(prepared, { columns: 1 })
    expect(line?.width).toBe(2)
    expect(line && materializeTerminalLineRange(prepared, line).text).toBe('B-')
  })

  test('keeps real leading hyphens', () => {
    const prepared = prepareTerminal('-abc', { whiteSpace: 'pre-wrap' })
    const [line] = collectWalked(prepared, { columns: 10 })
    expect(line && materializeTerminalLineRange(prepared, line).text).toBe('-abc')
  })

  test('keeps real leading hyphen after a soft hyphen boundary', () => {
    const prepared = prepareTerminal('a\u00AD-b', { whiteSpace: 'normal' })
    const lines = collectWalked(prepared, { columns: 2 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toContain('-b')
  })

  test('strips only generated soft-hyphen artifact on continuation lines', () => {
    const prepared = prepareTerminal('a\u00ADbc', { whiteSpace: 'normal' })
    const lines = collectWalked(prepared, { columns: 1 })
    expect(lines.map(line => materializeTerminalLineRange(prepared, line).text)).toEqual(['a-', 'b', 'c'])
  })

  test('unicode graphemes keep terminal widths', () => {
    const lines = assertPipelinesAgree(
      'A界e\u0301😀B',
      { whiteSpace: 'pre-wrap' },
      { columns: 3 },
    )
    expect(lines.length).toBeGreaterThan(1)
  })

  test('overwide grapheme emits one overflowing range', () => {
    const prepared = prepareTerminal('😀X', { whiteSpace: 'pre-wrap' })
    const [first] = collectWalked(prepared, { columns: 1 })
    expect(first?.overflow).toEqual({ width: 2, columns: 1 })
    expect(first && materializeTerminalLineRange(prepared, first).text).toBe('😀')
  })

  test('plain core rejects raw ANSI/control input even if width profile is overridden', () => {
    expect(() =>
      prepareTerminal('\x1b[31mred\x1b[0m', {
        widthProfile: { controlChars: 'zero-width' },
      }),
    ).toThrow()
  })

  test('mixed canary pipelines agree across widths', () => {
    for (const columns of [6, 10, 18, 40]) {
      assertPipelinesAgree(
        'foo trans\u00ADatlantic said "hello" to 世界 and alpha\u200Bbeta 👩‍💻',
        { whiteSpace: 'normal' },
        { columns },
      )
    }
  })
})
