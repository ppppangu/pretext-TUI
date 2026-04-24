// 补建说明：该文件为后续补建，用于执行 pretext-TUI 与主流 text wrapping primitives 的横向 benchmark evidence；当前进度：Task 4 升级为 raw samples + provenance + semantic matrix 的 optional report generator，仍不是发布门禁。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createTerminalLineIndex,
  createTerminalPageCache,
  getTerminalLinePage,
  materializeTerminalLinePage,
  materializeTerminalLineRange,
  prepareTerminal,
  walkTerminalLineRanges,
  type TerminalPrepareOptions,
} from '../src/index.js'
import {
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from '../src/terminal-rich-inline.js'
import {
  attachBenchmarkEvidenceRatios,
  BENCHMARK_EVIDENCE_SCHEMA,
  collectBenchmarkEvidenceMetadata,
  computeBenchmarkEvidenceStats,
  createBenchmarkReportId,
  renderBenchmarkEvidenceSummaryMarkdown,
  round,
  sha256,
  validateBenchmarkEvidenceReport,
  writeBenchmarkEvidenceReport,
  type BenchmarkEvidenceOutput,
  type BenchmarkEvidenceReport,
  type BenchmarkEvidenceResult,
  type BenchmarkEvidenceSample,
  type BenchmarkSemanticFeatures,
  type BenchmarkSemanticMatrixEntry,
  type BenchmarkWorkloadEvidence,
} from './tui-benchmark-evidence.js'

type Scenario = 'full-document' | 'large-page-seek' | 'prepared-resize' | 'rich-sgr'

type CompetitiveWorkload = {
  columns: number[]
  corpusFile?: string
  description: string
  id: string
  iterations?: number
  maxChars?: number
  minSamplesForP95?: number
  pageSize?: number
  pageStarts?: number[]
  prepare?: TerminalPrepareOptions
  rawText?: string
  repeat?: number
  samples?: number
  scenario: Scenario
  text?: string
}

type CompetitiveConfig = {
  defaults: {
    iterations: number
    minSamplesForP95: number
    samples: number
    warmupIterations: number
  }
  metadata: {
    note: string
    schema: string
  }
  workloads: CompetitiveWorkload[]
}

type CliOptions = {
  minSamplesForP95?: number
  packageScript?: string
  reportDir?: string
  reportFile?: string
  samples?: number
  summaryFile?: string
}

type OptionalCompetitors = {
  stringWidth?: LoadedOptionalDependency<StringWidthFn>
  stripAnsi?: LoadedOptionalDependency<StripAnsiFn>
  wrapAnsi?: LoadedOptionalDependency<WrapAnsiFn>
}

type LoadedOptionalDependency<T> = {
  fn: T
  version: string | null
}

type StringWidthFn = (input: string) => number
type StripAnsiFn = (input: string) => string
type WrapAnsiFn = (input: string, columns: number, options?: { hard?: boolean; trim?: boolean }) => string

type RunSummary = {
  codeUnits: number
  hash: string
  materializedLines: number
  rows: number
}

type LoadedWorkloadInput = {
  effectiveInput: string
  rawInput: string
  sourceKind: 'text' | 'rawText' | 'corpusFile'
  workloadEvidence: BenchmarkWorkloadEvidence
}

type BenchmarkRunner = {
  adapter: string
  notes: string
  run: () => RunSummary
  skipReason?: string
}

const root = process.cwd()
const configPath = 'benchmarks/competitive-tui.json'
const cli = parseCliOptions(process.argv.slice(2))
const config = parseCompetitiveConfig(JSON.parse(
  await readFile(path.join(root, configPath), 'utf8'),
))
const competitors = await loadOptionalCompetitors()
const packageInfo = parsePackageInfo(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')))
const metadata = await collectBenchmarkEvidenceMetadata({
  configPath,
  packageScript: cli.packageScript ?? 'benchmark:competitive:tui',
  root,
  scriptPaths: [
    'scripts/competitive-tui-benchmark.ts',
    'scripts/tui-benchmark-evidence.ts',
    'benchmarks/competitive-tui.json',
  ],
})
const generatedAt = new Date()
const workloads: BenchmarkWorkloadEvidence[] = []
const semanticMatrix: BenchmarkSemanticMatrixEntry[] = []
const results: BenchmarkEvidenceResult[] = []

for (const workload of config.workloads) {
  console.error(`[competitive] running ${workload.id}`)
  const loaded = await loadWorkloadInput(workload)
  workloads.push(loaded.workloadEvidence)
  const runners = runnersForWorkload(workload, loaded.effectiveInput, competitors)
  const workloadResults = runners.map(runner => runRunnerSamples(workload, runner))
  const referenceAdapter = referenceAdapterForWorkload(workload)
  results.push(...attachBenchmarkEvidenceRatios(workloadResults, referenceAdapter))
  semanticMatrix.push(...runners.map(runner => semanticMatrixEntry(workload, loaded.effectiveInput, runner.adapter)))
}

const report: BenchmarkEvidenceReport = {
  schema: BENCHMARK_EVIDENCE_SCHEMA,
  reportId: createBenchmarkReportId('competitive-tui', generatedAt, metadata.git),
  reportKind: 'competitive-tui',
  generatedAt: generatedAt.toISOString(),
  caveat: 'This is a local competitive benchmark for text-layout primitives, not a release gate and not a full TUI renderer/event-loop benchmark.',
  claimability: 'local-evidence-only',
  command: metadata.command,
  git: metadata.git,
  sources: metadata.sources,
  runtime: metadata.runtime,
  hardware: metadata.hardware,
  dependencies: {
    'pretext-tui': packageInfo.version,
    'wrap-ansi': competitors.wrapAnsi?.version ?? null,
    'string-width': competitors.stringWidth?.version ?? null,
    'strip-ansi': competitors.stripAnsi?.version ?? null,
  },
  workloads,
  semanticMatrix,
  results,
}
const validatedReport = validateBenchmarkEvidenceReport(report)

await writeOptionalReports(validatedReport, cli)

console.log('TUI competitive benchmark completed')
console.log(JSON.stringify(validatedReport, null, 2))

function runRunnerSamples(
  workload: CompetitiveWorkload,
  runner: BenchmarkRunner,
): BenchmarkEvidenceResult {
  console.error(`[competitive]   ${runner.adapter}`)
  const iterationsPerSample = iterationsFor(workload)
  const warmupIterations = config.defaults.warmupIterations
  const minP95Samples = minSamplesForP95ForWorkload(workload)
  if (runner.skipReason !== undefined) {
    return {
      workloadId: workload.id,
      adapter: runner.adapter,
      skipped: true,
      skipReason: runner.skipReason,
      notes: runner.notes,
      ratioDirection: 'elapsedMs / referenceElapsedMs; lower is faster',
      samples: [],
      stats: null,
      ratios: null,
    }
  }

  for (let i = 0; i < warmupIterations; i++) runner.run()

  const samples: BenchmarkEvidenceSample[] = []
  for (let sampleIndex = 0; sampleIndex < sampleCount(workload); sampleIndex++) {
    const started = performance.now()
    let summary: RunSummary | null = null
    for (let i = 0; i < iterationsPerSample; i++) {
      summary = runner.run()
    }
    const elapsedMs = performance.now() - started
    const finalSummary = summary ?? emptySummary()
    samples.push({
      sampleIndex,
      iterations: iterationsPerSample,
      elapsedMs: round(elapsedMs),
      opsPerSecond: round(iterationsPerSample / Math.max(elapsedMs / 1000, 0.001)),
      output: toEvidenceOutput(finalSummary),
    })
  }

  return {
    workloadId: workload.id,
    adapter: runner.adapter,
    notes: runner.notes,
    ratioDirection: 'elapsedMs / referenceElapsedMs; lower is faster',
    samples,
    stats: computeBenchmarkEvidenceStats(samples, {
      iterationsPerSample,
      minSamplesForP95: minP95Samples,
      warmupIterations,
    }),
    ratios: null,
  }
}

function runnersForWorkload(
  workload: CompetitiveWorkload,
  input: string,
  competitors: OptionalCompetitors,
): BenchmarkRunner[] {
  if (workload.scenario === 'full-document') {
    return [
      {
        adapter: 'pretext-cold-full',
        notes: 'prepareTerminal + walk/materialize all rows per sample iteration.',
        run: () => runPretextColdFull(input, workload),
      },
      wrapAnsiRunner('wrap-ansi-full', competitors, 'wrapAnsi hard-wraps the whole input per sample iteration.', wrapAnsi =>
        runWrapAnsiFull(input, workload, wrapAnsi),
      ),
      stringWidthRunner('string-width-greedy-full', competitors, 'Intl.Segmenter + string-width greedy hard wrap per sample iteration.', deps =>
        runStringWidthGreedyFull(input, workload, deps),
      ),
    ]
  }
  if (workload.scenario === 'prepared-resize') {
    const prepared = prepareTerminal(input, workload.prepare)
    return [
      {
        adapter: 'pretext-prepared-resize',
        notes: 'prepare once, relayout/materialize across resize widths per sample iteration.',
        run: () => runPretextPreparedFull(prepared, workload),
      },
      wrapAnsiRunner('wrap-ansi-resize', competitors, 'wrapAnsi rewraps raw input for every resize width.', wrapAnsi =>
        runWrapAnsiFull(input, workload, wrapAnsi),
      ),
      stringWidthRunner('string-width-greedy-resize', competitors, 'string-width greedy wrapper rewraps raw input for every resize width.', deps =>
        runStringWidthGreedyFull(input, workload, deps),
      ),
    ]
  }
  if (workload.scenario === 'rich-sgr') {
    return [
      {
        adapter: 'pretext-rich-sgr',
        notes: 'tokenize SGR metadata, terminal layout, materialize rich lines with explicit ANSI sidecar.',
        run: () => runPretextRichFull(input, workload),
      },
      wrapAnsiRunner('wrap-ansi-rich-sgr', competitors, 'wrapAnsi wraps SGR-decorated input directly.', wrapAnsi =>
        runWrapAnsiFull(input, workload, wrapAnsi),
      ),
      stringWidthRunner('string-width-greedy-strip-ansi', competitors, 'strip ANSI then greedy hard-wrap visible text only.', deps =>
        runStringWidthGreedyFull(input, workload, deps),
      ),
    ]
  }

  const hotPrepared = prepareTerminal(input, workload.prepare)
  const hotIndex = createTerminalLineIndex(hotPrepared, {
    columns: firstColumn(workload),
    anchorInterval: 32,
  })
  const hotCache = createTerminalPageCache(hotPrepared, hotIndex, {
    maxPages: 8,
    pageSize: pageSize(workload),
  })
  return [
    {
      adapter: 'pretext-virtual-cold-pages',
      notes: 'prepare, build fixed-column index/cache, fetch requested pages per sample iteration.',
      run: () => runPretextVirtualPages(input, workload, false),
    },
    {
      adapter: 'pretext-virtual-hot-pages',
      notes: 'reuse prepared text, sparse index, and page cache across repeated viewport page requests.',
      run: () => runPretextVirtualPages(input, workload, true, hotPrepared, hotIndex, hotCache),
    },
    wrapAnsiRunner('wrap-ansi-full-slice-pages', competitors, 'best-case baseline: wrap full input once, then slice requested viewport pages.', wrapAnsi =>
      runWrapAnsiPageSlices(input, workload, wrapAnsi),
    ),
    stringWidthRunner('string-width-greedy-full-slice-pages', competitors, 'best-case greedy baseline: full wrap once, then slice requested viewport pages.', deps =>
      runStringWidthGreedyPageSlices(input, workload, deps),
    ),
  ]
}

function wrapAnsiRunner(
  adapter: string,
  competitors: OptionalCompetitors,
  notes: string,
  run: (wrapAnsi: WrapAnsiFn) => RunSummary,
): BenchmarkRunner {
  if (competitors.wrapAnsi === undefined) {
    return {
      adapter,
      notes,
      run: emptySummary,
      skipReason: 'optional benchmark dependency wrap-ansi is not installed or failed to load',
    }
  }
  return {
    adapter,
    notes,
    run: () => run(competitors.wrapAnsi!.fn),
  }
}

function stringWidthRunner(
  adapter: string,
  competitors: OptionalCompetitors,
  notes: string,
  run: (competitors: { stringWidth: StringWidthFn; stripAnsi: StripAnsiFn }) => RunSummary,
): BenchmarkRunner {
  const missing = [
    competitors.stringWidth === undefined ? 'string-width' : null,
    competitors.stripAnsi === undefined ? 'strip-ansi' : null,
  ].filter((item): item is string => item !== null)
  if (missing.length > 0) {
    return {
      adapter,
      notes,
      run: emptySummary,
      skipReason: `optional benchmark ${missing.length === 1 ? 'dependency' : 'dependencies'} ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not installed or failed to load`,
    }
  }
  return {
    adapter,
    notes,
    run: () => run({
      stringWidth: competitors.stringWidth!.fn,
      stripAnsi: competitors.stripAnsi!.fn,
    }),
  }
}

function runPretextColdFull(input: string, workload: CompetitiveWorkload): RunSummary {
  const prepared = prepareTerminal(input, workload.prepare)
  return runPretextPreparedFull(prepared, workload)
}

function runPretextPreparedFull(
  prepared: ReturnType<typeof prepareTerminal>,
  workload: CompetitiveWorkload,
): RunSummary {
  const lines: string[] = []
  for (const columns of workload.columns) {
    walkTerminalLineRanges(prepared, { columns }, line => {
      lines.push(materializeTerminalLineRange(prepared, line).text)
    })
  }
  return summarizeLines(lines)
}

function runPretextRichFull(input: string, workload: CompetitiveWorkload): RunSummary {
  const prepared = prepareTerminalRichInline(input, workload.prepare)
  const lines: string[] = []
  for (const columns of workload.columns) {
    walkTerminalRichLineRanges(prepared, { columns }, line => {
      lines.push(materializeTerminalRichLineRange(prepared, line, { ansiText: 'sgr-osc8' }).ansiText ?? '')
    })
  }
  return summarizeLines(lines)
}

function runPretextVirtualPages(
  input: string,
  workload: CompetitiveWorkload,
  reuse: boolean,
  reusablePrepared?: ReturnType<typeof prepareTerminal>,
  reusableIndex?: ReturnType<typeof createTerminalLineIndex>,
  reusableCache?: ReturnType<typeof createTerminalPageCache>,
): RunSummary {
  const columns = firstColumn(workload)
  const prepared = reuse && reusablePrepared !== undefined
    ? reusablePrepared
    : prepareTerminal(input, workload.prepare)
  const index = reuse && reusableIndex !== undefined
    ? reusableIndex
    : createTerminalLineIndex(prepared, { columns, anchorInterval: 32 })
  const cache = reuse && reusableCache !== undefined
    ? reusableCache
    : createTerminalPageCache(prepared, index, {
      maxPages: 8,
      pageSize: pageSize(workload),
    })
  const lines: string[] = []
  for (const startRow of pageStarts(workload)) {
    const page = getTerminalLinePage(prepared, cache, index, {
      rowCount: pageSize(workload),
      startRow,
    })
    for (const line of materializeTerminalLinePage(prepared, page)) {
      lines.push(line.text)
    }
  }
  return summarizeLines(lines)
}

function runWrapAnsiFull(
  input: string,
  workload: CompetitiveWorkload,
  wrapAnsi: WrapAnsiFn,
): RunSummary {
  const lines: string[] = []
  for (const columns of workload.columns) {
    lines.push(...splitLines(wrapAnsi(input, columns, { hard: true, trim: false })))
  }
  return summarizeLines(lines)
}

function runWrapAnsiPageSlices(
  input: string,
  workload: CompetitiveWorkload,
  wrapAnsi: WrapAnsiFn,
): RunSummary {
  const wrapped = splitLines(wrapAnsi(input, firstColumn(workload), { hard: true, trim: false }))
  return summarizeLines(slicePages(wrapped, workload))
}

function runStringWidthGreedyFull(
  input: string,
  workload: CompetitiveWorkload,
  competitors: { stringWidth: StringWidthFn; stripAnsi: StripAnsiFn },
): RunSummary {
  const lines: string[] = []
  for (const columns of workload.columns) {
    lines.push(...stringWidthGreedyWrap(input, columns, competitors))
  }
  return summarizeLines(lines)
}

function runStringWidthGreedyPageSlices(
  input: string,
  workload: CompetitiveWorkload,
  competitors: { stringWidth: StringWidthFn; stripAnsi: StripAnsiFn },
): RunSummary {
  const wrapped = stringWidthGreedyWrap(input, firstColumn(workload), competitors)
  return summarizeLines(slicePages(wrapped, workload))
}

function stringWidthGreedyWrap(
  input: string,
  columns: number,
  competitors: { stringWidth: StringWidthFn; stripAnsi: StripAnsiFn },
): string[] {
  const visible = competitors.stripAnsi(input).replace(/\t/g, '    ')
  const rows: string[] = []
  for (const hardLine of splitLines(visible)) {
    let row = ''
    let width = 0
    for (const grapheme of segmentGraphemes(hardLine)) {
      const graphemeWidth = Math.max(0, competitors.stringWidth(grapheme))
      if (width > 0 && width + graphemeWidth > columns) {
        rows.push(row)
        row = ''
        width = 0
      }
      row += grapheme
      width += graphemeWidth
    }
    rows.push(row)
  }
  return rows
}

function summarizeLines(lines: readonly string[]): RunSummary {
  return {
    codeUnits: lines.reduce((sum, line) => sum + line.length, 0),
    hash: stableHash(lines.join('\n')),
    materializedLines: lines.length,
    rows: lines.length,
  }
}

function slicePages(lines: readonly string[], workload: CompetitiveWorkload): string[] {
  const sliced: string[] = []
  const size = pageSize(workload)
  for (const start of pageStarts(workload)) {
    sliced.push(...lines.slice(start, start + size))
  }
  return sliced
}

function semanticMatrixEntry(workload: CompetitiveWorkload, effectiveInput: string, adapter: string): BenchmarkSemanticMatrixEntry {
  const comparatorKind = adapter.startsWith('pretext-')
    ? 'pretext'
    : adapter.startsWith('wrap-ansi')
      ? 'wrap-ansi'
      : 'string-width-greedy'
  const operation = operationFor(workload, adapter)
  const exercisesOsc8 = workloadExercisesOsc8(effectiveInput)
  return {
    workloadId: workload.id,
    adapter,
    comparatorKind,
    operation,
    features: semanticFeatures(exercisesOsc8, comparatorKind, operation, adapter),
    caveats: semanticCaveats(exercisesOsc8, comparatorKind, operation, adapter),
  }
}

function semanticFeatures(
  exercisesOsc8: boolean,
  comparatorKind: BenchmarkSemanticMatrixEntry['comparatorKind'],
  operation: BenchmarkSemanticMatrixEntry['operation'],
  adapter: string,
): BenchmarkSemanticFeatures {
  if (comparatorKind === 'pretext') {
    const virtualCold = adapter === 'pretext-virtual-cold-pages'
    return {
      terminalWidth: 'native',
      graphemeSafety: 'native',
      tabs: 'layout-time',
      whitespace: 'pre-wrap',
      sourceOffsets: 'native',
      richSgr: operation === 'rich-sgr' ? 'metadata' : 'absent',
      osc8: operation === 'rich-sgr' && exercisesOsc8 ? 'policy-checked' : 'absent',
      sanitizer: operation === 'rich-sgr' && exercisesOsc8 ? 'native' : 'absent',
      rangeOnlyOutput: 'native',
      pageCache: operation === 'virtual-pages' ? 'native' : 'absent',
      appendInvalidation: 'absent',
      prepareIncluded: operation !== 'prepared-resize' && (operation !== 'virtual-pages' || virtualCold),
      cacheState: operation === 'virtual-pages'
        ? virtualCold ? 'cold' : 'hot'
        : 'not-applicable',
      outputHashComparable: true,
    }
  }
  if (comparatorKind === 'wrap-ansi') {
    return {
      terminalWidth: 'partial',
      graphemeSafety: 'partial',
      tabs: 'expanded',
      whitespace: 'partial',
      sourceOffsets: 'absent',
      richSgr: operation === 'rich-sgr' ? 'preserved-text' : 'absent',
      osc8: operation === 'rich-sgr' && exercisesOsc8 ? 'preserved-text' : 'absent',
      sanitizer: operation === 'rich-sgr' && exercisesOsc8 ? 'dependency' : 'absent',
      rangeOnlyOutput: 'absent',
      pageCache: 'absent',
      appendInvalidation: 'absent',
      prepareIncluded: true,
      cacheState: 'not-applicable',
      outputHashComparable: false,
    }
  }
  return {
    terminalWidth: 'partial',
    graphemeSafety: 'partial',
    tabs: 'expanded',
    whitespace: 'partial',
    sourceOffsets: 'absent',
    richSgr: operation === 'rich-sgr' ? 'stripped' : 'absent',
    osc8: operation === 'rich-sgr' && exercisesOsc8 ? 'stripped' : 'absent',
    sanitizer: operation === 'rich-sgr' && exercisesOsc8 ? 'dependency' : 'absent',
    rangeOnlyOutput: 'absent',
    pageCache: 'absent',
    appendInvalidation: 'absent',
    prepareIncluded: true,
    cacheState: 'not-applicable',
    outputHashComparable: false,
  }
}

function semanticCaveats(
  exercisesOsc8: boolean,
  comparatorKind: BenchmarkSemanticMatrixEntry['comparatorKind'],
  operation: BenchmarkSemanticMatrixEntry['operation'],
  adapter: string,
): string[] {
  if (comparatorKind === 'pretext') {
    if (operation === 'virtual-pages') {
      return adapter === 'pretext-virtual-cold-pages'
        ? ['Prepared text, sparse index, and page cache are rebuilt inside each cold-page sample iteration.']
        : ['Prepared text, sparse index, and page cache are reused for the hot-page adapter.']
    }
    if (operation === 'prepared-resize') {
      return ['Prepare time is intentionally excluded to measure resize relayout over one prepared buffer.']
    }
    return exercisesOsc8
      ? ['Pretext results include source-range capable terminal layout work and exercise OSC8 URI policy.']
      : ['Pretext results include source-range capable terminal layout work. OSC8 policy is not exercised by this workload.']
  }
  const common = ['Comparator does not provide source-offset ranges, sparse page caches, or host-neutral layout handles.']
  if (operation === 'rich-sgr') {
    common.push('Rich metadata semantics differ; hashes are not expected to match pretext rich fragments.')
    if (!exercisesOsc8) common.push('OSC8 behavior is not exercised by this workload.')
  }
  if (operation === 'virtual-pages') {
    common.push('Baseline wraps the full input before slicing requested rows.')
  }
  return common
}

function workloadExercisesOsc8(effectiveInput: string): boolean {
  return effectiveInput.includes('\u001b]8')
}

function operationFor(
  workload: CompetitiveWorkload,
  adapter: string,
): BenchmarkSemanticMatrixEntry['operation'] {
  if (workload.scenario === 'rich-sgr') return 'rich-sgr'
  if (workload.scenario === 'prepared-resize') return 'prepared-resize'
  if (workload.scenario === 'large-page-seek') return 'virtual-pages'
  return adapter.includes('cold') ? 'cold-full' : 'cold-full'
}

async function writeOptionalReports(report: BenchmarkEvidenceReport, cli: CliOptions): Promise<void> {
  const reportFile = cli.reportFile ?? (cli.reportDir === undefined ? undefined : path.join(cli.reportDir, `${report.reportId}.json`))
  if (reportFile !== undefined) {
    await mkdir(path.dirname(reportFile), { recursive: true })
    await writeBenchmarkEvidenceReport(reportFile, report)
    console.error(`[competitive] wrote report ${reportFile}`)
  }
  if (cli.summaryFile !== undefined) {
    await mkdir(path.dirname(cli.summaryFile), { recursive: true })
    await writeFile(cli.summaryFile, renderBenchmarkEvidenceSummaryMarkdown(report))
    console.error(`[competitive] wrote summary ${cli.summaryFile}`)
  }
}

async function loadWorkloadInput(workload: CompetitiveWorkload): Promise<LoadedWorkloadInput> {
  const rawInput = await loadRawWorkloadInput(workload)
  const effectiveInput = (workload.maxChars === undefined ? rawInput : rawInput.slice(0, workload.maxChars)).repeat(workload.repeat ?? 1)
  const sourceKind = workload.rawText !== undefined
    ? 'rawText'
    : workload.text !== undefined
      ? 'text'
      : 'corpusFile'
  const source = {
    kind: sourceKind,
    rawInputHash: sha256(rawInput),
    effectiveInputHash: sha256(effectiveInput),
    effectiveInputCodeUnits: effectiveInput.length,
    ...(workload.corpusFile === undefined ? {} : { corpusFile: workload.corpusFile }),
    ...(workload.maxChars === undefined ? {} : { maxChars: workload.maxChars }),
    ...(workload.repeat === undefined ? {} : { repeat: workload.repeat }),
  } satisfies BenchmarkWorkloadEvidence['source']

  return {
    rawInput,
    effectiveInput,
    sourceKind,
    workloadEvidence: {
      id: workload.id,
      scenario: workload.scenario,
      description: workload.description,
      columns: workload.columns,
      ...(workload.prepare === undefined ? {} : { prepare: workload.prepare }),
      ...(workload.pageSize === undefined ? {} : { pageSize: workload.pageSize }),
      ...(workload.pageStarts === undefined ? {} : { pageStarts: workload.pageStarts }),
      warmupIterations: config.defaults.warmupIterations,
      iterationsPerSample: iterationsFor(workload),
      sampleCount: sampleCount(workload),
      source,
    },
  }
}

async function loadRawWorkloadInput(workload: CompetitiveWorkload): Promise<string> {
  if (workload.rawText !== undefined) return decodeEscapes(workload.rawText)
  if (workload.text !== undefined) return decodeEscapes(workload.text)
  assert(workload.corpusFile !== undefined, `${workload.id} must define rawText, text, or corpusFile`)
  return readFile(path.join(root, 'corpora', workload.corpusFile), 'utf8')
}

function decodeEscapes(value: string): string {
  return value
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '\t')
    .replaceAll('\\u001b', '\u001b')
}

function referenceAdapterForWorkload(workload: CompetitiveWorkload): string {
  if (workload.scenario === 'large-page-seek') return 'pretext-virtual-hot-pages'
  if (workload.scenario === 'prepared-resize') return 'pretext-prepared-resize'
  if (workload.scenario === 'rich-sgr') return 'pretext-rich-sgr'
  return 'pretext-cold-full'
}

function iterationsFor(workload: CompetitiveWorkload): number {
  return workload.iterations ?? config.defaults.iterations
}

function sampleCount(workload: CompetitiveWorkload): number {
  return cli.samples ?? workload.samples ?? config.defaults.samples
}

function minSamplesForP95ForWorkload(workload: CompetitiveWorkload): number {
  return cli.minSamplesForP95 ?? workload.minSamplesForP95 ?? config.defaults.minSamplesForP95
}

function pageStarts(workload: CompetitiveWorkload): number[] {
  return workload.pageStarts ?? [0]
}

function pageSize(workload: CompetitiveWorkload): number {
  return workload.pageSize ?? 16
}

function firstColumn(workload: CompetitiveWorkload): number {
  const first = workload.columns[0]
  assert(first !== undefined, `${workload.id} must define at least one column width`)
  return first
}

function toEvidenceOutput(summary: RunSummary): BenchmarkEvidenceOutput {
  return {
    rows: summary.rows,
    materializedLines: summary.materializedLines,
    codeUnits: summary.codeUnits,
    hash: summary.hash,
  }
}

async function loadOptionalCompetitors(): Promise<OptionalCompetitors> {
  const result: OptionalCompetitors = {}
  const stringWidth = await loadOptionalDependency<StringWidthFn>('string-width')
  if (stringWidth !== undefined) result.stringWidth = stringWidth
  const stripAnsi = await loadOptionalDependency<StripAnsiFn>('strip-ansi')
  if (stripAnsi !== undefined) result.stripAnsi = stripAnsi
  const wrapAnsi = await loadOptionalDependency<WrapAnsiFn>('wrap-ansi')
  if (wrapAnsi !== undefined) result.wrapAnsi = wrapAnsi
  return result
}

async function loadOptionalDependency<T>(packageName: string): Promise<LoadedOptionalDependency<T> | undefined> {
  try {
    const imported = await import(packageName)
    return {
      fn: imported.default as T,
      version: await installedPackageVersion(packageName),
    }
  } catch {
    return undefined
  }
}

function parseCliOptions(args: readonly string[]): CliOptions {
  const result: CliOptions = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--report-dir') {
      result.reportDir = readCliValue(args, ++i, arg)
    } else if (arg === '--report-file') {
      result.reportFile = readCliValue(args, ++i, arg)
    } else if (arg === '--summary-file') {
      result.summaryFile = readCliValue(args, ++i, arg)
    } else if (arg === '--samples') {
      result.samples = Number(readCliValue(args, ++i, arg))
    } else if (arg === '--min-samples-for-p95') {
      result.minSamplesForP95 = Number(readCliValue(args, ++i, arg))
    } else if (arg === '--package-script') {
      result.packageScript = readCliValue(args, ++i, arg)
    } else if (arg === '--help') {
      printHelpAndExit()
    } else {
      throw new Error(`Unknown competitive benchmark option: ${String(arg)}`)
    }
  }
  if (result.samples !== undefined) assert(Number.isInteger(result.samples) && result.samples > 0, '--samples must be a positive integer')
  if (result.minSamplesForP95 !== undefined) {
    assert(Number.isInteger(result.minSamplesForP95) && result.minSamplesForP95 > 0, '--min-samples-for-p95 must be a positive integer')
  }
  return result
}

function readCliValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index]
  assert(value !== undefined && !value.startsWith('--'), `${flag} requires a value`)
  return value
}

function printHelpAndExit(): never {
  console.log([
    'Usage: bun run benchmark:competitive:tui -- [options]',
    '',
    'Options:',
    '  --report-dir <dir>              Write JSON evidence report to a generated file in dir.',
    '  --report-file <file>            Write JSON evidence report to an exact file path.',
    '  --summary-file <file>           Write Markdown summary generated from the JSON report.',
    '  --samples <count>               Override sample count for every workload.',
    '  --min-samples-for-p95 <count>   Override minimum sample count required for p95.',
    '  --package-script <name>         Override package script name in report metadata.',
  ].join('\n'))
  process.exit(0)
}

function parseCompetitiveConfig(value: unknown): CompetitiveConfig {
  const record = expectRecord(value, 'competitive benchmark config')
  const metadata = expectRecord(record['metadata'], 'competitive benchmark metadata')
  const defaults = expectRecord(record['defaults'], 'competitive benchmark defaults')
  const workloads = expectArray(record['workloads'], 'competitive benchmark workloads')
  assert(metadata['schema'] === 'pretext-tui-competitive-benchmark@1', 'unexpected competitive benchmark schema')
  expectPositiveInteger(defaults['iterations'], 'defaults.iterations')
  expectNonNegativeInteger(defaults['warmupIterations'], 'defaults.warmupIterations')
  expectPositiveInteger(defaults['samples'], 'defaults.samples')
  expectPositiveInteger(defaults['minSamplesForP95'], 'defaults.minSamplesForP95')
  assert(workloads.length > 0, 'competitive benchmark workloads must not be empty')
  const workloadIds = new Set<string>()
  for (const [index, item] of workloads.entries()) {
    const workload = expectRecord(item, `workloads[${index}]`)
    const id = expectString(workload['id'], `workloads[${index}].id`)
    assert(id.length > 0, `workloads[${index}].id must not be empty`)
    assert(!workloadIds.has(id), `workloads[${index}].id must be unique`)
    workloadIds.add(id)
    expectString(workload['description'], `workloads[${index}].description`)
    expectScenario(workload['scenario'], `workloads[${index}].scenario`)
    const columns = expectNumberArray(workload['columns'], `workloads[${index}].columns`)
    assert(columns.length > 0, `workloads[${index}].columns must not be empty`)
    for (const [columnIndex, column] of columns.entries()) {
      assert(Number.isInteger(column) && column > 0, `workloads[${index}].columns[${columnIndex}] must be a positive integer`)
    }
    if (workload['iterations'] !== undefined) expectPositiveInteger(workload['iterations'], `workloads[${index}].iterations`)
    if (workload['samples'] !== undefined) expectPositiveInteger(workload['samples'], `workloads[${index}].samples`)
    if (workload['minSamplesForP95'] !== undefined) expectPositiveInteger(workload['minSamplesForP95'], `workloads[${index}].minSamplesForP95`)
    if (workload['repeat'] !== undefined) expectPositiveInteger(workload['repeat'], `workloads[${index}].repeat`)
    if (workload['maxChars'] !== undefined) expectPositiveInteger(workload['maxChars'], `workloads[${index}].maxChars`)
    if (workload['pageSize'] !== undefined) expectPositiveInteger(workload['pageSize'], `workloads[${index}].pageSize`)
    if (workload['pageStarts'] !== undefined) {
      const pageStarts = expectNumberArray(workload['pageStarts'], `workloads[${index}].pageStarts`)
      for (const [pageStartIndex, pageStart] of pageStarts.entries()) {
        assert(Number.isInteger(pageStart) && pageStart >= 0, `workloads[${index}].pageStarts[${pageStartIndex}] must be a non-negative integer`)
      }
    }
    assert(
      typeof workload['rawText'] === 'string' ||
      typeof workload['text'] === 'string' ||
      typeof workload['corpusFile'] === 'string',
      `workloads[${index}] must define rawText, text, or corpusFile`,
    )
  }
  return {
    metadata: {
      note: expectString(metadata['note'], 'metadata.note'),
      schema: expectString(metadata['schema'], 'metadata.schema'),
    },
    defaults: defaults as CompetitiveConfig['defaults'],
    workloads: workloads as CompetitiveWorkload[],
  }
}

