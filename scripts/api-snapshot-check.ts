// 补建说明：该文件为后续补建，用于校验 Task 1 的公共 API/声明边界，避免通用 TUI 文本内核泄露内部 reader、segment 存储或 host-specific subpath；当前进度：首版读取构建后的 dist 与 package metadata 做 allowlist/forbidden-token 检查。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  expectedPackageExportKeys,
  expectedPackageExports,
  expectedPackageFiles,
  forbiddenPreparedHandleDeclarationTokens,
  forbiddenPublicDeclarationTokens,
  richPublicDeclarationExports,
  richPublicDeclarationForbiddenPatterns,
  richPublicDeclarationForbiddenTokens,
  richPublicRuntimeExports,
  terminalPublicDeclarationExports,
  terminalPublicRuntimeExports,
} from './public-api-contract.js'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
  exports?: Record<string, unknown>
  files?: string[]
}

const actualExportKeys = Object.keys(packageJson.exports ?? {}).sort()
assertJsonEqual(actualExportKeys, expectedPackageExportKeys, 'package export keys')
assertJsonEqual(packageJson.exports, expectedPackageExports, 'package export condition targets')
assertJsonEqual([...(packageJson.files ?? [])].sort(), [...expectedPackageFiles].sort(), 'package files allowlist')

type RuntimeModule = Record<string, unknown>

const publicFacadeRuntime = await import('../src/public-index.js') as RuntimeModule
const rootRuntime = await import('../src/index.js') as RuntimeModule
const richRuntime = await import('../src/terminal-rich-inline.js') as RuntimeModule
const builtRootRuntime = await importDistRuntime('index')
const builtTerminalRuntime = await importDistRuntime('terminal')
const builtRichRuntime = await importDistRuntime('terminal-rich-inline')

assertRuntimeExportNames(publicFacadeRuntime, terminalPublicRuntimeExports, 'canonical public facade runtime exports')
assertRuntimeExportNames(rootRuntime, terminalPublicRuntimeExports, 'root runtime exports')
assertRuntimeExportNames(builtRootRuntime, terminalPublicRuntimeExports, 'built root runtime exports')
assertRuntimeExportNames(builtTerminalRuntime, terminalPublicRuntimeExports, 'built terminal runtime exports')
assertRuntimeExportNames(richRuntime, richPublicRuntimeExports, 'rich runtime exports')
assertRuntimeExportNames(builtRichRuntime, richPublicRuntimeExports, 'built rich runtime exports')
assertSameRuntimeBindings(
  rootRuntime,
  publicFacadeRuntime,
  terminalPublicRuntimeExports,
  'src/index.ts must re-export the canonical src/public-index.ts facade',
)
assertSameRuntimeBindings(
  builtTerminalRuntime,
  builtRootRuntime,
  terminalPublicRuntimeExports,
  'dist/terminal.js must re-export dist/index.js without changing runtime bindings',
)

const indexDeclaration = await readDistDeclaration('index')
const terminalDeclaration = await readDistDeclaration('terminal')
const richDeclaration = await readDistDeclaration('terminal-rich-inline')

if (terminalDeclaration !== "export * from './index.js'\n") {
  throw new Error('dist/terminal.d.ts must re-export dist/index.d.ts so root and ./terminal share type identity')
}
assertNormalizedDeclarationEqual(
  'canonical source facade and built root declaration',
  await readSourceDeclaration('public-index'),
  indexDeclaration,
)
assertNormalizedDeclarationEqual(
  'canonical rich source facade and built rich declaration',
  await readSourceDeclaration('public-terminal-rich-inline'),
  richDeclaration,
)

for (const [name, declaration] of [
  ['index', indexDeclaration],
  ['terminal', terminalDeclaration],
  ['terminal-rich-inline', richDeclaration],
] as const) {
  assertDoesNotContain(name, declaration, forbiddenPublicDeclarationTokens)
}

