// 补建说明：该文件为后续补建，用于执行 TUI benchmark gate；当前进度：Task 9 覆盖 public APIs、rich inline、virtual text paging/source/append counters，阈值保守以降低 CI 噪声。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  appendTerminalCellFlow,
  createTerminalLineIndex,
  createTerminalPageCache,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalCursorForSourceOffset,
  getTerminalLineIndexStats,
  getTerminalLinePage,
  getTerminalPageCacheStats,
  invalidateTerminalLineIndex,
  invalidateTerminalPageCache,
  materializeTerminalLinePage,
  prepareTerminal,
  prepareTerminalCellFlow,
  type TerminalLayoutOptions,
  type TerminalPrepareOptions,
} from '../src/index.js'
import {
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from '../src/terminal-rich-inline.js'
import {
  assert,
  collectTerminalLines,
  stableHash,
} from '../tests/tui/validation-helpers.js'

type BenchmarkWorkload = {
  id: string
  text?: string
  rawText?: string
  corpusFile?: string
  counterAssertions?: Record<string, CounterAssertion>
  maxChars?: number
  rich?: boolean
  virtual?: boolean
  appendText?: string
  prepare?: TerminalPrepareOptions
  layout: TerminalLayoutOptions
  iterations?: number
  maxMilliseconds?: number
}

type CounterAssertion = {
  exact?: number
  max?: number
  min?: number
}

type BenchmarkConfig = {
  metadata: { schema: string }
  defaults: { iterations: number, maxMilliseconds: number }
  workloads: BenchmarkWorkload[]
}

const root = process.cwd()
const config = parseBenchmarkConfig(JSON.parse(
  await readFile(path.join(root, 'benchmarks/tui.json'), 'utf8'),
))

assert(config.metadata.schema === 'pretext-tui-benchmark@1', 'unexpected benchmark schema')

const results = []
for (const workload of config.workloads) {
  const input = await loadInput(workload)
  runWorkload(workload, input, 1)
  const iterations = workload.iterations ?? config.defaults.iterations
  const started = performance.now()
  const counters = runWorkload(workload, input, iterations)
  const elapsedMs = performance.now() - started
  const maxMilliseconds = workload.maxMilliseconds ?? config.defaults.maxMilliseconds
  assert(elapsedMs <= maxMilliseconds, `${workload.id} exceeded ${maxMilliseconds}ms: ${elapsedMs.toFixed(2)}ms`)
  assertCounterAssertions(workload, counters)
  results.push({
    id: workload.id,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    maxMilliseconds,
    counters,
    hash: stableHash(counters),
  })
}

console.log('TUI benchmark check passed')
console.log(JSON.stringify({ results }, null, 2))

function runWorkload(
  workload: BenchmarkWorkload,
  input: string,
  iterations: number,
): Record<string, number> {
  const counters = {
    prepareCalls: 0,
    layoutPasses: 0,
    materializedLines: 0,
    materializedCodeUnits: 0,
    pageCacheHits: 0,
    pageCacheMisses: 0,
    pageBuilds: 0,
    anchorCount: 0,
    maxAnchorReplayRows: 0,
    sourceLookups: 0,
    appendInvalidatedCodeUnits: 0,
    appendReprepareCodeUnits: 0,
    invalidatedPages: 0,
    richPrepareCalls: 0,
    richSpans: 0,
    richDiagnostics: 0,
    ansiCodeUnits: 0,
  }

  for (let i = 0; i < iterations; i++) {
    if (workload.rich) {
      const prepared = prepareTerminalRichInline(input, workload.prepare)
      counters.richPrepareCalls++
      counters.richSpans += prepared.spans.length
      counters.richDiagnostics += prepared.diagnostics.length
      walkTerminalRichLineRanges(prepared, workload.layout, line => {
        counters.layoutPasses++
        const materialized = materializeTerminalRichLineRange(prepared, line)
        counters.materializedLines++
        counters.materializedCodeUnits += materialized.text.length
        counters.ansiCodeUnits += materialized.ansiText.length
      })
      continue
    }

    if (workload.virtual) {
      const virtualCounters = runVirtualWorkload(workload, input)
      for (const key of Object.keys(virtualCounters) as Array<keyof typeof virtualCounters>) {
        if (key === 'maxAnchorReplayRows') {
          counters[key] = Math.max(counters[key], virtualCounters[key])
        } else {
          counters[key] += virtualCounters[key]
        }
      }
      assertVirtualCounters(workload, virtualCounters)
      continue
    }

    const prepared = prepareTerminal(input, workload.prepare)
    counters.prepareCalls++
    const lines = collectTerminalLines(prepared, workload.layout)
    counters.layoutPasses += lines.length
    counters.materializedLines += lines.length
    counters.materializedCodeUnits += lines.reduce((sum, line) => sum + line.materialized.text.length, 0)
  }

  return counters
}

function runVirtualWorkload(
  workload: BenchmarkWorkload,
  input: string,
): Record<
  | 'anchorCount'
  | 'appendInvalidatedCodeUnits'
  | 'appendReprepareCodeUnits'
  | 'invalidatedPages'
  | 'layoutPasses'
  | 'materializedCodeUnits'
  | 'materializedLines'
  | 'maxAnchorReplayRows'
  | 'pageBuilds'
  | 'pageCacheHits'
  | 'pageCacheMisses'
  | 'prepareCalls'
  | 'sourceLookups',
  number
> {
  const prepared = prepareTerminal(input, workload.prepare)
  const index = createTerminalLineIndex(prepared, {
    ...workload.layout,
    anchorInterval: 16,
  })
  const cache = createTerminalPageCache(prepared, index, {
    maxPages: 3,
    pageSize: 8,
  })
  const sourceIndex = createTerminalSourceOffsetIndex(prepared)
  const starts = [0, 8, 16, 24]
  let materializedLines = 0
  let materializedCodeUnits = 0
  let sourceLookups = 0

  for (const startRow of starts) {
    const page = getTerminalLinePage(prepared, cache, index, { startRow, rowCount: 8 })
    const materialized = materializeTerminalLinePage(prepared, page)
    materializedLines += materialized.length
    materializedCodeUnits += materialized.reduce((sum, line) => sum + line.text.length, 0)
    for (const line of page.lines) {
      getTerminalCursorForSourceOffset(prepared, sourceIndex, line.sourceStart)
      sourceLookups++
    }
  }
  getTerminalLinePage(prepared, cache, index, { startRow: 8, rowCount: 8 })

  let appendInvalidatedCodeUnits = 0
  let appendReprepareCodeUnits = 0
  let invalidatedPages = 0
  let flowRangeWalks = 0
  if (workload.appendText !== undefined) {
    const flow = prepareTerminalCellFlow(input, workload.prepare)
    const flowPrepared = getTerminalCellFlowPrepared(flow)
    const flowIndex = createTerminalLineIndex(flowPrepared, {
      ...workload.layout,
      anchorInterval: 16,
      generation: getTerminalCellFlowGeneration(flow),
    })
    const flowCache = createTerminalPageCache(flowPrepared, flowIndex, {
      maxPages: 2,
      pageSize: 8,
    })
    getTerminalLinePage(flowPrepared, flowCache, flowIndex, { startRow: 8, rowCount: 8 })
    getTerminalLinePage(flowPrepared, flowCache, flowIndex, {
      startRow: 96,
      rowCount: 8,
    })
    const appended = appendTerminalCellFlow(flow, workload.appendText, { invalidationWindowCodeUnits: 256 })
    const appendedPrepared = getTerminalCellFlowPrepared(appended.flow)
    appendInvalidatedCodeUnits += appended.invalidation.invalidatedSourceCodeUnits
    appendReprepareCodeUnits += appended.invalidation.reprepareSourceCodeUnits
    const lineInvalidation = invalidateTerminalLineIndex(appendedPrepared, flowIndex, appended.invalidation)
    invalidateTerminalPageCache(flowCache, lineInvalidation)
    invalidatedPages += getTerminalPageCacheStats(flowCache).invalidatedPages
    const page = getTerminalLinePage(appendedPrepared, flowCache, flowIndex, { startRow: 8, rowCount: 8 })
    const materialized = materializeTerminalLinePage(appendedPrepared, page)
    materializedLines += materialized.length
    materializedCodeUnits += materialized.reduce((sum, line) => sum + line.text.length, 0)
    flowRangeWalks += getTerminalLineIndexStats(flowIndex).rangeWalks
  }

  const indexStats = getTerminalLineIndexStats(index)
  const cacheStats = getTerminalPageCacheStats(cache)
  return {
    prepareCalls: workload.appendText === undefined ? 1 : 3,
    layoutPasses: indexStats.rangeWalks + flowRangeWalks,
    materializedLines,
    materializedCodeUnits,
    pageCacheHits: cacheStats.pageHits,
    pageCacheMisses: cacheStats.pageMisses,
    pageBuilds: cacheStats.pageBuilds,
    anchorCount: indexStats.anchorCount,
    maxAnchorReplayRows: indexStats.maxReplayRows,
    sourceLookups,
    appendInvalidatedCodeUnits,
    appendReprepareCodeUnits,
    invalidatedPages,
  }
}

function assertVirtualCounters(
  workload: BenchmarkWorkload,
  counters: Record<string, number>,
): void {
  assert(counter(counters, 'pageCacheHits') >= 1, `${workload.id} expected at least one page cache hit`)
  assert(counter(counters, 'pageCacheMisses') >= 4, `${workload.id} expected page cache misses`)
  assert(counter(counters, 'pageBuilds') >= 4, `${workload.id} expected page builds`)
  assert(counter(counters, 'anchorCount') > 0, `${workload.id} expected sparse anchors`)
  assert(counter(counters, 'maxAnchorReplayRows') <= 16, `${workload.id} exceeded sparse anchor replay bound`)
  assert(counter(counters, 'sourceLookups') > 0, `${workload.id} expected source lookups`)
  if (workload.appendText !== undefined) {
    assert(counter(counters, 'appendInvalidatedCodeUnits') > 0, `${workload.id} expected append invalidation`)
    assert(
      counter(counters, 'appendReprepareCodeUnits') >= counter(counters, 'appendInvalidatedCodeUnits'),
      `${workload.id} expected honest full reprepare counter`,
    )
    assert(counter(counters, 'invalidatedPages') > 0, `${workload.id} expected page invalidation`)
  }
}

function assertCounterAssertions(
  workload: BenchmarkWorkload,
  counters: Record<string, number>,
): void {
  for (const [key, assertion] of Object.entries(workload.counterAssertions ?? {})) {
    const value = counter(counters, key)
    if (assertion.exact !== undefined) {
      assert(value === assertion.exact, `${workload.id} counter ${key} expected ${assertion.exact}, got ${value}`)
    }
    if (assertion.min !== undefined) {
      assert(value >= assertion.min, `${workload.id} counter ${key} expected >= ${assertion.min}, got ${value}`)
    }
    if (assertion.max !== undefined) {
      assert(value <= assertion.max, `${workload.id} counter ${key} expected <= ${assertion.max}, got ${value}`)
    }
  }
}

function counter(counters: Record<string, number>, key: string): number {
  return counters[key] ?? 0
}

async function loadInput(workload: BenchmarkWorkload): Promise<string> {
  if (workload.rawText !== undefined) return workload.rawText
  if (workload.text !== undefined) return workload.text
  assert(workload.corpusFile !== undefined, `workload ${workload.id} missing input`)
  const text = await readFile(path.join(root, 'corpora', workload.corpusFile), 'utf8')
  return workload.maxChars === undefined ? text : text.slice(0, workload.maxChars)
}

function parseBenchmarkConfig(value: unknown): BenchmarkConfig {
  const record = expectRecord(value, 'benchmark config')
  const metadata = expectRecord(record['metadata'], 'benchmark config.metadata')
  assert(metadata['schema'] === 'pretext-tui-benchmark@1', 'unexpected benchmark schema')
  const defaults = expectRecord(record['defaults'], 'benchmark config.defaults')
  expectNumber(defaults['iterations'], 'benchmark config.defaults.iterations')
  expectNumber(defaults['maxMilliseconds'], 'benchmark config.defaults.maxMilliseconds')
  const workloads = expectArray(record['workloads'], 'benchmark config.workloads')
  for (const [index, item] of workloads.entries()) {
    const workload = expectRecord(item, `workloads[${index}]`)
    expectString(workload['id'], `workloads[${index}].id`)
    assert(
      typeof workload['text'] === 'string' ||
      typeof workload['rawText'] === 'string' ||
      typeof workload['corpusFile'] === 'string',
      `workloads[${index}] must define text, rawText, or corpusFile`,
    )
    expectRecord(workload['layout'], `workloads[${index}].layout`)
    if (workload['iterations'] !== undefined) expectNumber(workload['iterations'], `workloads[${index}].iterations`)
    if (workload['maxMilliseconds'] !== undefined) expectNumber(workload['maxMilliseconds'], `workloads[${index}].maxMilliseconds`)
    if (workload['counterAssertions'] !== undefined) {
      const assertions = expectRecord(workload['counterAssertions'], `workloads[${index}].counterAssertions`)
      for (const [counterKey, assertionValue] of Object.entries(assertions)) {
        const assertion = expectRecord(assertionValue, `workloads[${index}].counterAssertions.${counterKey}`)
        if (assertion['exact'] !== undefined) expectNumber(assertion['exact'], `workloads[${index}].counterAssertions.${counterKey}.exact`)
        if (assertion['min'] !== undefined) expectNumber(assertion['min'], `workloads[${index}].counterAssertions.${counterKey}.min`)
        if (assertion['max'] !== undefined) expectNumber(assertion['max'], `workloads[${index}].counterAssertions.${counterKey}.max`)
      }
    }
  }
  return {
    metadata: { schema: metadata['schema'] },
    defaults: defaults as BenchmarkConfig['defaults'],
    workloads: workloads as BenchmarkWorkload[],
  }
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
