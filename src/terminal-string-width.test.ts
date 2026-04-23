// 补建说明：该文件为后续补建，用于验证纯 TUI 终端 cell 宽度后端；当前进度：Task 3 首版，覆盖核心 ASCII/CJK/emoji/control/tab/profile 行为。
import { describe, expect, test } from 'bun:test'
import {
  resolveTerminalWidthProfile,
  TERMINAL_UNICODE_NARROW_PROFILE,
} from './terminal-width-profile.js'
import {
  terminalGraphemeWidth,
  terminalStringWidth,
  terminalTabAdvance,
} from './terminal-string-width.js'

describe('terminal width profile', () => {
  test('default profile is stable and named', () => {
    expect(TERMINAL_UNICODE_NARROW_PROFILE.cacheKey).toContain('terminal-unicode-narrow@1')
    expect(resolveTerminalWidthProfile()).toBe(TERMINAL_UNICODE_NARROW_PROFILE)
  })

  test('profile overrides produce a distinct cache key', () => {
    const wide = resolveTerminalWidthProfile({ ambiguousWidth: 'wide' })
    expect(wide.cacheKey).not.toBe(TERMINAL_UNICODE_NARROW_PROFILE.cacheKey)
  })
})

describe('terminal string width', () => {
  test('measures ascii and spaces as narrow cells', () => {
    expect(terminalStringWidth('abc')).toBe(3)
    expect(terminalStringWidth('a b')).toBe(3)
  })

  test('measures CJK and fullwidth text as wide cells', () => {
    expect(terminalStringWidth('中')).toBe(2)
    expect(terminalStringWidth('。')).toBe(2)
    expect(terminalStringWidth('Ａ')).toBe(2)
    expect(terminalStringWidth('한')).toBe(2)
  })

  test('supports ambiguous width policy', () => {
    expect(terminalStringWidth('Ω')).toBe(1)
    expect(terminalStringWidth('Ω', { ambiguousWidth: 'wide' })).toBe(2)
  })

  test('supports emoji width policy', () => {
    expect(terminalStringWidth('😀')).toBe(2)
    expect(terminalStringWidth('😀', { emojiWidth: 'narrow' })).toBe(1)
  })

  test('supports regional indicator policy', () => {
    expect(terminalStringWidth('🇺')).toBe(2)
    expect(terminalStringWidth('🇺', { regionalIndicator: 'flag-pair-wide-single-narrow' })).toBe(1)
    expect(terminalStringWidth('🇺🇸', { regionalIndicator: 'flag-pair-wide-single-narrow' })).toBe(2)
  })

  test('keeps combining marks inside their base cell', () => {
    expect(terminalStringWidth('e\u0301')).toBe(1)
    expect(terminalGraphemeWidth('\u0301')).toBe(0)
  })

  test('measures common emoji clusters as wide cells', () => {
    expect(terminalStringWidth('😀')).toBe(2)
    expect(terminalStringWidth('👩🏽')).toBe(2)
    expect(terminalStringWidth('👩‍💻')).toBe(2)
    expect(terminalStringWidth('👨‍👩‍👧‍👦')).toBe(2)
    expect(terminalStringWidth('1️⃣')).toBe(2)
    expect(terminalStringWidth('🇺🇸')).toBe(2)
  })

  test('handles variation selectors deterministically', () => {
    expect(terminalStringWidth('✈︎')).toBe(1)
    expect(terminalStringWidth('✈️')).toBe(2)
    expect(terminalStringWidth('a\uFE0F')).toBe(1)
  })

  test('special zero-width and glue characters have terminal widths', () => {
    expect(terminalStringWidth('\u200B')).toBe(0)
    expect(terminalStringWidth('\u2060')).toBe(0)
    expect(terminalStringWidth('\uFEFF')).toBe(0)
    expect(terminalStringWidth('\u00AD')).toBe(0)
    expect(terminalStringWidth('\u00A0')).toBe(1)
    expect(terminalStringWidth('\u202F')).toBe(1)
  })

  test('rejects controls under the default profile', () => {
    expect(() => terminalStringWidth('\x00')).toThrow()
    expect(() => terminalStringWidth('\x1b')).toThrow()
    expect(() => terminalStringWidth('\n')).toThrow()
    expect(() => terminalStringWidth('\t')).toThrow()
  })
})

describe('terminal tab advance', () => {
  test('advances to the next tab stop', () => {
    expect(terminalTabAdvance(0, 8)).toBe(8)
    expect(terminalTabAdvance(3, 8)).toBe(5)
    expect(terminalTabAdvance(8, 8)).toBe(8)
  })
})
