// 补建说明：该文件为后续补建，用于从当前引擎生成终端一致性套件的 expecteds 并写入 fixtures/conformance/*.json；当前进度：首版生成 manifest/width/wrap/offset 四份数据文件，--check 模式按字节回放对比并在漂移时退出 1。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  computeLayoutExpected,
  computeWidthExpected,
} from './tui-reference-cases.js'
import {
  conformanceOffsetInputs,
  conformanceWidthInputs,
  conformanceWrapInputs,
  type ConformanceOffsetInput,
} from './tui-conformance-kit-cases.js'
import {
  prepareTerminal,
  createTerminalLineIndex,
  createTerminalSourceOffsetIndex,
  projectTerminalSourceOffset,
} from '../src/public/index.js'
import type { LayoutSnapshot, WidthGoldenCase, LayoutGoldenCase } from '../tests/tui/validation-helpers.js'

const SCHEMA = 'pretext-tui-terminal-conformance-kit@1'
const PROFILE = 'terminal-unicode-narrow@1'
const UNICODE_VERSION = '17.0.0'
const GENERATED_BY = 'scripts/tui-conformance-kit-generate.ts'

const root = process.cwd()
const conformanceDir = path.join(root, 'fixtures/conformance')
const checkOnly = process.argv.slice(2).includes('--check')

export type OffsetExpected = {
  row: number
  column: number
  sourceOffset: number
  exact: boolean
  atEnd: boolean
}

export type WidthCaseRecord = WidthGoldenCase
export type WrapCaseRecord = LayoutGoldenCase
export type OffsetCaseRecord = ConformanceOffsetInput & { expected: OffsetExpected }

function metadata(note: string): Record<string, unknown> {
  return {
    note,
    schema: SCHEMA,
    profile: PROFILE,
    unicodeVersion: UNICODE_VERSION,
    generatedBy: GENERATED_BY,
  }
}

export function computeOffsetExpected(testCase: ConformanceOffsetInput): OffsetExpected {
  const prepared = prepareTerminal(testCase.text, testCase.prepare)
  const sourceIndex = createTerminalSourceOffsetIndex(prepared)
  const lineIndex = createTerminalLineIndex(prepared, {
    columns: testCase.columns,
    ...(testCase.startColumn === undefined ? {} : { startColumn: testCase.startColumn }),
  })
  const projection = projectTerminalSourceOffset(
    prepared,
    { sourceIndex, lineIndex },
    testCase.sourceOffset,
    testCase.bias === undefined ? undefined : { bias: testCase.bias },
  )
  return {
    row: projection.row,
    column: projection.column,
    sourceOffset: projection.sourceOffset,
    exact: projection.exact,
    atEnd: projection.atEnd,
  }
}

export function buildWidthCases(): WidthCaseRecord[] {
  return conformanceWidthInputs.map(input => ({
    ...input,
    expectedWidth: computeWidthExpected({ ...input, expectedWidth: 0 }),
  }))
}

export function buildWrapCases(): WrapCaseRecord[] {
  return conformanceWrapInputs.map(input => ({
    ...input,
    expected: computeLayoutExpected({ ...input, expected: {} as LayoutSnapshot }),
  }))
}

export function buildOffsetCases(): OffsetCaseRecord[] {
  return conformanceOffsetInputs.map(input => ({
    ...input,
    expected: computeOffsetExpected(input),
  }))
}

type DomainFile = { fileName: string, payload: Record<string, unknown> }

function buildDomainFiles(): DomainFile[] {
  const widthCases = buildWidthCases()
  const wrapCases = buildWrapCases()
  const offsetCases = buildOffsetCases()
  return [
    {
      fileName: 'manifest.json',
      payload: {
        metadata: metadata('补建说明：终端一致性套件清单；列出域文件与每个域所钉住的 terminal-contract 条款；当前进度：随 width/wrap/offset 种子用例同步生成。'),
        domains: [
          {
            file: 'width-cases.json',
            caseCount: widthCases.length,
            clauses: widthCases.map(testCase => testCase.id),
          },
          {
            file: 'wrap-cases.json',
            caseCount: wrapCases.length,
            clauses: wrapCases.map(testCase => testCase.id),
          },
          {
            file: 'offset-cases.json',
            caseCount: offsetCases.length,
            clauses: offsetCases.map(testCase => testCase.id),
          },
        ],
      },
    },
    {
      fileName: 'width-cases.json',
      payload: {
        metadata: metadata('补建说明：终端一致性套件 width 域；每个 case 的 expectedWidth 为 terminal-unicode-narrow@1 在 Unicode 17.0.0 下的整数 cell 宽度；当前进度：由生成器从引擎计算。'),
        cases: widthCases,
      },
    },
    {
      fileName: 'wrap-cases.json',
      payload: {
        metadata: metadata('补建说明：终端一致性套件 wrap 域；每个 case 的 expected 为引擎在给定 columns/startColumn 下的整行 layout 快照；当前进度：由生成器从引擎计算。'),
        cases: wrapCases,
      },
    },
    {
      fileName: 'offset-cases.json',
      payload: {
        metadata: metadata('补建说明：终端一致性套件 offset 域；每个 case 的 expected 仅保存可移植标量 {row,column,sourceOffset,exact,atEnd}；当前进度：由生成器从引擎计算。'),
        cases: offsetCases,
      },
    },
  ]
}

// Deterministic serialization for these NEW files: JSON.stringify with 2-space
// indent plus a trailing newline. Insertion order is fixed by the seed arrays, so
// re-running the generator is byte-stable.
function serialize(payload: Record<string, unknown>): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

// Only run generation/check when invoked as the entry point; importing this module
// for its case-building helpers (e.g. from the conformance-kit checker) must not
// write files or exit the process.
if (import.meta.main) {
  const domainFiles = buildDomainFiles()
  if (checkOnly) {
    const drifted: string[] = []
    for (const { fileName, payload } of domainFiles) {
      const filePath = path.join(conformanceDir, fileName)
      const expected = serialize(payload)
      let current: string | null = null
      try {
        current = await readFile(filePath, 'utf8')
      } catch {
        current = null
      }
      if (current !== expected) {
        drifted.push(fileName)
      }
    }
    if (drifted.length > 0) {
      console.error(`TUI conformance kit drift detected in: ${drifted.join(', ')}`)
      process.exit(1)
    }
    console.log('TUI conformance kit generate --check: no changes')
  } else {
    await mkdir(conformanceDir, { recursive: true })
    for (const { fileName, payload } of domainFiles) {
      await writeFile(path.join(conformanceDir, fileName), serialize(payload))
    }
    console.log(`TUI conformance kit generated ${domainFiles.length} files under fixtures/conformance/`)
  }
}
