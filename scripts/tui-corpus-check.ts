// 补建说明：该文件为后续补建，用于执行 Task 7 的 TUI corpus invariant 校验；当前进度：首版从 corpora/tui-step10.json 引用既有语料并验证 public API 不变量。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareTerminal, type TerminalLayoutOptions, type TerminalPrepareOptions } from '../src/index.js'
import {
  assert,
  assertTerminalInvariants,
  collectTerminalLines,
  stableHash,
} from '../tests/tui/validation-helpers.js'

type CorpusSlice = 'head' | 'middle' | 'tail'

type CorpusSample = {
  id: string
  file: string
  maxChars: number
  windows: CorpusSlice[]
  prepare?: TerminalPrepareOptions
  layouts: TerminalLayoutOptions[]
}

type CorpusManifest = {
  metadata: { schema: string }
  samples: CorpusSample[]
}

const root = process.cwd()
const manifest = parseCorpusManifest(JSON.parse(
  await readFile(path.join(root, 'corpora/tui-step10.json'), 'utf8'),
))

assert(manifest.metadata.schema === 'pretext-tui-corpus-manifest@1', 'unexpected corpus manifest schema')

const summaries = []
for (const sample of manifest.samples) {
  const fullText = await readFile(path.join(root, 'corpora', sample.file), 'utf8')
  for (const sliceName of sample.windows) {
    const text = selectSlice(fullText, sliceName, sample.maxChars)
    for (const layout of sample.layouts) {
      const prepared = prepareTerminal(text, sample.prepare)
      assertTerminalInvariants(prepared, layout)
      const lines = collectTerminalLines(prepared, layout)
      summaries.push({
        id: sample.id,
        slice: sliceName,
        columns: layout.columns,
        rows: lines.length,
        maxLineWidth: Math.max(0, ...lines.map(line => line.range.width)),
        lineHash: stableHash(lines.map(line => [
          line.materialized.text,
          line.range.sourceStart,
          line.range.sourceEnd,
          line.range.width,
          line.range.break.kind,
        ])),
      })
    }
  }
}

console.log(`TUI corpus check passed: ${summaries.length} sampled layouts`)
console.log(JSON.stringify({ summaries }, null, 2))

function selectSlice(text: string, sliceName: CorpusSlice, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (sliceName === 'head') return text.slice(0, maxChars)
  if (sliceName === 'tail') return text.slice(text.length - maxChars)
  const start = Math.max(0, Math.floor((text.length - maxChars) / 2))
  return text.slice(start, start + maxChars)
}

function parseCorpusManifest(value: unknown): CorpusManifest {
  const record = expectRecord(value, 'corpus manifest')
  const metadata = expectRecord(record['metadata'], 'corpus manifest.metadata')
  assert(metadata['schema'] === 'pretext-tui-corpus-manifest@1', 'unexpected corpus manifest schema')
  const samples = expectArray(record['samples'], 'corpus manifest.samples')
  for (const [index, item] of samples.entries()) {
    const sample = expectRecord(item, `samples[${index}]`)
    expectString(sample['id'], `samples[${index}].id`)
    expectString(sample['file'], `samples[${index}].file`)
    expectNumber(sample['maxChars'], `samples[${index}].maxChars`)
    const windows = expectArray(sample['windows'], `samples[${index}].windows`)
    for (const windowName of windows) {
      assert(windowName === 'head' || windowName === 'middle' || windowName === 'tail', `invalid corpus slice ${String(windowName)}`)
    }
    const layouts = expectArray(sample['layouts'], `samples[${index}].layouts`)
    for (const [layoutIndex, layout] of layouts.entries()) {
      const layoutRecord = expectRecord(layout, `samples[${index}].layouts[${layoutIndex}]`)
      expectNumber(layoutRecord['columns'], `samples[${index}].layouts[${layoutIndex}].columns`)
    }
  }
  return {
    metadata: { schema: metadata['schema'] },
    samples: samples as CorpusSample[],
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
