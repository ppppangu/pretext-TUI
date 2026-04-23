// 补建说明：该文件为后续补建，用于解析终端 rich sidecar 路径中的内联 SGR/OSC8 序列并产出可见文本与元数据 spans；当前进度：Task 6 首版，仅支持 inline SGR/OSC8，其他控制序列默认清洗并记录诊断。
import type { TerminalPrepareOptions } from './terminal.js'

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

export type TerminalRichDiagnostic = {
  kind: 'unsupported-control' | 'malformed-sequence'
  rawStart: number
  rawEnd: number
  sequence: string
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
}

function hasStyle(style: TerminalRichStyle): boolean {
  return Object.keys(style).length > 0
}

function cloneStyle(style: TerminalRichStyle): TerminalRichStyle {
  return { ...style }
}

function hasUnsafeControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x1b) {
      return true
    }
  }
  return false
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
      const hasNonWhitespaceAhead = /[^ \t\n\r\f]/.test(text.slice(i))
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
  unsupportedControlMode: 'sanitize' | 'reject' = 'sanitize',
): PreparedRichMetadata {
  let visibleRawText = ''
  const spans: RawVisibleSpan[] = []
  const diagnostics: TerminalRichDiagnostic[] = []
  const rawVisibleMap: Array<{ rawStart: number; rawEnd: number; sourceStart: number; sourceEnd: number }> = []
  const state: TokenizeState = { style: {}, link: null }

  function consumeStringControl(
    start: number,
    afterIntroducer: number,
  ): { end: number; sequence: string; malformed: boolean } {
    let j = afterIntroducer
    while (j < rawText.length) {
      if (rawText[j] === '\x1b' && rawText[j + 1] === '\\') {
        return { end: j + 2, sequence: rawText.slice(start, j + 2), malformed: false }
      }
      if (rawText.charCodeAt(j) === 0x9c) {
        return { end: j + 1, sequence: rawText.slice(start, j + 1), malformed: false }
      }
      j++
    }
    return { end: rawText.length, sequence: rawText.slice(start), malformed: true }
  }

  function pushVisible(text: string, rawStart: number, rawEnd: number): void {
    if (text.length === 0) return
    const start = visibleRawText.length
    visibleRawText += text
    const end = visibleRawText.length
    rawVisibleMap.push({
      rawStart,
      rawEnd,
      sourceStart: start,
      sourceEnd: end,
    })
    if (hasStyle(state.style)) {
      spans.push({
        kind: 'style',
        rawStart,
        rawEnd,
        rawVisibleStart: start,
        rawVisibleEnd: end,
        style: cloneStyle(state.style),
      })
    }
    if (state.link) {
      spans.push({
        kind: 'link',
        rawStart,
        rawEnd,
        rawVisibleStart: start,
        rawVisibleEnd: end,
        uri: state.link,
      })
    }
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
          while (i < rawText.length && (rawText.charCodeAt(i) < 0x40 || rawText.charCodeAt(i) > 0x7e)) i++
          const end = i < rawText.length ? i + 1 : rawText.length
          const sequence = rawText.slice(start, end)
          diagnostics.push({ kind: 'unsupported-control', rawStart: start, rawEnd: end, sequence })
          if (unsupportedControlMode === 'reject') throw new Error(`Unsupported control: ${sequence}`)
          i = end
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
          while (i < rawText.length) {
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
      const end = terminated
        ? rawText[i] === '\x07'
          ? i + 1
          : rawText.charCodeAt(i) === 0x9c
            ? i + 1
          : i + 2
        : rawText.length
          const sequence = rawText.slice(start, end)
          diagnostics.push({
            kind: terminated ? 'unsupported-control' : 'malformed-sequence',
            rawStart: start,
            rawEnd: end,
            sequence,
          })
          if (unsupportedControlMode === 'reject') throw new Error(`Unsupported control: ${sequence}`)
          i = end
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
          diagnostics.push({
            kind: consumed.malformed ? 'malformed-sequence' : 'unsupported-control',
            rawStart: start,
            rawEnd: consumed.end,
            sequence: consumed.sequence,
          })
          if (unsupportedControlMode === 'reject') throw new Error(`Unsupported control: ${consumed.sequence}`)
          i = consumed.end
          chunkStart = i
          continue
        }
        if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f)) && !allowedWhitespace) {
          if (chunk.length > 0) {
            pushVisible(chunk, chunkStart, i)
            chunk = ''
          }
          const sequence = rawText.slice(i, i + 1)
          diagnostics.push({ kind: 'unsupported-control', rawStart: i, rawEnd: i + 1, sequence })
          if (unsupportedControlMode === 'reject') throw new Error(`Unsupported control: ${sequence}`)
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
      while (i < rawText.length && (rawText.charCodeAt(i) < 0x40 || rawText.charCodeAt(i) > 0x7e)) i++
      if (i >= rawText.length) {
        const sequence = rawText.slice(escapeStart)
        diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: rawText.length, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Malformed CSI sequence: ${sequence}`)
        break
      }
      const final = rawText[i]
      const sequence = rawText.slice(escapeStart, Math.min(rawText.length, i + 1))
      if (final !== 'm') {
        diagnostics.push({ kind: 'unsupported-control', rawStart: escapeStart, rawEnd: i + 1, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Unsupported ANSI control: ${sequence}`)
        i++
        continue
      }
      if (!/^[0-9;:]*$/.test(rawText.slice(payloadStart, i))) {
        diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: i + 1, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Malformed SGR sequence: ${sequence}`)
        i++
        continue
      }
      const params = parseSgrParams(rawText.slice(payloadStart, i))
      if (params === null) {
        diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: i + 1, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Malformed SGR sequence: ${sequence}`)
        i++
        continue
      }
      const nextStyle = applySgr(state.style, params)
      if (nextStyle === null) {
        diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: i + 1, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Malformed SGR sequence: ${sequence}`)
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
      while (i < rawText.length) {
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
      const end = terminated
        ? rawText[i] === '\x07'
          ? i + 1
          : rawText.charCodeAt(i) === 0x9c
            ? i + 1
          : i + 2
        : rawText.length
      const sequence = rawText.slice(escapeStart, end)
      if (!terminated) {
        diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: end, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Malformed OSC sequence: ${sequence}`)
        break
      }
      const payload = rawText.slice(payloadStart, i)
      const parts = payload.split(';')
      if (parts[0] === '8') {
        if (parts.length < 3) {
          diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: end, sequence })
          if (unsupportedControlMode === 'reject') throw new Error(`Malformed OSC8 sequence: ${sequence}`)
          state.link = null
          i = end
          continue
        }
        const uri = parts.slice(2).join(';')
        if (hasUnsafeControlChar(uri)) {
          diagnostics.push({ kind: 'malformed-sequence', rawStart: escapeStart, rawEnd: end, sequence })
          if (unsupportedControlMode === 'reject') throw new Error(`Malformed OSC8 URI: ${sequence}`)
          state.link = null
        } else {
          state.link = uri === '' ? null : uri
        }
      } else {
        diagnostics.push({ kind: 'unsupported-control', rawStart: escapeStart, rawEnd: end, sequence })
        if (unsupportedControlMode === 'reject') throw new Error(`Unsupported OSC control: ${sequence}`)
      }
      i = end
      continue
    }

    if (marker === 'P' || marker === 'X' || marker === '^' || marker === '_') {
      const consumed = consumeStringControl(escapeStart, i + 1)
      diagnostics.push({
        kind: consumed.malformed ? 'malformed-sequence' : 'unsupported-control',
        rawStart: escapeStart,
        rawEnd: consumed.end,
        sequence: consumed.sequence,
      })
      if (unsupportedControlMode === 'reject') throw new Error(`Unsupported control: ${consumed.sequence}`)
      i = consumed.end
      continue
    }

    const markerCode = marker?.charCodeAt(0) ?? 0
    if (markerCode >= 0x20 && markerCode <= 0x2f) {
      let j = i + 1
      while (j < rawText.length && (rawText.charCodeAt(j) < 0x30 || rawText.charCodeAt(j) > 0x7e)) j++
      const end = j < rawText.length ? j + 1 : rawText.length
      const sequence = rawText.slice(escapeStart, end)
      diagnostics.push({
        kind: j < rawText.length ? 'unsupported-control' : 'malformed-sequence',
        rawStart: escapeStart,
        rawEnd: end,
        sequence,
      })
      if (unsupportedControlMode === 'reject') throw new Error(`Unsupported escape sequence: ${sequence}`)
      i = end
      continue
    }

    diagnostics.push({
      kind: 'unsupported-control',
      rawStart: escapeStart,
      rawEnd: Math.min(rawText.length, i + 1),
      sequence: rawText.slice(escapeStart, Math.min(rawText.length, i + 1)),
    })
    if (unsupportedControlMode === 'reject') {
      throw new Error(`Unsupported escape sequence: ${rawText.slice(escapeStart, Math.min(rawText.length, i + 1))}`)
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
  }
}
