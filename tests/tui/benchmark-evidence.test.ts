// 补建说明：该文件为后续补建，用于验证 Task 4 benchmark evidence schema、统计与 summary guardrails；当前进度：首版覆盖 p95 omission、ratio direction、schema validation 和 Markdown 不复制动态数字。
import { describe, expect, test } from 'bun:test'
import {
  BENCHMARK_EVIDENCE_SCHEMA,
  attachBenchmarkEvidenceRatios,
  computeBenchmarkEvidenceStats,
  renderBenchmarkEvidenceSummaryMarkdown,
  validateBenchmarkEvidenceReport,
  type BenchmarkEvidenceReport,
  type BenchmarkEvidenceResult,
  type BenchmarkEvidenceSample,
} from '../../scripts/tui-benchmark-evidence.js'

function sample(index: number, elapsedMs: number): BenchmarkEvidenceSample {
  return {
    sampleIndex: index,
    iterations: 10,
    elapsedMs,
    opsPerSecond: 10_000 / elapsedMs,
    output: {
      rows: 1,
      materializedLines: 1,
      codeUnits: 1,
      hash: String(index).padStart(8, '0'),
    },
  }
}

describe('benchmark evidence helpers', () => {
  test('omits p95 when sample count is below the configured evidence threshold', () => {
    const stats = computeBenchmarkEvidenceStats([sample(0, 10), sample(1, 20)], {
      iterationsPerSample: 10,
      minSamplesForP95: 5,
      warmupIterations: 1,
    })

    expect(stats.sampleCount).toBe(2)
    expect(stats.p50Ms).toBe(15)
    expect(stats.p95Ms).toBeNull()
    expect(stats.p95OmittedReason).toContain('below minSamplesForP95')
  })

  test('computes p95 and elapsed ratios from sample stats when enough samples exist', () => {
    const stats = computeBenchmarkEvidenceStats(
      [sample(0, 10), sample(1, 20), sample(2, 30), sample(3, 40), sample(4, 50)],
      { iterationsPerSample: 10, minSamplesForP95: 5, warmupIterations: 2 },
    )

    expect(stats.p50Ms).toBe(30)
    expect(stats.p95Ms).toBe(48)

    const reference = result('reference', 10, 20, 30, 40, 50)
    const slower = result('slower', 20, 40, 60, 80, 100)
    const withRatios = attachBenchmarkEvidenceRatios([reference, slower], 'reference')

    expect(withRatios[1]?.ratios?.referenceAdapter).toBe('reference')
    expect(withRatios[1]?.ratios?.meanElapsedToReference).toBe(2)
    expect(withRatios[1]?.ratioDirection).toBe('elapsedMs / referenceElapsedMs; lower is faster')
  })

  test('validates report shape and renders Markdown summary without dynamic benchmark numbers', () => {
    const report = minimalReport()
    expect(validateBenchmarkEvidenceReport(report).schema).toBe(BENCHMARK_EVIDENCE_SCHEMA)

    const markdown = renderBenchmarkEvidenceSummaryMarkdown(report)
    expect(markdown).toContain(report.reportId)
    expect(markdown).toContain('Timing numbers, ratios, and raw samples live in the JSON report')
    expect(markdown).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|ops\/sec|ops\/s)\b/i)
    expect(markdown).not.toMatch(/\b(?:p50|p95|mean|stdev|min|max)\s*[:=]\s*\d/i)
  })

  test('rejects evidence reports that omit provenance or semantic feature details', () => {
    expect(() => validateBenchmarkEvidenceReport({
      schema: BENCHMARK_EVIDENCE_SCHEMA,
      reportId: 'competitive-tui-20260424-abcdef1-clean-test0000',
      reportKind: 'competitive-tui',
      claimability: 'local-evidence-only',
      workloads: [],
      semanticMatrix: [],
      results: [],
    })).toThrow('report.generatedAt')

    const report = minimalReport()
    const badSemantic = {
      ...report,
      semanticMatrix: [
        {
          ...report.semanticMatrix[0],
          features: {
            ...report.semanticMatrix[0]!.features,
            osc8: 'magic',
          },
        },
      ],
    }
    expect(() => validateBenchmarkEvidenceReport(badSemantic)).toThrow('features.osc8')
  })

  test('rejects measured results that have not been ratio-annotated', () => {
    const [annotated] = minimalReport().results
    expect(annotated?.ratios).not.toBeNull()

    const report = {
      ...minimalReport(),
      results: [
        {
          ...annotated!,
          ratios: null,
        },
      ],
    }
    expect(() => validateBenchmarkEvidenceReport(report)).toThrow('ratios')
  })

  test('rejects hand-edited stats, ratios, and missing semantic entries', () => {
    const report = minimalReport()
    const [result] = report.results
    expect(result?.stats?.minSamplesForP95).toBe(5)

    const badStats = {
      ...report,
      results: [
        {
          ...result!,
          stats: {
            ...result!.stats!,
            meanMs: 999,
          },
        },
      ],
    }
    expect(() => validateBenchmarkEvidenceReport(badStats)).toThrow('stats.meanMs')

    const badRatios = {
      ...report,
      results: [
        {
          ...result!,
          ratios: {
            ...result!.ratios!,
            meanElapsedToReference: 2,
          },
        },
      ],
    }
    expect(() => validateBenchmarkEvidenceReport(badRatios)).toThrow('ratios.meanElapsedToReference')

    const missingSemantic = {
      ...report,
      semanticMatrix: [],
    }
    expect(() => validateBenchmarkEvidenceReport(missingSemantic)).toThrow('semanticMatrix')
  })

  test('requires semantic/result parity and comparator dependency provenance keys', () => {
    const report = minimalReport()
    const orphanSemantic = {
      ...report,
      semanticMatrix: [
        ...report.semanticMatrix,
        {
          ...report.semanticMatrix[0]!,
          adapter: 'orphan',
        },
      ],
    }
    expect(() => validateBenchmarkEvidenceReport(orphanSemantic)).toThrow('matching result')

    const missingComparatorDependency = {
      ...report,
      dependencies: { 'pretext-tui': '0.0.0' },
    }
    expect(() => validateBenchmarkEvidenceReport(missingComparatorDependency)).toThrow('wrap-ansi')
  })
})

