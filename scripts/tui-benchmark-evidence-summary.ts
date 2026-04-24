// 补建说明：该文件为后续补建，用于从 pretext-TUI benchmark evidence JSON 生成人工阅读 Markdown 摘要；当前进度：Task 4 首版，只从 JSON 派生且不复制动态性能数字。
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  readBenchmarkEvidenceReport,
  renderBenchmarkEvidenceSummaryMarkdown,
} from './tui-benchmark-evidence.js'

const args = process.argv.slice(2)
const input = args[0]

if (input === undefined || input === '--help') {
  console.log([
    'Usage: bun run scripts/tui-benchmark-evidence-summary.ts <report.json> [--out summary.md]',
    '',
    'The Markdown summary is generated from JSON only and intentionally avoids copied timing numbers.',
  ].join('\n'))
  process.exit(input === '--help' ? 0 : 1)
}

let output: string | undefined
for (let i = 1; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--out') {
    output = args[++i]
    if (output === undefined || output.startsWith('--')) throw new Error('--out requires a file path')
  } else {
    throw new Error(`Unknown summary option: ${String(arg)}`)
  }
}

const report = await readBenchmarkEvidenceReport(input)
const markdown = renderBenchmarkEvidenceSummaryMarkdown(report)

if (output === undefined) {
  console.log(markdown)
} else {
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, markdown)
  console.error(`Wrote benchmark evidence summary: ${output}`)
}

