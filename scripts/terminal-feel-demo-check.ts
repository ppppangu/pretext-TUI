// 补建说明：该文件为后续补建，用于把 terminal-feel-demo 的 CLI/JSON 契约纳入发布验证；当前进度：首版校验本地体感 demo 输出形状，不断言机器相关性能数字。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type JsonRecord = Record<string, unknown>

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const pretty = runDemo(['--frames=4', '--repeat=3', '--viewport-rows=5', '--columns=42'])
expectIncludes(pretty.stdout, 'pretext-tui feel demo', 'pretty header')
expectIncludes(pretty.stdout, 'conventional full wrap + slice', 'pretty conventional path')
expectIncludes(pretty.stdout, 'pretext prepared + sparse page cache', 'pretty pretext path')
expectIncludes(pretty.stdout, 'legend: "." <=', 'pretty meter legend')
expectIncludes(pretty.stdout, 'Local tactile demo only', 'pretty caveat')

const json = runDemo(['--frames=5', '--repeat=4', '--viewport-rows=6', '--columns=48', '--format=json'])
const report = parseJsonReport(json.stdout)
expectEqual(report['schema'], 'pretext-tui-feel-demo@1', 'json schema')
expectIncludes(String(report['caveat']), 'not a universal benchmark', 'json caveat')

const scenario = expectRecord(report['scenario'], 'scenario')
expectEqual(scenario['frameCount'], 5, 'scenario frames')
expectEqual(scenario['columns'], 48, 'scenario columns')
expectEqual(scenario['viewportRows'], 6, 'scenario viewport rows')
expectNumberGreaterThan(scenario['inputCodeUnits'], 0, 'scenario input code units')
expectNumberGreaterThan(scenario['rows'], 0, 'scenario rows')

const conventional = expectMeasuredPath(report['conventional'], 'conventional')
const pretext = expectMeasuredPath(report['pretext'], 'pretext')
expectEqual(conventional.samples.length, 5, 'conventional sample count')
expectEqual(pretext.samples.length, 5, 'pretext sample count')
expectEqual(conventional.meter.length, 5, 'conventional meter length')
expectEqual(pretext.meter.length, 5, 'pretext meter length')

const badOption = runDemoAllowFailure(['--unknown'])
if (badOption.exitCode === 0) {
  throw new Error('Expected unknown option to fail')
}
expectIncludes(badOption.stderr, 'unknown option: --unknown', 'unknown option error')

console.log('Terminal feel demo check passed')

function expectMeasuredPath(value: unknown, label: string): { meter: string, samples: unknown[] } {
  const record = expectRecord(value, label)
  expectIncludes(String(record['label']), label === 'conventional' ? 'full wrap' : 'pretext', `${label} label`)
  const meter = expectString(record['meter'], `${label} meter`)
  if (!/^[.*!]+$/u.test(meter)) throw new Error(`${label} meter uses unexpected symbols: ${meter}`)
  const samples = expectArray(record['samples'], `${label} samples`)
  const stats = expectRecord(record['stats'], `${label} stats`)
  for (const key of ['meanMs', 'p50Ms', 'p95Ms', 'maxMs', 'overBudgetFrames', 'overDoubleBudgetFrames']) {
    expectNumber(stats[key], `${label} stats.${key}`)
  }
  for (const sample of samples) {
    const sampleRecord = expectRecord(sample, `${label} sample`)
    expectNumber(sampleRecord['ms'], `${label} sample.ms`)
    expectNumber(sampleRecord['frame'], `${label} sample.frame`)
    expectNumber(sampleRecord['rowStart'], `${label} sample.rowStart`)
    expectNumberGreaterThan(sampleRecord['materializedRows'], 0, `${label} sample.materializedRows`)
  }
  return { meter, samples }
}

function runDemo(args: string[]): CommandResult {
  const result = runDemoAllowFailure(args)
  if (result.exitCode !== 0) {
    throw new Error(`terminal-feel-demo failed (${result.exitCode}):\n${result.stderr}${result.stdout}`)
  }
  return result
}

function runDemoAllowFailure(args: string[]): CommandResult {
  const result = Bun.spawnSync(['bun', 'run', '--silent', 'terminal-feel-demo', '--', ...args], {
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

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }
  return value
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function expectNumberGreaterThan(value: unknown, min: number, label: string): void {
  const numberValue = expectNumber(value, label)
  if (numberValue <= min) {
    throw new Error(`${label} must be greater than ${min}, got ${numberValue}`)
  }
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
