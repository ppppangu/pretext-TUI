// 补建说明：该脚本为后续补建，用于执行 Phase 9 TUI memory budget gate；当前进度：首版使用模型化 kernel-owned 结构估算，不采集宿主 UI 或进程堆指标。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createTerminalLayoutBundle,
  getTerminalLayoutBundlePage,
  getTerminalLayoutBundleProjectionIndexes,
  getTerminalLayoutBundleMemoryEstimate,
} from '../src/terminal-layout-bundle.js'
import {
  appendTerminalCellFlow,
  getTerminalCellFlowMemoryEstimate,
  prepareTerminalCellFlow,
} from '../src/terminal-cell-flow.js'
import { prepareTerminal, type TerminalLayoutOptions, type TerminalPrepareOptions } from '../src/terminal.js'
import {
  createTerminalRangeIndex,
  getTerminalRangeIndexMemoryEstimate,
  type TerminalRange,
} from '../src/terminal-range-index.js'
import {
  createTerminalSearchSession,
  getTerminalSearchMatchesForSourceRange,
  getTerminalSearchSessionMemoryEstimate,
  type TerminalSearchMode,
} from '../src/terminal-search-session.js'
import {
  createTerminalSelectionFromCoordinates,
  extractTerminalSelection,
  getTerminalSelectionExtractionMemoryEstimate,
} from '../src/terminal-selection.js'
import { prepareTerminalRichInline } from '../src/terminal-rich-inline.js'
import type {
  TerminalMemoryBudgetCategory,
  TerminalMemoryBudgetEstimate,
} from '../src/terminal-memory-budget.js'
import { getTerminalRichInlineMemoryEstimate } from '../src/terminal-memory-budget.js'

export type MemoryBudgetAssertion = Readonly<{
  category: TerminalMemoryBudgetCategory
  maxCachedLineRanges?: number
  maxEstimatedBytes: number
  maxNumberSlots?: number
  maxObjectEntries?: number
  maxRangeRecords?: number
  maxStringCodeUnits?: number
}>

export type MemoryBudgetWorkload = Readonly<{
  appendSequence?: Readonly<{
    count: number
    invalidationWindowCodeUnits?: number
    parts: readonly string[]
  }>
  budgets: readonly MemoryBudgetAssertion[]
  corpusFile?: string
  id: string
  layout: TerminalLayoutOptions
  layoutBundle?: true
  maxChars?: number
  prepare?: TerminalPrepareOptions
  rangeIndex?: Readonly<{
    count: number
    data?: true
    span: number
    stride: number
    tags?: readonly string[]
  }>
  rawText?: string
  repeatText?: Readonly<{
    count: number
    prefix?: string
    suffix?: string
    text: string
  }>
  rich?: true
  search?: Readonly<{
    caseSensitive?: boolean
    limit?: number
    mode?: TerminalSearchMode
    query: string
    wholeWord?: boolean
  }>
  selection?: Readonly<{
    anchor: { column: number, row: number }
    focus: { column: number, row: number }
  }>
  text?: string
}>

export type MemoryBudgetConfig = Readonly<{
  metadata: Readonly<{ note?: string, schema: 'pretext-tui-memory-budgets@1' }>
  workloads: readonly MemoryBudgetWorkload[]
}>

export type MemoryBudgetResult = Readonly<{
  estimates: readonly TerminalMemoryBudgetEstimate[]
  hash: string
  id: string
}>

export async function runTuiMemoryBudgetCheck(options: {
  configPath?: string
  root?: string
} = {}): Promise<readonly MemoryBudgetResult[]> {
  const root = options.root ?? process.cwd()
  const configPath = options.configPath ?? path.join(root, 'benchmarks/tui-memory-budgets.json')
  const config = parseMemoryBudgetConfig(JSON.parse(await readFile(configPath, 'utf8')))
  const results: MemoryBudgetResult[] = []
  for (const workload of config.workloads) {
    const input = await loadInput(workload, root)
    const estimates = runMemoryBudgetWorkload(workload, input)
    assertMemoryBudget(workload, estimates)
    results.push(Object.freeze({
      id: workload.id,
      estimates,
      hash: stableHash(JSON.stringify(estimates)),
    }))
  }
  return Object.freeze(results)
}

