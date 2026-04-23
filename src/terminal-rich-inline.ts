// 补建说明：该文件为后续补建，用于提供终端 rich metadata/ANSI sidecar 公共 API；当前进度：Task 6 首版，仅支持 SGR/OSC8 metadata 和基于 terminal core 的逐行 materialization。
import {
  materializeTerminalLineRange,
  prepareTerminal,
  type MaterializedTerminalLine,
  type PreparedTerminalText,
  type TerminalCursor,
  type TerminalLayoutOptions,
  type TerminalLineRange,
  type TerminalPrepareOptions,
  walkTerminalLineRanges,
  layoutNextTerminalLineRange,
} from './terminal.js'
import {
  terminalStringWidth,
  terminalTabAdvance,
} from './terminal-string-width.js'
import {
  tokenizeTerminalInlineAnsi,
  type PreparedRichMetadata,
  type TerminalRichDiagnostic,
  type TerminalRichSpan,
  type TerminalRichStyle,
} from './ansi-tokenize.js'

export type PreparedTerminalRichInline = {
  kind: 'prepared-terminal-rich-inline@1'
  rawText: string
  visibleText: string
  prepared: PreparedTerminalText
  spans: readonly TerminalRichSpan[]
  diagnostics: readonly TerminalRichDiagnostic[]
  rawVisibleMap: readonly { rawStart: number; rawEnd: number; sourceStart: number; sourceEnd: number }[]
}

export type TerminalRichFragment = {
  text: string
  sourceText: string
  sourceStart: number
  sourceEnd: number
  columnStart: number
  columnEnd: number
  style: TerminalRichStyle | null
  link: string | null
}

export type MaterializedTerminalRichLine = MaterializedTerminalLine & {
  fragments: TerminalRichFragment[]
  ansiText: string
}

function materializeFragmentVisibleText(
  sourceText: string,
  columnStart: number,
  prepared: PreparedTerminalText,
  visibleSoftHyphenIndex: number | null = null,
): { text: string; width: number } {
  let rendered = ''
  let column = columnStart
  let sourceOffset = 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(sourceText)) {
    if (segment === '\t') {
      const advance = terminalTabAdvance(column, prepared.tabStopAdvance)
      rendered += ' '.repeat(advance)
      column += advance
      sourceOffset += segment.length
      continue
    }
    if (segment === '\u00AD') {
      if (visibleSoftHyphenIndex === sourceOffset) {
        rendered += '-'
        column += 1
      }
      sourceOffset += segment.length
      continue
    }
    if (segment === '\u200B' || segment === '\u2060' || segment === '\uFEFF') {
      sourceOffset += segment.length
      continue
    }
    rendered += segment
    column += terminalStringWidth(segment, prepared.widthProfile)
    sourceOffset += segment.length
  }
  return { text: rendered, width: column - columnStart }
}

function styleToSgr(style: TerminalRichStyle | null): string {
  if (style === null) return '\x1b[0m'
  const codes: string[] = []
  if (style.bold) codes.push('1')
  if (style.dim) codes.push('2')
  if (style.italic) codes.push('3')
  if (style.underline) codes.push('4')
  if (style.inverse) codes.push('7')
  if (style.strikethrough) codes.push('9')
  if (style.fg?.startsWith('ansi256:')) codes.push('38', '5', style.fg.slice('ansi256:'.length))
  if (style.bg?.startsWith('ansi256:')) codes.push('48', '5', style.bg.slice('ansi256:'.length))
  if (style.fg?.startsWith('rgb:')) codes.push('38', '2', ...style.fg.slice(4).split(','))
  if (style.bg?.startsWith('rgb:')) codes.push('48', '2', ...style.bg.slice(4).split(','))
  if (style.fg?.startsWith('ansi:')) codes.push(style.fg.slice(5))
  if (style.bg?.startsWith('ansi:')) codes.push(style.bg.slice(5))
  return codes.length > 0 ? `\x1b[${codes.join(';')}m` : ''
}

function overlappingSpans(
  spans: readonly TerminalRichSpan[],
  start: number,
  end: number,
): TerminalRichSpan[] {
  return spans.filter(span => span.sourceStart < end && span.sourceEnd > start)
}

function sourceBoundaries(spans: readonly TerminalRichSpan[], start: number, end: number): number[] {
  const boundaries = new Set<number>([start, end])
  for (const span of spans) {
    boundaries.add(Math.max(start, span.sourceStart))
    boundaries.add(Math.min(end, span.sourceEnd))
  }
  return [...boundaries].sort((a, b) => a - b)
}

function graphemeBoundaryOffsets(text: string): number[] {
  const boundaries = [0]
  let offset = 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(text)) {
    offset += segment.length
    boundaries.push(offset)
  }
  return boundaries
}

function clampToGraphemeBoundary(
  candidate: number,
  boundaries: number[],
  direction: 'start' | 'end',
): number {
  if (boundaries.includes(candidate)) return candidate
  if (direction === 'start') {
    let result = 0
    for (const boundary of boundaries) {
      if (boundary > candidate) break
      result = boundary
    }
    return result
  }
  for (const boundary of boundaries) {
    if (boundary >= candidate) return boundary
  }
  return boundaries[boundaries.length - 1]!
}