function result(adapter: string, ...elapsed: number[]): BenchmarkEvidenceResult {
  const samples = elapsed.map((value, index) => sample(index, value))
  return {
    workloadId: 'workload',
    adapter,
    notes: 'test result',
    ratioDirection: 'elapsedMs / referenceElapsedMs; lower is faster',
    samples,
    stats: computeBenchmarkEvidenceStats(samples, {
      iterationsPerSample: 10,
      minSamplesForP95: 5,
      warmupIterations: 1,
    }),
    ratios: null,
  }
}

function minimalReport(): BenchmarkEvidenceReport {
  return {
    schema: BENCHMARK_EVIDENCE_SCHEMA,
    reportId: 'competitive-tui-20260424-abcdef1-clean-test0000',
    reportKind: 'competitive-tui',
    generatedAt: '2026-04-24T00:00:00.000Z',
    caveat: 'Local text-layout evidence only.',
    claimability: 'local-evidence-only',
    command: {
      argv: [],
      cwd: '<repo-root>',
      cwdRedacted: true,
      packageScript: 'benchmark:competitive:tui',
    },
    git: {
      commit: 'abcdef123456',
      shortCommit: 'abcdef1',
      branch: 'main',
      dirty: false,
      statusHash: null,
    },
    sources: {
      scriptHashes: { 'scripts/competitive-tui-benchmark.ts': hash64('a') },
      configPath: 'benchmarks/competitive-tui.json',
      configHash: hash64('b'),
      packageJsonHash: hash64('c'),
      lockfileHash: hash64('d'),
    },
    runtime: {
      bun: '1.0.0',
      node: '22.0.0',
      v8: '1',
      platform: 'win32',
      arch: 'x64',
      osType: 'Windows_NT',
      osRelease: '10',
    },
    hardware: {
      cpuModel: 'test cpu',
      logicalCpus: 1,
      totalMemoryBytes: 1024,
    },
    dependencies: {
      'pretext-tui': '0.0.0',
      'string-width': null,
      'strip-ansi': null,
      'wrap-ansi': null,
    },
    workloads: [
      {
        id: 'workload',
        scenario: 'full-document',
        description: 'Test workload.',
        columns: [80],
        warmupIterations: 1,
        iterationsPerSample: 10,
        sampleCount: 5,
        source: {
          kind: 'text',
          rawInputHash: hash64('e'),
          effectiveInputHash: hash64('f'),
          effectiveInputCodeUnits: 4,
        },
      },
    ],
    semanticMatrix: [
      {
        workloadId: 'workload',
        adapter: 'reference',
        comparatorKind: 'pretext',
        operation: 'cold-full',
        features: {
          terminalWidth: 'native',
          graphemeSafety: 'native',
          tabs: 'layout-time',
          whitespace: 'pre-wrap',
          sourceOffsets: 'native',
          richSgr: 'absent',
          osc8: 'absent',
          sanitizer: 'absent',
          rangeOnlyOutput: 'native',
          pageCache: 'absent',
          appendInvalidation: 'absent',
          prepareIncluded: true,
          cacheState: 'not-applicable',
          outputHashComparable: true,
        },
        caveats: ['Test caveat.'],
      },
    ],
    results: attachBenchmarkEvidenceRatios([result('reference', 10, 20, 30, 40, 50)], 'reference'),
  }
}

function hash64(char: string): string {
  return char.repeat(64)
}
