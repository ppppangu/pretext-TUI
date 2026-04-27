// 补建说明：该文件为后续补建，用于验证 terminal rich sidecar 的生产安全闸门；当前进度：Task 2 首版，覆盖 URI policy、控制序列清洗、bidi control、诊断脱敏与 opt-in ANSI 重放。
import { describe, expect, test } from 'bun:test'
import { TERMINAL_START_CURSOR } from '../../src/index.js'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
} from '../../src/terminal-rich-inline.js'
import {
  assert,
  assertNoUnsafeTerminalOutput,
  hasBidiFormatControls,
} from './validation-helpers.js'

describe('terminal rich security gate', () => {
  test('default profile keeps raw input out of prepared handles', () => {
    const prepared = prepareTerminalRichInline('\x1b[31msecret\x1b[0m')

    expect('rawText' in prepared).toBe(false)
    expect(prepared.raw).toBeUndefined()
    expect(prepared.policy.profile).toBe('default')
    expect(prepared.visibleText).toBe('secret')
  })

  test('transcript profile stores fingerprints without full raw payloads', () => {
    const prepared = prepareTerminalRichInline('\x1b[31msecret\x1b[0m', { profile: 'transcript' })

    expect(prepared.raw?.rawLength).toBeGreaterThan(0)
    expect(prepared.raw?.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect('text' in (prepared.raw ?? {})).toBe(false)
  })

  test('diagnostics are capped and do not expose raw sequence fields', () => {
    const prepared = prepareTerminalRichInline('\x07'.repeat(5), {
      diagnostics: { maxDiagnostics: 2, sampleCodeUnits: 2 },
    })

    expect(prepared.diagnostics).toHaveLength(2)
    for (const diagnostic of prepared.diagnostics) {
      expect(diagnostic.redacted).toBe(true)
      expect(diagnostic.fingerprint).toMatch(/^[0-9a-f]{8}$/)
      expect('sequence' in diagnostic).toBe(false)
      expect(diagnostic.escapedSample?.length).toBeLessThanOrEqual(4)
    }
  })

  test('default diagnostics do not expose escaped raw samples', () => {
    const prepared = prepareTerminalRichInline('\x1b]8;;https://user:pass@example.test\x1b\\secret\x1b]8;;\x1b\\')
    const diagnostic = prepared.diagnostics[0]

    expect(diagnostic?.redacted).toBe(true)
    expect(diagnostic?.escapedSample).toBeUndefined()
    expect(diagnostic?.code).toBe('osc8-uri-credentials-denied')
  })

  test('dangerous OSC8 schemes and credentials are denied without link spans', () => {
    const javascript = prepareTerminalRichInline('\x1b]8;;javascript:alert(1)\x1b\\link\x1b]8;;\x1b\\')
    const credentials = prepareTerminalRichInline('\x1b]8;;https://user:pass@example.test\x1b\\link\x1b]8;;\x1b\\')
    const tooLong = prepareTerminalRichInline('\x1b]8;;https://example.test/abcdef\x1b\\link\x1b]8;;\x1b\\', {
      osc8: { maxUriCodeUnits: 'https://e.test'.length },
    })
    const bidiUri = prepareTerminalRichInline('\x1b]8;;https://example.test/a\u202Ecod.exe\x1b\\link\x1b]8;;\x1b\\')
    const controlUri = prepareTerminalRichInline('\x1b]8;;https://example.test/a\x08b\x1b\\link\x1b]8;;\x1b\\')

    expect(javascript.visibleText).toBe('link')
    expect(credentials.visibleText).toBe('link')
    expect(javascript.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-scheme-denied')).toBe(true)
    expect(credentials.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-credentials-denied')).toBe(true)
    expect(tooLong.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-too-long')).toBe(true)
    expect(bidiUri.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-bidi-format-control')).toBe(true)
    expect(controlUri.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-control')).toBe(true)
    expect(javascript.spans.some(span => span.kind === 'link')).toBe(false)
    expect(credentials.spans.some(span => span.kind === 'link')).toBe(false)
    expect(tooLong.spans.some(span => span.kind === 'link')).toBe(false)
    expect(bidiUri.spans.some(span => span.kind === 'link')).toBe(false)
    expect(controlUri.spans.some(span => span.kind === 'link')).toBe(false)
  })

  test('audit-strict rejects non-https OSC8 links', () => {
    expect(() =>
      prepareTerminalRichInline('\x1b]8;;http://example.test\x1b\\x\x1b]8;;\x1b\\', {
        profile: 'audit-strict',
      }),
    ).toThrow('Terminal OSC8 URI violates security policy')
  })

  test('unsupported string controls sanitize or reject by policy', () => {
    const raw = 'a\x1b]52;c;secret\x07b\x1bPpayload\x1b\\c\x1b^pm\x1b\\d\x1b_apc\x1b\\e\x1bXsos\x1b\\f'
    const sanitized = prepareTerminalRichInline(raw, { whiteSpace: 'pre-wrap' })

    expect(sanitized.visibleText).toBe('abcdef')
    expect(sanitized.diagnostics.map(diagnostic => diagnostic.controlFamily)).toEqual([
      'osc',
      'dcs',
      'pm',
      'apc',
      'sos',
    ])
    assertNoUnsafeTerminalOutput(sanitized.visibleText)
    expect(() => prepareTerminalRichInline(raw, { unsupportedControlMode: 'reject' })).toThrow(
      'Unsupported terminal',
    )
  })

  test('bidi format controls are sanitized or rejected before layout', () => {
    const sanitized = prepareTerminalRichInline('a\u202Eb\u200E\u200F\u061Cc')

    expect(sanitized.visibleText).toBe('abc')
    expect(hasBidiFormatControls(sanitized.visibleText)).toBe(false)
    expect(sanitized.diagnostics.some(diagnostic => diagnostic.code === 'bidi-format-control')).toBe(true)
    expect(() => prepareTerminalRichInline('a\u200Eb', { bidiFormatControls: 'reject' })).toThrow(
      'Bidi format control',
    )
  })

  test('policy enums reject unknown JavaScript values at runtime', () => {
    expect(() => prepareTerminalRichInline('x', { profile: 'named-host' as never })).toThrow(
      'security profile',
    )
    expect(() => prepareTerminalRichInline('x', { rawRetention: 'full' as never })).toThrow(
      'rawRetention',
    )
    expect(() => prepareTerminalRichInline('x', { ansiReemit: 'all' as never })).toThrow(
      'ansiReemit',
    )
    expect(() => prepareTerminalRichInline('x', { osc8: { allowCredentials: 'yes' as never } })).toThrow(
      'allowCredentials',
    )
  })

  test('rich policy and materialize defaults ignore inherited prototype properties', () => {
    const polluted = {
      ansiText: 'sgr-osc8',
      profile: 'transcript',
      rawRetention: 'capped-sample',
      diagnostics: { maxDiagnostics: 8, sampleCodeUnits: 8 },
      osc8: { allowCredentials: true },
    }

    for (const [key, value] of Object.entries(polluted)) {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        value,
      })
    }

    try {
      const prepared = prepareTerminalRichInline(
        '\x1b]8;;https://user:pass@example.test\x1b\\secret\x1b]8;;\x1b\\',
        { whiteSpace: 'pre-wrap' },
      )
      const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
      assert(line !== null, 'expected rich line')

      expect(prepared.policy.profile).toBe('default')
      expect(prepared.raw).toBeUndefined()
      expect(prepared.diagnostics.some(diagnostic => diagnostic.escapedSample !== undefined)).toBe(false)
      expect(prepared.diagnostics.some(diagnostic => diagnostic.code === 'osc8-uri-credentials-denied')).toBe(true)
      expect(prepared.spans.some(span => span.kind === 'link')).toBe(false)
      expect(materializeTerminalRichLineRange(prepared, line).ansiText).toBeUndefined()
    } finally {
      for (const key of Object.keys(polluted)) {
        delete (Object.prototype as Record<string, unknown>)[key]
      }
    }
  })

  test('input and control sequence limits bound hostile payloads', () => {
    expect(() => prepareTerminalRichInline('abc', { limits: { maxInputCodeUnits: 2 } })).toThrow(
      'maxInputCodeUnits',
    )

    const tooLongControl = `a\x1b]0;${'x'.repeat(10)}\x07b`
    const sanitized = prepareTerminalRichInline(tooLongControl, {
      limits: { maxControlSequenceCodeUnits: 5 },
    })

    expect(sanitized.visibleText).toBe('a')
    expect(sanitized.diagnostics.some(diagnostic => diagnostic.code === 'control-sequence-too-long')).toBe(true)
    expect(() =>
      prepareTerminalRichInline(tooLongControl, {
        unsupportedControlMode: 'reject',
        limits: { maxControlSequenceCodeUnits: 5 },
      }),
    ).toThrow('maxControlSequenceCodeUnits')
  })

  test('span and raw-visible map limits are explicit and rejectable', () => {
    const spanLimited = prepareTerminalRichInline('\x1b[31mred\x1b[0m', {
      limits: { maxSpans: 0 },
    })
    expect(spanLimited.completeness.spansTruncated).toBe(true)
    expect(spanLimited.diagnostics.some(diagnostic => diagnostic.code === 'span-limit')).toBe(true)
    expect(() =>
      prepareTerminalRichInline('\x1b[31mred\x1b[0m', {
        unsupportedControlMode: 'reject',
        limits: { maxSpans: 0 },
      }),
    ).toThrow('span count')

    const rawMapLimited = prepareTerminalRichInline('abc', {
      limits: { maxRawVisibleMapEntries: 0 },
    })
    expect(rawMapLimited.completeness.rawVisibleMapTruncated).toBe(true)
    expect(rawMapLimited.diagnostics.some(diagnostic => diagnostic.code === 'raw-visible-map-limit')).toBe(true)
    expect(() =>
      prepareTerminalRichInline('abc', {
        unsupportedControlMode: 'reject',
        limits: { maxRawVisibleMapEntries: 0 },
      }),
    ).toThrow('raw-visible map')
  })

  test('ANSI reconstruction is opt-in and scoped by policy', () => {
    const prepared = prepareTerminalRichInline(
      '\x1b[31mred\x1b]8;;https://example.test\x1b\\link\x1b]8;;\x1b\\\x1b[0m',
      { whiteSpace: 'pre-wrap' },
    )
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
    assert(line !== null, 'expected rich line')

    expect(materializeTerminalRichLineRange(prepared, line).ansiText).toBeUndefined()
    expect(materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr' }).ansiText).toContain('\x1b[31m')
    expect(materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr' }).ansiText).not.toContain('\x1b]8;;')
    expect(materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' }).ansiText).toContain('\x1b]8;;https://example.test\x1b\\')

    const noReemit = prepareTerminalRichInline('\x1b[31mred\x1b[0m', { ansiReemit: 'none' })
    const noReemitLine = layoutNextTerminalRichLineRange(noReemit, TERMINAL_START_CURSOR, { columns: 20 })
    assert(noReemitLine !== null, 'expected rich line')
    expect(materializeTerminalRichLineRange(noReemit, noReemitLine, { ansiText: 'sgr' }).ansiText).toBeUndefined()

    const limited = prepareTerminalRichInline('\x1b[31mred\x1b[0m', {
      limits: { maxAnsiOutputCodeUnits: 2 },
    })
    const limitedLine = layoutNextTerminalRichLineRange(limited, TERMINAL_START_CURSOR, { columns: 20 })
    assert(limitedLine !== null, 'expected rich line')
    expect(() => materializeTerminalRichLineRange(limited, limitedLine, { ansiText: 'sgr' })).toThrow(
      'maxAnsiOutputCodeUnits',
    )
  })

  test('ANSI reconstruction options reject invalid runtime values before policy downgrade', () => {
    const prepared = prepareTerminalRichInline(
      '\x1b[31mred\x1b]8;;https://example.test\x1b\\link\x1b]8;;\x1b\\\x1b[0m',
      { whiteSpace: 'pre-wrap', ansiReemit: 'none' },
    )
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
    assert(line !== null, 'expected rich line')

    expect(() => materializeTerminalRichLineRange(prepared, line, null as never)).toThrow(
      'options must be an object',
    )
    expect(() => materializeTerminalRichLineRange(prepared, line, [] as never)).toThrow(
      'options must be an object',
    )
    expect(() => materializeTerminalRichLineRange(prepared, line, { ansiText: 'all' as never })).toThrow(
      'options.ansiText',
    )
    expect(() => materializeTerminalRichLineRange(prepared, line, { ansiText: false as never })).toThrow(
      'options.ansiText',
    )
    expect(() => materializeTerminalRichLineRange(prepared, line, {
      ansiText: 'none',
      unknown: true,
    } as never)).toThrow('options.unknown')
    expect(materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr' }).ansiText).toBeUndefined()
  })

  test('prepared sgr reemit policy downgrades requested osc8 materialization to sgr', () => {
    const prepared = prepareTerminalRichInline(
      '\x1b[31mred\x1b]8;;https://example.test\x1b\\link\x1b]8;;\x1b\\\x1b[0m',
      { whiteSpace: 'pre-wrap', ansiReemit: 'sgr' },
    )
    const line = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, { columns: 20 })
    assert(line !== null, 'expected rich line')
    const materialized = materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' })

    expect(materialized.ansiText).toContain('\x1b[31m')
    expect(materialized.ansiText).not.toContain('\x1b]8;;')
  })
})
