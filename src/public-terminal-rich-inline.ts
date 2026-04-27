// 补建说明：该文件为后续补建，用于作为 terminal-rich-inline 发布子路径的唯一 TypeScript 公共契约与运行时 facade；当前进度：Task 2 review 修正，将 rich 公共声明从 build 脚本迁回源码契约。
import {
  layoutNextTerminalRichLineRange as internalLayoutNextTerminalRichLineRange,
  extractTerminalRichSelection as internalExtractTerminalRichSelection,
  extractTerminalRichSourceRange as internalExtractTerminalRichSourceRange,
  materializeTerminalRichLineRange as internalMaterializeTerminalRichLineRange,
  prepareTerminalRichInline as internalPrepareTerminalRichInline,
  walkTerminalRichLineRanges as internalWalkTerminalRichLineRanges,
} from './terminal-rich-inline.js'
import type {
  MaterializedTerminalLine,
  PreparedTerminalText,
  TerminalSelection,
  TerminalSelectionExtraction,
  TerminalSelectionExtractionOptions,
  TerminalCursor,
  TerminalLayoutOptions,
  TerminalLineRange,
  TerminalPrepareOptions,
  TerminalSourceRangeExtractionRequest,
} from './public-index.js'

export type TerminalRichSecurityProfileName = 'default' | 'transcript' | 'audit-strict'
export type TerminalRichRawRetentionPolicy = 'none' | 'fingerprint' | 'capped-sample'
export type TerminalRichUnsupportedControlMode = 'sanitize' | 'reject'
export type TerminalRichBidiFormatPolicy = 'sanitize' | 'reject'
export type TerminalRichAnsiReemitPolicy = 'none' | 'sgr' | 'sgr-osc8'

export type TerminalRichControlFamily =
  | 'sgr'
  | 'csi'
  | 'osc'
  | 'osc8'
  | 'dcs'
  | 'pm'
  | 'apc'
  | 'sos'
  | 'c0'
  | 'c1'
  | 'esc'
  | 'bidi-format'
  | 'input'
  | 'span'
  | 'raw-map'

export type TerminalRichOsc8UriPolicy = Readonly<{
  allowedSchemes: readonly string[]
  allowCredentials: boolean
  maxUriCodeUnits: number
}>

export type TerminalRichDiagnosticPolicy = Readonly<{
  maxDiagnostics: number
  sampleCodeUnits: number
}>

export type TerminalRichLimits = Readonly<{
  maxInputCodeUnits: number
  maxControlSequenceCodeUnits: number
  maxSpans: number
  maxRawVisibleMapEntries: number
  maxAnsiOutputCodeUnits: number
}>

export type TerminalRichSecurityPolicyInput = Readonly<{
  profile?: TerminalRichSecurityProfileName
  unsupportedControlMode?: TerminalRichUnsupportedControlMode
  rawRetention?: TerminalRichRawRetentionPolicy
  bidiFormatControls?: TerminalRichBidiFormatPolicy
  osc8?: Partial<TerminalRichOsc8UriPolicy>
  diagnostics?: Partial<TerminalRichDiagnosticPolicy>
  limits?: Partial<TerminalRichLimits>
  ansiReemit?: TerminalRichAnsiReemitPolicy
}>

export type TerminalRichPolicySummary = Readonly<{
  profile: TerminalRichSecurityProfileName
  unsupportedControlMode: TerminalRichUnsupportedControlMode
  rawRetention: TerminalRichRawRetentionPolicy
  bidiFormatControls: TerminalRichBidiFormatPolicy
  osc8AllowedSchemes: readonly string[]
  ansiReemit: TerminalRichAnsiReemitPolicy
  maxAnsiOutputCodeUnits: number
}>

export type TerminalRichRawSummary = Readonly<{
  rawLength: number
  fingerprint: string
  escapedSample?: string
  sampleTruncated: boolean
}>

export type TerminalRichCompleteness = Readonly<{
  diagnosticsTruncated: boolean
  spansTruncated: boolean
  rawVisibleMapTruncated: boolean
}>

export type TerminalRichDiagnostic = Readonly<{
  kind: 'unsupported-control' | 'malformed-sequence' | 'policy-violation' | 'limit-exceeded'
  code: string
  controlFamily?: TerminalRichControlFamily
  rawStart: number
  rawEnd: number
  rawLength: number
  escapedSample?: string
  sampleTruncated: boolean
  fingerprint: string
  redacted: true
  profile: TerminalRichSecurityProfileName
}>

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

export type TerminalRichPrepareOptions = TerminalPrepareOptions & TerminalRichSecurityPolicyInput

export type PreparedTerminalRichInline = Readonly<{
  kind: 'prepared-terminal-rich-inline@1'
  visibleText: string
  prepared: PreparedTerminalText
  spans: readonly TerminalRichSpan[]
  diagnostics: readonly TerminalRichDiagnostic[]
  rawVisibleMap: readonly {
    rawStart: number
    rawEnd: number
    sourceStart: number
    sourceEnd: number
  }[]
  raw?: TerminalRichRawSummary
  policy: TerminalRichPolicySummary
  completeness: TerminalRichCompleteness
}>

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

export function prepareTerminalRichInline(
  rawText: string,
  options?: TerminalRichPrepareOptions,
): PreparedTerminalRichInline {
  return internalPrepareTerminalRichInline(rawText, options) as unknown as PreparedTerminalRichInline
}

export function walkTerminalRichLineRanges(
  prepared: PreparedTerminalRichInline,
  options: TerminalLayoutOptions,
  onLine: (line: TerminalLineRange) => void,
): number {
  return internalWalkTerminalRichLineRanges(prepared as never, options, onLine as never)
}

export function layoutNextTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  cursor: TerminalCursor,
  options: TerminalLayoutOptions,
): TerminalLineRange | null {
  return internalLayoutNextTerminalRichLineRange(prepared as never, cursor, options) as TerminalLineRange | null
}

export function materializeTerminalRichLineRange(
  prepared: PreparedTerminalRichInline,
  line: TerminalLineRange,
  options?: TerminalRichMaterializeOptions,
): MaterializedTerminalRichLine {
  return internalMaterializeTerminalRichLineRange(
    prepared as never,
    line as never,
    options,
  ) as unknown as MaterializedTerminalRichLine
}

export function extractTerminalRichSourceRange(
  prepared: PreparedTerminalRichInline,
  request: TerminalSourceRangeExtractionRequest,
  options: TerminalSelectionExtractionOptions,
): TerminalRichSelectionExtraction {
  return internalExtractTerminalRichSourceRange(
    prepared as never,
    request as never,
    options as never,
  ) as unknown as TerminalRichSelectionExtraction
}

export function extractTerminalRichSelection(
  prepared: PreparedTerminalRichInline,
  selection: TerminalSelection,
  options: TerminalSelectionExtractionOptions,
): TerminalRichSelectionExtraction {
  return internalExtractTerminalRichSelection(
    prepared as never,
    selection as never,
    options as never,
  ) as unknown as TerminalRichSelectionExtraction
}