assertDeclarationExports(indexDeclaration, terminalPublicDeclarationExports, 'index declaration exports')
assertDeclarationExports(richDeclaration, richPublicDeclarationExports, 'terminal-rich-inline declaration exports')
assertTypeBlockDoesNotContain(
  'index PreparedTerminalText',
  indexDeclaration,
  'PreparedTerminalText',
  forbiddenPreparedHandleDeclarationTokens,
)
assertTypeBlockContains(
  'index MaterializedTerminalLine',
  indexDeclaration,
  'MaterializedTerminalLine',
  ['sourceText: string'],
)
assertTypeBlockContains(
  'terminal-rich-inline TerminalRichFragment',
  richDeclaration,
  'TerminalRichFragment',
  ['sourceText: string'],
)

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

assertDoesNotContain('terminal-rich-inline', richDeclaration, richPublicDeclarationForbiddenTokens)
assertDoesNotMatch('terminal-rich-inline', richDeclaration, richPublicDeclarationForbiddenPatterns)

console.log('API snapshot check passed')

async function readDistDeclaration(name: string): Promise<string> {
  return readFile(path.join(root, 'dist', `${name}.d.ts`), 'utf8')
}

async function readSourceDeclaration(name: string): Promise<string> {
  return readFile(path.join(root, 'dist', 'internal', `${name}.d.ts`), 'utf8')
}

async function importDistRuntime(name: string): Promise<RuntimeModule> {
  return await import(pathToFileURL(path.join(root, 'dist', `${name}.js`)).href) as RuntimeModule
}

function assertRuntimeExportNames(module: RuntimeModule, expected: readonly string[], label: string): void {
  assertJsonEqual(Object.keys(module).sort(), expected, label)
}

function assertSameRuntimeBindings(
  actual: RuntimeModule,
  expected: RuntimeModule,
  names: readonly string[],
  label: string,
): void {
  for (const name of names) {
    if (actual[name] !== expected[name]) {
      throw new Error(`${label} binding mismatch: ${name}`)
    }
  }
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

function assertDeclarationExports(content: string, expected: readonly string[], label: string): void {
  const actual = declarationExportNames(content, label)
  assertJsonEqual(actual, expected, label)
}

function declarationExportNames(content: string, label: string): string[] {
  const names = new Set<string>()
  const unsupported: string[] = []
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('export')) continue
    if (/^export\s*\{\s*\}\s*;?$/u.test(trimmed)) continue

    const declaration = trimmed.match(/^export\s+(?:declare\s+)?(?:type|interface|function|const|class|enum)\s+([A-Za-z0-9_]+)/u)
    if (declaration !== null) {
      names.add(declaration[1]!)
      continue
    }

    const namedExport = trimmed.match(/^export\s*\{([^}]+)\}(?:\s+from\s+['"][^'"]+['"])?\s*;?$/u)
    if (namedExport !== null) {
      for (const item of namedExport[1]!.split(',')) {
        const name = item.trim().replace(/^type\s+/u, '')
        const alias = name.match(/^(?:[A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/u)
        names.add(alias?.[1] ?? name)
      }
      continue
    }

    unsupported.push(trimmed)
  }

  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported export declaration forms:\n${unsupported.join('\n')}`)
  }
  return [...names].sort()
}

function assertTypeBlockDoesNotContain(
  label: string,
  content: string,
  typeName: string,
  needles: readonly string[],
): void {
  const block = declarationTypeBlock(content, typeName)
  assertDoesNotContain(label, block, needles)
}

function assertTypeBlockContains(
  label: string,
  content: string,
  typeName: string,
  needles: readonly string[],
): void {
  const block = declarationTypeBlock(content, typeName)
  assertContains(label, block, needles)
}

function declarationTypeBlock(content: string, typeName: string): string {
  const pattern = new RegExp(`export type ${typeName} = [\\s\\S]*?\\n(?:export (?:declare |type )|declare const |$)`, 'u')
  const match = content.match(pattern)
  if (match === null) {
    throw new Error(`Missing declaration block for ${typeName}`)
  }
  return match[0]
}

function assertNormalizedDeclarationEqual(label: string, actual: string, expected: string): void {
  const normalizedActual = normalizeDeclaration(actual)
  const normalizedExpected = normalizeDeclaration(expected)
  if (normalizedActual !== normalizedExpected) {
    throw new Error(`${label} mismatch`)
  }
}

function normalizeDeclaration(content: string): string {
  return content
    .replaceAll('./public-index.js', './index.js')
    .replace(/\s+$/u, '')
}

function assertJsonEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch:\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`)
  }
}
