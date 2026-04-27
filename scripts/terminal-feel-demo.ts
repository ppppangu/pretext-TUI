// 补建说明：该文件为后续补建，用于提供一个本地可感知的滚动体感 demo，对比常规全量重包切片与 pretext-TUI 热页复用；当前进度：首版 CLI/JSON 输出，不作为正式 benchmark 或 host renderer。
import { performance } from 'node:perf_hooks'
import {
  createTerminalLayoutBundle,
  getTerminalLayoutBundlePage,
  layoutTerminal,
  materializeTerminalLinePage,
  prepareTerminal,
} from '../src/index.js'
import wrapAnsi from 'wrap-ansi'

type DemoFormat = 'pretty' | 'json'

type DemoArgs = {
  budgetMs: number
  columns: number
  format: DemoFormat
  frames: number
  help: boolean
  repeat: number
  viewportRows: number
}

type FrameSample = {
  frame: number
  materializedRows: number
  ms: number
  rowStart: number
}

type MeasuredPath = {
  label: string
  meter: string
  samples: FrameSample[]
  stats: {
    maxMs: number
    meanMs: number
    overBudgetFrames: number
    overDoubleBudgetFrames: number
    p50Ms: number
    p95Ms: number
  }
}

type FeelDemoReport = {
  schema: 'pretext-tui-feel-demo@1'
  caveat: string
  scenario: {
    budgetMs: number
    columns: number
    frameCount: number
    inputCodeUnits: number
    rows: number
    viewportRows: number
  }
  conventional: MeasuredPath
  pretext: MeasuredPath
}

try {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    process.exit(0)
  }

  const report = runFeelDemo(args)
  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printFeelDemo(report)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`terminal-feel-demo: ${message}`)
  console.error('')
  console.error(usage())
  process.exit(1)
}

function runFeelDemo(args: DemoArgs): FeelDemoReport {
  const input = buildDemoInput(args.repeat)
  const prepared = prepareTerminal(input, { whiteSpace: 'pre-wrap', tabSize: 4 })
  const rows = layoutTerminal(prepared, { columns: args.columns }).rows
  const starts = buildViewportStarts(rows, args.viewportRows, args.frames)

  const conventional = measurePath(
    'conventional full wrap + slice',
    starts,
    args.budgetMs,
    rowStart => {
      const wrappedRows = wrapAnsi(input, args.columns, {
        hard: true,
        trim: false,
      }).split(/\r?\n/u)
      return wrappedRows.slice(rowStart, rowStart + args.viewportRows).length
    },
  )

  const bundle = createTerminalLayoutBundle(prepared, {
    columns: args.columns,
    pageSize: args.viewportRows,
    maxPages: 8,
    anchorInterval: 64,
  })
  const pretext = measurePath(
    'pretext prepared + sparse page cache',
    starts,
    args.budgetMs,
    rowStart => {
      const page = getTerminalLayoutBundlePage(prepared, bundle, {
        startRow: rowStart,
        rowCount: args.viewportRows,
      })
      return materializeTerminalLinePage(prepared, page).length
    },
  )

  return {
    schema: 'pretext-tui-feel-demo@1',
    caveat: 'Local tactile demo only: it compares one repeated viewport workload on this machine, not a universal benchmark or renderer/event-loop measurement.',
    scenario: {
      budgetMs: args.budgetMs,
      columns: args.columns,
      frameCount: args.frames,
      inputCodeUnits: input.length,
      rows,
      viewportRows: args.viewportRows,
    },
    conventional,
    pretext,
  }
}

function measurePath(
  label: string,
  starts: readonly number[],
  budgetMs: number,
  runFrame: (rowStart: number) => number,
): MeasuredPath {
  const samples: FrameSample[] = []

  for (let index = 0; index < Math.min(3, starts.length); index++) {
    runFrame(starts[index] ?? 0)
  }

  for (let frame = 0; frame < starts.length; frame++) {
    const rowStart = starts[frame] ?? 0
    const start = performance.now()
    const materializedRows = runFrame(rowStart)
    const ms = performance.now() - start
    samples.push({
      frame,
      rowStart,
      materializedRows,
      ms: round2(ms),
    })
  }

  const values = samples.map(sample => sample.ms)
  return {
    label,
    samples,
    meter: renderMeter(samples, budgetMs),
    stats: {
      meanMs: round2(mean(values)),
      p50Ms: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      maxMs: round2(Math.max(...values)),
      overBudgetFrames: samples.filter(sample => sample.ms > budgetMs).length,
      overDoubleBudgetFrames: samples.filter(sample => sample.ms > budgetMs * 2).length,
    },
  }
}

function renderMeter(samples: readonly FrameSample[], budgetMs: number): string {
  return samples.map(sample => {
    if (sample.ms > budgetMs * 2) return '!'
    if (sample.ms > budgetMs) return '*'
    return '.'
  }).join('')
}

function buildViewportStarts(rows: number, viewportRows: number, frames: number): number[] {
  const maxStart = Math.max(0, rows - viewportRows)
  if (frames === 1) return [0]
  const starts: number[] = []
  for (let frame = 0; frame < frames; frame++) {
    const phase = frame / (frames - 1)
    const wave = phase <= 0.5 ? phase * 2 : (1 - phase) * 2
    starts.push(Math.floor(maxStart * wave))
  }
  return starts
}

