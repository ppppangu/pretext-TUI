// 补建说明：该文件为后续补建，用于提供 Phase 9 的内部模型化 memory budget 估算；当前进度：首版只服务 benchmark/evidence gate，不进入公共 API。
export const TERMINAL_MEMORY_BUDGET_MODEL = 'terminal-memory-budget@1' as const

export type TerminalMemoryBudgetCategory =
  | 'cell-flow'
  | 'combined'
  | 'layout-bundle'
  | 'line-index'
  | 'page-cache'
  | 'range-index'
  | 'rich-inline'
  | 'search-session'
  | 'selection-extraction'
  | 'source-index'

export type TerminalMemoryBudgetEstimate = Readonly<{
  kind: 'terminal-memory-budget-estimate@1'
  cachedLineRanges: number
  category: TerminalMemoryBudgetCategory
  estimatedBytes: number
  label: string
  model: typeof TERMINAL_MEMORY_BUDGET_MODEL
  notes: readonly string[]
  numberSlots: number
  objectEntries: number
  rangeRecords: number
  stringCodeUnits: number
}>

export type TerminalMemoryBudgetEstimateInput = Readonly<{
  cachedLineRanges?: number
  category: TerminalMemoryBudgetCategory
  label: string
  notes?: readonly string[]
  numberSlots?: number
  objectEntries?: number
  rangeRecords?: number
  stringCodeUnits?: number
}>

export type TerminalRichInlineMemoryInput = Readonly<{
  diagnostics: readonly Readonly<{
    code: string
    controlFamily?: string
    escapedSample?: string
    fingerprint: string
  }>[]
  raw?: Readonly<{ escapedSample?: string }>
  rawVisibleMap: readonly unknown[]
  spans: readonly (
    | Readonly<{ kind: 'link', uri: string }>
    | Readonly<{ kind: 'style', style: Readonly<Record<string, unknown>> }>
  )[]
  visibleText: string
}>

const STRING_CODE_UNIT_BYTES = 2
const NUMBER_SLOT_BYTES = 8
const OBJECT_ENTRY_BYTES = 32
const RANGE_RECORD_BYTES = 96
const CACHED_LINE_RANGE_BYTES = 160

export function createTerminalMemoryBudgetEstimate(
  input: TerminalMemoryBudgetEstimateInput,
): TerminalMemoryBudgetEstimate {
  const stringCodeUnits = normalizeNonNegativeInteger(input.stringCodeUnits ?? 0, `${input.label} stringCodeUnits`)
  const numberSlots = normalizeNonNegativeInteger(input.numberSlots ?? 0, `${input.label} numberSlots`)
  const objectEntries = normalizeNonNegativeInteger(input.objectEntries ?? 0, `${input.label} objectEntries`)
  const rangeRecords = normalizeNonNegativeInteger(input.rangeRecords ?? 0, `${input.label} rangeRecords`)
  const cachedLineRanges = normalizeNonNegativeInteger(input.cachedLineRanges ?? 0, `${input.label} cachedLineRanges`)
  return Object.freeze({
    kind: 'terminal-memory-budget-estimate@1',
    cachedLineRanges,
    category: input.category,
    estimatedBytes: (
      stringCodeUnits * STRING_CODE_UNIT_BYTES +
      numberSlots * NUMBER_SLOT_BYTES +
      objectEntries * OBJECT_ENTRY_BYTES +
      rangeRecords * RANGE_RECORD_BYTES +
      cachedLineRanges * CACHED_LINE_RANGE_BYTES
    ),
    label: input.label,
    model: TERMINAL_MEMORY_BUDGET_MODEL,
    notes: Object.freeze([...(input.notes ?? [])]),
    numberSlots,
    objectEntries,
    rangeRecords,
    stringCodeUnits,
  })
}

export function combineTerminalMemoryBudgetEstimates(
  label: string,
  estimates: readonly TerminalMemoryBudgetEstimate[],
  category: TerminalMemoryBudgetCategory = 'combined',
): TerminalMemoryBudgetEstimate {
  return createTerminalMemoryBudgetEstimate({
    category,
    label,
    cachedLineRanges: sumEstimates(estimates, 'cachedLineRanges'),
    numberSlots: sumEstimates(estimates, 'numberSlots'),
    objectEntries: sumEstimates(estimates, 'objectEntries'),
    rangeRecords: sumEstimates(estimates, 'rangeRecords'),
    stringCodeUnits: sumEstimates(estimates, 'stringCodeUnits'),
    notes: Object.freeze([
      `combined from ${estimates.length} ${TERMINAL_MEMORY_BUDGET_MODEL} estimates`,
      ...estimates.flatMap(estimate => estimate.notes.map(note => `${estimate.category}: ${note}`)),
    ]),
  })
}

export function getTerminalRichInlineMemoryEstimate(
  prepared: TerminalRichInlineMemoryInput,
  label = 'terminal rich inline',
): TerminalMemoryBudgetEstimate {
  let stringCodeUnits = prepared.visibleText.length
  let objectEntries = prepared.spans.length + prepared.diagnostics.length + prepared.rawVisibleMap.length
  for (const span of prepared.spans) {
    stringCodeUnits += span.kind === 'link' ? span.uri.length : 0
    if (span.kind === 'style') objectEntries += Object.keys(span.style).length
  }
  for (const diagnostic of prepared.diagnostics) {
    stringCodeUnits += diagnostic.code.length + diagnostic.fingerprint.length
    if (diagnostic.controlFamily !== undefined) stringCodeUnits += diagnostic.controlFamily.length
    if (diagnostic.escapedSample !== undefined) stringCodeUnits += diagnostic.escapedSample.length
  }
  if (prepared.raw?.escapedSample !== undefined) stringCodeUnits += prepared.raw.escapedSample.length
  return createTerminalMemoryBudgetEstimate({
    category: 'rich-inline',
    label,
    stringCodeUnits,
    numberSlots: prepared.spans.length * 2 + prepared.rawVisibleMap.length * 4 + prepared.diagnostics.length,
    objectEntries,
    rangeRecords: prepared.spans.length + prepared.rawVisibleMap.length,
    notes: ['rich sidecar estimate excludes full raw input unless policy retained a capped escaped sample'],
  })
}

function sumEstimates(
  estimates: readonly TerminalMemoryBudgetEstimate[],
  key: 'cachedLineRanges' | 'numberSlots' | 'objectEntries' | 'rangeRecords' | 'stringCodeUnits',
): number {
  return estimates.reduce((sum, estimate) => sum + estimate[key], 0)
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return value
}
