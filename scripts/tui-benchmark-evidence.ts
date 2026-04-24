// 补建说明：该文件为后续补建，用于集中定义 TUI benchmark evidence 报告 schema、统计、hash 与 provenance helper；当前进度：Task 4 首版，服务 optional competitive benchmark evidence，不进入发布门禁。
import { readFile, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

export const BENCHMARK_EVIDENCE_SCHEMA = 'pretext-tui-benchmark-evidence@1' as const

export type BenchmarkEvidenceReport = Readonly<{
  schema: typeof BENCHMARK_EVIDENCE_SCHEMA
  reportId: string
  reportKind: 'competitive-tui'
  generatedAt: string
  caveat: string
  claimability: 'local-evidence-only'
  command: BenchmarkEvidenceCommand
  git: BenchmarkEvidenceGit
  sources: BenchmarkEvidenceSources
  runtime: BenchmarkEvidenceRuntime
  hardware: BenchmarkEvidenceHardware
  dependencies: Record<string, string | null>
  workloads: readonly BenchmarkWorkloadEvidence[]
  semanticMatrix: readonly BenchmarkSemanticMatrixEntry[]
  results: readonly BenchmarkEvidenceResult[]
}>

export type BenchmarkEvidenceCommand = Readonly<{
  argv: readonly string[]
  cwd: '<repo-root>'
  cwdRedacted: true
  packageScript?: string
}>

export type BenchmarkEvidenceGit = Readonly<{
  commit: string | null
  shortCommit: string | null
  branch: string | null
  dirty: boolean | null
  statusHash: string | null
}>

export type BenchmarkEvidenceSources = Readonly<{
  scriptHashes: Record<string, string>
  configPath: string
  configHash: string
  packageJsonHash: string
  lockfileHash: string | null
}>

export type BenchmarkEvidenceRuntime = Readonly<{
  bun: string
  node: string
  v8: string | undefined
  platform: NodeJS.Platform
  arch: string
  osType: string
  osRelease: string
}>

export type BenchmarkEvidenceHardware = Readonly<{
  cpuModel: string
  logicalCpus: number
  totalMemoryBytes: number
}>

export type BenchmarkWorkloadEvidence = Readonly<{
  id: string
  scenario: string
  description: string
  columns: readonly number[]
  prepare?: unknown
  pageSize?: number
  pageStarts?: readonly number[]
  warmupIterations: number
  iterationsPerSample: number
  sampleCount: number
  source: BenchmarkWorkloadSourceEvidence
}>

export type BenchmarkWorkloadSourceEvidence = Readonly<{
  kind: 'text' | 'rawText' | 'corpusFile'
  corpusFile?: string
  rawInputHash: string
  effectiveInputHash: string
  effectiveInputCodeUnits: number
  maxChars?: number
  repeat?: number
}>

export type BenchmarkSemanticMatrixEntry = Readonly<{
  workloadId: string
  adapter: string
  comparatorKind: 'pretext' | 'wrap-ansi' | 'string-width-greedy'
  operation: 'cold-full' | 'prepared-resize' | 'rich-sgr' | 'virtual-pages'
  features: BenchmarkSemanticFeatures
  caveats: readonly string[]
}>

export type BenchmarkSemanticFeatures = Readonly<{
  terminalWidth: 'native' | 'partial' | 'absent'
  graphemeSafety: 'native' | 'partial' | 'absent'
  tabs: 'layout-time' | 'expanded' | 'partial' | 'absent'
  whitespace: 'pre-wrap' | 'normal' | 'partial'
  sourceOffsets: 'native' | 'absent'
  richSgr: 'metadata' | 'preserved-text' | 'stripped' | 'absent'
  osc8: 'policy-checked' | 'preserved-text' | 'stripped' | 'absent'
  sanitizer: 'native' | 'dependency' | 'absent'
  rangeOnlyOutput: 'native' | 'absent'
  pageCache: 'native' | 'absent'
  appendInvalidation: 'native' | 'absent'
  prepareIncluded: boolean
  cacheState: 'cold' | 'hot' | 'not-applicable'
  outputHashComparable: boolean
}>

export type BenchmarkEvidenceResult = Readonly<{
  workloadId: string
  adapter: string
  skipped?: true
  skipReason?: string
  notes: string
  referenceAdapter?: string
  ratioDirection: 'elapsedMs / referenceElapsedMs; lower is faster'
  samples: readonly BenchmarkEvidenceSample[]
  stats: BenchmarkEvidenceStats | null
  ratios: BenchmarkEvidenceRatios | null
}>

export type BenchmarkEvidenceSample = Readonly<{
  sampleIndex: number
  iterations: number
  elapsedMs: number
  opsPerSecond: number
  output: BenchmarkEvidenceOutput
}>

export type BenchmarkEvidenceOutput = Readonly<{
  rows: number
  materializedLines: number
  codeUnits: number
  hash: string
}>

export type BenchmarkEvidenceStats = Readonly<{
  sampleCount: number
  iterationsPerSample: number
  minSamplesForP95: number
  warmupIterations: number
  minMs: number
  maxMs: number
  meanMs: number
  stdevMs: number
  coefficientOfVariation: number
  p50Ms: number
  p95Ms: number | null
  p95OmittedReason?: string
  meanOpsPerSecond: number
  p50OpsPerSecond: number
}>

export type BenchmarkEvidenceRatios = Readonly<{
  referenceAdapter: string
  meanElapsedToReference: number | null
  p50ElapsedToReference: number | null
}>

export function computeBenchmarkEvidenceStats(
  samples: readonly BenchmarkEvidenceSample[],
  options: {
    iterationsPerSample: number
    minSamplesForP95: number
    warmupIterations: number
  },
): BenchmarkEvidenceStats {
  assert(samples.length > 0, 'cannot compute benchmark stats without samples')
  const elapsed = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b)
  const ops = samples.map(sample => sample.opsPerSecond).sort((a, b) => a - b)
  const meanMs = mean(elapsed)
  const stdevMs = sampleStdev(elapsed, meanMs)
  const p95Allowed = samples.length >= options.minSamplesForP95
  const stats: BenchmarkEvidenceStats = {
    sampleCount: samples.length,
    iterationsPerSample: options.iterationsPerSample,
    minSamplesForP95: options.minSamplesForP95,
    warmupIterations: options.warmupIterations,
    minMs: round(elapsed[0] ?? 0),
    maxMs: round(elapsed.at(-1) ?? 0),
    meanMs: round(meanMs),
    stdevMs: round(stdevMs),
    coefficientOfVariation: round(meanMs === 0 ? 0 : stdevMs / meanMs),
    p50Ms: round(percentileSorted(elapsed, 0.5)),
    p95Ms: p95Allowed ? round(percentileSorted(elapsed, 0.95)) : null,
    meanOpsPerSecond: round(mean(samples.map(sample => sample.opsPerSecond))),
    p50OpsPerSecond: round(percentileSorted(ops, 0.5)),
  }
  if (!p95Allowed) {
    return {
      ...stats,
      p95OmittedReason: `sampleCount ${samples.length} is below minSamplesForP95 ${options.minSamplesForP95}`,
    }
  }
  return stats
}