if (import.meta.main) {
  const results = await runTuiMemoryBudgetCheck()
  console.log('TUI memory budget check passed')
  console.log(JSON.stringify({ results }, null, 2))
}

export function parseMemoryBudgetConfig(value: unknown): MemoryBudgetConfig {
  const record = expectRecord(value, 'memory budget config')
  assertAllowedKeys(record, 'memory budget config', ['metadata', 'workloads'])
  const metadata = expectRecord(record['metadata'], 'memory budget config.metadata')
  assertAllowedKeys(metadata, 'memory budget config.metadata', ['note', 'schema'])
  const schema = expectString(metadata['schema'], 'memory budget config.metadata.schema')
  assert(schema === 'pretext-tui-memory-budgets@1', 'unexpected memory budget schema')
  const note = metadata['note'] === undefined
    ? undefined
    : expectString(metadata['note'], 'memory budget config.metadata.note')
  const workloads = expectArray(record['workloads'], 'memory budget config.workloads')
  return Object.freeze({
    metadata: note === undefined ? { schema } : { note, schema },
    workloads: Object.freeze(workloads.map((item, index) => parseMemoryBudgetWorkload(item, index))),
  })
}

function parseMemoryBudgetWorkload(value: unknown, index: number): MemoryBudgetWorkload {
  const label = `memory budget workloads[${index}]`
  const workload = expectRecord(value, label)
  assertAllowedKeys(workload, label, [
    'appendSequence',
    'budgets',
    'corpusFile',
    'id',
    'layout',
    'layoutBundle',
    'maxChars',
    'prepare',
    'rangeIndex',
    'rawText',
    'repeatText',
    'rich',
    'search',
    'selection',
    'text',
  ])
  expectString(workload['id'], `${label}.id`)
  assertExactlyOneInputSource(workload, label)
  if (workload['text'] !== undefined) expectString(workload['text'], `${label}.text`)
  if (workload['rawText'] !== undefined) expectString(workload['rawText'], `${label}.rawText`)
  if (workload['corpusFile'] !== undefined) expectString(workload['corpusFile'], `${label}.corpusFile`)
  if (workload['repeatText'] !== undefined) parseRepeatText(workload['repeatText'], `${label}.repeatText`)
  if (workload['maxChars'] !== undefined) {
    expectPositiveInteger(workload['maxChars'], `${label}.maxChars`)
    assert(workload['corpusFile'] !== undefined, `${label}.maxChars requires corpusFile`)
  }
  if (workload['layoutBundle'] !== undefined) expectTrueFlag(workload['layoutBundle'], `${label}.layoutBundle`)
  if (workload['rich'] !== undefined) expectTrueFlag(workload['rich'], `${label}.rich`)
  parseLayout(workload['layout'], `${label}.layout`)
  if (workload['prepare'] !== undefined) parsePrepare(workload['prepare'], `${label}.prepare`)
  if (workload['appendSequence'] !== undefined) parseAppendSequence(workload['appendSequence'], `${label}.appendSequence`)
  if (workload['rangeIndex'] !== undefined) parseRangeIndex(workload['rangeIndex'], `${label}.rangeIndex`)
  if (workload['search'] !== undefined) parseSearch(workload['search'], `${label}.search`)
  if (workload['selection'] !== undefined) parseSelection(workload['selection'], `${label}.selection`)
  const modes = [
    workload['appendSequence'] !== undefined,
    workload['layoutBundle'] === true,
    workload['rangeIndex'] !== undefined,
    workload['rich'] === true,
    workload['search'] !== undefined,
    workload['selection'] !== undefined,
  ].filter(Boolean).length
  assert(modes === 1, `${label} must define exactly one memory budget mode`)
  return Object.freeze({
    ...(workload as MemoryBudgetWorkload),
    budgets: Object.freeze(parseBudgets(workload['budgets'], `${label}.budgets`)),
  })
}

