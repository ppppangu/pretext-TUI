// 补建说明：该文件为后续补建，用于验证 TUI benchmark JSON schema、counter registry 与模式组合守门；当前进度：Phase 7 recovery 首版覆盖 unknown fields、counter names 与 invalid mode combinations。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  benchmarkKnownCounterNames,
  counter,
  parseBenchmarkConfig,
} from '../../scripts/tui-benchmark-check.js'

const repoRoot = path.resolve(import.meta.dir, '../..')
const staleCounterNames = [
  'richBoundaryGraphemeSegmentations',
  'richFragmentGraphemeSegmentations',
  'terminalMaterializeGraphemeSegmentations',
]
const requiredWorkloadCounterAssertions: Record<string, readonly string[]> = {
  'source-search-session': [
    'terminalSearchMatches',
    'terminalSearchProjectionRequests',
    'terminalSearchReturnedMatches',
    'terminalSearchScannedCodeUnits',
    'terminalSearchScopeChecks',
    'terminalSearchScopes',
    'terminalSearchSessions',
    'terminalSearchSourceMaterializations',
    'terminalSearchStoredMatches',
    'terminalSearchStoredMatchCodeUnits',
  ],
  'selection-extraction': [
    'terminalSelectionCoordinateRequests',
    'terminalSelectionExtractionRequests',
    'terminalSelectionProjectionFragments',
    'terminalSelectionRangeIndexLookups',
    'terminalSelectionSourceCodeUnits',
    'terminalSelectionVisibleCodeUnits',
  ],
}

