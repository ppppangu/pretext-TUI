// 补建说明：该文件为后续补建，用于验证纯 TUI 终端 cell 宽度后端；当前进度：Task 3 首版，覆盖核心 ASCII/CJK/emoji/control/tab/profile 行为。
import { describe, expect, test } from 'bun:test'
import {
  createInjectedTerminalWidthProfile,
  resolveTerminalWidthProfile,
  TERMINAL_UNICODE_NARROW_PROFILE,
} from './unicode/terminal-width-profile.js'
import {
  terminalGraphemeWidth,
  terminalStringWidth,
  terminalTabAdvance,
} from './unicode/terminal-string-width.js'

describe('terminal width profile', () => {
  test('default profile is stable and named', () => {
    expect(TERMINAL_UNICODE_NARROW_PROFILE.cacheKey).toContain('terminal-unicode-narrow@1')
    expect(resolveTerminalWidthProfile()).toBe(TERMINAL_UNICODE_NARROW_PROFILE)
  })

  test('profile overrides produce a distinct cache key', () => {
    const wide = resolveTerminalWidthProfile({ ambiguousWidth: 'wide' })
    expect(wide.cacheKey).not.toBe(TERMINAL_UNICODE_NARROW_PROFILE.cacheKey)
  })

  test('does not trust structural copies with stale cache identity', () => {
    const narrow = resolveTerminalWidthProfile({ ambiguousWidth: 'narrow' })
    const forged = {
      ...narrow,
      ambiguousWidth: 'wide' as const,
    }

    expect(resolveTerminalWidthProfile(forged as never)).not.toBe(forged)
    expect(terminalStringWidth('Ω', forged as never)).toBe(2)
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

  test('rejects bidi format controls as unsafe visible text', () => {
    expect(() => terminalStringWidth('\u061C')).toThrow()
    expect(() => terminalStringWidth('\u200E')).toThrow()
    expect(() => terminalStringWidth('\u200F')).toThrow()
    expect(() => terminalStringWidth('\u202E')).toThrow()
    expect(() => terminalStringWidth('a\u2066b')).toThrow()
  })
})

describe('terminal tab advance', () => {
  test('advances to the next tab stop', () => {
    expect(terminalTabAdvance(0, 8)).toBe(8)
    expect(terminalTabAdvance(3, 8)).toBe(5)
    expect(terminalTabAdvance(8, 8)).toBe(8)
  })
})

describe('injected host width profile', () => {
  const ccLike = createInjectedTerminalWidthProfile({
    id: 'test/cc-like@1',
    graphemeWidth: g => {
      if (g === '⚠') return 1 // host (CC) truth: 1; built-in policy: 2
      if (g === '中' || g === '😀') return 2
      return g.length === 0 ? 0 : 1
    },
  })

  test('overrides built-in width classification', () => {
    expect(terminalGraphemeWidth('⚠')).toBe(2) // built-in default
    expect(terminalGraphemeWidth('⚠', ccLike)).toBe(1) // host truth wins
    expect(terminalStringWidth('A⚠中', ccLike)).toBe(1 + 1 + 2)
  })

  test('carries a distinct, id-keyed cache identity', () => {
    expect(ccLike.cacheKey).toContain('name=terminal-injected@1')
    expect(ccLike.cacheKey).toContain('id=test/cc-like@1')
    const other = createInjectedTerminalWidthProfile({ id: 'test/other@1', graphemeWidth: () => 1 })
    expect(other.cacheKey).not.toBe(ccLike.cacheKey)
  })

  test('cache identity follows the function, not just the id (no poisoning)', () => {
    // Two profiles sharing an id but with different functions must not share a cache.
    const one = createInjectedTerminalWidthProfile({ id: 'dup', graphemeWidth: () => 1 })
    const two = createInjectedTerminalWidthProfile({ id: 'dup', graphemeWidth: () => 2 })
    expect(one.cacheKey).not.toBe(two.cacheKey)
    expect(terminalGraphemeWidth('z', one)).toBe(1)
    expect(terminalGraphemeWidth('z', two)).toBe(2)
    // The same function reference with the same id is stable (intended sharing).
    const fn = () => 1
    expect(createInjectedTerminalWidthProfile({ id: 'k', graphemeWidth: fn }).cacheKey)
      .toBe(createInjectedTerminalWidthProfile({ id: 'k', graphemeWidth: fn }).cacheKey)
  })

  test('resolves through to itself, preserving the width fn', () => {
    expect(resolveTerminalWidthProfile(ccLike)).toBe(ccLike)
    expect(resolveTerminalWidthProfile(ccLike).graphemeWidth).toBe(ccLike.graphemeWidth)
  })

  test('runs the control and bidi gate before the injected fn', () => {
    const seen: string[] = []
    const spy = createInjectedTerminalWidthProfile({
      id: 'test/spy@1',
      graphemeWidth: g => {
        seen.push(g)
        return 9
      },
    })
    expect(terminalGraphemeWidth('', spy)).toBe(0) // empty: gate, not host
    expect(() => terminalGraphemeWidth('\x07', spy)).toThrow() // control: rejected before host
    expect(() => terminalGraphemeWidth('\u202E', spy)).toThrow() // bidi: rejected before host
    expect(terminalGraphemeWidth('Z', spy)).toBe(9) // visible: delegated
    expect(seen).toEqual(['Z'])
  })

  test('honors controlChars policy without delegating controls', () => {
    const zw = createInjectedTerminalWidthProfile({
      id: 'test/zw@1',
      graphemeWidth: () => 9,
      controlChars: 'zero-width',
    })
    expect(terminalGraphemeWidth('\x07', zw)).toBe(0)
  })

  test('rejects invalid widths returned by the host fn', () => {
    const frac = createInjectedTerminalWidthProfile({ id: 'test/frac@1', graphemeWidth: () => 1.5 })
    const neg = createInjectedTerminalWidthProfile({ id: 'test/neg@1', graphemeWidth: () => -1 })
    expect(() => terminalGraphemeWidth('x', frac)).toThrow()
    expect(() => terminalGraphemeWidth('y', neg)).toThrow()
  })

  test('validates factory input', () => {
    expect(() => createInjectedTerminalWidthProfile({ id: '', graphemeWidth: () => 1 })).toThrow()
    expect(() => createInjectedTerminalWidthProfile({ id: 'a;b', graphemeWidth: () => 1 })).toThrow()
    // @ts-expect-error graphemeWidth is required
    expect(() => createInjectedTerminalWidthProfile({ id: 'x' })).toThrow()
  })
})
