// 补建说明：该文件为后续补建，用于验证 plain terminal input 的单一 reject 集；当前进度：补建 isRejectedPlainTerminalCodePoint / sanitizePlainTerminalInput 行为，证明 assert 与 sanitize 共用同一判定（消除宿主侧重复正则）。
import { describe, expect, test } from 'bun:test'
import { sanitizePlainTerminalInput } from '../../src/public/index.js'
import {
  assertPlainTerminalInput,
  isRejectedPlainTerminalCodePoint,
} from '../../src/core/terminal-plain-input.js'

describe('plain terminal input sanitizer', () => {
  test('returns already-clean text unchanged', () => {
    const clean = 'hello 世界 😀\tindented\nsecond\r\nthird\fpage'
    expect(sanitizePlainTerminalInput(clean)).toBe(clean)
  })

  test('strips C0 controls but preserves \\t \\n \\r \\f', () => {
    expect(sanitizePlainTerminalInput('a\x00b\x07c\x0bd')).toBe('abcd')
    expect(sanitizePlainTerminalInput('a\tb\nc\rd\fe')).toBe('a\tb\nc\rd\fe')
    // The plain sanitizer removes bare ESC; it does NOT understand full SGR sequences.
    expect(sanitizePlainTerminalInput('\x1b[31mred\x1b[0m')).toBe('[31mred[0m')
  })

  test('strips DEL and C1 controls (0x7F–0x9F)', () => {
    expect(sanitizePlainTerminalInput('a\x7fb\x85c\x9fd')).toBe('abcd')
  })

  test('strips bidi format controls', () => {
    expect(sanitizePlainTerminalInput('a\u200Eb\u202Ec\u2066d\u061Ce')).toBe('abcde')
  })

  test('copy-on-first-reject keeps the correct prefix and suffix', () => {
    expect(sanitizePlainTerminalInput('keep\x00drop\x07tail')).toBe('keepdroptail')
    expect(sanitizePlainTerminalInput('\x07leading')).toBe('leading')
    expect(sanitizePlainTerminalInput('trailing\x07')).toBe('trailing')
  })

  test('keeps ordinary visible text, CJK and emoji', () => {
    expect(sanitizePlainTerminalInput('中文 ⚠ ➡ 😀 क्ष')).toBe('中文 ⚠ ➡ 😀 क्ष')
  })

  test('isRejectedPlainTerminalCodePoint is the one reject set assert and sanitize share', () => {
    // The mathematical statement of single-source: for every code unit, the predicate,
    // the assert throw, and the sanitize strip must agree exactly.
    const units: number[] = []
    for (let cp = 0x00; cp <= 0xa0; cp++) units.push(cp)
    units.push(0x061c, 0x200e, 0x200f, 0x202e, 0x2066, 0x2069, 0x4e2d) // bidi controls + a visible CJK
    for (const cp of units) {
      const ch = String.fromCharCode(cp)
      const rejected = isRejectedPlainTerminalCodePoint(cp)
      if (rejected) {
        expect(() => assertPlainTerminalInput(ch)).toThrow()
      } else {
        expect(() => assertPlainTerminalInput(ch)).not.toThrow()
      }
      expect(sanitizePlainTerminalInput(`x${ch}y`)).toBe(rejected ? 'xy' : `x${ch}y`)
    }
  })

  test('sanitized output is always accepted by the plain path', () => {
    const nasty = 'a\x00\x1b[2J\u202Eb\x7f\u2066c\td\ne\r\nf'
    const sanitized = sanitizePlainTerminalInput(nasty)
    expect(() => assertPlainTerminalInput(sanitized)).not.toThrow()
  })
})
