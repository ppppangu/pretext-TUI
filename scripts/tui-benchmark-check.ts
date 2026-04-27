// 补建说明：该文件为后续补建，用于执行 TUI benchmark gate；当前进度：Task 9 覆盖 public APIs、rich inline、virtual text paging/source/append counters，阈值保守以降低 CI 噪声。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  appendTerminalCellFlow,
  createTerminalLayoutBundle,
  createTerminalLineIndex,
  createTerminalPageCache,
  createTerminalSearchSession,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  getTerminalCursorForSourceOffset,
  getTerminalLayoutBundlePage,
  getTerminalLineIndexStats,
  getTerminalLinePage,
  getTerminalPageCacheStats,
  getTerminalSearchMatchAfterSourceOffset,
  getTerminalSearchMatchBeforeSourceOffset,
  getTerminalSearchMatchesForSourceRange,
  getTerminalSearchSessionMatchCount,
  invalidateTerminalLineIndex,
  invalidateTerminalLayoutBundle,
  invalidateTerminalPageCache,
  layoutNextTerminalLineRange,
  materializeTerminalLinePage,
  materializeTerminalLineRange,
  prepareTerminal,
  prepareTerminalCellFlow,
  projectTerminalSourceOffset,
  TERMINAL_START_CURSOR,
  type TerminalLayoutOptions,
  type TerminalPrepareOptions,
  type TerminalSearchMode,
} from '../src/index.js'
import {
  createTerminalLayoutBundle as createInternalTerminalLayoutBundle,
  getTerminalLayoutBundleStats,
} from '../src/terminal-layout-bundle.js'
import {
  createTerminalSelectionFromCoordinates,
  extractTerminalSelection,
  extractTerminalSourceRange,
} from '../src/terminal-selection.js'
import { prepareTerminal as prepareTerminalForSelection } from '../src/terminal.js'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  extractTerminalRichSourceRange,
  walkTerminalRichLineRanges,
} from '../src/terminal-rich-inline.js'
import {
  createTerminalRichRawVisibleIndex,
  getTerminalRichRawVisibleRangesForSourceRange,
} from '../src/terminal-rich-span-index.js'
import {
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
  terminalPerformanceCounterNames,
  type TerminalPerformanceCounterName,
} from '../src/terminal-performance-counters.js'
import {
  assert,
  collectTerminalLines,
  stableHash,
} from '../tests/tui/validation-helpers.js'

export type BenchmarkWorkload = {
  id: string
  text?: string
  rawText?: string
  corpusFile?: string
  repeatText?: {
    prefix?: string
    text: string
    count: number
    suffix?: string
  }
  counterAssertions?: Partial<Record<BenchmarkCounterName, CounterAssertion>>
  firstLineOnly?: boolean
  maxChars?: number
  rich?: boolean
  search?: {
    caseSensitive?: boolean
    limit?: number
    mode?: TerminalSearchMode
    project?: boolean
    query: string
    wholeWord?: boolean
  }
  selection?: {
    anchor: { row: number, column: number }
    focus: { row: number, column: number }
    rich?: boolean
    sourceEnd: number
    sourceStart: number
  }
  virtual?: boolean
  layoutBundle?: boolean
  appendText?: string
  prepare?: TerminalPrepareOptions
  layout: TerminalLayoutOptions
  iterations?: number
  maxMilliseconds?: number
}

export type CounterAssertion = {
  exact?: number
  max?: number
  min?: number
}

export type BenchmarkConfig = {
  metadata: { note?: string, schema: string }
  defaults: { iterations: number, maxMilliseconds: number }
  workloads: BenchmarkWorkload[]
}

