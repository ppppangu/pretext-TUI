// 补建说明：该文件为后续补建，用于提供 Task 8 的 package-level terminal vertical slice demo；当前进度：首版展示 row-count precomputation、resize reflow 与 visible-window materialization，不包含宿主集成或交互式应用外壳。
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  layoutTerminal,
  materializeTerminalLineRange,
  prepareTerminal,
  walkTerminalLineRanges,
  type PreparedTerminalText,
  type TerminalLineRange,
} from '../src/index.js'

type DemoFormat = 'pretty' | 'json'

type DemoArgs = {
  columns: number
  format: DemoFormat
  fixture: string
  help: boolean
  listFixtures: boolean
  windowStart: number
  windowSize: number
  resizeColumns: number[]
}

type DemoLine = {
  break: string
  sourceEnd: number
  sourceStart: number
  text: string
  width: number
}

type DemoReport = {
  schema: 'pretext-tui-terminal-demo@1'
  baseLayout: {
    columns: number
    rows: number
  }
  fixture: {
    name: string
    path: string
  }
  prepare: {
    inputCodeUnits: number
    tabSize: number
    whiteSpace: 'pre-wrap'
    widthProfile: string
  }
  reflow: Array<{
    columns: number
    rows: number
  }>
  viewport: {
    materializedRows: number
    size: number
    start: number
    lines: DemoLine[]
  }
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = path.join(packageRoot, 'fixtures')

try {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    process.exit(0)
  }
  if (args.listFixtures) {
    console.log((await listFixtureNames()).join('\n'))
    process.exit(0)
  }

  const fixturePath = resolveFixturePath(args.fixture)
  const input = stripSupplementHeader(await readFile(fixturePath, 'utf8'))
  const report = buildReport(args, fixturePath, input)
  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printReport(report)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`terminal-demo: ${message}`)
  console.error('')
  console.error(usage())
  process.exit(1)
}

function buildReport(args: DemoArgs, fixturePath: string, input: string): DemoReport {
  const prepared = prepareTerminal(input, { whiteSpace: 'pre-wrap', tabSize: 4 })
  const primaryRows = layoutTerminal(prepared, { columns: args.columns }).rows
  const lines: DemoLine[] = []
  let row = 0

  walkTerminalLineRanges(prepared, { columns: args.columns }, line => {
    if (row >= args.windowStart && row < args.windowStart + args.windowSize) {
      lines.push(materializeDemoLine(prepared, line))
    }
    row++
  })

  return {
    schema: 'pretext-tui-terminal-demo@1',
    fixture: {
      name: fixtureNameFromPath(fixturePath),
      path: path.relative(packageRoot, fixturePath).replaceAll(path.sep, '/'),
    },
    prepare: {
      inputCodeUnits: prepared.sourceText.length,
      tabSize: 4,
      whiteSpace: 'pre-wrap',
      widthProfile: 'terminal-unicode-narrow@1',
    },
    baseLayout: {
      columns: args.columns,
      rows: primaryRows,
    },
    reflow: args.resizeColumns.map(columns => ({
      columns,
      rows: layoutTerminal(prepared, { columns }).rows,
    })),
    viewport: {
      start: args.windowStart,
      size: args.windowSize,
      materializedRows: lines.length,
      lines,
    },
  }
}

function materializeDemoLine(prepared: PreparedTerminalText, line: TerminalLineRange): DemoLine {
  const item = materializeTerminalLineRange(prepared, line)
  const breakLabel = line.break.kind === 'end' ? 'end' : line.break.kind
  return {
    text: item.text,
    width: line.width,
    break: breakLabel,
    sourceStart: line.sourceStart,
    sourceEnd: line.sourceEnd,
  }
}

function printReport(report: DemoReport): void {
  console.log('pretext-tui terminal demo')
  console.log(`fixture: ${report.fixture.name} (${report.fixture.path})`)
  console.log(`schema: ${report.schema}`)
  console.log('')
  console.log('[1] row-count precomputation')
  console.log(`  inputCodeUnits: ${report.prepare.inputCodeUnits}`)
  console.log(`  prepare: whiteSpace=${report.prepare.whiteSpace} tabSize=${report.prepare.tabSize} widthProfile=${report.prepare.widthProfile}`)
  console.log(`  ${report.baseLayout.columns} cols -> ${report.baseLayout.rows} rows`)
  console.log('')
  console.log('[2] resize reflow')
  for (const item of report.reflow) {
    console.log(`  ${item.columns} cols -> ${item.rows} rows`)
  }
  console.log('')
  console.log(`[3] visible window start=${report.viewport.start} size=${report.viewport.size}`)
  for (let index = 0; index < report.viewport.lines.length; index++) {
    const rowIndex = report.viewport.start + index
    const line = report.viewport.lines[index]
    if (!line) continue
    const label = String(rowIndex + 1).padStart(3, '0')
    console.log(`${label} | ${line.text}  [w=${line.width}, break=${line.break}, source=${line.sourceStart}:${line.sourceEnd}]`)
  }
  console.log(`materializedRows: ${report.viewport.materializedRows}`)
}