function runMemoryBudgetWorkload(
  workload: MemoryBudgetWorkload,
  input: string,
): readonly TerminalMemoryBudgetEstimate[] {
  if (workload.appendSequence !== undefined) {
    let flow = prepareTerminalCellFlow(input, workload.prepare)
    for (let index = 0; index < workload.appendSequence.count; index++) {
      const part = workload.appendSequence.parts[index % workload.appendSequence.parts.length]!
      flow = appendTerminalCellFlow(flow, part, {
        invalidationWindowCodeUnits: workload.appendSequence.invalidationWindowCodeUnits ?? 256,
      }).flow
    }
    return Object.freeze([
      getTerminalCellFlowMemoryEstimate(flow, `${workload.id} cell flow`),
    ])
  }
  if (workload.layoutBundle === true) {
    const prepared = prepareTerminal(input, workload.prepare)
    const bundle = createTerminalLayoutBundle(prepared, {
      ...workload.layout,
      anchorInterval: 16,
      maxPages: 3,
      pageSize: 8,
    })
    getTerminalLayoutBundlePage(prepared, bundle, { startRow: 0, rowCount: 8 })
    getTerminalLayoutBundlePage(prepared, bundle, { startRow: 8, rowCount: 8 })
    getTerminalLayoutBundleProjectionIndexes(prepared, bundle)
    return Object.freeze([
      getTerminalLayoutBundleMemoryEstimate(bundle, `${workload.id} layout bundle`),
    ])
  }
  if (workload.rangeIndex !== undefined) {
    const index = createTerminalRangeIndex(createRangeFixture(workload.rangeIndex))
    return Object.freeze([
      getTerminalRangeIndexMemoryEstimate(index, `${workload.id} range index`),
    ])
  }
  if (workload.rich === true) {
    const rich = prepareTerminalRichInline(input, workload.prepare)
    return Object.freeze([
      getTerminalRichInlineMemoryEstimate(rich, `${workload.id} rich inline`),
    ])
  }
  if (workload.search !== undefined) {
    const prepared = prepareTerminal(input, workload.prepare)
    const session = createTerminalSearchSession(prepared, workload.search.query, {
      ...(workload.search.mode === undefined ? {} : { mode: workload.search.mode }),
      ...(workload.search.caseSensitive === undefined ? {} : { caseSensitive: workload.search.caseSensitive }),
      ...(workload.search.wholeWord === undefined ? {} : { wholeWord: workload.search.wholeWord }),
    })
    getTerminalSearchMatchesForSourceRange(session, {
      sourceStart: 0,
      sourceEnd: input.length,
      ...(workload.search.limit === undefined ? {} : { limit: workload.search.limit }),
    })
    return Object.freeze([
      getTerminalSearchSessionMemoryEstimate(session, `${workload.id} search session`),
    ])
  }
  if (workload.selection !== undefined) {
    const prepared = prepareTerminal(input, workload.prepare)
    const indexes = createTerminalLayoutBundle(prepared, {
      ...workload.layout,
      anchorInterval: 8,
      maxPages: 2,
      pageSize: 8,
    })
    const selection = createTerminalSelectionFromCoordinates(prepared, indexes, workload.selection)
    assert(selection !== null, `${workload.id} expected coordinate selection`)
    const extraction = extractTerminalSelection(prepared, selection, { indexes })
    return Object.freeze([
      getTerminalSelectionExtractionMemoryEstimate(extraction, `${workload.id} selection extraction`),
    ])
  }
  throw new Error(`${workload.id} missing memory budget mode`)
}

function assertMemoryBudget(
  workload: MemoryBudgetWorkload,
  estimates: readonly TerminalMemoryBudgetEstimate[],
): void {
  const budgetsByCategory = new Map(workload.budgets.map(budget => [budget.category, budget]))
  const usedCategories = new Set<TerminalMemoryBudgetCategory>()
  for (const estimate of estimates) {
    const budget = budgetsByCategory.get(estimate.category)
    assert(budget !== undefined, `${workload.id} missing budget for ${estimate.category}`)
    usedCategories.add(estimate.category)
    assert(estimate.estimatedBytes <= budget.maxEstimatedBytes, `${workload.id} ${estimate.category} estimatedBytes ${estimate.estimatedBytes} exceeds ${budget.maxEstimatedBytes}`)
    assertOptionalMax(estimate.cachedLineRanges, budget.maxCachedLineRanges, `${workload.id} ${estimate.category} cachedLineRanges`)
    assertOptionalMax(estimate.numberSlots, budget.maxNumberSlots, `${workload.id} ${estimate.category} numberSlots`)
    assertOptionalMax(estimate.objectEntries, budget.maxObjectEntries, `${workload.id} ${estimate.category} objectEntries`)
    assertOptionalMax(estimate.rangeRecords, budget.maxRangeRecords, `${workload.id} ${estimate.category} rangeRecords`)
    assertOptionalMax(estimate.stringCodeUnits, budget.maxStringCodeUnits, `${workload.id} ${estimate.category} stringCodeUnits`)
  }
  for (const budget of workload.budgets) {
    assert(usedCategories.has(budget.category), `${workload.id} budget for ${budget.category} was not exercised`)
  }
}