function currentStyle(spans: readonly TerminalRichSpan[], start: number, end: number): TerminalRichStyle | null {
  const styleSpan = spans.find(
    span => span.kind === 'style' && span.sourceStart < end && span.sourceEnd > start,
  )
  return styleSpan?.kind === 'style' ? styleSpan.style : null
}

function currentLink(spans: readonly TerminalRichSpan[], start: number, end: number): string | null {
  const linkSpan = spans.find(
    span => span.kind === 'link' && span.sourceStart < end && span.sourceEnd > start,
  )
  return linkSpan?.kind === 'link' ? linkSpan.uri : null
}

export function prepareTerminalRichInline(
  rawText: string,
  options: TerminalPrepareOptions & { unsupportedControlMode?: 'sanitize' | 'reject' } = {},
): PreparedTerminalRichInline {
  const tokenized: PreparedRichMetadata = tokenizeTerminalInlineAnsi(
    rawText,
    options.whiteSpace,
    options.unsupportedControlMode,
  )
  const spans = tokenized.spans.map(span =>
    span.kind === 'style'
      ? Object.freeze({ ...span, style: Object.freeze({ ...span.style }) })
      : Object.freeze({ ...span }),
  )
  const diagnostics = tokenized.diagnostics.map(diagnostic => Object.freeze({ ...diagnostic }))
  const rawVisibleMap = tokenized.rawVisibleMap.map(entry => Object.freeze({ ...entry }))
  return Object.freeze({
    kind: 'prepared-terminal-rich-inline@1',
    rawText,
    visibleText: tokenized.visibleText,
    prepared: prepareTerminal(tokenized.visibleText, options),
    spans: Object.freeze(spans),
    diagnostics: Object.freeze(diagnostics),
    rawVisibleMap: Object.freeze(rawVisibleMap),
  })
}

export function walkTerminalRichLineRanges(
  prepared: PreparedTerminalRichInline,
  options: TerminalLayoutOptions,
  onLine: (line: TerminalLineRange) => void,
): number {
  return walkTerminalLineRanges(prepared.prepared, options, onLine)
}

export function layoutNextTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  cursor: TerminalCursor,
  options: TerminalLayoutOptions,
): TerminalLineRange | null {
  return layoutNextTerminalLineRange(prepared.prepared, cursor, options)
}

export function materializeTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  line: TerminalLineRange,
): MaterializedTerminalRichLine {
  const base = materializeTerminalLineRange(prepared.prepared, line)
  const spans = overlappingSpans(prepared.spans, line.sourceStart, line.sourceEnd)
  const localBoundaries = graphemeBoundaryOffsets(base.sourceText)
  const boundaries = sourceBoundaries(spans, line.sourceStart, line.sourceEnd).map(boundary =>
    line.sourceStart +
    clampToGraphemeBoundary(boundary - line.sourceStart, localBoundaries, boundary === line.sourceStart ? 'start' : 'end'),
  )
  const fragments: TerminalRichFragment[] = []
  let currentColumn = line.startColumn
  let ansiText = ''
  let renderedOffset = 0
  const lastSoftHyphenOffset =
    line.break.kind === 'soft-hyphen'
      ? base.sourceText.lastIndexOf('\u00AD')
      : -1

  for (let i = 0; i < boundaries.length - 1; i++) {
    const sourceStart = boundaries[i]!
    const sourceEnd = boundaries[i + 1]!
    if (sourceEnd <= sourceStart) continue
    const sourceText = base.sourceText.slice(sourceStart - line.sourceStart, sourceEnd - line.sourceStart)
    const visibleSoftHyphenIndex =
      lastSoftHyphenOffset >= 0 &&
      lastSoftHyphenOffset >= sourceStart - line.sourceStart &&
      lastSoftHyphenOffset < sourceEnd - line.sourceStart
        ? lastSoftHyphenOffset - (sourceStart - line.sourceStart)
        : null
    const materialized = materializeFragmentVisibleText(
      sourceText,
      currentColumn,
      prepared.prepared,
      visibleSoftHyphenIndex,
    )
    let fragmentText = materialized.text
    const remainingBaseText = base.text.slice(renderedOffset)
    while (fragmentText.length > 0 && !remainingBaseText.startsWith(fragmentText)) {
      fragmentText = fragmentText.slice(0, -1)
    }
    const fragmentWidth = terminalStringWidth(fragmentText, prepared.prepared.widthProfile)
    const style = currentStyle(spans, sourceStart, sourceEnd)
    const link = currentLink(spans, sourceStart, sourceEnd)
    const fragment: TerminalRichFragment = {
      text: fragmentText,
      sourceText,
      sourceStart,
      sourceEnd,
      columnStart: currentColumn,
      columnEnd: currentColumn + fragmentWidth,
      style,
      link,
    }
    if (fragment.text === '' && fragment.columnStart === fragment.columnEnd) continue
    currentColumn = fragment.columnEnd
    renderedOffset += fragment.text.length
    fragments.push(fragment)

    if (link) ansiText += `\x1b]8;;${link}\x1b\\`
    if (style) ansiText += styleToSgr(style)
    ansiText += fragment.text
    if (style) ansiText += '\x1b[0m'
    if (link) ansiText += '\x1b]8;;\x1b\\'
  }

  return {
    ...base,
    fragments,
    ansiText,
  }
}
