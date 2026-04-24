// 补建说明：该文件为后续补建，用于校验 Task 1 的公共 API/声明边界，避免通用 TUI 文本内核泄露内部 reader、segment 存储或 host-specific subpath；当前进度：首版读取构建后的 dist 与 package metadata 做 allowlist/forbidden-token 检查。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
  exports?: Record<string, unknown>
  files?: string[]
}

const expectedExportKeys = ['.', './package.json', './terminal', './terminal-rich-inline']
const actualExportKeys = Object.keys(packageJson.exports ?? {}).sort()
assertJsonEqual(actualExportKeys, expectedExportKeys, 'package export keys')

const expectedFiles = [
  'CHANGELOG.md',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/terminal.js',
  'dist/terminal.d.ts',
  'dist/terminal-rich-inline.js',
  'dist/terminal-rich-inline.d.ts',
  'dist/internal',
]
assertJsonEqual(packageJson.files ?? [], expectedFiles, 'package files allowlist')

const rootRuntime = await import('../src/index.js') as Record<string, unknown>
const richRuntime = await import('../src/terminal-rich-inline.js') as Record<string, unknown>
const builtRootRuntime = await importDistRuntime('index')
const builtTerminalRuntime = await importDistRuntime('terminal')
const builtRichRuntime = await importDistRuntime('terminal-rich-inline')

const terminalRuntimeExports = [
  'TERMINAL_START_CURSOR',
  'appendTerminalCellFlow',
  'createTerminalLineIndex',
  'createTerminalPageCache',
  'createTerminalSourceOffsetIndex',
  'getTerminalCellFlowGeneration',
  'getTerminalCellFlowPrepared',
  'getTerminalCursorForSourceOffset',
  'getTerminalLineIndexMetadata',
  'getTerminalLineIndexStats',
  'getTerminalLinePage',
  'getTerminalLineRangeAtRow',
  'getTerminalPageCacheStats',
  'getTerminalSourceOffsetForCursor',
  'invalidateTerminalLineIndex',
  'invalidateTerminalPageCache',
  'layoutNextTerminalLineRange',
  'layoutTerminal',
  'materializeTerminalLinePage',
  'materializeTerminalLineRange',
  'materializeTerminalLineRanges',
  'measureTerminalLineIndexRows',
  'measureTerminalLineStats',
  'prepareTerminal',
  'prepareTerminalCellFlow',
  'walkTerminalLineRanges',
].sort()

const richRuntimeExports = [
  'layoutNextTerminalRichLineRange',
  'materializeTerminalRichLineRange',
  'prepareTerminalRichInline',
  'walkTerminalRichLineRanges',
].sort()

assertJsonEqual(Object.keys(rootRuntime).sort(), terminalRuntimeExports, 'root runtime exports')
assertJsonEqual(Object.keys(builtRootRuntime).sort(), terminalRuntimeExports, 'built root runtime exports')
assertJsonEqual(Object.keys(builtTerminalRuntime).sort(), terminalRuntimeExports, 'built terminal runtime exports')
assertJsonEqual(Object.keys(richRuntime).sort(), richRuntimeExports, 'rich runtime exports')
assertJsonEqual(Object.keys(builtRichRuntime).sort(), richRuntimeExports, 'built rich runtime exports')

const indexDeclaration = await readDistDeclaration('index')
const terminalDeclaration = await readDistDeclaration('terminal')
const richDeclaration = await readDistDeclaration('terminal-rich-inline')

if (terminalDeclaration !== "export * from './index.js'\n") {
  throw new Error('dist/terminal.d.ts must re-export dist/index.d.ts so root and ./terminal share type identity')
}

for (const [name, declaration] of [
  ['index', indexDeclaration],
  ['terminal', terminalDeclaration],
  ['terminal-rich-inline', richDeclaration],
] as const) {
  assertDoesNotContain(name, declaration, [
    './internal/',
    './layout.js',
    './analysis.js',
    './ansi-tokenize.js',
    './terminal-grapheme-geometry.js',
    './terminal-performance-counters.js',
    './terminal-prepared-reader.js',
    'PreparedTextWithSegments',
    'segments: string',
    'sourceStarts',
    'kinds:',
    'widths:',
    'tabStopAdvance',
    'getInternalPreparedTerminalText',
    'createPreparedTerminalText',
    'PreparedTerminalGeometry',
    'TerminalPerformanceCounter',
    'disableTerminalPerformanceCounters',
    'resetTerminalPerformanceCounters',
    'snapshotTerminalPerformanceCounters',
  ])
}

assertContains('index', indexDeclaration, [
  "kind: 'prepared-terminal-text@1'",
  'declare const preparedTerminalTextBrand: unique symbol',
  'export declare function prepareTerminal',
])

assertContains('terminal-rich-inline', richDeclaration, [
  "from './index.js'",
  'PreparedTerminalText',
  "TerminalRichSecurityProfileName = 'default' | 'transcript' | 'audit-strict'",
  'TerminalRichPrepareOptions',
  'TerminalRichMaterializeOptions',
  'TerminalRichCompleteness',
  'ansiText?: string',
  'redacted: true',
])

assertDoesNotContain('terminal-rich-inline', richDeclaration, [
  'sequence: string',
  'ansiText: string',
  'text?: string',
  './terminal-rich-policy.js',
])
assertDoesNotMatch('terminal-rich-inline', richDeclaration, [
  /\brawText\s*:\s*string\s*[;}]/u,
  /\bsequence\s*:\s*string\b/u,
  /\bansiText\s*:\s*string\b/u,
])

console.log('API snapshot check passed')

async function readDistDeclaration(name: string): Promise<string> {
  return readFile(path.join(root, 'dist', `${name}.d.ts`), 'utf8')
}

async function importDistRuntime(name: string): Promise<Record<string, unknown>> {
  return await import(pathToFileURL(path.join(root, 'dist', `${name}.js`)).href) as Record<string, unknown>
}

function assertContains(label: string, content: string, needles: readonly string[]): void {
  for (const needle of needles) {
    if (!content.includes(needle)) {
      throw new Error(`${label} declaration missing expected token: ${needle}`)
    }
  }
}

function assertDoesNotContain(label: string, content: string, needles: readonly string[]): void {
  for (const needle of needles) {
    if (content.includes(needle)) {
      throw new Error(`${label} declaration contains forbidden token: ${needle}`)
    }
  }
}

function assertDoesNotMatch(label: string, content: string, patterns: readonly RegExp[]): void {
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      throw new Error(`${label} declaration matches forbidden pattern: ${pattern}`)
    }
  }
}

function assertJsonEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch:\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`)
  }
}