function assertOptionalMax(value: number, max: number | undefined, label: string): void {
  if (max !== undefined) assert(value <= max, `${label} ${value} exceeds ${max}`)
}

async function loadInput(workload: MemoryBudgetWorkload, root: string): Promise<string> {
  if (workload.rawText !== undefined) return workload.rawText
  if (workload.text !== undefined) return workload.text
  if (workload.repeatText !== undefined) {
    return `${workload.repeatText.prefix ?? ''}${workload.repeatText.text.repeat(workload.repeatText.count)}${workload.repeatText.suffix ?? ''}`
  }
  assert(workload.corpusFile !== undefined, `workload ${workload.id} missing input`)
  const text = await readFile(path.join(root, 'corpora', workload.corpusFile), 'utf8')
  return workload.maxChars === undefined ? text : text.slice(0, workload.maxChars)
}

function createRangeFixture(input: NonNullable<MemoryBudgetWorkload['rangeIndex']>): readonly TerminalRange[] {
  const ranges: TerminalRange[] = []
  for (let index = 0; index < input.count; index++) {
    ranges.push(Object.freeze({
      id: `range-${index}`,
      kind: index % 2 === 0 ? 'block' : 'inline',
      sourceStart: index * input.stride,
      sourceEnd: index * input.stride + input.span,
      ...(input.tags === undefined ? {} : { tags: input.tags }),
      ...(input.data === true ? { data: { order: index, source: 'fixture' } } : {}),
    }))
  }
  return Object.freeze(ranges)
}

function parseBudgets(value: unknown, label: string): readonly MemoryBudgetAssertion[] {
  const items = expectArray(value, label)
  assert(items.length > 0, `${label} must not be empty`)
  const seenCategories = new Set<TerminalMemoryBudgetCategory>()
  return items.map((item, index) => {
    const budget = expectRecord(item, `${label}[${index}]`)
    assertAllowedKeys(budget, `${label}[${index}]`, [
      'category',
      'maxCachedLineRanges',
      'maxEstimatedBytes',
      'maxNumberSlots',
      'maxObjectEntries',
      'maxRangeRecords',
      'maxStringCodeUnits',
    ])
    const category = parseMemoryBudgetCategory(budget['category'], `${label}[${index}].category`)
    assert(!seenCategories.has(category), `${label}[${index}].category duplicates ${category}`)
    seenCategories.add(category)
    return Object.freeze({
      category,
      maxEstimatedBytes: expectPositiveInteger(budget['maxEstimatedBytes'], `${label}[${index}].maxEstimatedBytes`),
      ...(budget['maxCachedLineRanges'] === undefined ? {} : {
        maxCachedLineRanges: expectNonNegativeInteger(budget['maxCachedLineRanges'], `${label}[${index}].maxCachedLineRanges`),
      }),
      ...(budget['maxNumberSlots'] === undefined ? {} : {
        maxNumberSlots: expectNonNegativeInteger(budget['maxNumberSlots'], `${label}[${index}].maxNumberSlots`),
      }),
      ...(budget['maxObjectEntries'] === undefined ? {} : {
        maxObjectEntries: expectNonNegativeInteger(budget['maxObjectEntries'], `${label}[${index}].maxObjectEntries`),
      }),
      ...(budget['maxRangeRecords'] === undefined ? {} : {
        maxRangeRecords: expectNonNegativeInteger(budget['maxRangeRecords'], `${label}[${index}].maxRangeRecords`),
      }),
      ...(budget['maxStringCodeUnits'] === undefined ? {} : {
        maxStringCodeUnits: expectNonNegativeInteger(budget['maxStringCodeUnits'], `${label}[${index}].maxStringCodeUnits`),
      }),
    })
  })
}

