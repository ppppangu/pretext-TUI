// 补建说明：该文件为后续补建，用于提供终端 rich metadata/ANSI sidecar 公共 API；当前进度：Batch 6B.1 将 rich materialization 的宽度 fallback 迁移到 PreparedTerminalReader，避免依赖 legacy prepared arrays。
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
  getTerminalLineSourceBoundaryOffsets,
  materializeTerminalLineSourceRange,
} from './terminal-line-source.js'
import {
  extractTerminalSelection,
  extractTerminalSourceRange,
  type TerminalSelection,
  type TerminalSelectionExtraction,
  type TerminalSelectionExtractionOptions,
  type TerminalSelectionExtractionFragment,
  type TerminalSourceRangeExtractionRequest,
} from './terminal-selection.js'
import {
  getInternalPreparedTerminalReader,
  type PreparedTerminalReader,
} from './terminal-prepared-reader.js'
import { terminalStringWidth } from './terminal-string-width.js'
import {
  tokenizeTerminalInlineAnsi,
  type PreparedRichMetadata,
  type TerminalRichSpan,
  type TerminalRichStyle,
} from './ansi-tokenize.js'
import {
  createTerminalRichSpanIntervalIndex,
  getTerminalRichSpansForSourceRange,
  type TerminalRichSpanIntervalIndex,
} from './terminal-rich-span-index.js'
import {
  createTerminalRichRawSummary,
  resolveTerminalRichPolicy,
  summarizeTerminalRichPolicy,
  type TerminalRichAnsiReemitPolicy,
  type TerminalRichCompleteness,
  type TerminalRichDiagnostic,
  type TerminalRichPolicySummary,
  type TerminalRichRawSummary,
  type TerminalRichSecurityPolicyInput,
} from './terminal-rich-policy.js'
import { recordTerminalPerformanceCounter } from './terminal-performance-counters.js'

export type TerminalRichPrepareOptions = TerminalPrepareOptions & TerminalRichSecurityPolicyInput

export type PreparedTerminalRichInline = {
  kind: 'prepared-terminal-rich-inline@1'
  visibleText: string
  prepared: PreparedTerminalText
  spans: readonly TerminalRichSpan[]
  diagnostics: readonly TerminalRichDiagnostic[]
  rawVisibleMap: readonly { rawStart: number; rawEnd: number; sourceStart: number; sourceEnd: number }[]
  raw?: TerminalRichRawSummary
  policy: TerminalRichPolicySummary
  completeness: TerminalRichCompleteness
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
  ansiText?: string
}

export type TerminalRichSelectionExtractionFragment = TerminalRichFragment & Readonly<{
  kind: 'terminal-rich-selection-extraction-fragment@1'
  row: number
}>

export type TerminalRichSelectionExtraction = TerminalSelectionExtraction & Readonly<{
  richFragments: readonly TerminalRichSelectionExtractionFragment[]
}>

export type TerminalRichMaterializeOptions = Readonly<{
  ansiText?: TerminalRichAnsiReemitPolicy
}>

type TerminalRichInlineState = Readonly<{
  spanIndex: TerminalRichSpanIntervalIndex
}>

const terminalRichInlineStates = new WeakMap<PreparedTerminalRichInline, TerminalRichInlineState>()

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

function overlappingSpansForRange(
  prepared: PreparedTerminalRichInline,
  start: number,
  end: number,
): readonly TerminalRichSpan[] {
  return getTerminalRichSpansForSourceRange(
    getTerminalRichInlineState(prepared).spanIndex,
    { sourceStart: start, sourceEnd: end },
  )
}

function sourceBoundaries(spans: readonly TerminalRichSpan[], start: number, end: number): number[] {
  const boundaries = new Set<number>([start, end])
  for (const span of spans) {
    boundaries.add(Math.max(start, span.sourceStart))
    boundaries.add(Math.min(end, span.sourceEnd))
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  recordTerminalPerformanceCounter('richBoundaryCount', sorted.length)
  return sorted
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

function effectiveAnsiTextMode(
  prepared: PreparedTerminalRichInline,
  options: TerminalRichMaterializeOptions,
): TerminalRichAnsiReemitPolicy {
  const requested = hasOwn(options as Record<string, unknown>, 'ansiText')
    ? options.ansiText ?? 'none'
    : 'none'
  if (requested === 'none' || prepared.policy.ansiReemit === 'none') return 'none'
  if (prepared.policy.ansiReemit === 'sgr') return 'sgr'
  return requested
}

function normalizeTerminalRichMaterializeOptions(
  options: TerminalRichMaterializeOptions | undefined,
): TerminalRichMaterializeOptions {
  if (options === undefined) return {}
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Terminal rich materialize options must be an object')
  }
  const record = options as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key !== 'ansiText') {
      throw new Error(`Terminal rich materialize options.${key} is not supported`)
    }
  }
  const ansiText = hasOwn(record, 'ansiText') ? record['ansiText'] : undefined
  if (ansiText === undefined) return {}
  if (ansiText === 'none' || ansiText === 'sgr' || ansiText === 'sgr-osc8') {
    return { ansiText }
  }
  throw new Error('Terminal rich materialize options.ansiText must be one of none, sgr, or sgr-osc8')
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function appendAnsiText(
  current: string | undefined,
  piece: string,
  prepared: PreparedTerminalRichInline,
): string | undefined {
  if (current === undefined || piece.length === 0) return current
  if (current.length + piece.length > prepared.policy.maxAnsiOutputCodeUnits) {
    throw new Error('Materialized terminal rich ANSI text exceeds maxAnsiOutputCodeUnits')
  }
  return current + piece
}