export function attachBenchmarkEvidenceRatios(
  results: readonly BenchmarkEvidenceResult[],
  referenceAdapter: string,
): BenchmarkEvidenceResult[] {
  const reference = results.find(result => result.adapter === referenceAdapter && result.stats !== null)
  if (reference === undefined || reference.stats === null) {
    return results.map(result => ({
      ...result,
      referenceAdapter,
      ratios: null,
    }))
  }
  const referenceStats = reference.stats
  return results.map(result => {
    if (result.stats === null) {
      return {
        ...result,
        referenceAdapter,
        ratios: null,
      }
    }
    return {
      ...result,
      referenceAdapter,
      ratios: {
        referenceAdapter,
        meanElapsedToReference: safeRatio(result.stats.meanMs, referenceStats.meanMs),
        p50ElapsedToReference: safeRatio(result.stats.p50Ms, referenceStats.p50Ms),
      },
    }
  })
}

export function createBenchmarkReportId(kind: 'competitive-tui', generatedAt: Date, git: Pick<BenchmarkEvidenceGit, 'dirty' | 'shortCommit'>): string {
  const yyyymmdd = generatedAt.toISOString().slice(0, 10).replaceAll('-', '')
  const commit = git.shortCommit ?? 'nogit'
  const dirty = git.dirty === true ? 'dirty' : git.dirty === false ? 'clean' : 'unknown'
  const runId = sha256(`${generatedAt.toISOString()}:${kind}:${commit}:${dirty}`).slice(0, 8)
  return `${kind}-${yyyymmdd}-${commit}-${dirty}-${runId}`
}

