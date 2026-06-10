// 补建说明：该文件为后续补建，用于在 reference 校验与再生成之间共享 case 求值与字节级序列化；当前进度：首版覆盖 width/layout/rich expected 计算与 accuracy/tui-reference.json 序列化。
import type { TerminalLineRange } from '../src/public/index.js'
import {
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
  walkTerminalRichLineRanges,
} from '../src/rich/terminal-rich-inline.js'
import { terminalStringWidth } from '../src/unicode/terminal-string-width.js'
import {
  assert,
  snapshotLayoutCase,
  type LayoutGoldenCase,
  type LayoutSnapshot,
  type RichGoldenCase,
  type WidthGoldenCase,
} from '../tests/tui/validation-helpers.js'

export type ReferenceFile = {
  metadata: { note: string, schema: string }
  widthCases: WidthGoldenCase[]
  layoutCases: LayoutGoldenCase[]
  richCases: RichGoldenCase[]
}

export type RichExpected = RichGoldenCase['expected']

export function computeWidthExpected(testCase: WidthGoldenCase): number {
  return terminalStringWidth(testCase.text, testCase.widthProfile)
}

export function computeLayoutExpected(testCase: LayoutGoldenCase): LayoutSnapshot {
  return snapshotLayoutCase(testCase.text, testCase.prepare, testCase.layout)
}

export function computeRichExpected(testCase: RichGoldenCase): RichExpected {
  const prepared = prepareTerminalRichInline(testCase.rawText, testCase.prepare)
  const lines: TerminalLineRange[] = []
  walkTerminalRichLineRanges(prepared, testCase.layout, line => lines.push(line))
  const materialized = lines.map(line => materializeTerminalRichLineRange(prepared, line))
  return {
    visibleText: prepared.visibleText,
    diagnosticCount: prepared.diagnostics.length,
    spanKinds: prepared.spans.map(span => span.kind),
    texts: materialized.map(line => line.text),
    fragmentTexts: materialized.map(line => line.fragments.map(fragment => fragment.text)),
  }
}

export function parseReferenceFile(value: unknown): ReferenceFile {
  const record = expectRecord(value, 'reference')
  const metadata = expectRecord(record['metadata'], 'reference.metadata')
  const note = expectString(metadata['note'], 'reference.metadata.note')
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
    metadata: { note, schema: metadata['schema'] },
    widthCases: widthCases as WidthGoldenCase[],
    layoutCases: layoutCases as LayoutGoldenCase[],
    richCases: richCases as RichGoldenCase[],
  }
}

// 序列化按 accuracy/tui-reference.json 的字节格式逐字段重建：2 空格缩进、冒号后 1 空格、LF、文件末尾恰好 1 个换行；
// 每种形状使用固定键序，原始 unicode 与  转义均由 JSON.stringify 保证字节一致。
export function serializeReferenceFile(file: ReferenceFile): string {
  return `${renderValue(referenceShape(file), 0)}\n`
}

type OrderedObject = { __ordered: true, entries: Array<[string, unknown]> }

function ordered(entries: Array<[string, unknown] | null>): OrderedObject {
  return { __ordered: true, entries: entries.filter((entry): entry is [string, unknown] => entry !== null) }
}

function referenceShape(file: ReferenceFile): OrderedObject {
  return ordered([
    ['metadata', ordered([
      ['note', file.metadata.note],
      ['schema', file.metadata.schema],
    ])],
    ['widthCases', file.widthCases.map(widthShape)],
    ['layoutCases', file.layoutCases.map(layoutShape)],
    ['richCases', file.richCases.map(richShape)],
  ])
}

function widthShape(testCase: WidthGoldenCase): OrderedObject {
  return ordered([
    ['id', testCase.id],
    ['text', testCase.text],
    testCase.widthProfile === undefined ? null : ['widthProfile', widthProfileShape(testCase.widthProfile)],
    ['expectedWidth', testCase.expectedWidth],
  ])
}

function layoutShape(testCase: LayoutGoldenCase): OrderedObject {
  return ordered([
    ['id', testCase.id],
    ['text', testCase.text],
    testCase.prepare === undefined ? null : ['prepare', prepareShape(testCase.prepare)],
    ['layout', layoutOptionsShape(testCase.layout)],
    ['expected', layoutExpectedShape(testCase.expected)],
  ])
}

function layoutExpectedShape(expected: LayoutSnapshot): OrderedObject {
  return ordered([
    ['rows', expected.rows],
    ['maxLineWidth', expected.maxLineWidth],
    ['texts', expected.texts],
    ['sourceTexts', expected.sourceTexts],
    ['widths', expected.widths],
    ['breakKinds', expected.breakKinds],
    ['sourceRanges', expected.sourceRanges],
    ['overflow', expected.overflow.map(overflowShape)],
  ])
}