export function prepareTerminalRichInline(
  rawText: string,
  options: TerminalRichPrepareOptions = {},
): PreparedTerminalRichInline {
  const policy = resolveTerminalRichPolicy(options)
  const tokenized: PreparedRichMetadata = tokenizeTerminalInlineAnsi(
    rawText,
    options.whiteSpace,
    policy,
  )
  const spans = tokenized.spans.map(span =>
    span.kind === 'style'
      ? Object.freeze({ ...span, style: Object.freeze({ ...span.style }) })
      : Object.freeze({ ...span }),
  )
  const diagnostics = tokenized.diagnostics.map(diagnostic => Object.freeze({ ...diagnostic }))
  const rawVisibleMap = tokenized.rawVisibleMap.map(entry => Object.freeze({ ...entry }))
  const prepared: PreparedTerminalRichInline = {
    kind: 'prepared-terminal-rich-inline@1',
    visibleText: tokenized.visibleText,
    prepared: prepareTerminal(tokenized.visibleText, options),
    spans: Object.freeze(spans),
    diagnostics: Object.freeze(diagnostics),
    rawVisibleMap: Object.freeze(rawVisibleMap),
    policy: summarizeTerminalRichPolicy(policy),
    completeness: tokenized.completeness,
  }
  const raw = createTerminalRichRawSummary(rawText, policy)
  if (raw !== undefined) prepared.raw = raw
  const frozen = Object.freeze(prepared)
  terminalRichInlineStates.set(frozen, Object.freeze({
    spanIndex: createTerminalRichSpanIntervalIndex(frozen.spans),
  }))
  return frozen
}

export function walkTerminalRichLineRanges(
  prepared: PreparedTerminalRichInline,
  options: TerminalLayoutOptions,
  onLine: (line: TerminalLineRange) => void,
): number {
  getTerminalRichInlineState(prepared)
  return walkTerminalLineRanges(prepared.prepared, options, onLine)
}

export function layoutNextTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  cursor: TerminalCursor,
  options: TerminalLayoutOptions,
): TerminalLineRange | null {
  getTerminalRichInlineState(prepared)
  return layoutNextTerminalLineRange(prepared.prepared, cursor, options)
}

export function materializeTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  line: TerminalLineRange,
  options: TerminalRichMaterializeOptions = {},
): MaterializedTerminalRichLine {
  getTerminalRichInlineState(prepared)
  const materializeOptions = normalizeTerminalRichMaterializeOptions(options)
  const reader = getInternalPreparedTerminalReader(prepared.prepared)
  const base = materializeTerminalLineRange(prepared.prepared, line)
  const spans = overlappingSpansForRange(prepared, line.sourceStart, line.sourceEnd)
  const localBoundaries = getTerminalLineSourceBoundaryOffsets(prepared.prepared, line)
    .map(boundary => boundary - line.sourceStart)
  const boundaries = sourceBoundaries(spans, line.sourceStart, line.sourceEnd).map(boundary =>
    line.sourceStart +
    clampToGraphemeBoundary(boundary - line.sourceStart, localBoundaries, boundary === line.sourceStart ? 'start' : 'end'),
  )
  const fragments: TerminalRichFragment[] = []
  let currentColumn = line.startColumn
  const ansiTextMode = effectiveAnsiTextMode(prepared, materializeOptions)
  let ansiText = ansiTextMode === 'none' ? undefined : ''
  let renderedOffset = 0

  for (let i = 0; i < boundaries.length - 1; i++) {
    const sourceStart = boundaries[i]!
    const sourceEnd = boundaries[i + 1]!
    if (sourceEnd <= sourceStart) continue
    const sourceText = base.sourceText.slice(sourceStart - line.sourceStart, sourceEnd - line.sourceStart)
    const materialized = materializeTerminalLineSourceRange(
      prepared.prepared,
      line,
      sourceStart,
      sourceEnd,
      currentColumn,
    )
    let fragmentText = materialized.text
    const remainingBaseText = base.text.slice(renderedOffset)
    let usedMaterializedWidth = true
    while (fragmentText.length > 0 && !remainingBaseText.startsWith(fragmentText)) {
      fragmentText = fragmentText.slice(0, -1)
      usedMaterializedWidth = false
    }
    const fragmentWidth = usedMaterializedWidth
      ? materialized.width
      : measureTrimmedRichFragmentWidth(fragmentText, reader)
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

    if (ansiTextMode === 'sgr-osc8' && link) {
      ansiText = appendAnsiText(ansiText, `\x1b]8;;${link}\x1b\\`, prepared)
    }
    if (style) ansiText = appendAnsiText(ansiText, styleToSgr(style), prepared)
    ansiText = appendAnsiText(ansiText, fragment.text, prepared)
    if (style) ansiText = appendAnsiText(ansiText, '\x1b[0m', prepared)
    if (ansiTextMode === 'sgr-osc8' && link) {
      ansiText = appendAnsiText(ansiText, '\x1b]8;;\x1b\\', prepared)
    }
  }

  const materialized: MaterializedTerminalRichLine = {
    ...base,
    fragments,
  }
  if (ansiText !== undefined) {
    materialized.ansiText = ansiText
  } else {
    Object.defineProperty(materialized, 'ansiText', {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    })
  }
  return materialized
}