function buildDemoInput(repeat: number): string {
  const block = [
    '$ run pipeline --target terminal-kernel --profile unicode',
    'info  chunk 0001: normalized tabs\tCJK 世界 emoji 🚀 regional 🇺🇸 and combining e\u0301 safely',
    'warn  long record: /var/log/app/session/2026-04-27/request/alpha/beta/gamma?trace=source-offset&viewport=hot',
    'diff  - old renderer had to rebuild every visible jump',
    'diff  + pretext-tui keeps source ranges and asks only for the page it needs',
    'test  ✓ wraps tabs, SHY, ZWJ emoji, links, records, and source offsets without host semantics',
    'trace row anchor -> page cache -> materialize visible rows only',
  ].join('\n')

  const chunks: string[] = []
  for (let index = 0; index < repeat; index++) {
    chunks.push(`# record ${String(index + 1).padStart(4, '0')}\n${block}`)
  }
  return chunks.join('\n')
}

function printFeelDemo(report: FeelDemoReport): void {
  console.log('pretext-tui feel demo')
  console.log(report.caveat)
  console.log('')
  console.log(`scenario: ${report.scenario.frameCount} scroll frames, ${report.scenario.columns} columns, ${report.scenario.viewportRows} visible rows`)
  console.log(`source: ${report.scenario.inputCodeUnits} UTF-16 code units -> ${report.scenario.rows} terminal rows`)
  console.log(`legend: "." <= ${report.scenario.budgetMs}ms, "*" > budget, "!" > 2x budget`)
  console.log('')
  printPath(report.conventional, report.scenario.budgetMs)
  console.log('')
  printPath(report.pretext, report.scenario.budgetMs)
  console.log('')
  console.log('Read this as a local feel check: the conventional path rewraps the whole source for every viewport jump; the pretext path reuses prepared text, sparse anchors, and a page cache.')
}

function printPath(path: MeasuredPath, budgetMs: number): void {
  const over = `${path.stats.overBudgetFrames}/${path.samples.length}`
  const overDouble = `${path.stats.overDoubleBudgetFrames}/${path.samples.length}`
  console.log(path.label)
  console.log(`  frames: ${path.meter}`)
  console.log(`  mean=${path.stats.meanMs}ms p50=${path.stats.p50Ms}ms p95=${path.stats.p95Ms}ms max=${path.stats.maxMs}ms`)
  console.log(`  over ${budgetMs}ms: ${over}; over ${round2(budgetMs * 2)}ms: ${overDouble}`)
}

function parseArgs(argv: string[]): DemoArgs {
  const allowedFlags = new Set(['budget-ms', 'columns', 'format', 'frames', 'help', 'repeat', 'viewport-rows'])
  const booleanFlags = new Set(['help'])
  const values: Record<string, string> = {}

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) continue
    if (arg === '--') continue
    if (!arg.startsWith('--')) throw new Error(`unexpected positional argument: ${arg}`)

    const eq = arg.indexOf('=')
    const key = eq < 0 ? arg.slice(2) : arg.slice(2, eq)
    if (!allowedFlags.has(key)) throw new Error(`unknown option: --${key}`)

    let value: string
    if (eq < 0) {
      if (booleanFlags.has(key)) {
        value = 'true'
      } else {
        const next = argv[index + 1]
        if (next === undefined || next === '--' || next.startsWith('--')) {
          throw new Error(`missing value for --${key}`)
        }
        value = next
        index++
      }
    } else {
      value = arg.slice(eq + 1)
      if (value.length === 0 && !booleanFlags.has(key)) throw new Error(`missing value for --${key}`)
    }

    values[key] = value
  }

  return {
    budgetMs: parsePositiveNumber(values['budget-ms'] ?? '16.7', '--budget-ms'),
    columns: parsePositiveInteger(values['columns'] ?? '72', '--columns'),
    format: parseFormat(values['format'] ?? 'pretty'),
    frames: parsePositiveInteger(values['frames'] ?? '60', '--frames'),
    help: values['help'] === 'true',
    repeat: parsePositiveInteger(values['repeat'] ?? '160', '--repeat'),
    viewportRows: parsePositiveInteger(values['viewport-rows'] ?? '18', '--viewport-rows'),
  }
}

function parseFormat(value: string): DemoFormat {
  if (value === 'pretty' || value === 'json') return value
  throw new Error(`--format must be "pretty" or "json", got ${value}`)
}

function parsePositiveInteger(value: string, label: string): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`)
  }
  return numberValue
}

function parsePositiveNumber(value: string, label: string): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive number, got ${value}`)
  }
  return numberValue
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return round2(sorted[index] ?? 0)
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function usage(): string {
  return [
    'Usage: bun run demo:compare:tui -- [options]',
    '',
    'Options:',
    '  --columns <n>          Terminal width in cells (default: 72)',
    '  --viewport-rows <n>    Visible rows per simulated frame (default: 18)',
    '  --frames <n>           Number of scroll frames to sample (default: 60)',
    '  --repeat <n>           Repeated transcript blocks in the source (default: 160)',
    '  --budget-ms <n>        Frame budget marker for the meter (default: 16.7)',
    '  --format <pretty|json> Output format (default: pretty)',
    '  --help                 Print this help and exit',
  ].join('\n')
}