const benchmarkHarnessCounterNames = [
  'prepareCalls',
  'layoutPasses',
  'materializedLines',
  'materializedCodeUnits',
  'pageCacheHits',
  'pageCacheMisses',
  'pageBuilds',
  'anchorCount',
  'maxAnchorReplayRows',
  'sourceLookups',
  'appendInvalidatedCodeUnits',
  'appendReprepareCodeUnits',
  'invalidatedPages',
  'richPrepareCalls',
  'richSpans',
  'richDiagnostics',
  'ansiCodeUnits',
  'searchSessions',
  'searchReturnedMatches',
  'searchProjectedMatches',
  'searchNavigationLookups',
  'selectionCoordinateRequests',
  'selectionSelectionExtractions',
  'selectionSourceExtractions',
  'selectionRichExtractions',
  'selectionExtractedCodeUnits',
] as const

export type BenchmarkHarnessCounterName = typeof benchmarkHarnessCounterNames[number]
export type BenchmarkCounterName = BenchmarkHarnessCounterName | TerminalPerformanceCounterName

export const benchmarkKnownCounterNames: readonly BenchmarkCounterName[] = Object.freeze([
  ...terminalPerformanceCounterNames,
  ...benchmarkHarnessCounterNames,
].sort())

const benchmarkKnownCounterNameSet = new Set<string>(benchmarkKnownCounterNames)

export type BenchmarkResult = Readonly<{
  id: string
  elapsedMs: number
  maxMilliseconds: number
  counters: Record<string, number>
  hash: string
}>

export async function runTuiBenchmarkCheck(options: {
  root?: string
  configPath?: string
} = {}): Promise<BenchmarkResult[]> {
  const root = options.root ?? process.cwd()
  const configPath = options.configPath ?? path.join(root, 'benchmarks/tui.json')
  const config = parseBenchmarkConfig(JSON.parse(await readFile(configPath, 'utf8')))
  const results: BenchmarkResult[] = []
  for (const workload of config.workloads) {
    const input = await loadInput(workload, root)
    runWorkload(workload, input, 1)
    const iterations = workload.iterations ?? config.defaults.iterations
    resetTerminalPerformanceCounters()
    const started = performance.now()
    const counters = runWorkload(workload, input, iterations)
    const elapsedMs = performance.now() - started
    mergeCounters(counters, snapshotTerminalPerformanceCounters())
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
  return results
}

if (import.meta.main) {
  const results = await runTuiBenchmarkCheck()
  console.log('TUI benchmark check passed')
  console.log(JSON.stringify({ results }, null, 2))
}

function mergeCounters(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value
  }
}

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
    searchSessions: 0,
    searchReturnedMatches: 0,
    searchProjectedMatches: 0,
    searchNavigationLookups: 0,
    selectionCoordinateRequests: 0,
    selectionSelectionExtractions: 0,
    selectionSourceExtractions: 0,
    selectionRichExtractions: 0,
    selectionExtractedCodeUnits: 0,
  }

  for (let i = 0; i < iterations; i++) {
    if (workload.selection !== undefined) {
      const selectionCounters = runSelectionWorkload(workload, input, workload.selection)
      mergeCounters(counters, selectionCounters)
      continue
    }

    if (workload.rich) {
      const prepared = prepareTerminalRichInline(input, workload.prepare)
      counters.richPrepareCalls++
      counters.richSpans += prepared.spans.length
      counters.richDiagnostics += prepared.diagnostics.length
      const rawVisibleIndex = createTerminalRichRawVisibleIndex(prepared.rawVisibleMap)
      let rawVisibleQueryEnd = Math.min(8, prepared.visibleText.length)
      if (workload.firstLineOnly) {
        const lateSourceStart = Math.max(0, prepared.visibleText.length - workload.layout.columns)
        const sourceIndex = createTerminalSourceOffsetIndex(prepared.prepared as never)
        const cursor = getTerminalCursorForSourceOffset(
          prepared.prepared as never,
          sourceIndex,
          lateSourceStart,
          'after',
        ).cursor
        const line = layoutNextTerminalRichLineRange(prepared, cursor, workload.layout)
        assert(line !== null, `${workload.id} expected at least one rich line`)
        rawVisibleQueryEnd = line.sourceEnd
        getTerminalRichRawVisibleRangesForSourceRange(rawVisibleIndex, {
          sourceStart: line.sourceStart,
          sourceEnd: line.sourceEnd,
        })
        counters.layoutPasses++
        const materialized = materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' })
        counters.materializedLines++
        counters.materializedCodeUnits += materialized.text.length
        counters.ansiCodeUnits += materialized.ansiText?.length ?? 0
        continue
      }
      getTerminalRichRawVisibleRangesForSourceRange(rawVisibleIndex, {
        sourceStart: 0,
        sourceEnd: rawVisibleQueryEnd,
      })
      walkTerminalRichLineRanges(prepared, workload.layout, line => {
        counters.layoutPasses++
        const materialized = materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' })
        counters.materializedLines++
        counters.materializedCodeUnits += materialized.text.length
        counters.ansiCodeUnits += materialized.ansiText?.length ?? 0
      })
      continue
    }

    if (workload.search !== undefined) {
      const searchCounters = runSearchWorkload(workload, input, workload.search)
      mergeCounters(counters, searchCounters)
      continue
    }

    if (workload.virtual) {
      const virtualCounters = workload.layoutBundle
        ? runLayoutBundleWorkload(workload, input)
        : runVirtualWorkload(workload, input)
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
    if (workload.firstLineOnly) {
      const line = layoutNextTerminalLineRange(prepared, TERMINAL_START_CURSOR, workload.layout)
      assert(line !== null, `${workload.id} expected at least one line`)
      counters.layoutPasses++
      const materialized = materializeTerminalLineRange(prepared, line)
      counters.materializedLines++
      counters.materializedCodeUnits += materialized.text.length
      continue
    }
    const lines = collectTerminalLines(prepared, workload.layout)
    counters.layoutPasses += lines.length
    counters.materializedLines += lines.length
    counters.materializedCodeUnits += lines.reduce((sum, line) => sum + line.materialized.text.length, 0)
  }

  return counters
}

