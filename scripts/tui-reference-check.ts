// 补建说明：该文件为后续补建，用于执行 Task 7 的 deterministic TUI reference/golden 校验；当前进度：首版覆盖 layout、rich inline 与 width profile goldens。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareTerminal } from '../src/index.js'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from '../src/terminal-rich-inline.js'
import { terminalStringWidth } from '../src/terminal-string-width.js'
import {
  TERMINAL_START_CURSOR,
  type TerminalLineRange,
} from '../src/index.js'
import {
  assert,
  assertDeepEqual,
  assertLayoutGolden,
  assertTerminalInvariants,
  type LayoutGoldenCase,
  type RichGoldenCase,
  type WidthGoldenCase,
} from '../tests/tui/validation-helpers.js'

type ReferenceFile = {
  metadata: { schema: string }
  widthCases: WidthGoldenCase[]
  layoutCases: LayoutGoldenCase[]
  richCases: RichGoldenCase[]
}

const root = process.cwd()
const reference = parseReferenceFile(JSON.parse(
  await readFile(path.join(root, 'accuracy/tui-reference.json'), 'utf8'),
))

assert(reference.metadata.schema === 'pretext-tui-reference@1', 'unexpected reference schema')

for (const item of reference.widthCases) {
  const width = terminalStringWidth(item.text, item.widthProfile)
  assert(width === item.expectedWidth, `width golden ${item.id} mismatch: ${width} !== ${item.expectedWidth}`)
}

for (const item of reference.layoutCases) {
  assertLayoutGolden(item)
  const prepared = prepareTerminal(item.text, item.prepare)
  assertTerminalInvariants(prepared, item.layout)
}

for (const item of reference.richCases) {
  const prepared = prepareTerminalRichInline(item.rawText, item.prepare)
  const lines: TerminalLineRange[] = []
  walkTerminalRichLineRanges(prepared, item.layout, line => lines.push(line))
  const materialized = lines.map(line => materializeTerminalRichLineRange(prepared, line))
  assertDeepEqual({
    visibleText: prepared.visibleText,
    diagnosticCount: prepared.diagnostics.length,
    spanKinds: prepared.spans.map(span => span.kind),
    texts: materialized.map(line => line.text),
    fragmentTexts: materialized.map(line => line.fragments.map(fragment => fragment.text)),
  }, item.expected, `rich golden ${item.id}`)

  const first = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, item.layout)
  assert(first !== null || prepared.visibleText.length === 0, `rich golden ${item.id} did not produce a first line`)
}

console.log(`TUI reference check passed: ${reference.layoutCases.length} layout, ${reference.richCases.length} rich, ${reference.widthCases.length} width cases`)

function parseReferenceFile(value: unknown): ReferenceFile {
  const record = expectRecord(value, 'reference')
  const metadata = expectRecord(record['metadata'], 'reference.metadata')
  assert(metadata['schema'] === 'pretext-tui-reference@1', 'unexpected reference schema')
  const widthCases = expectArray(record['widthCases'], 'reference.widthCases')
  const layoutCases = expectArray(record['layoutCases'], 'reference.layoutCases')
  const richCases = expectArray(record['richCases'], 'reference.richCases')

  for (const [index, item] of widthCases.entries()) {
    const widthCase = expectRecord(item, `widthCases[${index}]`)
    expectString(widthCase['id'], `widthCases[${index}].id`)
    expectString(widthCase['text'], `widthCases[${index}].text`)
    expectNumber(widthCase['expectedWidth'], `widthCases[${index}].expectedWidth`)
  }
  for (const [index, item] of layoutCases.entries()) {
    const layoutCase = expectRecord(item, `layoutCases[${index}]`)
    expectString(layoutCase['id'], `layoutCases[${index}].id`)
    expectString(layoutCase['text'], `layoutCases[${index}].text`)
    expectRecord(layoutCase['layout'], `layoutCases[${index}].layout`)
    expectRecord(layoutCase['expected'], `layoutCases[${index}].expected`)
  }
  for (const [index, item] of richCases.entries()) {
    const richCase = expectRecord(item, `richCases[${index}]`)
    expectString(richCase['id'], `richCases[${index}].id`)
    expectString(richCase['rawText'], `richCases[${index}].rawText`)
    expectRecord(richCase['layout'], `richCases[${index}].layout`)
    expectRecord(richCase['expected'], `richCases[${index}].expected`)
  }

  return {
    metadata: { schema: metadata['schema'] },
    widthCases: widthCases as WidthGoldenCase[],
    layoutCases: layoutCases as LayoutGoldenCase[],
    richCases: richCases as RichGoldenCase[],
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