function overflowShape(overflow: { width: number, columns: number } | null): unknown {
  if (overflow === null) return null
  return ordered([
    ['width', overflow.width],
    ['columns', overflow.columns],
  ])
}

function richShape(testCase: RichGoldenCase): OrderedObject {
  return ordered([
    ['id', testCase.id],
    ['rawText', testCase.rawText],
    testCase.prepare === undefined ? null : ['prepare', prepareShape(testCase.prepare)],
    ['layout', layoutOptionsShape(testCase.layout)],
    ['expected', richExpectedShape(testCase.expected)],
  ])
}

function richExpectedShape(expected: RichExpected): OrderedObject {
  return ordered([
    ['visibleText', expected.visibleText],
    ['diagnosticCount', expected.diagnosticCount],
    ['spanKinds', expected.spanKinds],
    ['texts', expected.texts],
    ['fragmentTexts', expected.fragmentTexts],
  ])
}

function prepareShape(prepare: NonNullable<RichGoldenCase['prepare']>): OrderedObject {
  const record = prepare as Record<string, unknown>
  return ordered([
    'whiteSpace' in record ? ['whiteSpace', record['whiteSpace']] : null,
    'wordBreak' in record ? ['wordBreak', record['wordBreak']] : null,
    'widthProfile' in record ? ['widthProfile', widthProfileShape(record['widthProfile'] as WidthGoldenCase['widthProfile'])] : null,
    'tabSize' in record ? ['tabSize', record['tabSize']] : null,
  ])
}

function layoutOptionsShape(layout: LayoutGoldenCase['layout']): OrderedObject {
  const record = layout as Record<string, unknown>
  return ordered([
    ['columns', record['columns']],
    'startColumn' in record ? ['startColumn', record['startColumn']] : null,
  ])
}

function widthProfileShape(widthProfile: WidthGoldenCase['widthProfile']): unknown {
  const record = widthProfile as Record<string, unknown>
  return ordered([
    'ambiguousWidth' in record ? ['ambiguousWidth', record['ambiguousWidth']] : null,
  ])
}

function renderValue(value: unknown, indent: number): string {
  if (isOrderedObject(value)) return renderOrderedObject(value, indent)
  if (Array.isArray(value)) return renderArray(value, indent)
  return renderPrimitive(value)
}

function renderOrderedObject(object: OrderedObject, indent: number): string {
  if (object.entries.length === 0) return '{}'
  const childPad = '  '.repeat(indent + 1)
  const closePad = '  '.repeat(indent)
  const lines = object.entries.map(([key, child]) => `${childPad}${JSON.stringify(key)}: ${renderValue(child, indent + 1)}`)
  return `{\n${lines.join(',\n')}\n${closePad}}`
}

function renderArray(array: unknown[], indent: number): string {
  if (array.length === 0) return '[]'
  if (array.every(isInlineElement)) {
    return `[${array.map(element => renderInlineElement(element)).join(', ')}]`
  }
  const childPad = '  '.repeat(indent + 1)
  const closePad = '  '.repeat(indent)
  const lines = array.map(element => `${childPad}${renderValue(element, indent + 1)}`)
  return `[\n${lines.join(',\n')}\n${closePad}]`
}

function isInlineElement(value: unknown): boolean {
  if (isPrimitive(value)) return true
  return Array.isArray(value) && value.every(isPrimitive)
}

function renderInlineElement(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(element => renderPrimitive(element)).join(', ')}]`
  }
  return renderPrimitive(value)
}

function renderPrimitive(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new Error(`unsupported primitive: ${typeof value}`)
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isOrderedObject(value: unknown): value is OrderedObject {
  return typeof value === 'object' && value !== null && (value as { __ordered?: unknown }).__ordered === true
}

// 对比 stored（解析得到）与 regenerated（重算得到）两份 ReferenceFile 的 expected 字段，返回发生变化或新增的 case id。
export function diffReferenceCaseIds(stored: ReferenceFile, regenerated: ReferenceFile): {
  width: string[]
  layout: string[]
  rich: string[]
} {
  return {
    width: changedIds(stored.widthCases, regenerated.widthCases, item => item.id, item => item.expectedWidth),
    layout: changedIds(stored.layoutCases, regenerated.layoutCases, item => item.id, item => item.expected),
    rich: changedIds(stored.richCases, regenerated.richCases, item => item.id, item => item.expected),
  }
}

function changedIds<T>(
  stored: T[],
  regenerated: T[],
  idOf: (item: T) => string,
  expectedOf: (item: T) => unknown,
): string[] {
  const storedById = new Map(stored.map(item => [idOf(item), item]))
  const changed: string[] = []
  for (const item of regenerated) {
    const id = idOf(item)
    const before = storedById.get(id)
    if (before === undefined) {
      changed.push(id)
      continue
    }
    if (JSON.stringify(expectedOf(before)) !== JSON.stringify(expectedOf(item))) {
      changed.push(id)
    }
  }
  return changed
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