function runSelectionWorkload(
  workload: BenchmarkWorkload,
  input: string,
  selectionWorkload: NonNullable<BenchmarkWorkload['selection']>,
): Record<
  | 'prepareCalls'
  | 'selectionCoordinateRequests'
  | 'selectionExtractedCodeUnits'
  | 'selectionRichExtractions'
  | 'selectionSelectionExtractions'
  | 'selectionSourceExtractions',
  number
> {
  const rich = selectionWorkload.rich === true
    ? prepareTerminalRichInline(input, workload.prepare)
    : undefined
  const prepared = rich?.prepared ?? prepareTerminalForSelection(input, workload.prepare)
  const indexes = createInternalTerminalLayoutBundle(prepared, {
    ...workload.layout,
    anchorInterval: 8,
    maxPages: 3,
    pageSize: 8,
  })
  const selection = createTerminalSelectionFromCoordinates(prepared, indexes, {
    anchor: selectionWorkload.anchor,
    focus: selectionWorkload.focus,
  })
  assert(selection !== null, `${workload.id} expected coordinate selection`)
  const selectionExtraction = extractTerminalSelection(prepared, selection, { indexes })
  const sourceExtraction = extractTerminalSourceRange(prepared, {
    sourceStart: selectionWorkload.sourceStart,
    sourceEnd: selectionWorkload.sourceEnd,
  }, { indexes })
  let richCodeUnits = 0
  let richExtractions = 0
  if (rich !== undefined) {
    const richExtraction = extractTerminalRichSourceRange(rich, {
      sourceStart: selectionWorkload.sourceStart,
      sourceEnd: selectionWorkload.sourceEnd,
    }, { indexes })
    richCodeUnits = richExtraction.richFragments.reduce((sum, fragment) => sum + fragment.text.length, 0)
    richExtractions = 1
  }

  return {
    prepareCalls: 1,
    selectionCoordinateRequests: 1,
    selectionSelectionExtractions: 1,
    selectionSourceExtractions: 1,
    selectionRichExtractions: richExtractions,
    selectionExtractedCodeUnits:
      selectionExtraction.visibleText.length +
      sourceExtraction.visibleText.length +
      richCodeUnits,
  }
}