function parseArgs(argv: string[]): DemoArgs {
  const allowedFlags = new Set([
    'columns',
    'fixture',
    'format',
    'help',
    'list-fixtures',
    'resize-columns',
    'window-size',
    'window-start',
  ])
  const booleanFlags = new Set(['help', 'list-fixtures'])
  const values: Record<string, string> = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) continue
    if (arg === '--') continue
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${arg}`)
    }

    const eq = arg.indexOf('=')
    const key = eq < 0 ? arg.slice(2) : arg.slice(2, eq)
    if (!allowedFlags.has(key)) {
      throw new Error(`unknown option: --${key}`)
    }

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
      if (value.length === 0 && !booleanFlags.has(key)) {
        throw new Error(`missing value for --${key}`)
      }
    }

    values[key] = value
  }
  const columns = parsePositiveInteger(values['columns'] ?? '52', '--columns')
  return {
    columns,
    format: parseFormat(values['format'] ?? 'pretty'),
    fixture: values['fixture'] ?? 'mixed-terminal-session',
    help: values['help'] === 'true',
    listFixtures: values['list-fixtures'] === 'true',
    windowStart: parseNonNegativeInteger(values['window-start'] ?? '0', '--window-start'),
    windowSize: parsePositiveInteger(values['window-size'] ?? '12', '--window-size'),
    resizeColumns: parseResizeColumns(values['resize-columns'], columns),
  }
}

function parseFormat(value: string): DemoFormat {
  if (value === 'pretty' || value === 'json') return value
  throw new Error(`--format must be "pretty" or "json", got ${value}`)
}

function parseResizeColumns(value: string | undefined, primaryColumns: number): number[] {
  if (value === undefined || value.length === 0) {
    return uniqueSorted([
      Math.max(1, primaryColumns - 16),
      primaryColumns,
      primaryColumns + 16,
    ])
  }
  return uniqueSorted(value.split(',').map((item, index) =>
    parsePositiveInteger(item.trim(), `--resize-columns[${index}]`),
  ))
}

function parsePositiveInteger(value: string, label: string): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`)
  }
  return numberValue
}

function parseNonNegativeInteger(value: string, label: string): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
  return numberValue
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function resolveFixturePath(fixture: string): string {
  const normalizedFixture = fixture.replaceAll('\\', '/')
  const hasPathSeparator = normalizedFixture.includes('/')
  const extension = path.extname(normalizedFixture)
  const fixtureTarget = extension.length === 0
    ? `${normalizedFixture}.txt`
    : normalizedFixture
  const resolved = path.resolve(packageRoot, fixtureTarget)
  const resolvedInsideFixtures = isInsideDirectory(resolved, fixturesDir)
    ? resolved
    : path.resolve(fixturesDir, fixtureTarget)
  if (!isInsideDirectory(resolvedInsideFixtures, fixturesDir)) {
    throw new Error(`fixture must resolve inside fixtures/: ${fixture}`)
  }
  if (path.extname(resolvedInsideFixtures) !== '.txt') {
    throw new Error(`fixture must be a .txt transcript under fixtures/: ${fixture}`)
  }
  if (!hasPathSeparator && extension.length > 0 && extension !== '.txt') {
    throw new Error(`fixture names may only use the .txt extension: ${fixture}`)
  }
  return resolvedInsideFixtures
}

function isInsideDirectory(target: string, directory: string): boolean {
  const relative = path.relative(directory, target)
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function stripSupplementHeader(text: string): string {
  return text.replace(/^# 补建说明：[^\n]*(?:\r?\n)?/, '')
}

function fixtureNameFromPath(fixturePath: string): string {
  return path.basename(fixturePath, path.extname(fixturePath))
}

async function listFixtureNames(): Promise<string[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.txt'))
    .map(entry => path.basename(entry.name, '.txt'))
    .sort()
}

function usage(): string {
  return [
    'Usage: bun run --silent terminal-demo -- [options]',
    '',
    'Options:',
    '  --columns <n>             Primary terminal width in cells (default: 52)',
    '  --fixture <name|path>     Fixture name or path under fixtures/ (default: mixed-terminal-session)',
    '  --window-start <n>        First zero-based row to materialize (default: 0)',
    '  --window-size <n>         Number of rows to materialize (default: 12)',
    '  --resize-columns <csv>    Comma-separated widths for reflow (default: columns-16,columns,columns+16)',
    '  --format <pretty|json>    Output format (default: pretty)',
    '  --list-fixtures           Print fixture names and exit',
    '  --help                    Print this help and exit',
  ].join('\n')
}