export async function collectBenchmarkEvidenceMetadata(options: {
  configPath: string
  packageScript?: string
  root: string
  scriptPaths: readonly string[]
}): Promise<{
  command: BenchmarkEvidenceCommand
  git: BenchmarkEvidenceGit
  hardware: BenchmarkEvidenceHardware
  runtime: BenchmarkEvidenceRuntime
  sources: BenchmarkEvidenceSources
}> {
  const git = readGitState(options.root)
  const scriptHashes: Record<string, string> = {}
  for (const scriptPath of options.scriptPaths) {
    scriptHashes[toForwardSlash(scriptPath)] = await hashFileIfExists(path.join(options.root, scriptPath)) ?? ''
  }
  const command: BenchmarkEvidenceCommand = options.packageScript === undefined
    ? {
        argv: process.argv.slice(2),
        cwd: '<repo-root>',
        cwdRedacted: true,
      }
    : {
        argv: process.argv.slice(2),
        cwd: '<repo-root>',
        cwdRedacted: true,
        packageScript: options.packageScript,
      }

  return {
    command,
    git,
    hardware: {
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    runtime: {
      bun: Bun.version,
      node: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
    },
    sources: {
      scriptHashes,
      configPath: toForwardSlash(options.configPath),
      configHash: await hashFileIfExists(path.join(options.root, options.configPath)) ?? '',
      packageJsonHash: await hashFileIfExists(path.join(options.root, 'package.json')) ?? '',
      lockfileHash: await hashFileIfExists(path.join(options.root, 'bun.lock')),
    },
  }
}

export function validateBenchmarkEvidenceReport(value: unknown): BenchmarkEvidenceReport {
  const report = expectRecord(value, 'benchmark evidence report')
  assert(report['schema'] === BENCHMARK_EVIDENCE_SCHEMA, 'unexpected benchmark evidence schema')
  expectString(report['reportId'], 'report.reportId')
  assert(report['reportKind'] === 'competitive-tui', 'report.reportKind must be competitive-tui')
  expectString(report['generatedAt'], 'report.generatedAt')
  expectString(report['caveat'], 'report.caveat')
  assert(report['claimability'] === 'local-evidence-only', 'report.claimability must be local-evidence-only')
  validateCommand(report['command'])
  validateGit(report['git'])
  validateSources(report['sources'])
  validateRuntime(report['runtime'])
  validateHardware(report['hardware'])
  validateDependencies(report['dependencies'])
  const workloads = expectNonEmptyArray(report['workloads'], 'report.workloads')
  const workloadById = new Map<string, BenchmarkWorkloadEvidence>()
  const workloadIds = new Set<string>()
  for (const [index, workloadValue] of workloads.entries()) {
    const workload = validateWorkloadEvidence(workloadValue, index)
    const workloadId = workload.id
    assert(!workloadIds.has(workloadId), `report.workloads[${index}].id must be unique`)
    workloadIds.add(workloadId)
    workloadById.set(workloadId, workload)
  }
  const semanticMatrix = expectNonEmptyArray(report['semanticMatrix'], 'report.semanticMatrix')
  const semanticKeys = new Set<string>()
  for (const [index, entryValue] of semanticMatrix.entries()) {
    const entry = validateSemanticMatrixEntry(entryValue, index)
    assert(workloadIds.has(entry.workloadId), `report.semanticMatrix[${index}].workloadId must reference a workload`)
    const key = resultKey(entry.workloadId, entry.adapter)
    assert(!semanticKeys.has(key), `report.semanticMatrix[${index}] must not duplicate workload/adapter`)
    semanticKeys.add(key)
  }
  const results = expectArray(report['results'], 'report.results')
  assert(results.length > 0, 'report.results must not be empty')
  const resultKeys = new Set<string>()
  const resultsByWorkload = new Map<string, BenchmarkEvidenceResult[]>()
  for (const [index, resultValue] of results.entries()) {
    const result = expectRecord(resultValue, `report.results[${index}]`)
    const workloadId = expectString(result['workloadId'], `report.results[${index}].workloadId`)
    assert(workloadIds.has(workloadId), `report.results[${index}].workloadId must reference a workload`)
    const adapter = expectString(result['adapter'], `report.results[${index}].adapter`)
    const key = resultKey(workloadId, adapter)
    assert(!resultKeys.has(key), `report.results[${index}] must not duplicate workload/adapter`)
    assert(semanticKeys.has(key), `report.results[${index}] must have a matching semanticMatrix entry`)
    resultKeys.add(key)
    expectString(result['notes'], `report.results[${index}].notes`)
    assert(
      result['ratioDirection'] === 'elapsedMs / referenceElapsedMs; lower is faster',
      `report.results[${index}].ratioDirection must describe elapsed ratio direction`,
    )
    expectString(result['referenceAdapter'], `report.results[${index}].referenceAdapter`)
    const samples = expectArray(result['samples'], `report.results[${index}].samples`)
    if (result['skipped'] === true) {
      expectString(result['skipReason'], `report.results[${index}].skipReason`)
      assert(samples.length === 0, `report.results[${index}].samples must be empty for skipped results`)
      assert(result['stats'] === null, `report.results[${index}].stats must be null for skipped results`)
      assert(result['ratios'] === null, `report.results[${index}].ratios must be null for skipped results`)
    } else {
      assert(samples.length > 0, `report.results[${index}].samples must not be empty for measured results`)
      const validatedSamples = samples.map((sample, sampleIndex) => validateSample(sample, index, sampleIndex))
      const stats = validateStats(result['stats'], index)
      assert(stats.sampleCount === samples.length, `report.results[${index}].stats.sampleCount must match samples length`)
      const workload = workloadById.get(workloadId)
      assert(workload !== undefined, `report.results[${index}].workloadId must reference a known workload`)
      assert(stats.sampleCount === workload.sampleCount, `report.results[${index}].stats.sampleCount must match workload.sampleCount`)
      assert(stats.iterationsPerSample === workload.iterationsPerSample, `report.results[${index}].stats.iterationsPerSample must match workload.iterationsPerSample`)
      assert(stats.warmupIterations === workload.warmupIterations, `report.results[${index}].stats.warmupIterations must match workload.warmupIterations`)
      for (const [sampleIndex, sample] of validatedSamples.entries()) {
        assert(sample.iterations === stats.iterationsPerSample, `report.results[${index}].samples[${sampleIndex}].iterations must match stats.iterationsPerSample`)
      }
      const expectedStats = computeBenchmarkEvidenceStats(validatedSamples, {
        iterationsPerSample: stats.iterationsPerSample,
        minSamplesForP95: stats.minSamplesForP95,
        warmupIterations: stats.warmupIterations,
      })
      assertStatsMatch(stats, expectedStats, index)
      validateRatios(result['ratios'], index)
    }
    const validatedResult = result as unknown as BenchmarkEvidenceResult
    const bucket = resultsByWorkload.get(workloadId) ?? []
    bucket.push(validatedResult)
    resultsByWorkload.set(workloadId, bucket)
  }
  for (const semanticKey of semanticKeys) {
    assert(resultKeys.has(semanticKey), `report.semanticMatrix entry ${semanticKey.replace('\u0000', '/')} must have a matching result`)
  }
  for (const workloadId of workloadIds) {
    const workloadResults = resultsByWorkload.get(workloadId) ?? []
    assert(workloadResults.length > 0, `report.results must include workload ${workloadId}`)
    const referenceAdapters = new Set(workloadResults.map(result => result.referenceAdapter))
    assert(referenceAdapters.size === 1, `report.results for workload ${workloadId} must use one referenceAdapter`)
    const referenceAdapter = workloadResults[0]?.referenceAdapter
    assert(referenceAdapter !== undefined, `report.results for workload ${workloadId} must define referenceAdapter`)
    const reference = workloadResults.find(result => result.adapter === referenceAdapter)
    assert(reference !== undefined, `report.results for workload ${workloadId} must include reference adapter ${referenceAdapter}`)
    assert(reference.stats !== null, `report.results reference adapter ${referenceAdapter} for workload ${workloadId} must be measured`)
    for (const [index, result] of workloadResults.entries()) {
      if (result.stats === null) {
        assert(result.ratios === null, `report.results for workload ${workloadId} skipped result ${index} must not have ratios`)
      } else {
        assert(result.ratios !== null, `report.results for workload ${workloadId} measured result ${index} must have ratios`)
        assertRatiosMatch(result.ratios, referenceAdapter, result.stats, reference.stats, workloadId, result.adapter)
      }
    }
  }
  return report as unknown as BenchmarkEvidenceReport
}

function validateCommand(value: unknown): void {
  const command = expectRecord(value, 'report.command')
  expectArray(command['argv'], 'report.command.argv')
  assert(command['cwd'] === '<repo-root>', 'report.command.cwd must be redacted')
  assert(command['cwdRedacted'] === true, 'report.command.cwdRedacted must be true')
  if (command['packageScript'] !== undefined) expectString(command['packageScript'], 'report.command.packageScript')
}

function validateGit(value: unknown): void {
  const git = expectRecord(value, 'report.git')
  expectNullableString(git['commit'], 'report.git.commit')
  expectNullableString(git['shortCommit'], 'report.git.shortCommit')
  expectNullableString(git['branch'], 'report.git.branch')
  expectNullableString(git['statusHash'], 'report.git.statusHash')
  assert(git['dirty'] === true || git['dirty'] === false || git['dirty'] === null, 'report.git.dirty must be boolean or null')
}

function validateSources(value: unknown): void {
  const sources = expectRecord(value, 'report.sources')
  const scriptHashes = expectRecord(sources['scriptHashes'], 'report.sources.scriptHashes')
  assert(Object.keys(scriptHashes).length > 0, 'report.sources.scriptHashes must not be empty')
  for (const [key, item] of Object.entries(scriptHashes)) {
    assert(key.length > 0, 'report.sources.scriptHashes keys must not be empty')
    expectSha256(item, `report.sources.scriptHashes.${key}`)
  }
  expectString(sources['configPath'], 'report.sources.configPath')
  expectSha256(sources['configHash'], 'report.sources.configHash')
  expectSha256(sources['packageJsonHash'], 'report.sources.packageJsonHash')
  if (sources['lockfileHash'] !== null) expectSha256(sources['lockfileHash'], 'report.sources.lockfileHash')
}

function validateRuntime(value: unknown): void {
  const runtime = expectRecord(value, 'report.runtime')
  expectString(runtime['bun'], 'report.runtime.bun')
  expectString(runtime['node'], 'report.runtime.node')
  if (runtime['v8'] !== undefined) expectString(runtime['v8'], 'report.runtime.v8')
  expectString(runtime['platform'], 'report.runtime.platform')
  expectString(runtime['arch'], 'report.runtime.arch')
  expectString(runtime['osType'], 'report.runtime.osType')
  expectString(runtime['osRelease'], 'report.runtime.osRelease')
}

function validateHardware(value: unknown): void {
  const hardware = expectRecord(value, 'report.hardware')
  expectString(hardware['cpuModel'], 'report.hardware.cpuModel')
  expectNumber(hardware['logicalCpus'], 'report.hardware.logicalCpus')
  expectNumber(hardware['totalMemoryBytes'], 'report.hardware.totalMemoryBytes')
}

function validateDependencies(value: unknown): void {
  const dependencies = expectRecord(value, 'report.dependencies')
  assert(Object.keys(dependencies).length > 0, 'report.dependencies must not be empty')
  const requiredKeys = ['pretext-tui', 'wrap-ansi', 'string-width', 'strip-ansi']
  for (const key of requiredKeys) {
    assert(Object.hasOwn(dependencies, key), `report.dependencies.${key} must be present`)
  }
  for (const [key, item] of Object.entries(dependencies)) {
    assert(key.length > 0, 'report.dependencies keys must not be empty')
    expectNullableString(item, `report.dependencies.${key}`)
  }
}

function validateWorkloadEvidence(value: unknown, index: number): BenchmarkWorkloadEvidence {
  const workload = expectRecord(value, `report.workloads[${index}]`)
  const id = expectString(workload['id'], `report.workloads[${index}].id`)
  assert(id.length > 0, `report.workloads[${index}].id must not be empty`)
  expectString(workload['scenario'], `report.workloads[${index}].scenario`)
  expectString(workload['description'], `report.workloads[${index}].description`)
  const columns = expectNumberArray(workload['columns'], `report.workloads[${index}].columns`)
  assert(columns.length > 0, `report.workloads[${index}].columns must not be empty`)
  for (const [columnIndex, column] of columns.entries()) {
    assert(Number.isInteger(column) && column > 0, `report.workloads[${index}].columns[${columnIndex}] must be a positive integer`)
  }
  if (workload['pageSize'] !== undefined) {
    const pageSize = expectNumber(workload['pageSize'], `report.workloads[${index}].pageSize`)
    assert(Number.isInteger(pageSize) && pageSize > 0, `report.workloads[${index}].pageSize must be a positive integer`)
  }
  if (workload['pageStarts'] !== undefined) {
    const pageStarts = expectNumberArray(workload['pageStarts'], `report.workloads[${index}].pageStarts`)
    for (const [pageStartIndex, pageStart] of pageStarts.entries()) {
      assert(Number.isInteger(pageStart) && pageStart >= 0, `report.workloads[${index}].pageStarts[${pageStartIndex}] must be a non-negative integer`)
    }
  }
  const warmupIterations = expectNumber(workload['warmupIterations'], `report.workloads[${index}].warmupIterations`)
  assert(Number.isInteger(warmupIterations) && warmupIterations >= 0, `report.workloads[${index}].warmupIterations must be a non-negative integer`)
  const iterationsPerSample = expectNumber(workload['iterationsPerSample'], `report.workloads[${index}].iterationsPerSample`)
  assert(Number.isInteger(iterationsPerSample) && iterationsPerSample > 0, `report.workloads[${index}].iterationsPerSample must be a positive integer`)
  const sampleCount = expectNumber(workload['sampleCount'], `report.workloads[${index}].sampleCount`)
  assert(Number.isInteger(sampleCount) && sampleCount > 0, `report.workloads[${index}].sampleCount must be a positive integer`)
  validateWorkloadSource(workload['source'], index)
  return workload as unknown as BenchmarkWorkloadEvidence
}

function validateWorkloadSource(value: unknown, workloadIndex: number): void {
  const source = expectRecord(value, `report.workloads[${workloadIndex}].source`)
  assert(
    source['kind'] === 'text' || source['kind'] === 'rawText' || source['kind'] === 'corpusFile',
    `report.workloads[${workloadIndex}].source.kind must be text, rawText, or corpusFile`,
  )
  if (source['corpusFile'] !== undefined) expectString(source['corpusFile'], `report.workloads[${workloadIndex}].source.corpusFile`)
  expectSha256(source['rawInputHash'], `report.workloads[${workloadIndex}].source.rawInputHash`)
  expectSha256(source['effectiveInputHash'], `report.workloads[${workloadIndex}].source.effectiveInputHash`)
  const effectiveInputCodeUnits = expectNumber(source['effectiveInputCodeUnits'], `report.workloads[${workloadIndex}].source.effectiveInputCodeUnits`)
  assert(Number.isInteger(effectiveInputCodeUnits) && effectiveInputCodeUnits >= 0, `report.workloads[${workloadIndex}].source.effectiveInputCodeUnits must be a non-negative integer`)
  if (source['maxChars'] !== undefined) {
    const maxChars = expectNumber(source['maxChars'], `report.workloads[${workloadIndex}].source.maxChars`)
    assert(Number.isInteger(maxChars) && maxChars > 0, `report.workloads[${workloadIndex}].source.maxChars must be a positive integer`)
  }
  if (source['repeat'] !== undefined) {
    const repeat = expectNumber(source['repeat'], `report.workloads[${workloadIndex}].source.repeat`)
    assert(Number.isInteger(repeat) && repeat > 0, `report.workloads[${workloadIndex}].source.repeat must be a positive integer`)
  }
}

function validateSemanticMatrixEntry(value: unknown, index: number): BenchmarkSemanticMatrixEntry {
  const entry = expectRecord(value, `report.semanticMatrix[${index}]`)
  const workloadId = expectString(entry['workloadId'], `report.semanticMatrix[${index}].workloadId`)
  assert(workloadId.length > 0, `report.semanticMatrix[${index}].workloadId must not be empty`)
  expectString(entry['adapter'], `report.semanticMatrix[${index}].adapter`)
  assert(
    entry['comparatorKind'] === 'pretext' || entry['comparatorKind'] === 'wrap-ansi' || entry['comparatorKind'] === 'string-width-greedy',
    `report.semanticMatrix[${index}].comparatorKind is invalid`,
  )
  assert(
    entry['operation'] === 'cold-full' || entry['operation'] === 'prepared-resize' || entry['operation'] === 'rich-sgr' || entry['operation'] === 'virtual-pages',
    `report.semanticMatrix[${index}].operation is invalid`,
  )
  validateSemanticFeatures(entry['features'], index)
  expectStringArray(entry['caveats'], `report.semanticMatrix[${index}].caveats`)
  return entry as unknown as BenchmarkSemanticMatrixEntry
}

function validateSemanticFeatures(value: unknown, index: number): void {
  const features = expectRecord(value, `report.semanticMatrix[${index}].features`)
  expectOneOf(features['terminalWidth'], ['native', 'partial', 'absent'], `report.semanticMatrix[${index}].features.terminalWidth`)
  expectOneOf(features['graphemeSafety'], ['native', 'partial', 'absent'], `report.semanticMatrix[${index}].features.graphemeSafety`)
  expectOneOf(features['tabs'], ['layout-time', 'expanded', 'partial', 'absent'], `report.semanticMatrix[${index}].features.tabs`)
  expectOneOf(features['whitespace'], ['pre-wrap', 'normal', 'partial'], `report.semanticMatrix[${index}].features.whitespace`)
  expectOneOf(features['sourceOffsets'], ['native', 'absent'], `report.semanticMatrix[${index}].features.sourceOffsets`)
  expectOneOf(features['richSgr'], ['metadata', 'preserved-text', 'stripped', 'absent'], `report.semanticMatrix[${index}].features.richSgr`)
  expectOneOf(features['osc8'], ['policy-checked', 'preserved-text', 'stripped', 'absent'], `report.semanticMatrix[${index}].features.osc8`)
  expectOneOf(features['sanitizer'], ['native', 'dependency', 'absent'], `report.semanticMatrix[${index}].features.sanitizer`)
  expectOneOf(features['rangeOnlyOutput'], ['native', 'absent'], `report.semanticMatrix[${index}].features.rangeOnlyOutput`)
  expectOneOf(features['pageCache'], ['native', 'absent'], `report.semanticMatrix[${index}].features.pageCache`)
  expectOneOf(features['appendInvalidation'], ['native', 'absent'], `report.semanticMatrix[${index}].features.appendInvalidation`)
  expectBoolean(features['prepareIncluded'], `report.semanticMatrix[${index}].features.prepareIncluded`)
  expectOneOf(features['cacheState'], ['cold', 'hot', 'not-applicable'], `report.semanticMatrix[${index}].features.cacheState`)
  expectBoolean(features['outputHashComparable'], `report.semanticMatrix[${index}].features.outputHashComparable`)
}

function validateSample(value: unknown, resultIndex: number, sampleIndex: number): BenchmarkEvidenceSample {
  const sample = expectRecord(value, `report.results[${resultIndex}].samples[${sampleIndex}]`)
  const reportedSampleIndex = expectNumber(sample['sampleIndex'], `report.results[${resultIndex}].samples[${sampleIndex}].sampleIndex`)
  assert(reportedSampleIndex === sampleIndex, `report.results[${resultIndex}].samples[${sampleIndex}].sampleIndex must match its array index`)
  const iterations = expectNumber(sample['iterations'], `report.results[${resultIndex}].samples[${sampleIndex}].iterations`)
  assert(Number.isInteger(iterations) && iterations > 0, `report.results[${resultIndex}].samples[${sampleIndex}].iterations must be a positive integer`)
  const elapsedMs = expectNumber(sample['elapsedMs'], `report.results[${resultIndex}].samples[${sampleIndex}].elapsedMs`)
  assert(elapsedMs >= 0, `report.results[${resultIndex}].samples[${sampleIndex}].elapsedMs must be non-negative`)
  const opsPerSecond = expectNumber(sample['opsPerSecond'], `report.results[${resultIndex}].samples[${sampleIndex}].opsPerSecond`)
  assert(opsPerSecond > 0, `report.results[${resultIndex}].samples[${sampleIndex}].opsPerSecond must be positive`)
  const output = expectRecord(sample['output'], `report.results[${resultIndex}].samples[${sampleIndex}].output`)
  expectNonNegativeInteger(output['rows'], `report.results[${resultIndex}].samples[${sampleIndex}].output.rows`)
  expectNonNegativeInteger(output['materializedLines'], `report.results[${resultIndex}].samples[${sampleIndex}].output.materializedLines`)
  expectNonNegativeInteger(output['codeUnits'], `report.results[${resultIndex}].samples[${sampleIndex}].output.codeUnits`)
  expectStableHash(output['hash'], `report.results[${resultIndex}].samples[${sampleIndex}].output.hash`)
  return sample as unknown as BenchmarkEvidenceSample
}

function validateStats(value: unknown, resultIndex: number): BenchmarkEvidenceStats {
  const stats = expectRecord(value, `report.results[${resultIndex}].stats`)
  const sampleCount = expectNumber(stats['sampleCount'], `report.results[${resultIndex}].stats.sampleCount`)
  assert(Number.isInteger(sampleCount) && sampleCount > 0, `report.results[${resultIndex}].stats.sampleCount must be a positive integer`)
  const iterationsPerSample = expectNumber(stats['iterationsPerSample'], `report.results[${resultIndex}].stats.iterationsPerSample`)
  assert(Number.isInteger(iterationsPerSample) && iterationsPerSample > 0, `report.results[${resultIndex}].stats.iterationsPerSample must be a positive integer`)
  const minSamplesForP95 = expectNumber(stats['minSamplesForP95'], `report.results[${resultIndex}].stats.minSamplesForP95`)
  assert(Number.isInteger(minSamplesForP95) && minSamplesForP95 > 0, `report.results[${resultIndex}].stats.minSamplesForP95 must be a positive integer`)
  const warmupIterations = expectNumber(stats['warmupIterations'], `report.results[${resultIndex}].stats.warmupIterations`)
  assert(Number.isInteger(warmupIterations) && warmupIterations >= 0, `report.results[${resultIndex}].stats.warmupIterations must be a non-negative integer`)
  const minMs = expectNumber(stats['minMs'], `report.results[${resultIndex}].stats.minMs`)
  const maxMs = expectNumber(stats['maxMs'], `report.results[${resultIndex}].stats.maxMs`)
  const meanMs = expectNumber(stats['meanMs'], `report.results[${resultIndex}].stats.meanMs`)
  const stdevMs = expectNumber(stats['stdevMs'], `report.results[${resultIndex}].stats.stdevMs`)
  const coefficientOfVariation = expectNumber(stats['coefficientOfVariation'], `report.results[${resultIndex}].stats.coefficientOfVariation`)
  const p50Ms = expectNumber(stats['p50Ms'], `report.results[${resultIndex}].stats.p50Ms`)
  assert(minMs >= 0 && maxMs >= minMs && meanMs >= 0 && stdevMs >= 0 && coefficientOfVariation >= 0 && p50Ms >= 0, `report.results[${resultIndex}].stats timing fields must be non-negative and ordered`)
  if (stats['p95Ms'] === null) {
    expectString(stats['p95OmittedReason'], `report.results[${resultIndex}].stats.p95OmittedReason`)
    assert(sampleCount < minSamplesForP95, `report.results[${resultIndex}].stats.p95Ms may be null only when sampleCount is below minSamplesForP95`)
  } else {
    const p95Ms = expectNumber(stats['p95Ms'], `report.results[${resultIndex}].stats.p95Ms`)
    assert(p95Ms >= 0, `report.results[${resultIndex}].stats.p95Ms must be non-negative`)
    assert(sampleCount >= minSamplesForP95, `report.results[${resultIndex}].stats.p95Ms requires sampleCount at or above minSamplesForP95`)
    assert(stats['p95OmittedReason'] === undefined, `report.results[${resultIndex}].stats.p95OmittedReason must be omitted when p95Ms is present`)
  }
  if (stats['p95OmittedReason'] !== undefined) expectString(stats['p95OmittedReason'], `report.results[${resultIndex}].stats.p95OmittedReason`)
  const meanOpsPerSecond = expectNumber(stats['meanOpsPerSecond'], `report.results[${resultIndex}].stats.meanOpsPerSecond`)
  const p50OpsPerSecond = expectNumber(stats['p50OpsPerSecond'], `report.results[${resultIndex}].stats.p50OpsPerSecond`)
  assert(meanOpsPerSecond > 0 && p50OpsPerSecond > 0, `report.results[${resultIndex}].stats ops fields must be positive`)
  return stats as unknown as BenchmarkEvidenceStats
}

function validateRatios(value: unknown, resultIndex: number): BenchmarkEvidenceRatios {
  const ratios = expectRecord(value, `report.results[${resultIndex}].ratios`)
  expectString(ratios['referenceAdapter'], `report.results[${resultIndex}].ratios.referenceAdapter`)
  if (ratios['meanElapsedToReference'] !== null) {
    const mean = expectNumber(ratios['meanElapsedToReference'], `report.results[${resultIndex}].ratios.meanElapsedToReference`)
    assert(mean >= 0, `report.results[${resultIndex}].ratios.meanElapsedToReference must be non-negative`)
  }
  if (ratios['p50ElapsedToReference'] !== null) {
    const p50 = expectNumber(ratios['p50ElapsedToReference'], `report.results[${resultIndex}].ratios.p50ElapsedToReference`)
    assert(p50 >= 0, `report.results[${resultIndex}].ratios.p50ElapsedToReference must be non-negative`)
  }
  return ratios as unknown as BenchmarkEvidenceRatios
}

function resultKey(workloadId: string, adapter: string): string {
  return `${workloadId}\u0000${adapter}`
}

function assertStatsMatch(actual: BenchmarkEvidenceStats, expected: BenchmarkEvidenceStats, resultIndex: number): void {
  const keys: Array<keyof BenchmarkEvidenceStats> = [
    'sampleCount',
    'iterationsPerSample',
    'minSamplesForP95',
    'warmupIterations',
    'minMs',
    'maxMs',
    'meanMs',
    'stdevMs',
    'coefficientOfVariation',
    'p50Ms',
    'p95Ms',
    'p95OmittedReason',
    'meanOpsPerSecond',
    'p50OpsPerSecond',
  ]
  for (const key of keys) {
    assert(
      actual[key] === expected[key],
      `report.results[${resultIndex}].stats.${String(key)} must match recomputed sample statistics`,
    )
  }
}

function assertRatiosMatch(
  actual: BenchmarkEvidenceRatios,
  referenceAdapter: string,
  stats: BenchmarkEvidenceStats,
  referenceStats: BenchmarkEvidenceStats,
  workloadId: string,
  adapter: string,
): void {
  assert(actual.referenceAdapter === referenceAdapter, `report.results ${workloadId}/${adapter} ratios.referenceAdapter must match workload referenceAdapter`)
  assert(
    actual.meanElapsedToReference === safeRatio(stats.meanMs, referenceStats.meanMs),
    `report.results ${workloadId}/${adapter} ratios.meanElapsedToReference must match recomputed statistics`,
  )
  assert(
    actual.p50ElapsedToReference === safeRatio(stats.p50Ms, referenceStats.p50Ms),
    `report.results ${workloadId}/${adapter} ratios.p50ElapsedToReference must match recomputed statistics`,
  )
}

export async function readBenchmarkEvidenceReport(filePath: string): Promise<BenchmarkEvidenceReport> {
  return validateBenchmarkEvidenceReport(JSON.parse(await readFile(filePath, 'utf8')))
}

export async function writeBenchmarkEvidenceReport(filePath: string, report: BenchmarkEvidenceReport): Promise<void> {
  await writeFile(filePath, JSON.stringify(validateBenchmarkEvidenceReport(report), null, 2) + '\n')
}

export function renderBenchmarkEvidenceSummaryMarkdown(report: BenchmarkEvidenceReport): string {
  validateBenchmarkEvidenceReport(report)
  const adaptersByWorkload = new Map<string, string[]>()
  for (const result of report.results) {
    const adapters = adaptersByWorkload.get(result.workloadId) ?? []
    adapters.push(result.skipped ? `${result.adapter} (skipped)` : result.adapter)
    adaptersByWorkload.set(result.workloadId, adapters)
  }

  const lines = [
    '<!-- 补建说明：该文件可由 benchmark evidence JSON 后续生成，用于给人工阅读者定位原始报告；当前进度：Task 4 summary renderer 生成，不复制动态性能数字，JSON 报告仍是唯一数值真相源。 -->',
    `# Benchmark Evidence Summary: ${report.reportId}`,
    '',
    `Schema: \`${report.schema}\``,
    '',
    `Claimability: \`${report.claimability}\``,
    '',
    `Git dirty: \`${String(report.git.dirty)}\``,
    '',
    report.caveat,
    '',
    'Timing numbers, ratios, and raw samples live in the JSON report. This Markdown summary intentionally avoids copying dynamic benchmark numbers.',
    '',
    '## Workloads',
    '',
  ]

  for (const workload of report.workloads) {
    lines.push(`- \`${workload.id}\`: ${workload.description}`)
    lines.push(`  Adapters: ${(adaptersByWorkload.get(workload.id) ?? []).map(adapter => `\`${adapter}\``).join(', ')}`)
  }

  lines.push('', '## Semantic Caveats', '')
  for (const entry of report.semanticMatrix) {
    if (entry.caveats.length === 0) continue
    lines.push(`- \`${entry.workloadId}\` / \`${entry.adapter}\`: ${entry.caveats.join(' ')}`)
  }

  lines.push('', 'Use this summary to find the report. Use the JSON report for any concrete benchmark claim.', '')
  return lines.join('\n')
}

