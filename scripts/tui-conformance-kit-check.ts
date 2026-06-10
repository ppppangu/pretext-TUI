// 补建说明：该文件为后续补建，用于把 fixtures/conformance 的套件用例对当前引擎重新求值并在不匹配时列出 case id 退出 1；当前进度：首版覆盖 width/wrap/offset 三域逐字段对比。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  computeLayoutExpected,
  computeWidthExpected,
} from './tui-reference-cases.js'
import {
  computeOffsetExpected,
  type OffsetCaseRecord,
  type WidthCaseRecord,
  type WrapCaseRecord,
} from './tui-conformance-kit-generate.js'

const root = process.cwd()
const conformanceDir = path.join(root, 'fixtures/conformance')

type DomainPayload = { metadata?: { schema?: unknown }, cases?: unknown }

const mismatches: string[] = []

await checkWidth()
await checkWrap()
await checkOffset()

if (mismatches.length > 0) {
  console.error('TUI conformance kit check failed for case ids:')
  for (const id of mismatches) {
    console.error(`- ${id}`)
  }
  process.exit(1)
}

console.log('TUI conformance kit check passed')

async function loadCases(fileName: string): Promise<unknown[]> {
  const raw = await readFile(path.join(conformanceDir, fileName), 'utf8')
  const payload = JSON.parse(raw) as DomainPayload
  if (payload.metadata?.schema !== 'pretext-tui-terminal-conformance-kit@1') {
    throw new Error(`${fileName}: unexpected conformance kit schema`)
  }
  if (!Array.isArray(payload.cases)) {
    throw new Error(`${fileName}: missing cases array`)
  }
  return payload.cases
}

async function checkWidth(): Promise<void> {
  const cases = (await loadCases('width-cases.json')) as WidthCaseRecord[]
  for (const testCase of cases) {
    const actual = computeWidthExpected(testCase)
    if (actual !== testCase.expectedWidth) {
      mismatches.push(testCase.id)
    }
  }
}

async function checkWrap(): Promise<void> {
  const cases = (await loadCases('wrap-cases.json')) as WrapCaseRecord[]
  for (const testCase of cases) {
    const actual = computeLayoutExpected(testCase)
    if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
      mismatches.push(testCase.id)
    }
  }
}

async function checkOffset(): Promise<void> {
  const cases = (await loadCases('offset-cases.json')) as OffsetCaseRecord[]
  for (const testCase of cases) {
    const actual = computeOffsetExpected(testCase)
    if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
      mismatches.push(testCase.id)
    }
  }
}