describe('tui benchmark config validation', () => {
  test('actual benchmarks/tui.json parses through the importable validator', async () => {
    const raw = await readFile(path.join(repoRoot, 'benchmarks/tui.json'), 'utf8')
    const parsed = parseBenchmarkConfig(JSON.parse(raw))

    expect(parsed.metadata.schema).toBe('pretext-tui-benchmark@1')
    expect(parsed.workloads.length).toBeGreaterThan(0)
  })

  test('actual benchmark workloads keep Phase 9 evidence-critical coverage explicit', async () => {
    const raw = await readFile(path.join(repoRoot, 'benchmarks/tui.json'), 'utf8')
    const parsed = parseBenchmarkConfig(JSON.parse(raw))
    const ids = parsed.workloads.map(workload => workload.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const required of [
      'source-search-session',
      'selection-extraction',
      'rich-sparse-first-line-indexes',
      'chunked-append-1000-small-virtual',
      'chunked-append-1000-small-layout-bundle',
    ]) {
      expect(ids).toContain(required)
    }

    for (const workload of parsed.workloads.filter(item => item.appendSequence !== undefined)) {
      expect(workload.counterAssertions?.appendFullReprepareFallbacks?.exact).toBe(0)
      expect(workload.counterAssertions?.appendFullReprepareCodeUnits?.exact).toBe(0)
      expect(workload.counterAssertions?.appendMaxAnalyzedCodeUnitsPerCall?.max).toBeGreaterThan(0)
      expect(workload.counterAssertions?.appendOpenTailCodeUnits?.max).toBeGreaterThan(0)
    }
    for (const [id, counters] of Object.entries(requiredWorkloadCounterAssertions)) {
      const workload = parsed.workloads.find(item => item.id === id)
      expect(workload).toBeDefined()
      for (const counterName of counters) {
        expect(workload?.counterAssertions).toHaveProperty(counterName)
      }
    }
  })

  test('unknown counters fail at config parse time and lookup time', () => {
    expect(() => parseBenchmarkConfig(configWithWorkload({
      counterAssertions: {
        notARealCounter: { exact: 0 },
      },
    }))).toThrow('not a known counter')
    expect(() => counter({}, 'notARealCounter')).toThrow('unknown benchmark counter')
  })

  test('unknown root, workload, and nested fields fail closed', () => {
    expect(() => parseBenchmarkConfig({
      ...validConfig(),
      extraRoot: true,
    })).toThrow('extraRoot')
    expect(() => parseBenchmarkConfig(configWithWorkload({ extraWorkload: true }))).toThrow('extraWorkload')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      layout: { columns: 12, surprise: true },
    }))).toThrow('surprise')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      prepare: { whiteSpace: 'pre-wrap', widthProfile: { unknownWidth: true } },
    }))).toThrow('unknownWidth')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      counterAssertions: { prepareCalls: { exact: 1, around: 1 } },
    }))).toThrow('around')
  })

  test('invalid mode flags and combinations fail schema validation', () => {
    expect(() => parseBenchmarkConfig(configWithWorkload({ rich: false }))).toThrow('literal true')
    expect(() => parseBenchmarkConfig(configWithWorkload({ virtual: false }))).toThrow('literal true')
    expect(() => parseBenchmarkConfig(configWithWorkload({ layoutBundle: false }))).toThrow('literal true')
    expect(() => parseBenchmarkConfig(configWithWorkload({ firstLineOnly: false }))).toThrow('literal true')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      rich: true,
      search: { query: 'x' },
    }))).toThrow('mutually exclusive')
    expect(() => parseBenchmarkConfig(configWithWorkload({ layoutBundle: true }))).toThrow('requires virtual')
    expect(() => parseBenchmarkConfig(configWithWorkload({ appendText: 'tail' }))).toThrow('requires virtual')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      virtual: true,
      appendSequence: { count: 2, parts: ['x'], parityCheckpoints: [] },
    }))).toThrow('parityCheckpoints must not be empty')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      virtual: true,
      appendSequence: { count: 2, parts: ['x'], parityCheckpoints: [3] },
    }))).toThrow('must be <= count')
    expect(() => parseBenchmarkConfig(configWithWorkload({ virtual: true, firstLineOnly: true }))).toThrow('firstLineOnly')
    expect(() => parseBenchmarkConfig(configWithWorkload({ maxChars: 10 }))).toThrow('requires corpusFile')
    expect(() => parseBenchmarkConfig(configWithWorkload({ corpusFile: 'mixed-app-text.txt', text: 'x' }))).toThrow(
      'exactly one input source',
    )
  })

  test('layout, prepare, search, selection, and assertion values are type and range checked', () => {
    expect(() => parseBenchmarkConfig(configWithWorkload({ layout: { columns: 0 } }))).toThrow('positive integer')
    expect(() => parseBenchmarkConfig(configWithWorkload({ prepare: { tabSize: 0 } }))).toThrow('positive integer')
    expect(parseBenchmarkConfig(configWithWorkload({ prepare: { wordBreak: 'keep-all' } })).workloads[0]?.prepare).toEqual({
      wordBreak: 'keep-all',
    })
    expect(() => parseBenchmarkConfig(configWithWorkload({ prepare: { wordBreak: 'break-all' } }))).toThrow('wordBreak')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      search: { query: 'x', limit: -1 },
    }))).toThrow('non-negative integer')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      selection: {
        anchor: { row: 0, column: 0 },
        focus: { row: -1, column: 0 },
        sourceStart: 0,
        sourceEnd: 1,
      },
    }))).toThrow('non-negative integer')
    expect(() => parseBenchmarkConfig(configWithWorkload({
      counterAssertions: { prepareCalls: { exact: -1 } },
    }))).toThrow('non-negative integer')
  })

  test('stale never-recorded counter names are absent from the known benchmark registry', () => {
    for (const name of staleCounterNames) {
      expect(benchmarkKnownCounterNames).not.toContain(name)
    }
  })
})

function validConfig(): {
  metadata: Record<string, unknown>
  defaults: Record<string, unknown>
  workloads: Record<string, unknown>[]
} {
  return {
    metadata: { schema: 'pretext-tui-benchmark@1' },
    defaults: { iterations: 1, maxMilliseconds: 1000 },
    workloads: [
      {
        id: 'minimal',
        text: 'hello',
        layout: { columns: 12 },
      },
    ],
  }
}

function configWithWorkload(overrides: Record<string, unknown>) {
  const config = validConfig()
  config.workloads[0] = {
    ...config.workloads[0],
    ...overrides,
  }
  return config
}