export function sha256(value: string | Uint8Array): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export async function hashFileIfExists(filePath: string): Promise<string | null> {
  try {
    return sha256(await readFile(filePath))
  } catch {
    return null
  }
}

export function round(value: number): number {
  return Number(value.toFixed(2))
}

function readGitState(root: string): BenchmarkEvidenceGit {
  const commit = runGit(root, ['rev-parse', 'HEAD'])
  const shortCommit = runGit(root, ['rev-parse', '--short', 'HEAD'])
  const branch = runGit(root, ['branch', '--show-current'])
  const status = runGit(root, ['status', '--porcelain'], { keepEmpty: true })
  return {
    commit,
    shortCommit,
    branch,
    dirty: status === null ? null : status.length > 0,
    statusHash: status === null ? null : sha256(status),
  }
}

function runGit(root: string, args: string[], options: { keepEmpty?: boolean } = {}): string | null {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: root,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (result.exitCode !== 0) return null
  const output = new TextDecoder().decode(result.stdout).trim()
  if (options.keepEmpty === true) return output
  return output.length === 0 ? null : output
}

function percentileSorted(values: readonly number[], percentile: number): number {
  assert(values.length > 0, 'cannot compute percentile for empty values')
  if (values.length === 1) return values[0]!
  const index = (values.length - 1) * percentile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return (values[lower] ?? 0) * (1 - weight) + (values[upper] ?? 0) * weight
}