function parseMemoryBudgetCategory(value: unknown, label: string): TerminalMemoryBudgetCategory {
  const category = expectString(value, label)
  const categories: readonly TerminalMemoryBudgetCategory[] = [
    'cell-flow',
    'combined',
    'layout-bundle',
    'line-index',
    'page-cache',
    'range-index',
    'rich-inline',
    'search-session',
    'selection-extraction',
    'source-index',
  ]
  assert(categories.includes(category as TerminalMemoryBudgetCategory), `${label} must be a known memory budget category`)
  return category as TerminalMemoryBudgetCategory
}

function parseRepeatText(value: unknown, label: string): void {
  const repeatText = expectRecord(value, label)
  assertAllowedKeys(repeatText, label, ['count', 'prefix', 'suffix', 'text'])
  if (repeatText['prefix'] !== undefined) expectString(repeatText['prefix'], `${label}.prefix`)
  expectString(repeatText['text'], `${label}.text`)
  expectNonNegativeInteger(repeatText['count'], `${label}.count`)
  if (repeatText['suffix'] !== undefined) expectString(repeatText['suffix'], `${label}.suffix`)
}

function parseAppendSequence(value: unknown, label: string): void {
  const appendSequence = expectRecord(value, label)
  assertAllowedKeys(appendSequence, label, ['count', 'invalidationWindowCodeUnits', 'parts'])
  expectPositiveInteger(appendSequence['count'], `${label}.count`)
  const parts = expectArray(appendSequence['parts'], `${label}.parts`)
  assert(parts.length > 0, `${label}.parts must not be empty`)
  for (let index = 0; index < parts.length; index++) expectString(parts[index], `${label}.parts[${index}]`)
  if (appendSequence['invalidationWindowCodeUnits'] !== undefined) {
    expectPositiveInteger(appendSequence['invalidationWindowCodeUnits'], `${label}.invalidationWindowCodeUnits`)
  }
}

function parseRangeIndex(value: unknown, label: string): void {
  const rangeIndex = expectRecord(value, label)
  assertAllowedKeys(rangeIndex, label, ['count', 'data', 'span', 'stride', 'tags'])
  expectPositiveInteger(rangeIndex['count'], `${label}.count`)
  expectPositiveInteger(rangeIndex['span'], `${label}.span`)
  expectPositiveInteger(rangeIndex['stride'], `${label}.stride`)
  if (rangeIndex['data'] !== undefined) expectTrueFlag(rangeIndex['data'], `${label}.data`)
  if (rangeIndex['tags'] !== undefined) {
    const tags = expectArray(rangeIndex['tags'], `${label}.tags`)
    for (let index = 0; index < tags.length; index++) expectString(tags[index], `${label}.tags[${index}]`)
  }
}

function parseLayout(value: unknown, label: string): void {
  const layout = expectRecord(value, label)
  assertAllowedKeys(layout, label, ['columns', 'startColumn'])
  expectPositiveInteger(layout['columns'], `${label}.columns`)
  if (layout['startColumn'] !== undefined) expectNonNegativeInteger(layout['startColumn'], `${label}.startColumn`)
}

function parsePrepare(value: unknown, label: string): void {
  const prepare = expectRecord(value, label)
  assertAllowedKeys(prepare, label, ['tabSize', 'whiteSpace', 'widthProfile', 'wordBreak'])
  if (prepare['whiteSpace'] !== undefined) {
    assert(prepare['whiteSpace'] === 'normal' || prepare['whiteSpace'] === 'pre-wrap', `${label}.whiteSpace must be normal or pre-wrap`)
  }
  if (prepare['wordBreak'] !== undefined) {
    assert(prepare['wordBreak'] === 'normal' || prepare['wordBreak'] === 'keep-all', `${label}.wordBreak must be normal or keep-all`)
  }
  if (prepare['tabSize'] !== undefined) expectPositiveInteger(prepare['tabSize'], `${label}.tabSize`)
  if (prepare['widthProfile'] !== undefined) parseWidthProfile(prepare['widthProfile'], `${label}.widthProfile`)
}