function parsePackageInfo(value: unknown): {
  version: string
} {
  const record = expectRecord(value, 'package.json')
  return {
    version: expectString(record['version'], 'package.version'),
  }
}

async function installedPackageVersion(packageName: string): Promise<string | null> {
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'node_modules', packageName, 'package.json'), 'utf8'))
    return expectString(expectRecord(packageJson, `${packageName} package`)['version'], `${packageName}.version`)
  } catch {
    return null
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

function expectPositiveInteger(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(Number.isInteger(number) && number > 0, `${label} must be a positive integer`)
  return number
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(Number.isInteger(number) && number >= 0, `${label} must be a non-negative integer`)
  return number
}

function expectNumberArray(value: unknown, label: string): number[] {
  const array = expectArray(value, label)
  return array.map((item, index) => expectNumber(item, `${label}[${index}]`))
}

function expectScenario(value: unknown, label: string): Scenario {
  assert(
    value === 'full-document' || value === 'large-page-seek' || value === 'prepared-resize' || value === 'rich-sgr',
    `${label} must be a known competitive scenario`,
  )
  return value
}

function splitLines(value: string): string[] {
  return value.split(/\r\n|\r|\n/)
}

function segmentGraphemes(value: string): string[] {
  const graphemes: string[] = []
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(value)) {
    graphemes.push(segment)
  }
  return graphemes
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function emptySummary(): RunSummary {
  return {
    codeUnits: 0,
    hash: stableHash(''),
    materializedLines: 0,
    rows: 0,
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