function mean(values: readonly number[]): number {
  assert(values.length > 0, 'cannot compute mean for empty values')
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleStdev(values: readonly number[], meanValue: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function safeRatio(value: number, reference: number): number | null {
  if (reference === 0) return null
  return round(value / reference)
}

function toForwardSlash(value: string): string {
  return value.replaceAll(path.sep, '/')
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

function expectArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`)
  return value
}

function expectNonEmptyArray(value: unknown, label: string): unknown[] {
  const array = expectArray(value, label)
  assert(array.length > 0, `${label} must not be empty`)
  return array
}

function expectString(value: unknown, label: string): string {
  assert(typeof value === 'string', `${label} must be a string`)
  return value
}

function expectStringArray(value: unknown, label: string): string[] {
  const array = expectArray(value, label)
  return array.map((item, index) => expectString(item, `${label}[${index}]`))
}

function expectNullableString(value: unknown, label: string): string | null {
  assert(value === null || typeof value === 'string', `${label} must be a string or null`)
  return value
}

function expectNumber(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a finite number`)
  return value
}

function expectNumberArray(value: unknown, label: string): number[] {
  const array = expectArray(value, label)
  return array.map((item, index) => expectNumber(item, `${label}[${index}]`))
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  const number = expectNumber(value, label)
  assert(Number.isInteger(number) && number >= 0, `${label} must be a non-negative integer`)
  return number
}

function expectBoolean(value: unknown, label: string): boolean {
  assert(typeof value === 'boolean', `${label} must be a boolean`)
  return value
}

function expectSha256(value: unknown, label: string): string {
  const text = expectString(value, label)
  assert(/^[a-f0-9]{64}$/i.test(text), `${label} must be a sha256 hex digest`)
  return text
}

function expectStableHash(value: unknown, label: string): string {
  const text = expectString(value, label)
  assert(/^[a-f0-9]{8}$/i.test(text), `${label} must be an 8-character stable hash`)
  return text
}

function expectOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  assert(typeof value === 'string' && (allowed as readonly string[]).includes(value), `${label} must be one of ${allowed.join(', ')}`)
  return value as T
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
