// 补建说明：该文件为后续补建，用于解析终端 rich sidecar 路径中的内联 SGR/OSC8 序列并产出可见文本与元数据 spans；当前进度：Task 6 首版，仅支持 inline SGR/OSC8，其他控制序列默认清洗并记录诊断。
import type { TerminalPrepareOptions } from './terminal.js'
import {
  createTerminalRichDiagnostic,
  resolveTerminalRichPolicy,
  validateTerminalRichOsc8Uri,
  type TerminalRichCompleteness,
  type TerminalRichControlFamily,
  type TerminalRichDiagnostic,
  type TerminalRichSecurityPolicyInput,
} from './terminal-rich-policy.js'
import { isTerminalBidiFormatControlCodePoint } from './terminal-control-policy.js'

export type TerminalRichStyle = {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

export type TerminalRichSpan =
  | {
      kind: 'style'
      rawStart: number
      rawEnd: number
      sourceStart: number
      sourceEnd: number
      style: TerminalRichStyle
    }
  | {
      kind: 'link'
      rawStart: number
      rawEnd: number
      sourceStart: number
      sourceEnd: number
      uri: string
    }

type RawVisibleSpan =
  | {
      kind: 'style'
      rawStart: number
      rawEnd: number
      rawVisibleStart: number
      rawVisibleEnd: number
      style: TerminalRichStyle
    }
  | {
      kind: 'link'
      rawStart: number
      rawEnd: number
      rawVisibleStart: number
      rawVisibleEnd: number
      uri: string
    }

type TokenizeState = {
  style: TerminalRichStyle
  link: string | null
}

export type PreparedRichMetadata = {
  visibleText: string
  spans: TerminalRichSpan[]
  diagnostics: TerminalRichDiagnostic[]
  rawVisibleMap: Array<{ rawStart: number; rawEnd: number; sourceStart: number; sourceEnd: number }>
  completeness: TerminalRichCompleteness
}

function hasStyle(style: TerminalRichStyle): boolean {
  return Object.keys(style).length > 0
}

function cloneStyle(style: TerminalRichStyle): TerminalRichStyle {
  return { ...style }
}

function applySgr(style: TerminalRichStyle, params: number[]): TerminalRichStyle | null {
  const next = { ...style }
  if (params.length === 0) params = [0]
  for (let i = 0; i < params.length; i++) {
    const code = params[i]!
    switch (code) {
      case 0:
        for (const key of Object.keys(next) as Array<keyof TerminalRichStyle>) delete next[key]
        break
      case 1:
        next.bold = true
        break
      case 2:
        next.dim = true
        break
      case 3:
        next.italic = true
        break
      case 4:
        next.underline = true
        break
      case 7:
        next.inverse = true
        break
      case 9:
        next.strikethrough = true
        break
      case 22:
        delete next.bold
        delete next.dim
        break
      case 23:
        delete next.italic
        break
      case 24:
        delete next.underline
        break
      case 27:
        delete next.inverse
        break
      case 29:
        delete next.strikethrough
        break
      case 39:
        delete next.fg
        break
      case 49:
        delete next.bg
        break
      default:
        if (code >= 30 && code <= 37) next.fg = `ansi:${code}`
        else if (code >= 40 && code <= 47) next.bg = `ansi:${code}`
        else if (code >= 90 && code <= 97) next.fg = `ansi:${code}`
        else if (code >= 100 && code <= 107) next.bg = `ansi:${code}`
        else if (code === 38 || code === 48) {
          if (params[i + 1] === 5 && params[i + 2] !== undefined) {
            const value = `ansi256:${params[i + 2]!}`
            if (code === 38) next.fg = value
            else next.bg = value
            i += 2
          } else if (
            params[i + 1] === 2 &&
            params[i + 2] !== undefined &&
            params[i + 3] !== undefined &&
            params[i + 4] !== undefined
          ) {
            const value = `rgb:${params[i + 2]!},${params[i + 3]!},${params[i + 4]!}`
            if (code === 38) next.fg = value
            else next.bg = value
            i += 4
          } else {
            return null
          }
        }
        break
    }
  }
  return next
}

function parseSgrParams(payload: string): number[] | null {
  const tokens = payload.split(';')
  const params: number[] = []
  for (const token of tokens) {
    if (token === '') {
      params.push(0)
      continue
    }
    if (token.includes(':')) {
      if (token.startsWith('38:') || token.startsWith('48:')) {
        const parts = token.split(':')
        if ((parts[1] === '2' || parts[1] === '5') && parts[2] === '') {
          parts.splice(2, 1)
        }
        const parsed = parts.map(value => Number.parseInt(value, 10))
        if (parsed.some(value => !Number.isFinite(value))) return null
        params.push(...parsed)
        continue
      }
      const head = Number.parseInt(token.split(':')[0]!, 10)
      if (!Number.isFinite(head)) return null
      params.push(head)
      continue
    }
    const value = Number.parseInt(token, 10)
    if (!Number.isFinite(value)) return null
    params.push(value)
  }
  return params
}

function c1StringControlFamily(code: number): TerminalRichControlFamily {
  if (code === 0x90) return 'dcs'
  if (code === 0x98) return 'sos'
  if (code === 0x9e) return 'pm'
  return 'apc'
}

function escStringControlFamily(marker: string | undefined): TerminalRichControlFamily {
  if (marker === 'P') return 'dcs'
  if (marker === 'X') return 'sos'
  if (marker === '^') return 'pm'
  return 'apc'
}

function normalizeVisibleTextWithMap(
  text: string,
  whiteSpace: TerminalPrepareOptions['whiteSpace'] = 'normal',
): { text: string; rawToNormalized: number[] } {
  if (whiteSpace === 'pre-wrap') {
    let normalized = ''
    const rawToNormalized = Array<number>(text.length + 1).fill(0)
    let out = 0
    for (let i = 0; i < text.length; i++) {
      rawToNormalized[i] = out
      const ch = text[i]!
      if (ch === '\r') {
        if (text[i + 1] === '\n') {
          normalized += '\n'
          out++
          rawToNormalized[i + 1] = out - 1
          i++
        } else {
          normalized += '\n'
          out++
        }
      } else if (ch === '\f') {
        normalized += '\n'
        out++
      } else {
        normalized += ch
        out++
      }
    }
    rawToNormalized[text.length] = out
    return { text: normalized, rawToNormalized }
  }

  let normalized = ''
  const rawToNormalized = Array<number>(text.length + 1).fill(0)
  const hasNonWhitespaceAtOrAfter = Array<boolean>(text.length + 1).fill(false)
  let seenNonWhitespace = false
  for (let j = text.length - 1; j >= 0; j--) {
    if (!/[ \t\n\r\f]/.test(text[j]!)) seenNonWhitespace = true
    hasNonWhitespaceAtOrAfter[j] = seenNonWhitespace
  }
  let out = 0
  let i = 0
  while (i < text.length) {
    rawToNormalized[i] = out
    const ch = text[i]!
    if (/[ \t\n\r\f]/.test(ch)) {
      const runStart = i
      while (i < text.length && /[ \t\n\r\f]/.test(text[i]!)) {
        rawToNormalized[i] = out
        i++
      }
      const hasOutput = normalized.length > 0
      const hasNonWhitespaceAhead = hasNonWhitespaceAtOrAfter[i] ?? false
      if (hasOutput && hasNonWhitespaceAhead) {
        normalized += ' '
        out++
      }
      rawToNormalized[i] = out
      rawToNormalized[runStart] = out - (hasOutput && hasNonWhitespaceAhead ? 1 : 0)
      continue
    }
    normalized += ch
    out++
    i++
    rawToNormalized[i] = out
  }
  rawToNormalized[text.length] = out
  return { text: normalized, rawToNormalized }
}

function rebaseSpans(
  spans: RawVisibleSpan[],
  rawToNormalized: number[],
): TerminalRichSpan[] {
  const rebased: TerminalRichSpan[] = []
  for (const span of spans) {
    const sourceStart = rawToNormalized[span.rawVisibleStart] ?? 0
    const sourceEnd = rawToNormalized[span.rawVisibleEnd] ?? sourceStart
    if (sourceEnd <= sourceStart) continue
    if (span.kind === 'style') {
      rebased.push({
        kind: 'style',
        rawStart: span.rawStart,
        rawEnd: span.rawEnd,
        sourceStart,
        sourceEnd,
        style: span.style,
      })
    } else {
      rebased.push({
        kind: 'link',
        rawStart: span.rawStart,
        rawEnd: span.rawEnd,
        sourceStart,
        sourceEnd,
        uri: span.uri,
      })
    }
  }
  return rebased
}

export function tokenizeTerminalInlineAnsi(
  rawText: string,
  whiteSpace: TerminalPrepareOptions['whiteSpace'] = 'normal',
  policyInput: TerminalRichSecurityPolicyInput = {},
): PreparedRichMetadata {
  const policy = resolveTerminalRichPolicy(policyInput)
  if (rawText.length > policy.limits.maxInputCodeUnits) {
    throw new Error('Terminal rich input exceeds maxInputCodeUnits')
  }
  let visibleRawText = ''
  const spans: RawVisibleSpan[] = []
  const diagnostics: TerminalRichDiagnostic[] = []
  const rawVisibleMap: Array<{ rawStart: number; rawEnd: number; sourceStart: number; sourceEnd: number }> = []
  const state: TokenizeState = { style: {}, link: null }
  let spanLimitReported = false
  let rawMapLimitReported = false
  let diagnosticsTruncated = false

  function pushDiagnostic(input: {
    kind: TerminalRichDiagnostic['kind']
    code: string
    controlFamily?: TerminalRichControlFamily
    rawStart: number
    rawEnd: number
    sequence: string
  }): void {
    if (diagnostics.length >= policy.diagnostics.maxDiagnostics) {
      diagnosticsTruncated = true
      return
    }
    diagnostics.push(createTerminalRichDiagnostic({ ...input, policy }))
  }

  function rejectIfNeeded(message: string): void {
    if (policy.unsupportedControlMode === 'reject') {
      throw new Error(message)
    }
  }

  function checkSequenceLimit(
    start: number,
    end: number,
    sequence: string,
    controlFamily: TerminalRichControlFamily,
  ): boolean {
    if (sequence.length <= policy.limits.maxControlSequenceCodeUnits) return false
    pushDiagnostic({
      kind: 'limit-exceeded',
      code: 'control-sequence-too-long',
      controlFamily,
      rawStart: start,
      rawEnd: end,
      sequence,
    })
    rejectIfNeeded('Terminal rich control sequence exceeds maxControlSequenceCodeUnits')
    return true
  }

  function controlLimitEnd(start: number): number {
    return Math.min(rawText.length, start + policy.limits.maxControlSequenceCodeUnits + 1)
  }

  function consumeStringControl(
    start: number,
    afterIntroducer: number,
  ): { end: number; sequence: string; malformed: boolean; limitExceeded: boolean } {
    let j = afterIntroducer
    const limitEnd = controlLimitEnd(start)
    while (j < rawText.length && j < limitEnd) {
      if (rawText[j] === '\x1b' && rawText[j + 1] === '\\') {
        return { end: j + 2, sequence: rawText.slice(start, j + 2), malformed: false, limitExceeded: false }
      }
      if (rawText.charCodeAt(j) === 0x9c) {
        return { end: j + 1, sequence: rawText.slice(start, j + 1), malformed: false, limitExceeded: false }
      }
      j++
    }
    if (j >= limitEnd) {
      return { end: limitEnd, sequence: rawText.slice(start, limitEnd), malformed: false, limitExceeded: true }
    }
    return { end: rawText.length, sequence: rawText.slice(start), malformed: true, limitExceeded: false }
  }

  function pushVisible(text: string, rawStart: number, rawEnd: number): void {
    if (text.length === 0) return
    const start = visibleRawText.length
    visibleRawText += text
    const end = visibleRawText.length
    if (rawVisibleMap.length < policy.limits.maxRawVisibleMapEntries) {
      rawVisibleMap.push({
        rawStart,
        rawEnd,
        sourceStart: start,
        sourceEnd: end,
      })
    } else if (!rawMapLimitReported) {
      rawMapLimitReported = true
      pushDiagnostic({
        kind: 'limit-exceeded',
        code: 'raw-visible-map-limit',
        controlFamily: 'raw-map',
        rawStart,
        rawEnd,
        sequence: text,
      })
      rejectIfNeeded('Terminal rich raw-visible map exceeds maxRawVisibleMapEntries')
    }
    if (hasStyle(state.style)) {
      pushSpan({
        kind: 'style',
        rawStart,
        rawEnd,
        rawVisibleStart: start,
        rawVisibleEnd: end,
        style: cloneStyle(state.style),
      })
    }
    if (state.link) {
      pushSpan({
        kind: 'link',
        rawStart,
        rawEnd,
        rawVisibleStart: start,
        rawVisibleEnd: end,
        uri: state.link,
      })
    }
  }

  function pushSpan(span: RawVisibleSpan): void {
    if (spans.length < policy.limits.maxSpans) {
      spans.push(span)
      return
    }
    if (spanLimitReported) return
    spanLimitReported = true
    pushDiagnostic({
      kind: 'limit-exceeded',
      code: 'span-limit',
      controlFamily: 'span',
      rawStart: span.rawStart,
      rawEnd: span.rawEnd,
      sequence: rawText.slice(span.rawStart, span.rawEnd),
    })
    rejectIfNeeded('Terminal rich span count exceeds maxSpans')
  }

  let i = 0
  while (i < rawText.length) {
    if (rawText[i] !== '\x1b') {
      let chunk = ''
      let chunkStart = i
      while (i < rawText.length && rawText[i] !== '\x1b') {
        const ch = rawText[i]!
        const code = rawText.charCodeAt(i)
        const allowedWhitespace = ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
        if (code === 0x9b) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const start = i
          i++
          const limitEnd = controlLimitEnd(start)
          while (i < rawText.length && i < limitEnd && (rawText.charCodeAt(i) < 0x40 || rawText.charCodeAt(i) > 0x7e)) i++
          const limitExceeded = i >= limitEnd
          const end = limitExceeded ? limitEnd : i < rawText.length ? i + 1 : rawText.length
          const sequence = rawText.slice(start, end)
          if (!checkSequenceLimit(start, end, sequence, 'csi')) {
            pushDiagnostic({ kind: 'unsupported-control', code: 'c1-csi-unsupported', controlFamily: 'csi', rawStart: start, rawEnd: end, sequence })
            rejectIfNeeded('Unsupported terminal control')
          }
          i = limitExceeded ? rawText.length : end
          chunkStart = i
          continue
        }
        if (code === 0x9d) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const start = i
          i++
          let terminated = false
          const limitEnd = controlLimitEnd(start)
          while (i < rawText.length && i < limitEnd) {
            if (rawText[i] === '\x07') {
              terminated = true
              break
            }
            if (rawText.charCodeAt(i) === 0x9c) {
              terminated = true
              break
            }
            if (rawText[i] === '\x1b' && rawText[i + 1] === '\\') {
              terminated = true
              break
            }
            i++
          }
          const limitExceeded = !terminated && i >= limitEnd
          const end = limitExceeded
            ? limitEnd
            : terminated
            ? rawText[i] === '\x07'
              ? i + 1
              : rawText.charCodeAt(i) === 0x9c
                ? i + 1
                : i + 2
            : rawText.length
          const sequence = rawText.slice(start, end)
          if (!checkSequenceLimit(start, end, sequence, 'osc')) {
            pushDiagnostic({
              kind: terminated ? 'unsupported-control' : 'malformed-sequence',
              code: terminated ? 'c1-osc-unsupported' : 'c1-osc-malformed',
              controlFamily: 'osc',
              rawStart: start,
              rawEnd: end,
              sequence,
            })
            rejectIfNeeded('Unsupported terminal OSC control')
          }
          i = limitExceeded ? rawText.length : end
          chunkStart = i
          continue
        }
        if (code === 0x90 || code === 0x98 || code === 0x9e || code === 0x9f) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const start = i
          const consumed = consumeStringControl(start, i + 1)
          const family = c1StringControlFamily(code)
          const sequenceTooLong = checkSequenceLimit(start, consumed.end, consumed.sequence, family) || consumed.limitExceeded
          if (!sequenceTooLong) {
            pushDiagnostic({
              kind: consumed.malformed ? 'malformed-sequence' : 'unsupported-control',
              code: consumed.malformed ? `${family}-malformed` : `${family}-unsupported`,
              controlFamily: family,
              rawStart: start,
              rawEnd: consumed.end,
              sequence: consumed.sequence,
            })
            rejectIfNeeded('Unsupported terminal string control')
          }
          i = consumed.limitExceeded ? rawText.length : consumed.end
          chunkStart = i
          continue
        }
        if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f)) && !allowedWhitespace) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const sequence = rawText.slice(i, i + 1)
          pushDiagnostic({ kind: 'unsupported-control', code: code <= 0x1f ? 'c0-control' : 'c1-control', controlFamily: code <= 0x1f ? 'c0' : 'c1', rawStart: i, rawEnd: i + 1, sequence })
          rejectIfNeeded('Unsupported terminal control')
          i++
          chunkStart = i
          continue
        }
        if (isTerminalBidiFormatControlCodePoint(code)) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const sequence = rawText.slice(i, i + 1)
          pushDiagnostic({ kind: 'policy-violation', code: 'bidi-format-control', controlFamily: 'bidi-format', rawStart: i, rawEnd: i + 1, sequence })
          if (policy.bidiFormatControls === 'reject') {
            throw new Error('Bidi format control is not allowed in terminal rich text')
          }
          i++
          chunkStart = i
          continue
        }
        chunk += ch
        i++
      }
      pushVisible(chunk, chunkStart, i)
      continue
    }

    const escapeStart = i
    i++
    const marker = rawText[i]
    if (marker === '[') {
      i++
      const payloadStart = i
      const limitEnd = controlLimitEnd(escapeStart)
      while (i < rawText.length && i < limitEnd && (rawText.charCodeAt(i) < 0x40 || rawText.charCodeAt(i) > 0x7e)) i++
      if (i >= limitEnd) {
        const sequence = rawText.slice(escapeStart, limitEnd)
        checkSequenceLimit(escapeStart, limitEnd, sequence, 'csi')
        i = rawText.length
        continue
      }
      if (i >= rawText.length) {
        const sequence = rawText.slice(escapeStart)
        if (!checkSequenceLimit(escapeStart, rawText.length, sequence, 'csi')) {
          pushDiagnostic({
            kind: 'malformed-sequence',
            code: 'csi-malformed',
            controlFamily: 'csi',
            rawStart: escapeStart,
            rawEnd: rawText.length,
            sequence,
          })
          rejectIfNeeded('Malformed terminal CSI sequence')
        }
        break
      }
      const final = rawText[i]
      const sequence = rawText.slice(escapeStart, Math.min(rawText.length, i + 1))
      const sequenceTooLong = checkSequenceLimit(escapeStart, i + 1, sequence, final === 'm' ? 'sgr' : 'csi')
      if (final !== 'm') {
        if (!sequenceTooLong) {
          pushDiagnostic({
            kind: 'unsupported-control',
            code: 'csi-unsupported',
            controlFamily: 'csi',
            rawStart: escapeStart,
            rawEnd: i + 1,
            sequence,
          })
          rejectIfNeeded('Unsupported terminal CSI control')
        }
        i++
        continue
      }
      if (sequenceTooLong) {
        i++
        continue
      }
      if (!/^[0-9;:]*$/.test(rawText.slice(payloadStart, i))) {
        pushDiagnostic({
          kind: 'malformed-sequence',
          code: 'sgr-malformed-payload',
          controlFamily: 'sgr',
          rawStart: escapeStart,
          rawEnd: i + 1,
          sequence,
        })
        rejectIfNeeded('Malformed terminal SGR sequence')
        i++
        continue
      }
      const params = parseSgrParams(rawText.slice(payloadStart, i))
      if (params === null) {
        pushDiagnostic({
          kind: 'malformed-sequence',
          code: 'sgr-malformed-params',
          controlFamily: 'sgr',
          rawStart: escapeStart,
          rawEnd: i + 1,
          sequence,
        })
        rejectIfNeeded('Malformed terminal SGR sequence')
        i++
        continue
      }
      const nextStyle = applySgr(state.style, params)
      if (nextStyle === null) {
        pushDiagnostic({
          kind: 'malformed-sequence',
          code: 'sgr-unsupported-color',
          controlFamily: 'sgr',
          rawStart: escapeStart,
          rawEnd: i + 1,
          sequence,
        })
        rejectIfNeeded('Malformed terminal SGR sequence')
        i++
        continue
      }
      state.style = nextStyle
      i++
      continue
    }

    if (marker === ']') {
      i++
      const payloadStart = i
      let terminated = false
      const limitEnd = controlLimitEnd(escapeStart)
      while (i < rawText.length && i < limitEnd) {
        if (rawText[i] === '\x07') {
          terminated = true
          break
        }
        if (rawText.charCodeAt(i) === 0x9c) {
          terminated = true
          break
        }
        if (rawText[i] === '\x1b' && rawText[i + 1] === '\\') {
          terminated = true
          break
        }
        i++
      }
      const limitExceeded = !terminated && i >= limitEnd
      const end = limitExceeded
        ? limitEnd
        : terminated
        ? rawText[i] === '\x07'
          ? i + 1
          : rawText.charCodeAt(i) === 0x9c
            ? i + 1
            : i + 2
        : rawText.length
      const sequence = rawText.slice(escapeStart, end)
      const sequenceTooLong = checkSequenceLimit(escapeStart, end, sequence, 'osc')
      if (sequenceTooLong) {
        i = limitExceeded ? rawText.length : end
        if (!terminated) break
        continue
      }
      if (!terminated) {
        pushDiagnostic({
          kind: 'malformed-sequence',
          code: 'osc-malformed',
          controlFamily: 'osc',
          rawStart: escapeStart,
          rawEnd: end,
          sequence,
        })
        rejectIfNeeded('Malformed terminal OSC sequence')
        break
      }
      const payload = rawText.slice(payloadStart, i)
      const parts = payload.split(';')
      if (parts[0] === '8') {
        if (parts.length < 3) {
          pushDiagnostic({
            kind: 'malformed-sequence',
            code: 'osc8-malformed',
            controlFamily: 'osc8',
            rawStart: escapeStart,
            rawEnd: end,
            sequence,
          })
          rejectIfNeeded('Malformed terminal OSC8 sequence')
          state.link = null
          i = end
          continue
        }
        const uri = parts.slice(2).join(';')
        const validated = validateTerminalRichOsc8Uri(uri, policy)
        if (!validated.ok) {
          pushDiagnostic({
            kind: 'policy-violation',
            code: validated.code,
            controlFamily: 'osc8',
            rawStart: escapeStart,
            rawEnd: end,
            sequence,
          })
          rejectIfNeeded('Terminal OSC8 URI violates security policy')
          state.link = null
        } else {
          state.link = validated.uri === '' ? null : validated.uri
        }
      } else {
        pushDiagnostic({
          kind: 'unsupported-control',
          code: 'osc-unsupported',
          controlFamily: 'osc',
          rawStart: escapeStart,
          rawEnd: end,
          sequence,
        })
        rejectIfNeeded('Unsupported terminal OSC control')
      }
      i = end
      continue
    }

    if (marker === 'P' || marker === 'X' || marker === '^' || marker === '_') {
      const consumed = consumeStringControl(escapeStart, i + 1)
      const family = escStringControlFamily(marker)
      const sequenceTooLong = checkSequenceLimit(escapeStart, consumed.end, consumed.sequence, family) || consumed.limitExceeded
      if (!sequenceTooLong) {
        pushDiagnostic({
          kind: consumed.malformed ? 'malformed-sequence' : 'unsupported-control',
          code: consumed.malformed ? `${family}-malformed` : `${family}-unsupported`,
          controlFamily: family,
          rawStart: escapeStart,
          rawEnd: consumed.end,
          sequence: consumed.sequence,
        })
        rejectIfNeeded('Unsupported terminal string control')
      }
      i = consumed.limitExceeded ? rawText.length : consumed.end
      continue
    }

    const markerCode = marker?.charCodeAt(0) ?? 0
    if (markerCode >= 0x20 && markerCode <= 0x2f) {
      let j = i + 1
      const limitEnd = controlLimitEnd(escapeStart)
      while (j < rawText.length && j < limitEnd && (rawText.charCodeAt(j) < 0x30 || rawText.charCodeAt(j) > 0x7e)) j++
      const limitExceeded = j >= limitEnd
      const end = limitExceeded ? limitEnd : j < rawText.length ? j + 1 : rawText.length
      const sequence = rawText.slice(escapeStart, end)
      if (!checkSequenceLimit(escapeStart, end, sequence, 'esc')) {
        pushDiagnostic({
          kind: j < rawText.length ? 'unsupported-control' : 'malformed-sequence',
          code: j < rawText.length ? 'escape-unsupported' : 'escape-malformed',
          controlFamily: 'esc',
          rawStart: escapeStart,
          rawEnd: end,
          sequence,
        })
        rejectIfNeeded('Unsupported terminal escape sequence')
      }
      i = limitExceeded ? rawText.length : end
      continue
    }

    const end = Math.min(rawText.length, i + 1)
    const sequence = rawText.slice(escapeStart, end)
    if (!checkSequenceLimit(escapeStart, end, sequence, 'esc')) {
      pushDiagnostic({
        kind: 'unsupported-control',
        code: 'escape-unsupported',
        controlFamily: 'esc',
        rawStart: escapeStart,
        rawEnd: end,
        sequence,
      })
      rejectIfNeeded('Unsupported terminal escape sequence')
    }
    i++
  }

  const normalized = normalizeVisibleTextWithMap(visibleRawText, whiteSpace)
  for (const run of rawVisibleMap) {
    run.sourceStart = normalized.rawToNormalized[run.sourceStart] ?? 0
    run.sourceEnd = normalized.rawToNormalized[run.sourceEnd] ?? run.sourceStart
  }
  return {
    visibleText: normalized.text,
    spans: rebaseSpans(spans, normalized.rawToNormalized),
    diagnostics,
    rawVisibleMap,
    completeness: Object.freeze({
      diagnosticsTruncated,
      spansTruncated: spanLimitReported,
      rawVisibleMapTruncated: rawMapLimitReported,
    }),
  }
}
