// 补建说明：该文件为后续补建，用于执行 Task 7 的 deterministic TUI reference/golden 校验；当前进度：复用 tui-reference-cases 共享求值，覆盖 layout、rich inline 与 width profile goldens。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TERMINAL_START_CURSOR, prepareTerminal } from '../src/index.js'
import {
  layoutNextTerminalRichLineRange,
  prepareTerminalRichInline,
} from '../src/terminal-rich-inline.js'
import {
  assert,
  assertDeepEqual,
  assertLayoutGolden,
  assertTerminalInvariants,
} from '../tests/tui/validation-helpers.js'
import {
  computeRichExpected,
  computeWidthExpected,
  parseReferenceFile,
} from './tui-reference-cases.js'

const root = process.cwd()
const reference = parseReferenceFile(JSON.parse(
  await readFile(path.join(root, 'accuracy/tui-reference.json'), 'utf8'),
))

assert(reference.metadata.schema === 'pretext-tui-reference@1', 'unexpected reference schema')

for (const item of reference.widthCases) {
  const width = computeWidthExpected(item)
  assert(width === item.expectedWidth, `width golden ${item.id} mismatch: ${width} !== ${item.expectedWidth}`)
}

for (const item of reference.layoutCases) {
  assertLayoutGolden(item)
  const prepared = prepareTerminal(item.text, item.prepare)
  assertTerminalInvariants(prepared, item.layout)
}

for (const item of reference.richCases) {
  assertDeepEqual(computeRichExpected(item), item.expected, `rich golden ${item.id}`)

  const prepared = prepareTerminalRichInline(item.rawText, item.prepare)
  const first = layoutNextTerminalRichLineRange(prepared, TERMINAL_START_CURSOR, item.layout)
  assert(first !== null || prepared.visibleText.length === 0, `rich golden ${item.id} did not produce a first line`)
}

console.log(`TUI reference check passed: ${reference.layoutCases.length} layout, ${reference.richCases.length} rich, ${reference.widthCases.length} width cases`)