export function extractTerminalRichSourceRange(
  prepared: PreparedTerminalRichInline,
  request: TerminalSourceRangeExtractionRequest,
  options: TerminalSelectionExtractionOptions,
): TerminalRichSelectionExtraction {
  getTerminalRichInlineState(prepared)
  const extraction = extractTerminalSourceRange(prepared.prepared, request, options)
  return withRichSelectionFragments(prepared, extraction)
}

export function extractTerminalRichSelection(
  prepared: PreparedTerminalRichInline,
  selection: TerminalSelection,
  options: TerminalSelectionExtractionOptions,
): TerminalRichSelectionExtraction {
  getTerminalRichInlineState(prepared)
  const extraction = extractTerminalSelection(prepared.prepared, selection, options)
  return withRichSelectionFragments(prepared, extraction)
}

function measureTrimmedRichFragmentWidth(
  text: string,
  reader: PreparedTerminalReader,
): number {
  recordTerminalPerformanceCounter('richFragmentWidthMeasurements')
  return terminalStringWidth(text, reader.widthProfile)
}

function withRichSelectionFragments(
  prepared: PreparedTerminalRichInline,
  extraction: TerminalSelectionExtraction,
): TerminalRichSelectionExtraction {
  const richFragments = Object.freeze(extraction.rowFragments.flatMap(fragment =>
    richFragmentsForSelectionFragment(prepared, fragment),
  ))
  return Object.freeze({
    ...extraction,
    richFragments,
  })
}

function richFragmentsForSelectionFragment(
  prepared: PreparedTerminalRichInline,
  rowFragment: TerminalSelectionExtractionFragment,
): TerminalRichSelectionExtractionFragment[] {
  const spans = overlappingSpansForRange(prepared, rowFragment.sourceStart, rowFragment.sourceEnd)
  const localBoundaries = getTerminalLineSourceBoundaryOffsets(prepared.prepared, rowFragment.line)
    .map(boundary => boundary - rowFragment.line.sourceStart)
  const boundaries = sourceBoundaries(spans, rowFragment.sourceStart, rowFragment.sourceEnd).map(boundary =>
    rowFragment.line.sourceStart +
    clampToGraphemeBoundary(
      boundary - rowFragment.line.sourceStart,
      localBoundaries,
      boundary === rowFragment.sourceStart ? 'start' : 'end',
    ),
  )
  const fragments: TerminalRichSelectionExtractionFragment[] = []
  let currentColumn = rowFragment.startColumn

  for (let i = 0; i < boundaries.length - 1; i++) {
    const sourceStart = boundaries[i]!
    const sourceEnd = boundaries[i + 1]!
    if (sourceEnd <= sourceStart) continue
    const materialized = materializeTerminalLineSourceRange(
      prepared.prepared,
      rowFragment.line,
      sourceStart,
      sourceEnd,
      currentColumn,
    )
    const sourceText = rowFragment.sourceText.slice(
      sourceStart - rowFragment.sourceStart,
      sourceEnd - rowFragment.sourceStart,
    )
    const fragment: TerminalRichSelectionExtractionFragment = {
      kind: 'terminal-rich-selection-extraction-fragment@1',
      row: rowFragment.row,
      text: materialized.text,
      sourceText,
      sourceStart,
      sourceEnd,
      columnStart: currentColumn,
      columnEnd: currentColumn + materialized.width,
      style: currentStyle(spans, sourceStart, sourceEnd),
      link: currentLink(spans, sourceStart, sourceEnd),
    }
    if (fragment.text === '' && fragment.columnStart === fragment.columnEnd) continue
    currentColumn = fragment.columnEnd
    fragments.push(Object.freeze(fragment))
  }

  return fragments
}

function getTerminalRichInlineState(prepared: PreparedTerminalRichInline): TerminalRichInlineState {
  const state = terminalRichInlineStates.get(prepared)
  if (state === undefined) {
    throw new Error('Invalid prepared terminal rich inline handle')
  }
  return state
}
