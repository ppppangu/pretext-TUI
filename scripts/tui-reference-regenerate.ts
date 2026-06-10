// 补建说明：该文件为后续补建，用于在引擎行为更新后字节级再生成 accuracy/tui-reference.json（含 --check 漂移门禁）；当前进度：首版覆盖 width/layout/rich 重算、变更 id 摘要与 --check 字节对比。
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  computeLayoutExpected,
  computeRichExpected,
  computeWidthExpected,
  diffReferenceCaseIds,
  parseReferenceFile,
  serializeReferenceFile,
  type ReferenceFile,
} from './tui-reference-cases.js'

const root = process.cwd()
const referencePath = path.join(root, 'accuracy/tui-reference.json')
const checkOnly = process.argv.slice(2).includes('--check')

const current = await readFile(referencePath, 'utf8')
const stored = parseReferenceFile(JSON.parse(current))
const regenerated = regenerate(stored)
const serialized = serializeReferenceFile(regenerated)
const changed = diffReferenceCaseIds(stored, regenerated)
const changedIds = [...changed.width, ...changed.layout, ...changed.rich]

if (checkOnly) {
  if (serialized !== current) {
    if (changedIds.length > 0) {
      console.error(`TUI reference drift detected, changed ids: ${changedIds.join(', ')}`)
    } else {
      console.error('TUI reference drift detected: serialized bytes differ from accuracy/tui-reference.json')
    }
    process.exit(1)
  }
  console.log('TUI reference regenerate --check: no changes')
} else {
  await writeFile(referencePath, serialized)
  if (changedIds.length > 0) {
    console.log(`TUI reference regenerated, changed ids: ${changedIds.join(', ')}`)
  } else {
    console.log('TUI reference regenerated: no expected changes')
  }
}

function regenerate(file: ReferenceFile): ReferenceFile {
  return {
    metadata: file.metadata,
    widthCases: file.widthCases.map(testCase => ({
      ...testCase,
      expectedWidth: computeWidthExpected(testCase),
    })),
    layoutCases: file.layoutCases.map(testCase => ({
      ...testCase,
      expected: computeLayoutExpected(testCase),
    })),
    richCases: file.richCases.map(testCase => ({
      ...testCase,
      expected: computeRichExpected(testCase),
    })),
  }
}
