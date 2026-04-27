// 补建说明：该文件为后续补建，用于验证 Phase 9 memory budget gate 的配置校验和模型化估算；当前进度：首版覆盖实际配置、fail-closed schema 与核心结构预算。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  parseMemoryBudgetConfig,
  runTuiMemoryBudgetCheck,
} from '../../scripts/tui-memory-budget-check.js'

const repoRoot = path.resolve(import.meta.dir, '../..')

describe('tui memory budget gate', () => {
  test('actual benchmarks/tui-memory-budgets.json parses and passes the modelled budget check', async () => {
    const raw = await readFile(path.join(repoRoot, 'benchmarks/tui-memory-budgets.json'), 'utf8')
    const parsed = parseMemoryBudgetConfig(JSON.parse(raw))
    expect(parsed.metadata.schema).toBe('pretext-tui-memory-budgets@1')
    expect(parsed.workloads.map(workload => workload.id)).toEqual([
      'layout-bundle-memory',
      'source-search-session-memory',
      'selection-extraction-memory',
      'generic-range-index-memory',
      'rich-inline-memory',
      'chunked-append-1000-small-memory',
      'chunked-append-long-unbroken-memory',
    ])

    const results = await runTuiMemoryBudgetCheck({ root: repoRoot })
    expect(results).toHaveLength(parsed.workloads.length)
    expect(results.every(result => result.estimates.length > 0)).toBe(true)
  })

  test('unknown fields, wrong budget categories, and missing budget modes fail closed', () => {
    expect(() => parseMemoryBudgetConfig({
      ...validConfig(),
      extraRoot: true,
    })).toThrow('extraRoot')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({ extraWorkload: true }))).toThrow('extraWorkload')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      budgets: [{ category: 'not-real', maxEstimatedBytes: 1 }],
    }))).toThrow('known memory budget category')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      budgets: [
        { category: 'layout-bundle', maxEstimatedBytes: 10000 },
        { category: 'layout-bundle', maxEstimatedBytes: 20000 },
      ],
    }))).toThrow('duplicates layout-bundle')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      rich: true,
      search: { query: 'x' },
    }))).toThrow('exactly one memory budget mode')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      layoutBundle: true,
      rich: true,
    }))).toThrow('exactly one memory budget mode')
  })

  test('numeric budget and workload bounds are validated', () => {
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      budgets: [{ category: 'layout-bundle', maxEstimatedBytes: 0 }],
    }))).toThrow('positive integer')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      maxChars: 12,
    }))).toThrow('requires corpusFile')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      appendSequence: { count: 1, parts: [] },
      layoutBundle: undefined,
    }))).toThrow('parts must not be empty')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      rangeIndex: { count: 0, span: 1, stride: 1 },
      layoutBundle: undefined,
    }))).toThrow('positive integer')
    expect(() => parseMemoryBudgetConfig(configWithWorkload({
      prepare: { widthProfile: { emojiWidth: 'magic' } },
    }))).toThrow('emojiWidth')
    expect(parseMemoryBudgetConfig(configWithWorkload({
      prepare: { widthProfile: 'terminal-unicode-narrow@1' },
    })).workloads[0]?.prepare).toEqual({ widthProfile: 'terminal-unicode-narrow@1' })
  })
})

function validConfig(): {
  metadata: Record<string, unknown>
  workloads: Record<string, unknown>[]
} {
  return {
    metadata: { schema: 'pretext-tui-memory-budgets@1' },
    workloads: [
      {
        id: 'minimal',
        text: 'hello',
        layoutBundle: true,
        layout: { columns: 12 },
        budgets: [{ category: 'layout-bundle', maxEstimatedBytes: 10000 }],
      },
    ],
  }
}

function configWithWorkload(overrides: Record<string, unknown>) {
  const config = validConfig()
  config.workloads[0] = {
    ...config.workloads[0],
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  }
  return config
}