function runSearchWorkload(
  workload: BenchmarkWorkload,
  input: string,
  search: NonNullable<BenchmarkWorkload['search']>,
): Record<
  | 'prepareCalls'
  | 'searchNavigationLookups'
  | 'searchProjectedMatches'
  | 'searchReturnedMatches'
  | 'searchSessions',
  number
> {
  const prepared = prepareTerminal(input, workload.prepare)
  const indexes = search.project === true
    ? createTerminalLayoutBundle(prepared, {
      ...workload.layout,
      anchorInterval: 16,
      maxPages: 2,
      pageSize: 8,
    })
    : undefined
  const session = createTerminalSearchSession(prepared, search.query, {
    ...(search.mode === undefined ? {} : { mode: search.mode }),
    ...(search.caseSensitive === undefined ? {} : { caseSensitive: search.caseSensitive }),
    ...(search.wholeWord === undefined ? {} : { wholeWord: search.wholeWord }),
    ...(indexes === undefined ? {} : { indexes }),
  })
  const matchCount = getTerminalSearchSessionMatchCount(session)
  const matches = getTerminalSearchMatchesForSourceRange(session, {
    sourceStart: 0,
    sourceEnd: input.length,
    ...(search.limit === undefined ? {} : { limit: search.limit }),
  })
  assert(matchCount >= matches.length, `${workload.id} expected match count >= returned matches`)
  const after = getTerminalSearchMatchAfterSourceOffset(session, 0)
  const before = getTerminalSearchMatchBeforeSourceOffset(session, input.length)
  assert(after !== null, `${workload.id} expected a search match after BOF`)
  assert(before !== null, `${workload.id} expected a search match before EOF`)

  return {
    prepareCalls: 1,
    searchSessions: 1,
    searchReturnedMatches: matches.length,
    searchProjectedMatches: matches.filter(match => match.projection !== undefined).length,
    searchNavigationLookups: 2,
  }
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
    // For virtual workloads this counts range-walker invocations, not renderer or page-build calls.
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

function runLayoutBundleWorkload(
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
  const bundle = createTerminalLayoutBundle(prepared, {
    ...workload.layout,
    anchorInterval: 16,
    maxPages: 3,
    pageSize: 8,
  })
  const starts = [0, 8, 16, 24]
  let materializedLines = 0
  let materializedCodeUnits = 0
  let sourceLookups = 0

  for (const startRow of starts) {
    const page = getTerminalLayoutBundlePage(prepared, bundle, { startRow, rowCount: 8 })
    const materialized = materializeTerminalLinePage(prepared, page)
    materializedLines += materialized.length
    materializedCodeUnits += materialized.reduce((sum, line) => sum + line.text.length, 0)
    for (const line of page.lines) {
      projectTerminalSourceOffset(prepared, bundle, line.sourceStart)
      sourceLookups++
    }
  }
  getTerminalLayoutBundlePage(prepared, bundle, { startRow: 8, rowCount: 8 })

  let appendInvalidatedCodeUnits = 0
  let appendReprepareCodeUnits = 0
  let invalidatedPages = 0
  let flowRangeWalks = 0
  if (workload.appendText !== undefined) {
    const flow = prepareTerminalCellFlow(input, workload.prepare)
    const flowPrepared = getTerminalCellFlowPrepared(flow)
    const flowBundle = createTerminalLayoutBundle(flowPrepared, {
      ...workload.layout,
      anchorInterval: 16,
      generation: getTerminalCellFlowGeneration(flow),
      maxPages: 2,
      pageSize: 8,
    })
    getTerminalLayoutBundlePage(flowPrepared, flowBundle, { startRow: 8, rowCount: 8 })
    getTerminalLayoutBundlePage(flowPrepared, flowBundle, {
      startRow: 96,
      rowCount: 8,
    })
    const appended = appendTerminalCellFlow(flow, workload.appendText, { invalidationWindowCodeUnits: 256 })
    const appendedPrepared = getTerminalCellFlowPrepared(appended.flow)
    appendInvalidatedCodeUnits += appended.invalidation.invalidatedSourceCodeUnits
    appendReprepareCodeUnits += appended.invalidation.reprepareSourceCodeUnits
    invalidateTerminalLayoutBundle(appendedPrepared, flowBundle, appended.invalidation)
    const flowBundleStats = getTerminalLayoutBundleStats(flowBundle as never)
    invalidatedPages += flowBundleStats.pageCache.invalidatedPages
    const page = getTerminalLayoutBundlePage(appendedPrepared, flowBundle, { startRow: 8, rowCount: 8 })
    const materialized = materializeTerminalLinePage(appendedPrepared, page)
    materializedLines += materialized.length
    materializedCodeUnits += materialized.reduce((sum, line) => sum + line.text.length, 0)
    projectTerminalSourceOffset(appendedPrepared, flowBundle, appended.invalidation.firstInvalidSourceOffset)
    sourceLookups++
    flowRangeWalks += getTerminalLayoutBundleStats(flowBundle as never).lineIndex.rangeWalks
  }

  const bundleStats = getTerminalLayoutBundleStats(bundle as never)
  return {
    prepareCalls: workload.appendText === undefined ? 1 : 3,
    // For virtual workloads this counts range-walker invocations, not renderer or page-build calls.
    layoutPasses: bundleStats.lineIndex.rangeWalks + flowRangeWalks,
    materializedLines,
    materializedCodeUnits,
    pageCacheHits: bundleStats.pageCache.pageHits,
    pageCacheMisses: bundleStats.pageCache.pageMisses,
    pageBuilds: bundleStats.pageCache.pageBuilds,
    anchorCount: bundleStats.lineIndex.anchorCount,
    maxAnchorReplayRows: bundleStats.lineIndex.maxReplayRows,
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

export function counter(counters: Record<string, number>, key: string): number {
  assert(isBenchmarkCounterName(key), `unknown benchmark counter ${key}`)
  return counters[key] ?? 0
}

function isBenchmarkCounterName(key: string): key is BenchmarkCounterName {
  return benchmarkKnownCounterNameSet.has(key)
}

async function loadInput(workload: BenchmarkWorkload, root: string): Promise<string> {
  if (workload.rawText !== undefined) return workload.rawText
  if (workload.text !== undefined) return workload.text
  if (workload.repeatText !== undefined) {
    return `${workload.repeatText.prefix ?? ''}${workload.repeatText.text.repeat(workload.repeatText.count)}${workload.repeatText.suffix ?? ''}`
  }
  assert(workload.corpusFile !== undefined, `workload ${workload.id} missing input`)
  const text = await readFile(path.join(root, 'corpora', workload.corpusFile), 'utf8')
  return workload.maxChars === undefined ? text : text.slice(0, workload.maxChars)
}

export function parseBenchmarkConfig(value: unknown): BenchmarkConfig {
  const record = expectRecord(value, 'benchmark config')
  assertAllowedKeys(record, 'benchmark config', ['metadata', 'defaults', 'workloads'])
  const metadata = expectRecord(record['metadata'], 'benchmark config.metadata')
  assertAllowedKeys(metadata, 'benchmark config.metadata', ['note', 'schema'])
  const schema = expectString(metadata['schema'], 'benchmark config.metadata.schema')
  assert(schema === 'pretext-tui-benchmark@1', 'unexpected benchmark schema')
  const note = metadata['note'] === undefined
    ? undefined
    : expectString(metadata['note'], 'benchmark config.metadata.note')
  const defaults = expectRecord(record['defaults'], 'benchmark config.defaults')
  assertAllowedKeys(defaults, 'benchmark config.defaults', ['iterations', 'maxMilliseconds'])
  const iterations = expectPositiveInteger(defaults['iterations'], 'benchmark config.defaults.iterations')
  const maxMilliseconds = expectPositiveNumber(defaults['maxMilliseconds'], 'benchmark config.defaults.maxMilliseconds')
  const workloads = expectArray(record['workloads'], 'benchmark config.workloads')
  return {
    metadata: note === undefined ? { schema } : { note, schema },
    defaults: { iterations, maxMilliseconds },
    workloads: workloads.map((item, index) => parseBenchmarkWorkload(item, index)),
  }
}

function parseBenchmarkWorkload(value: unknown, index: number): BenchmarkWorkload {
  const label = `workloads[${index}]`
  const workload = expectRecord(value, label)
  assertAllowedKeys(workload, label, [
    'appendText',
    'corpusFile',
    'counterAssertions',
    'firstLineOnly',
    'id',
    'iterations',
    'layout',
    'layoutBundle',
    'maxChars',
    'maxMilliseconds',
    'prepare',
    'rawText',
    'repeatText',
    'rich',
    'search',
    'selection',
    'text',
    'virtual',
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
  if (workload['rich'] !== undefined) expectTrueFlag(workload['rich'], `${label}.rich`)
  if (workload['virtual'] !== undefined) expectTrueFlag(workload['virtual'], `${label}.virtual`)
  if (workload['layoutBundle'] !== undefined) expectTrueFlag(workload['layoutBundle'], `${label}.layoutBundle`)
  if (workload['firstLineOnly'] !== undefined) expectTrueFlag(workload['firstLineOnly'], `${label}.firstLineOnly`)
  if (workload['appendText'] !== undefined) {
    expectString(workload['appendText'], `${label}.appendText`)
    assert(workload['virtual'] === true, `${label}.appendText requires virtual`)
  }
  if (workload['layoutBundle'] === true) {
    assert(workload['virtual'] === true, `${label}.layoutBundle requires virtual`)
  }
  const modeCount = [
    workload['rich'] === true,
    workload['search'] !== undefined,
    workload['selection'] !== undefined,
    workload['virtual'] === true,
  ].filter(Boolean).length
  assert(modeCount <= 1, `${label} rich, search, selection, and virtual modes are mutually exclusive`)
  if (workload['firstLineOnly'] === true) {
    assert(workload['search'] === undefined, `${label}.firstLineOnly cannot be combined with search`)
    assert(workload['selection'] === undefined, `${label}.firstLineOnly cannot be combined with selection`)
    assert(workload['virtual'] !== true, `${label}.firstLineOnly cannot be combined with virtual`)
  }
  parseLayout(workload['layout'], `${label}.layout`)
  if (workload['prepare'] !== undefined) parsePrepare(workload['prepare'], `${label}.prepare`)
  if (workload['iterations'] !== undefined) expectPositiveInteger(workload['iterations'], `${label}.iterations`)
  if (workload['maxMilliseconds'] !== undefined) expectPositiveNumber(workload['maxMilliseconds'], `${label}.maxMilliseconds`)
  if (workload['search'] !== undefined) parseSearch(workload['search'], `${label}.search`)
  if (workload['selection'] !== undefined) parseSelection(workload['selection'], `${label}.selection`)
  if (workload['counterAssertions'] !== undefined) parseCounterAssertions(workload['counterAssertions'], `${label}.counterAssertions`)
  return workload as BenchmarkWorkload
}

function parseRepeatText(value: unknown, label: string): void {
  const repeatText = expectRecord(value, label)
  assertAllowedKeys(repeatText, label, ['count', 'prefix', 'suffix', 'text'])
  if (repeatText['prefix'] !== undefined) expectString(repeatText['prefix'], `${label}.prefix`)
  expectString(repeatText['text'], `${label}.text`)
  expectNonNegativeInteger(repeatText['count'], `${label}.count`)
  if (repeatText['suffix'] !== undefined) expectString(repeatText['suffix'], `${label}.suffix`)
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
    assert(
      prepare['whiteSpace'] === 'normal' || prepare['whiteSpace'] === 'pre-wrap',
      `${label}.whiteSpace must be normal or pre-wrap`,
    )
  }
  if (prepare['wordBreak'] !== undefined) {
    assert(
      prepare['wordBreak'] === 'normal' || prepare['wordBreak'] === 'keep-all',
      `${label}.wordBreak must be normal or keep-all`,
    )
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
  assertAllowedKeys(search, label, ['caseSensitive', 'limit', 'mode', 'project', 'query', 'wholeWord'])
  expectString(search['query'], `${label}.query`)
  if (search['mode'] !== undefined) {
    assert(search['mode'] === 'literal' || search['mode'] === 'regex', `${label}.mode must be literal or regex`)
  }
  if (search['caseSensitive'] !== undefined) expectBoolean(search['caseSensitive'], `${label}.caseSensitive`)
  if (search['wholeWord'] !== undefined) expectBoolean(search['wholeWord'], `${label}.wholeWord`)
  if (search['project'] !== undefined) expectBoolean(search['project'], `${label}.project`)
  if (search['limit'] !== undefined) expectNonNegativeInteger(search['limit'], `${label}.limit`)
}

function parseSelection(value: unknown, label: string): void {
  const selection = expectRecord(value, label)
  assertAllowedKeys(selection, label, ['anchor', 'focus', 'rich', 'sourceEnd', 'sourceStart'])
  parseSelectionPoint(selection['anchor'], `${label}.anchor`)
  parseSelectionPoint(selection['focus'], `${label}.focus`)
  const sourceStart = expectNonNegativeInteger(selection['sourceStart'], `${label}.sourceStart`)
  const sourceEnd = expectNonNegativeInteger(selection['sourceEnd'], `${label}.sourceEnd`)
  assert(sourceEnd >= sourceStart, `${label}.sourceEnd must be >= sourceStart`)
  if (selection['rich'] !== undefined) expectBoolean(selection['rich'], `${label}.rich`)
}

function parseSelectionPoint(value: unknown, label: string): void {
  const point = expectRecord(value, label)
  assertAllowedKeys(point, label, ['column', 'row'])
  expectNonNegativeInteger(point['row'], `${label}.row`)
  expectNonNegativeInteger(point['column'], `${label}.column`)
}

function parseCounterAssertions(value: unknown, label: string): void {
  const assertions = expectRecord(value, label)
  for (const [counterKey, assertionValue] of Object.entries(assertions)) {
    assert(isBenchmarkCounterName(counterKey), `${label}.${counterKey} is not a known counter`)
    const assertion = expectRecord(assertionValue, `${label}.${counterKey}`)
    assertAllowedKeys(assertion, `${label}.${counterKey}`, ['exact', 'max', 'min'])
    assert(
      assertion['exact'] !== undefined || assertion['min'] !== undefined || assertion['max'] !== undefined,
      `${label}.${counterKey} must define exact, min, or max`,
    )
    if (assertion['exact'] !== undefined) expectNonNegativeInteger(assertion['exact'], `${label}.${counterKey}.exact`)
    if (assertion['min'] !== undefined) expectNonNegativeInteger(assertion['min'], `${label}.${counterKey}.min`)
    if (assertion['max'] !== undefined) expectNonNegativeInteger(assertion['max'], `${label}.${counterKey}.max`)
  }
}

function assertExactlyOneInputSource(workload: Record<string, unknown>, label: string): void {
  const sources = ['corpusFile', 'rawText', 'repeatText', 'text'].filter(key => workload[key] !== undefined)
  assert(sources.length === 1, `${label} must define exactly one input source`)
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  label: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(record)) {
    assert(allowed.has(key), `${label}.${key} is not allowed`)
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

function expectPositiveNumber(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(number > 0, `${label} must be positive`)
  return number
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
