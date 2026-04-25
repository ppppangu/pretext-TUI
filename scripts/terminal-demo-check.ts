// 补建说明：该文件为后续补建，用于将 Task 8 terminal-demo 的 pretty/json 输出契约纳入发布验证；当前进度：首版校验 demo CLI、JSON schema、fixture 沙箱错误与核心行数。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type JsonRecord = Record<string, unknown>

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const pretty = runDemo(['--columns=52', '--fixture=mixed-terminal-session'])
expectIncludes(pretty.stdout, 'pretext-tui terminal demo', 'pretty header')
expectIncludes(pretty.stdout, '[1] row-count precomputation', 'pretty prepare section')
expectIncludes(pretty.stdout, '52 cols -> 31 rows', 'pretty primary row count')
expectIncludes(pretty.stdout, '[2] resize reflow', 'pretty resize section')
expectIncludes(pretty.stdout, '36 cols -> 41 rows', 'pretty narrow resize row count')
expectIncludes(pretty.stdout, '68 cols -> 27 rows', 'pretty wide resize row count')
expectIncludes(pretty.stdout, '[3] visible window start=0 size=12', 'pretty viewport section')
expectIncludes(pretty.stdout, 'materializedRows: 12', 'pretty materialized row count')

const fixturePathWithoutSuffix = runDemo(['--columns=52', '--fixture=fixtures/mixed-terminal-session', '--window-start=20', '--window-size=5'])
expectIncludes(fixturePathWithoutSuffix.stdout, '[3] visible window start=20 size=5', 'fixture path without suffix viewport section')
expectIncludes(fixturePathWithoutSuffix.stdout, 'materializedRows: 5', 'fixture path without suffix materialized row count')

const json = runDemo(['--columns', '52', '--fixture', 'mixed-terminal-session', '--format', 'json'])
const report = parseJsonReport(json.stdout)
expectEqual(report['schema'], 'pretext-tui-terminal-demo@1', 'json schema')
expectNoKey(report, 'window', 'json report should use viewport terminology')

const fixture = expectRecord(report['fixture'], 'json fixture')
expectEqual(fixture['name'], 'mixed-terminal-session', 'json fixture name')
expectEqual(fixture['path'], 'fixtures/mixed-terminal-session.txt', 'json fixture path')

const prepare = expectRecord(report['prepare'], 'json prepare')
expectEqual(prepare['inputCodeUnits'], 855, 'json input code units')
expectEqual(prepare['whiteSpace'], 'pre-wrap', 'json whitespace')
expectEqual(prepare['tabSize'], 4, 'json tab size')
expectEqual(prepare['widthProfile'], 'terminal-unicode-narrow@1', 'json width profile')

const baseLayout = expectRecord(report['baseLayout'], 'json base layout')
expectEqual(baseLayout['columns'], 52, 'json base columns')
expectEqual(baseLayout['rows'], 31, 'json base rows')

const reflow = expectArray(report['reflow'], 'json reflow')
expectEqual(reflow.length, 3, 'json reflow count')
expectEqual(expectRecord(reflow[0], 'json reflow[0]')['columns'], 36, 'json reflow narrow columns')
expectEqual(expectRecord(reflow[0], 'json reflow[0]')['rows'], 41, 'json reflow narrow rows')
expectEqual(expectRecord(reflow[1], 'json reflow[1]')['columns'], 52, 'json reflow base columns')
expectEqual(expectRecord(reflow[1], 'json reflow[1]')['rows'], 31, 'json reflow base rows')
expectEqual(expectRecord(reflow[2], 'json reflow[2]')['columns'], 68, 'json reflow wide columns')
expectEqual(expectRecord(reflow[2], 'json reflow[2]')['rows'], 27, 'json reflow wide rows')

const viewport = expectRecord(report['viewport'], 'json viewport')
expectEqual(viewport['start'], 0, 'json viewport start')
expectEqual(viewport['size'], 12, 'json viewport size')
expectEqual(viewport['materializedRows'], 12, 'json viewport materialized rows')
const lines = expectArray(viewport['lines'], 'json viewport lines')
expectEqual(lines.length, 12, 'json viewport line count')
expectEqual(expectRecord(lines[0], 'json first viewport line')['text'], '$ pretext-tui demo --profile terminal-unicode-', 'json first line text')
expectEqual(expectRecord(lines[4], 'json wrapped URL line')['width'], 38, 'json wrapped URL line width')

const badFixture = runDemoAllowFailure(['--fixture', '../package.json'])
if (badFixture.exitCode === 0) {
  throw new Error('Expected outside-fixture path to fail')
}
expectIncludes(badFixture.stderr, 'fixture must resolve inside fixtures/', 'outside-fixture error')
if (badFixture.stderr.includes('Error:')) {
  throw new Error('User-facing fixture errors must not print stack traces')
}

const nonTranscriptFixture = runDemoAllowFailure(['--fixture', 'fixtures/README.md'])
if (nonTranscriptFixture.exitCode === 0) {
  throw new Error('Expected non-transcript fixture path to fail')
}
expectIncludes(nonTranscriptFixture.stderr, 'fixture must be a .txt transcript under fixtures/', 'non-transcript fixture error')

console.log('Terminal demo check passed')

function runDemo(args: string[]): CommandResult {
  const result = runDemoAllowFailure(args)
  if (result.exitCode !== 0) {
    throw new Error(`terminal-demo failed (${result.exitCode}):\n${result.stderr}${result.stdout}`)
  }
  return result
}

function runDemoAllowFailure(args: string[]): CommandResult {
  const result = Bun.spawnSync(['bun', 'run', '--silent', 'terminal-demo', '--', ...args], {
    cwd: packageRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  }
}

function parseJsonReport(raw: string): JsonRecord {
  const value = JSON.parse(raw) as unknown
  return expectRecord(value, 'json report')
}

function expectRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as JsonRecord
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value
}

function expectIncludes(value: string, expected: string, label: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${label} missing ${JSON.stringify(expected)}:\n${value}`)
  }
}

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function expectNoKey(value: JsonRecord, key: string, label: string): void {
  if (Object.hasOwn(value, key)) {
    throw new Error(label)
  }
}
