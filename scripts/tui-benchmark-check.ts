// 补建说明：该文件为后续补建，用于执行 Task 7 的 TUI benchmark gate；当前进度：首版使用 public APIs 与 harness counters，阈值保守以降低 CI 噪声。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareTerminal, type TerminalLayoutOptions, type TerminalPrepareOptions } from '../src/index.js'
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
  maxChars?: number
  rich?: boolean
  prepare?: TerminalPrepareOptions
  layout: TerminalLayoutOptions
  iterations?: number
  maxMilliseconds?: number
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

    const prepared = prepareTerminal(input, workload.prepare)
    counters.prepareCalls++
    const lines = collectTerminalLines(prepared, workload.layout)
    counters.layoutPasses += lines.length
    counters.materializedLines += lines.length
    counters.materializedCodeUnits += lines.reduce((sum, line) => sum + line.materialized.text.length, 0)
  }

  return counters
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