function parseWidthProfile(value: unknown, label: string): void {
  if (value === 'terminal-unicode-narrow@1') return
  const profile = expectRecord(value, label)
  assertAllowedKeys(profile, label, [
    'ambiguousWidth',
    'ansiMode',
    'controlChars',
    'defaultTabSize',
    'emojiWidth',
    'regionalIndicator',
  ])
  if (profile['ambiguousWidth'] !== undefined) {
    assert(profile['ambiguousWidth'] === 'narrow' || profile['ambiguousWidth'] === 'wide', `${label}.ambiguousWidth must be narrow or wide`)
  }
  if (profile['emojiWidth'] !== undefined) {
    assert(
      profile['emojiWidth'] === 'presentation-wide' || profile['emojiWidth'] === 'wide' || profile['emojiWidth'] === 'narrow',
      `${label}.emojiWidth must be presentation-wide, wide, or narrow`,
    )
  }
  if (profile['regionalIndicator'] !== undefined) {
    assert(
      profile['regionalIndicator'] === 'flag-pair-wide-single-wide' ||
        profile['regionalIndicator'] === 'flag-pair-wide-single-narrow',
      `${label}.regionalIndicator must be a known regional indicator policy`,
    )
  }
  if (profile['controlChars'] !== undefined) {
    assert(
      profile['controlChars'] === 'reject' ||
        profile['controlChars'] === 'zero-width' ||
        profile['controlChars'] === 'replacement',
      `${label}.controlChars must be reject, zero-width, or replacement`,
    )
  }
  if (profile['ansiMode'] !== undefined) {
    assert(profile['ansiMode'] === 'plain-reject', `${label}.ansiMode must be plain-reject`)
  }
  if (profile['defaultTabSize'] !== undefined) expectPositiveInteger(profile['defaultTabSize'], `${label}.defaultTabSize`)
}

function parseSearch(value: unknown, label: string): void {
  const search = expectRecord(value, label)
  assertAllowedKeys(search, label, ['caseSensitive', 'limit', 'mode', 'query', 'wholeWord'])
  expectString(search['query'], `${label}.query`)
  if (search['mode'] !== undefined) {
    assert(search['mode'] === 'literal' || search['mode'] === 'regex', `${label}.mode must be literal or regex`)
  }
  if (search['caseSensitive'] !== undefined) expectBoolean(search['caseSensitive'], `${label}.caseSensitive`)
  if (search['wholeWord'] !== undefined) expectBoolean(search['wholeWord'], `${label}.wholeWord`)
  if (search['limit'] !== undefined) expectNonNegativeInteger(search['limit'], `${label}.limit`)
}

function parseSelection(value: unknown, label: string): void {
  const selection = expectRecord(value, label)
  assertAllowedKeys(selection, label, ['anchor', 'focus'])
  parseSelectionPoint(selection['anchor'], `${label}.anchor`)
  parseSelectionPoint(selection['focus'], `${label}.focus`)
}

function parseSelectionPoint(value: unknown, label: string): void {
  const point = expectRecord(value, label)
  assertAllowedKeys(point, label, ['column', 'row'])
  expectNonNegativeInteger(point['column'], `${label}.column`)
  expectNonNegativeInteger(point['row'], `${label}.row`)
}

function assertExactlyOneInputSource(workload: Record<string, unknown>, label: string): void {
  const sources = ['corpusFile', 'rawText', 'repeatText', 'text'].filter(key => workload[key] !== undefined)
  assert(sources.length === 1, `${label} must define exactly one input source`)
}

function assertAllowedKeys(record: Record<string, unknown>, label: string, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(record)) assert(allowed.has(key), `${label}.${key} is not allowed`)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

function expectArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`)
  return value
}

function expectString(value: unknown, label: string): string {
  assert(typeof value === 'string', `${label} must be a string`)
  return value
}

function expectNumber(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`)
  return value
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(Number.isInteger(number) && number >= 0, `${label} must be a non-negative integer`)
  return number
}

function expectPositiveInteger(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(Number.isInteger(number) && number > 0, `${label} must be a positive integer`)
  return number
}

function expectBoolean(value: unknown, label: string): boolean {
  assert(typeof value === 'boolean', `${label} must be a boolean`)
  return value
}

function expectTrueFlag(value: unknown, label: string): true {
  assert(value === true, `${label} must be literal true when present`)
  return true
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
