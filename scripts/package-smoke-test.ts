import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  allowedRootDistFiles,
  expectedPackageExportKeys,
  expectedPackageExports,
  expectedPackageFiles,
  forbiddenPackageSubpaths,
  forbiddenPreparedHandleDeclarationTokens,
  forbiddenRootTypeExports,
  requiredTarballFiles,
  richPublicRuntimeExports,
  richSidecarOnlyExports,
  terminalPublicRuntimeExports,
} from './public-api-contract.js'

const root = process.cwd()
const keepTemp = process.argv.includes('--keep-temp')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'pretext-package-smoke-'))
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
  name: string
  devDependencies?: Record<string, string>
  private?: boolean
  files?: string[]
  main?: string
  types?: string
  exports?: Record<string, unknown>
}
const packageName = packageJson.name
let succeeded = false

type PackageExportMap = {
  '.'?: { types?: string; import?: string; default?: string }
  './terminal'?: { types?: string; import?: string; default?: string }
  './terminal-rich-inline'?: { types?: string; import?: string; default?: string }
  './package.json'?: string
}

try {
  validatePackageMetadata()
  const tarballPath = await packPackage()
  verifyTarballSurface(tarballPath)
  await smokeJavaScriptEsm(tarballPath)
  await smokeTypeScript(tarballPath)
  succeeded = true
  console.log(`Package smoke test passed: ${tarballPath}`)
} catch (error) {
  console.error(`Package smoke test failed. Temp files kept at ${tempRoot}`)
  throw error
} finally {
  if (!keepTemp && succeeded) {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

function validatePackageMetadata(): void {
  if (!packageName) throw new Error('package.json name must be set')
  pinnedTypeScriptVersion()
  if (packageJson.private === true) throw new Error('package.json must not be private for publish smoke')
  if (packageJson.main !== './dist/index.js') throw new Error(`Unexpected main: ${packageJson.main}`)
  if (packageJson.types !== './dist/index.d.ts') throw new Error(`Unexpected types: ${packageJson.types}`)
  assertJsonEqual([...(packageJson.files ?? [])].sort(), [...expectedPackageFiles].sort(), 'package files allowlist')

  const exports = packageJson.exports as PackageExportMap | undefined
  const exportKeys = Object.keys(exports ?? {}).sort()
  assertJsonEqual(exportKeys, expectedPackageExportKeys, 'package export keys')
  assertJsonEqual(exports, expectedPackageExports, 'package export condition targets')
}

async function packPackage(): Promise<string> {
  const packDir = path.join(tempRoot, 'pack')
  await mkdir(packDir, { recursive: true })

  run(['npm', 'pack', '--pack-destination', packDir], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const entries = await readdir(packDir)
  const tarballs = entries.filter(entry => entry.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one tarball in ${packDir}, found ${tarballs.length}`)
  }
  return path.join(packDir, tarballs[0]!)
}

function verifyTarballSurface(tarballPath: string): void {
  const tarList = run(['tar', '-tf', tarballPath], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const files = new Set(
    tarList.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map(file => file.replace(/^package\//, '')),
  )

  for (const required of requiredTarballFiles) {
    if (!files.has(required)) throw new Error(`Tarball missing required file: ${required}`)
  }

  const allowedRootDistFileSet = new Set(allowedRootDistFiles)
  for (const file of files) {
    if (/^dist\/[^/]+\.(?:js|d\.ts)$/.test(file) && !allowedRootDistFileSet.has(file)) {
      throw new Error(`Tarball contains root-level internal dist file: ${file}`)
    }
    if (
      file.startsWith('src/') ||
      file.startsWith('scripts/') ||
      file.startsWith('docs/') ||
      file.startsWith('corpora/') ||
      file.startsWith('site/') ||
      file.startsWith('pages/') ||
      file === 'dist/rich-inline.js' ||
      file === 'dist/rich-inline.d.ts' ||
      file === 'dist/layout.js' ||
      file === 'dist/layout.d.ts' ||
      file === 'dist/analysis.js' ||
      file === 'dist/analysis.d.ts' ||
      file.includes('assets') ||
      file.includes('demos')
    ) {
      throw new Error(`Tarball contains forbidden file: ${file}`)
    }
  }
}

async function smokeJavaScriptEsm(tarballPath: string): Promise<void> {
  const projectDir = path.join(tempRoot, 'js-esm')
  await createProject(projectDir, {
    name: 'pretext-package-smoke-js-esm',
    private: true,
    type: 'module',
  })

  await installTarball(projectDir, tarballPath)
  await writeFile(
    path.join(projectDir, 'index.js'),
    [
      `import * as root from '${packageName}'`,
      `import * as terminal from '${packageName}/terminal'`,
      `import * as rich from '${packageName}/terminal-rich-inline'`,
      "import { createRequire } from 'node:module'",
      'const require = createRequire(import.meta.url)',
      `const terminalRuntimeExports = ${jsonForGeneratedSource(terminalPublicRuntimeExports)}`,
      `const richRuntimeExports = ${jsonForGeneratedSource(richPublicRuntimeExports)}`,
      "for (const [label, surface, expected] of [['root', root, terminalRuntimeExports], ['terminal', terminal, terminalRuntimeExports], ['rich', rich, richRuntimeExports]]) {",
      "  const actual = Object.keys(surface).sort()",
      "  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} exports changed: ${JSON.stringify(actual)}`)",
      '}',
      'for (const name of terminalRuntimeExports) {',
      "  if (root[name] !== terminal[name]) throw new Error(`root and ./terminal binding mismatch: ${name}`)",
      '}',
      'function assertOpaqueHandle(label, handle, forbiddenFields = []) {',
      "  if (!Object.isFrozen(handle)) throw new Error(`${label} handle is not frozen`)",
      "  const keys = Reflect.ownKeys(handle)",
      "  if (JSON.stringify(keys) !== JSON.stringify(['kind'])) throw new Error(`${label} handle leaked keys: ${JSON.stringify(keys)}`)",
      '  for (const field of forbiddenFields) {',
      "    if (field in handle) throw new Error(`${label} handle leaked ${field}`)",
      '  }',
      '}',
      `const forbiddenPreparedFields = ${jsonForGeneratedSource(forbiddenPreparedHandleDeclarationTokens)}`,
      "const prepared = root.prepareTerminal('x\\t世界\\nz', { whiteSpace: 'pre-wrap', tabSize: 4, widthProfile: { ambiguousWidth: 'wide' } })",
      "assertOpaqueHandle('prepared', prepared, forbiddenPreparedFields)",
      'const result = root.layoutTerminal(prepared, { columns: 8, startColumn: 2 })',
      "if (!Number.isInteger(result.rows) || result.rows < 1) throw new Error('bad rows')",
      'const stats = root.measureTerminalLineStats(prepared, { columns: 8, startColumn: 2 })',
      "if (stats.rows !== result.rows) throw new Error('bad stats')",
      'const lines = []',
      'root.walkTerminalLineRanges(prepared, { columns: 8, startColumn: 2 }, line => lines.push(line))',
      "if (lines.length !== result.rows) throw new Error('walk/layout mismatch')",
      'const next = root.layoutNextTerminalLineRange(prepared, root.TERMINAL_START_CURSOR, { columns: 8, startColumn: 2 })',
      "if (next === null) throw new Error('bad next line')",
      'const materialized = root.materializeTerminalLineRange(prepared, next)',
      "if (typeof materialized.text !== 'string') throw new Error('bad materialization')",
      'const sourceIndex = root.createTerminalSourceOffsetIndex(prepared)',
      "assertOpaqueHandle('source index', sourceIndex)",
      'const lookup = root.getTerminalCursorForSourceOffset(prepared, sourceIndex, 1)',
      "if (root.getTerminalSourceOffsetForCursor(prepared, lookup.cursor, sourceIndex) !== lookup.sourceOffset) throw new Error('bad source lookup')",
      'const lineIndex = root.createTerminalLineIndex(prepared, { columns: 8, startColumn: 2, anchorInterval: 2 })',
      "assertOpaqueHandle('line index', lineIndex)",
      "if (root.getTerminalLineIndexMetadata(lineIndex).columns !== 8) throw new Error('bad line index metadata')",
      "if (root.getTerminalLineIndexStats(lineIndex).anchorCount < 1) throw new Error('bad line index stats')",
      'const pageCache = root.createTerminalPageCache(prepared, lineIndex, { pageSize: 2, maxPages: 2 })',
      "assertOpaqueHandle('page cache', pageCache)",
      'const page = root.getTerminalLinePage(prepared, pageCache, lineIndex, { startRow: 0, rowCount: 2 })',
      "if (root.materializeTerminalLinePage(prepared, page).length !== page.lines.length) throw new Error('bad page materialization')",
      "if (root.materializeTerminalLineRanges(prepared, page.lines).length !== page.lines.length) throw new Error('bad range materialization')",
      'const bundle = root.createTerminalLayoutBundle(prepared, { columns: 8, startColumn: 2, anchorInterval: 2, pageSize: 2, maxPages: 2 })',
      "assertOpaqueHandle('layout bundle', bundle)",
      'const bundlePage = root.getTerminalLayoutBundlePage(prepared, bundle, { startRow: 0, rowCount: 2 })',
      "if (root.materializeTerminalLinePage(prepared, bundlePage).length !== bundlePage.lines.length) throw new Error('bad bundle page materialization')",
      "if (root.projectTerminalSourceOffset(prepared, bundle, 1).sourceOffset !== root.projectTerminalSourceOffset(prepared, { sourceIndex, lineIndex }, 1).sourceOffset) throw new Error('bad bundle projection')",
      "const rangeIndex = root.createTerminalRangeIndex([{ id: 'block', kind: 'generic', sourceStart: 0, sourceEnd: 3, tags: ['a'], data: { payloadId: 'p1' } }, { id: 'point', kind: 'generic-marker', sourceStart: 1, sourceEnd: 1 }])",
      "assertOpaqueHandle('range index', rangeIndex)",
      "const pointRanges = root.getTerminalRangesAtSourceOffset(rangeIndex, 1)",
      "if (pointRanges.map(range => range.id).join(',') !== 'block,point') throw new Error('bad range point lookup')",
      "if (!Object.isFrozen(pointRanges[0]) || !Object.isFrozen(pointRanges[0].tags) || !Object.isFrozen(pointRanges[0].data)) throw new Error('range results must be frozen')",
      "if (root.getTerminalRangesForSourceRange(rangeIndex, { sourceStart: 1, sourceEnd: 2 }).length !== 2) throw new Error('bad range overlap lookup')",
      "try { root.getTerminalRangesAtSourceOffset(Object.freeze({ kind: 'terminal-range-index@1' }), 0); throw new Error('bad forged range index accepted') } catch (error) { if (error.message === 'bad forged range index accepted') throw error }",
      "let activeRangesGetterCount = 0",
      "const activeRanges = []",
      "Object.defineProperty(activeRanges, '0', { enumerable: true, get() { activeRangesGetterCount++; throw new Error('range getter should not execute') } })",
      "try { root.createTerminalRangeIndex(activeRanges); throw new Error('bad active range array accepted') } catch (error) { if (error.message === 'bad active range array accepted' || error.message === 'range getter should not execute') throw error }",
      "if (activeRangesGetterCount !== 0) throw new Error('active range array getter executed')",
      "let proxyTrapCount = 0",
      "const proxiedRangeData = new Proxy({ value: true }, { getPrototypeOf(target) { proxyTrapCount++; return Reflect.getPrototypeOf(target) }, ownKeys(target) { proxyTrapCount++; return Reflect.ownKeys(target) }, getOwnPropertyDescriptor(target, property) { proxyTrapCount++; return Reflect.getOwnPropertyDescriptor(target, property) } })",
      "try { root.createTerminalRangeIndex([{ id: 'proxy', kind: 'generic', sourceStart: 0, sourceEnd: 1, data: proxiedRangeData }]); throw new Error('bad proxy range data accepted') } catch (error) { if (error.message === 'bad proxy range data accepted') throw error }",
      "if (proxyTrapCount !== 0) throw new Error('proxy range data traps executed')",
      "const search = root.createTerminalSearchSession(prepared, '世界', { indexes: bundle })",
      "assertOpaqueHandle('search session', search, ['matches', 'next', 'previous', 'all'])",
      "if (root.getTerminalSearchSessionMatchCount(search) !== 1) throw new Error('bad search count')",
      "const searchMatches = root.getTerminalSearchMatchesForSourceRange(search)",
      "if (searchMatches.length !== 1 || searchMatches[0].matchText !== '世界') throw new Error('bad search match')",
      "if (!Object.isFrozen(searchMatches[0]) || searchMatches[0].kind !== 'terminal-search-match@1') throw new Error('search match must be frozen data')",
      "if (!searchMatches[0].projection || searchMatches[0].row !== undefined || searchMatches[0].column !== undefined || searchMatches[0].highlight !== undefined || searchMatches[0].active !== undefined) throw new Error('search match boundary drift')",
      "if (root.getTerminalSearchMatchAfterSourceOffset(search, 0)?.sourceStart !== searchMatches[0].sourceStart) throw new Error('bad search after')",
      "if (root.getTerminalSearchMatchBeforeSourceOffset(search, prepared.sourceLength ?? 999)?.sourceStart !== searchMatches[0].sourceStart) throw new Error('bad search before')",
      "try { root.getTerminalSearchSessionMatchCount(Object.freeze({ kind: 'terminal-search-session@1' })); throw new Error('bad forged search session accepted') } catch (error) { if (error.message === 'bad forged search session accepted') throw error }",
      "const selectionPrepared = root.prepareTerminal('hello world', { whiteSpace: 'normal' })",
      "const selectionBundle = root.createTerminalLayoutBundle(selectionPrepared, { columns: 5 })",
      "const selection = root.createTerminalSelectionFromCoordinates(selectionPrepared, selectionBundle, { anchor: { row: 0, column: 1 }, focus: { row: 1, column: 3 }, mode: 'linear' })",
      "if (selection === null || selection.kind !== 'terminal-selection@1' || selection.direction !== 'forward') throw new Error('bad selection')",
      "if (!Object.isFrozen(selection) || selection.clipboard !== undefined || selection.highlight !== undefined || selection.active !== undefined) throw new Error('selection boundary drift')",
      "const extracted = root.extractTerminalSelection(selectionPrepared, selection, { indexes: selectionBundle })",
      "if (extracted.kind !== 'terminal-selection-extraction@1' || extracted.sourceText !== 'ello wor' || extracted.visibleText !== 'ello\\nwor') throw new Error('bad selection extraction')",
      "if (!Object.isFrozen(extracted) || extracted.clipboardText !== undefined || extracted.highlight !== undefined || extracted.active !== undefined) throw new Error('selection extraction boundary drift')",
      "const flow = root.prepareTerminalCellFlow('hello\\nworld', { whiteSpace: 'pre-wrap' })",
      "assertOpaqueHandle('cell flow', flow)",
      "const flowIndex = root.createTerminalLineIndex(root.getTerminalCellFlowPrepared(flow), { columns: 8, generation: root.getTerminalCellFlowGeneration(flow) })",
      "const flowCache = root.createTerminalPageCache(root.getTerminalCellFlowPrepared(flow), flowIndex, { pageSize: 2, maxPages: 2 })",
      "root.getTerminalLinePage(root.getTerminalCellFlowPrepared(flow), flowCache, flowIndex, { startRow: 0, rowCount: 2 })",
      "const flowBundle = root.createTerminalLayoutBundle(root.getTerminalCellFlowPrepared(flow), { columns: 8, generation: root.getTerminalCellFlowGeneration(flow), pageSize: 2, maxPages: 2 })",
      "root.getTerminalLayoutBundlePage(root.getTerminalCellFlowPrepared(flow), flowBundle, { startRow: 0, rowCount: 2 })",
      "const appended = root.appendTerminalCellFlow(flow, '\\nnext')",
      "if (root.getTerminalCellFlowGeneration(appended.flow) !== root.getTerminalCellFlowGeneration(flow) + 1) throw new Error('bad append generation')",
      "const lineInvalidation = root.invalidateTerminalLineIndex(root.getTerminalCellFlowPrepared(appended.flow), flowIndex, appended.invalidation)",
      "root.invalidateTerminalPageCache(flowCache, lineInvalidation)",
      "const bundleInvalidation = root.invalidateTerminalLayoutBundle(root.getTerminalCellFlowPrepared(appended.flow), flowBundle, appended.invalidation)",
      "if (bundleInvalidation.previousGeneration !== root.getTerminalCellFlowGeneration(flow)) throw new Error('bad bundle invalidation generation')",
      "if (typeof root.projectTerminalSourceOffset(root.getTerminalCellFlowPrepared(appended.flow), flowBundle, 1).row !== 'number') throw new Error('bad bundle projection after invalidation')",
      "if (root.getTerminalPageCacheStats(flowCache).invalidatedPages < 1) throw new Error('bad page invalidation')",
      "const richPrepared = rich.prepareTerminalRichInline('\\x1b[31mred\\x1b[0m')",
      "const richLine = rich.layoutNextTerminalRichLineRange(richPrepared, root.TERMINAL_START_CURSOR, { columns: 10 })",
      "if (richLine === null) throw new Error('bad rich next line')",
      "if ('rawText' in richPrepared) throw new Error('rich prepared leaked rawText')",
      "if (richPrepared.raw !== undefined) throw new Error('default rich profile retained raw')",
      "try { rich.materializeTerminalRichLineRange(Object.freeze({ ...richPrepared, spans: [] }), richLine); throw new Error('bad forged rich handle accepted') } catch (error) { if (error.message === 'bad forged rich handle accepted') throw error }",
      "if (rich.materializeTerminalRichLineRange(richPrepared, richLine).ansiText !== undefined) throw new Error('rich ansi output must be opt-in')",
      "if (!rich.materializeTerminalRichLineRange(richPrepared, richLine, { ansiText: 'sgr' }).ansiText.includes('\\x1b[31m')) throw new Error('bad rich ansi output')",
      "const richBundle = root.createTerminalLayoutBundle(richPrepared.prepared, { columns: 10 })",
      "const richSelection = root.createTerminalSelectionFromCoordinates(richPrepared.prepared, richBundle, { anchor: { row: 0, column: 0 }, focus: { row: 0, column: 3 } })",
      "const richExtraction = rich.extractTerminalRichSelection(richPrepared, richSelection, { indexes: richBundle })",
      "if (richExtraction.richFragments[0]?.style?.fg !== 'ansi:31' || richExtraction.richFragments.some(fragment => fragment.text.includes('\\x1b'))) throw new Error('bad rich selection extraction')",
      "const richUnsafe = rich.prepareTerminalRichInline('\\x1b]8;;javascript:alert(1)\\x1b\\\\x')",
      "if (!richUnsafe.diagnostics.some(diagnostic => diagnostic.redacted && !('sequence' in diagnostic))) throw new Error('bad rich diagnostic redaction')",
      "if (richUnsafe.diagnostics.some(diagnostic => diagnostic.escapedSample !== undefined)) throw new Error('default diagnostics leaked escaped samples')",
      "try { rich.prepareTerminalRichInline('x', { profile: 'named-host' }); throw new Error('bad profile accepted') } catch (error) { if (error.message === 'bad profile accepted') throw error }",
      "const packageJson = require(`${process.env.PACKAGE_NAME}/package.json`)",
      "if (packageJson.name !== process.env.PACKAGE_NAME) throw new Error('bad package.json export')",
      `const forbiddenPackageSubpaths = ${jsonForGeneratedSource(forbiddenPackageSubpaths)}`,
      'for (const bad of forbiddenPackageSubpaths) {',
      '  try {',
      '    await import(`${process.env.PACKAGE_NAME}/${bad}`)',
      '    throw new Error(`unexpected import success for ${bad}`)',
      '  } catch (error) {',
      "    if (error.message?.startsWith('unexpected import success')) throw error",
      "    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error.code !== 'ERR_MODULE_NOT_FOUND') throw error",
      '  }',
      '}',
      "console.log('js-esm ok')",
      '',
    ].join('\n'),
  )

  run(['node', 'index.js'], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { PACKAGE_NAME: packageName },
  })
}

async function smokeTypeScript(tarballPath: string): Promise<void> {
  const projectDir = path.join(tempRoot, 'ts')
  await createProject(projectDir, {
    name: 'pretext-package-smoke-ts',
    private: true,
    type: 'module',
    devDependencies: {
      typescript: pinnedTypeScriptVersion(),
    },
  })

  await installTarball(projectDir, tarballPath)
  await writeFile(
    path.join(projectDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'esnext',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ['index.ts', 'recipes.ts'],
    }, null, 2) + '\n',
  )
  await writeFile(
    path.join(projectDir, 'tsconfig.recipes-runtime.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'esnext',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: false,
        outDir: '.recipe-runtime',
        skipLibCheck: false,
      },
      include: ['recipes.ts'],
    }, null, 2) + '\n',
  )

  // Keep this intentionally smaller than docs/recipes: it is a package consumer gate,
  // not a second prose source for the adoption recipes.
  await writeFile(
    path.join(projectDir, 'recipes.ts'),
    [
      `import { createTerminalLayoutBundle, createTerminalLineIndex, createTerminalPageCache, createTerminalSourceOffsetIndex, getTerminalLayoutBundlePage, getTerminalLinePage, getTerminalLineRangeAtRow, materializeTerminalLinePage, prepareTerminal, projectTerminalCoordinate, projectTerminalSourceOffset, projectTerminalSourceRange, type MaterializedTerminalLine, type TerminalProjectionIndexes, type TerminalSourceRangeProjection } from '${packageName}'`,
      `import { materializeTerminalRichLineRange, prepareTerminalRichInline, type MaterializedTerminalRichLine } from '${packageName}/terminal-rich-inline'`,
      '',
      'type HostBlock = { id: string; text: string }',
      'type BlockRange = { block: HostBlock; sourceStart: number; sourceEnd: number }',
      '',
      'function buildRecipeSource(blocks: readonly HostBlock[]): { source: string; ranges: readonly BlockRange[] } {',
      "  let source = ''",
      '  const ranges: BlockRange[] = []',
      '  for (const block of blocks) {',
      "    if (source.length > 0) source += '\\n'",
      '    const sourceStart = source.length',
      '    source += block.text',
      '    ranges.push({ block, sourceStart, sourceEnd: source.length })',
      '  }',
      '  return { source, ranges }',
      '}',
      '',
      'export function recipeTranscriptViewport(blocks: readonly HostBlock[], columns: number): readonly MaterializedTerminalLine[] {',
      '  const { source } = buildRecipeSource(blocks)',
      "  const prepared = prepareTerminal(source, { whiteSpace: 'pre-wrap' })",
      '  const bundle = createTerminalLayoutBundle(prepared, { columns, anchorInterval: 64, pageSize: 64, maxPages: 4 })',
      '  const page = getTerminalLayoutBundlePage(prepared, bundle, { startRow: 0, rowCount: 12 })',
      '  return materializeTerminalLinePage(prepared, page)',
      '}',
      '',
      'export function recipeResizeAnchor(text: string, previousColumns: number, nextColumns: number): number {',
      "  const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })",
      '  const previousIndex = createTerminalLineIndex(prepared, { columns: previousColumns })',
      '  const topSourceOffset = getTerminalLineRangeAtRow(prepared, previousIndex, 0)?.sourceStart ?? 0',
      '  const nextIndex = createTerminalLineIndex(prepared, { columns: nextColumns })',
      '  const sourceIndex = createTerminalSourceOffsetIndex(prepared)',
      '  return projectTerminalSourceOffset(prepared, { sourceIndex, lineIndex: nextIndex }, topSourceOffset, { bias: "after" }).row',
      '}',
      '',
      'export function recipeSourceMapping(text: string, columns: number, sourceOffset: number): number {',
      "  const prepared = prepareTerminal(text, { whiteSpace: 'pre-wrap' })",
      '  const sourceIndex = createTerminalSourceOffsetIndex(prepared)',
      '  const lineIndex = createTerminalLineIndex(prepared, { columns })',
      '  const indexes = { sourceIndex, lineIndex } satisfies TerminalProjectionIndexes',
      '  projectTerminalCoordinate(prepared, indexes, { row: 0, column: 0 })?.sourceOffset satisfies number | undefined',
      '  projectTerminalSourceRange(prepared, indexes, { sourceStart: 0, sourceEnd: sourceOffset }) satisfies TerminalSourceRangeProjection',
      '  return projectTerminalSourceOffset(prepared, indexes, sourceOffset, { bias: "closest" }).row',
      '}',
      '',
      'export function recipeRichLog(rawLog: string, columns: number): readonly MaterializedTerminalRichLine[] {',
      "  const rich = prepareTerminalRichInline(rawLog, { whiteSpace: 'pre-wrap', profile: 'transcript', unsupportedControlMode: 'sanitize', rawRetention: 'fingerprint' })",
      '  const index = createTerminalLineIndex(rich.prepared, { columns, anchorInterval: 64 })',
      '  const cache = createTerminalPageCache(rich.prepared, index, { pageSize: 64, maxPages: 4 })',
      '  const page = getTerminalLinePage(rich.prepared, cache, index, { startRow: 0, rowCount: 12 })',
      '  return page.lines.map(line => materializeTerminalRichLineRange(rich, line))',
      '}',
      '',
      "recipeTranscriptViewport([{ id: 'a', text: 'hello\\nworld' }], 12)[0]?.text satisfies string | undefined",
      "recipeResizeAnchor('hello world', 8, 12) satisfies number",
      "recipeSourceMapping('hello world', 8, 3) satisfies number",
      "if (recipeSourceMapping('hello world', 6, 'hello world'.length) !== 1) throw new Error('recipe EOF source mapping should resolve to last row')",
      "recipeRichLog('\\x1b[31mred\\x1b[0m', 12)[0]?.fragments[0]?.text satisfies string | undefined",
      '',
    ].join('\n'),
  )

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { TERMINAL_START_CURSOR, appendTerminalCellFlow, createTerminalLayoutBundle, createTerminalLineIndex, createTerminalPageCache, createTerminalRangeIndex, createTerminalSearchSession, createTerminalSelectionFromCoordinates, createTerminalSourceOffsetIndex, extractTerminalSelection, extractTerminalSourceRange, getTerminalCellFlowGeneration, getTerminalCellFlowPrepared, getTerminalCursorForSourceOffset, getTerminalLayoutBundlePage, getTerminalLineIndexMetadata, getTerminalLineIndexStats, getTerminalLinePage, getTerminalLineRangeAtRow, getTerminalPageCacheStats, getTerminalRangesAtSourceOffset, getTerminalRangesForSourceRange, getTerminalSearchMatchAfterSourceOffset, getTerminalSearchMatchBeforeSourceOffset, getTerminalSearchMatchesForSourceRange, getTerminalSearchSessionMatchCount, getTerminalSourceOffsetForCursor, invalidateTerminalLayoutBundle, invalidateTerminalLineIndex, invalidateTerminalPageCache, layoutNextTerminalLineRange, materializeTerminalLinePage, materializeTerminalLineRange, materializeTerminalLineRanges, measureTerminalLineIndexRows, measureTerminalLineStats, layoutTerminal, prepareTerminal, prepareTerminalCellFlow, projectTerminalCoordinate, projectTerminalCursor, projectTerminalRow, projectTerminalSourceOffset, projectTerminalSourceRange, walkTerminalLineRanges, type PreparedTerminalCellFlow, type TerminalAppendInvalidation, type TerminalAppendOptions, type TerminalAppendResult, type TerminalAppendStrategy, type TerminalCellCoordinate, type TerminalCoordinateProjection, type TerminalCoordinateProjectionRequest, type TerminalCoordinateSourceProjection, type TerminalFixedLayoutOptions, type TerminalLayoutBundle, type TerminalLayoutBundleInvalidation, type TerminalLayoutBundleInvalidationResult, type TerminalLayoutBundleOptions, type TerminalLineIndex, type TerminalLineIndexInvalidation, type TerminalLineIndexInvalidationResult, type TerminalLineIndexMetadata, type TerminalLineIndexStats, type TerminalLinePage, type TerminalLinePageRequest, type TerminalLineRange, type TerminalPageCache, type TerminalPageCacheOptions, type TerminalPageCacheStats, type TerminalProjectionIndexInput, type TerminalProjectionIndexes, type TerminalRange, type TerminalRangeData, type TerminalRangeIndex, type TerminalRangeQuery, type TerminalRowProjection, type TerminalSearchMatch, type TerminalSearchMode, type TerminalSearchOptions, type TerminalSearchQuery, type TerminalSearchRangeIndexScope, type TerminalSearchScope, type TerminalSearchSession, type TerminalSearchSourceRangeQuery, type TerminalSelection, type TerminalSelectionCoordinate, type TerminalSelectionDirection, type TerminalSelectionExtraction, type TerminalSelectionExtractionFragment, type TerminalSelectionExtractionOptions, type TerminalSelectionMode, type TerminalSelectionRequest, type TerminalSourceLookupResult, type TerminalSourceOffsetBias, type TerminalSourceOffsetIndex, type TerminalSourceProjection, type TerminalSourceProjectionOptions, type TerminalSourceRangeExtractionRequest, type TerminalSourceRangeProjection, type TerminalSourceRangeProjectionFragment, type TerminalSourceRangeProjectionRequest } from '${packageName}'`,
      `import { layoutNextTerminalLineRange as layoutNextFromSubpath, layoutTerminal as layoutFromSubpath, materializeTerminalLineRange as materializeFromSubpath, prepareTerminal as prepareFromSubpath, projectTerminalSourceOffset as projectSourceFromSubpath } from '${packageName}/terminal'`,
      `import { extractTerminalRichSelection, extractTerminalRichSourceRange, prepareTerminalRichInline, layoutNextTerminalRichLineRange, materializeTerminalRichLineRange, walkTerminalRichLineRanges, type TerminalRichDiagnostic, type TerminalRichMaterializeOptions, type TerminalRichPrepareOptions, type TerminalRichSecurityProfileName, type TerminalRichSelectionExtraction, type TerminalRichSelectionExtractionFragment } from '${packageName}/terminal-rich-inline'`,
      "const prepared = prepareTerminal('hello 世界', { whiteSpace: 'pre-wrap', tabSize: 4 })",
      'const result = layoutTerminal(prepared, { columns: 8 })',
      'result.rows satisfies number',
      'measureTerminalLineStats(prepared, { columns: 8 }).rows satisfies number',
      'const lines: TerminalLineRange[] = []',
      'walkTerminalLineRanges(prepared, { columns: 8 }, line => lines.push(line))',
      'const firstRoot = layoutNextTerminalLineRange(prepared, TERMINAL_START_CURSOR, { columns: 8 })',
      'if (firstRoot) materializeTerminalLineRange(prepared, firstRoot).text satisfies string',
      'const sourceIndex = createTerminalSourceOffsetIndex(prepared)',
      'sourceIndex satisfies TerminalSourceOffsetIndex',
      "const sourceBias: TerminalSourceOffsetBias = 'closest'",
      'sourceBias satisfies TerminalSourceOffsetBias',
      'getTerminalCursorForSourceOffset(prepared, sourceIndex, 1).sourceOffset satisfies number',
      'getTerminalCursorForSourceOffset(prepared, sourceIndex, 1) satisfies TerminalSourceLookupResult',
      'getTerminalSourceOffsetForCursor(prepared, getTerminalCursorForSourceOffset(prepared, sourceIndex, 1).cursor, sourceIndex) satisfies number',
      'const lineIndex = createTerminalLineIndex(prepared, { columns: 8, anchorInterval: 4 })',
      'lineIndex satisfies TerminalLineIndex',
      'const fixedOptions: TerminalFixedLayoutOptions = { columns: 8, anchorInterval: 4 }',
      'fixedOptions satisfies TerminalFixedLayoutOptions',
      'type ProjectionTypeSmoke = { cell: TerminalCellCoordinate; coordinate: TerminalCoordinateProjection; coordinateRequest: TerminalCoordinateProjectionRequest; coordinateSource: TerminalCoordinateSourceProjection; indexes: TerminalProjectionIndexes; options: TerminalSourceProjectionOptions; range: TerminalSourceRangeProjection; rangeFragment: TerminalSourceRangeProjectionFragment; rangeRequest: TerminalSourceRangeProjectionRequest; row: TerminalRowProjection; source: TerminalSourceProjection }',
      'const projectionTypeSmoke = null as unknown as ProjectionTypeSmoke',
      'void projectionTypeSmoke',
      'const projection = projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, 1, sourceBias)',
      'projection satisfies TerminalCoordinateProjection',
      "if (projection.kind !== 'terminal-coordinate-projection@1') throw new Error('projection kind mismatch')",
      "if (projection.coordinate.row !== projection.row || projection.coordinate.column !== projection.column) throw new Error('projection coordinate mirror mismatch')",
      'projectTerminalCursor(prepared, sourceIndex, lineIndex, projection.cursor) satisfies TerminalSourceProjection',
      'projectTerminalRow(prepared, lineIndex, projection.row) satisfies TerminalRowProjection | null',
      'projectTerminalCoordinate(prepared, { sourceIndex, lineIndex }, { row: 0, column: 0 }) satisfies TerminalCoordinateSourceProjection | null',
      'projectTerminalSourceRange(prepared, { sourceIndex, lineIndex }, { sourceStart: 0, sourceEnd: 2 }) satisfies TerminalSourceRangeProjection',
      'projectSourceFromSubpath(prepared, { sourceIndex, lineIndex }, 1, { bias: sourceBias }).column satisfies number',
      'getTerminalLineIndexMetadata(lineIndex) satisfies TerminalLineIndexMetadata',
      'getTerminalLineIndexMetadata(lineIndex).columns satisfies number',
      'getTerminalLineIndexStats(lineIndex) satisfies TerminalLineIndexStats',
      'measureTerminalLineIndexRows(prepared, lineIndex) satisfies number',
      'getTerminalLineRangeAtRow(prepared, lineIndex, 0)?.width satisfies number | undefined',
      'const cacheOptions: TerminalPageCacheOptions = { pageSize: 2, maxPages: 2 }',
      'const cache = createTerminalPageCache(prepared, lineIndex, cacheOptions)',
      'cache satisfies TerminalPageCache',
      'const pageRequest: TerminalLinePageRequest = { startRow: 0, rowCount: 2 }',
      'const page = getTerminalLinePage(prepared, cache, lineIndex, pageRequest)',
      'page satisfies TerminalLinePage',
      'materializeTerminalLinePage(prepared, page)[0]?.text satisfies string | undefined',
      'materializeTerminalLineRanges(prepared, page.lines)[0]?.text satisfies string | undefined',
      'const bundleOptions: TerminalLayoutBundleOptions = { columns: 8, anchorInterval: 4, pageSize: 2, maxPages: 2 }',
      'const bundle = createTerminalLayoutBundle(prepared, bundleOptions)',
      'bundle satisfies TerminalLayoutBundle',
      'const projectionInput: TerminalProjectionIndexInput = bundle',
      'projectionInput satisfies TerminalProjectionIndexInput',
      'const bundlePage = getTerminalLayoutBundlePage(prepared, bundle, pageRequest)',
      'bundlePage satisfies TerminalLinePage',
      'materializeTerminalLinePage(prepared, bundlePage)[0]?.text satisfies string | undefined',
      'projectTerminalSourceOffset(prepared, bundle, 1, { bias: sourceBias }).column satisfies number',
      'projectTerminalCursor(prepared, bundle, projection.cursor).row satisfies number',
      'projectTerminalCoordinate(prepared, bundle, { row: 0, column: 0 }) satisfies TerminalCoordinateSourceProjection | null',
      'projectTerminalSourceRange(prepared, bundle, { sourceStart: 0, sourceEnd: 2 }) satisfies TerminalSourceRangeProjection',
      'projectTerminalRow(prepared, bundle, 0) satisfies TerminalRowProjection | null',
      "const terminalRangeData: TerminalRangeData = { payload: ['p1', 1] }",
      "const terminalRange: TerminalRange = { id: 'range', kind: 'generic', sourceStart: 0, sourceEnd: 2, tags: ['tag'], data: terminalRangeData }",
      'const terminalRangeQuery: TerminalRangeQuery = { sourceStart: 0, sourceEnd: 2 }',
      'const rangeIndex = createTerminalRangeIndex([terminalRange])',
      'rangeIndex satisfies TerminalRangeIndex',
      'getTerminalRangesAtSourceOffset(rangeIndex, 1)[0]?.id satisfies string | undefined',
      'getTerminalRangesForSourceRange(rangeIndex, terminalRangeQuery)[0]?.kind satisfies string | undefined',
      "const terminalSearchMode: TerminalSearchMode = 'literal'",
      "const terminalSearchQuery: TerminalSearchQuery = 'hello'",
      'const terminalSearchRangeQuery: TerminalSearchSourceRangeQuery = { sourceStart: 0, sourceEnd: 5, limit: 1 }',
      'const terminalSearchRangeScope: TerminalSearchRangeIndexScope = { rangeIndex, sourceStart: 0, sourceEnd: 2 }',
      'terminalSearchRangeScope satisfies TerminalSearchScope',
      'const terminalSearchOptions: TerminalSearchOptions = { mode: terminalSearchMode, caseSensitive: false, indexes: bundle, scope: terminalSearchRangeQuery }',
      'const terminalSearch = createTerminalSearchSession(prepared, terminalSearchQuery, terminalSearchOptions)',
      'terminalSearch satisfies TerminalSearchSession',
      'getTerminalSearchSessionMatchCount(terminalSearch) satisfies number',
      'getTerminalSearchMatchesForSourceRange(terminalSearch, terminalSearchRangeQuery) satisfies readonly TerminalSearchMatch[]',
      'getTerminalSearchMatchAfterSourceOffset(terminalSearch, 0) satisfies TerminalSearchMatch | null',
      'getTerminalSearchMatchBeforeSourceOffset(terminalSearch, 5) satisfies TerminalSearchMatch | null',
      'const terminalSelectionCoordinate: TerminalSelectionCoordinate = { row: 0, column: 0 }',
      'const terminalSelectionRequest: TerminalSelectionRequest = { anchor: terminalSelectionCoordinate, focus: { row: 0, column: 2 }, mode: "linear" }',
      'const terminalSelectionMode: TerminalSelectionMode = "linear"',
      'terminalSelectionMode satisfies TerminalSelectionMode',
      'const terminalSelectionDirection: TerminalSelectionDirection = "forward"',
      'terminalSelectionDirection satisfies TerminalSelectionDirection',
      'const terminalSelection = createTerminalSelectionFromCoordinates(prepared, bundle, terminalSelectionRequest)',
      'terminalSelection satisfies TerminalSelection | null',
      'const terminalSourceRangeExtractionRequest: TerminalSourceRangeExtractionRequest = { sourceStart: 0, sourceEnd: 2 }',
      'const terminalSelectionExtractionOptions: TerminalSelectionExtractionOptions = { indexes: bundle, rangeIndex }',
      'const terminalSelectionExtraction = extractTerminalSourceRange(prepared, terminalSourceRangeExtractionRequest, terminalSelectionExtractionOptions)',
      'terminalSelectionExtraction satisfies TerminalSelectionExtraction',
      'terminalSelectionExtraction.rowFragments[0] satisfies TerminalSelectionExtractionFragment | undefined',
      'if (terminalSelection) extractTerminalSelection(prepared, terminalSelection, terminalSelectionExtractionOptions) satisfies TerminalSelectionExtraction',
      "const flow = prepareTerminalCellFlow('hello')",
      'flow satisfies PreparedTerminalCellFlow',
      "const flowIndex = createTerminalLineIndex(getTerminalCellFlowPrepared(flow), { columns: 8, generation: getTerminalCellFlowGeneration(flow) })",
      "const flowBundle = createTerminalLayoutBundle(getTerminalCellFlowPrepared(flow), { columns: 8, generation: getTerminalCellFlowGeneration(flow), pageSize: 2, maxPages: 2 })",
      "const appendOptions: TerminalAppendOptions = { invalidationWindowCodeUnits: 128 }",
      'appendOptions satisfies TerminalAppendOptions',
      "const appended = appendTerminalCellFlow(flow, ' world')",
      'appended satisfies TerminalAppendResult',
      'appended.invalidation satisfies TerminalAppendInvalidation',
      'appended.invalidation.strategy satisfies TerminalAppendStrategy',
      "appended.invalidation.reprepareSourceCodeUnits satisfies number",
      "const flowInvalidation = invalidateTerminalLineIndex(getTerminalCellFlowPrepared(appended.flow), flowIndex, appended.invalidation)",
      'const typedInvalidation: TerminalLineIndexInvalidation = appended.invalidation',
      'typedInvalidation satisfies TerminalLineIndexInvalidation',
      'flowInvalidation satisfies TerminalLineIndexInvalidationResult',
      'const bundleInvalidationInput: TerminalLayoutBundleInvalidation = appended.invalidation',
      'bundleInvalidationInput satisfies TerminalLayoutBundleInvalidation',
      'const flowBundleInvalidation = invalidateTerminalLayoutBundle(getTerminalCellFlowPrepared(appended.flow), flowBundle, bundleInvalidationInput)',
      'flowBundleInvalidation satisfies TerminalLayoutBundleInvalidationResult',
      "invalidateTerminalPageCache(createTerminalPageCache(getTerminalCellFlowPrepared(appended.flow), flowIndex), flowInvalidation)",
      'getTerminalPageCacheStats(cache) satisfies TerminalPageCacheStats',
      "const prepared2 = prepareFromSubpath('hello')",
      'layoutTerminal(prepared2, { columns: 80 }).rows satisfies number',
      'const preparedFromRootForSubpath = prepareTerminal("cross surface")',
      'layoutFromSubpath(preparedFromRootForSubpath, { columns: 80 }).rows satisfies number',
      'layoutFromSubpath(prepared2, { columns: 80 }).rows satisfies number',
      'const first = layoutNextFromSubpath(prepared2, TERMINAL_START_CURSOR, { columns: 80 })',
      'if (first) materializeFromSubpath(prepared2, first).text satisfies string',
      "const richPrepared = prepareTerminalRichInline('\\x1b[31mred\\x1b[0m')",
      "const richOptions: TerminalRichPrepareOptions = { profile: 'transcript', unsupportedControlMode: 'sanitize', rawRetention: 'fingerprint' }",
      "const richPreparedWithOptions = prepareTerminalRichInline('\\x1b[31mred\\x1b[0m', richOptions)",
      "richPreparedWithOptions.policy.profile satisfies TerminalRichSecurityProfileName",
      "richPreparedWithOptions.raw?.fingerprint satisfies string | undefined",
      'richPreparedWithOptions.completeness.spansTruncated satisfies boolean',
      "richPreparedWithOptions.diagnostics[0] satisfies TerminalRichDiagnostic | undefined",
      "const richMaterializeOptions: TerminalRichMaterializeOptions = { ansiText: 'sgr' }",
      'let richWalkCount = 0',
      'walkTerminalRichLineRanges(richPrepared, { columns: 80 }, () => { richWalkCount++ })',
      'richWalkCount satisfies number',
      'const richFirst = layoutNextTerminalRichLineRange(richPrepared, TERMINAL_START_CURSOR, { columns: 80 })',
      'if (richFirst) materializeTerminalRichLineRange(richPrepared, richFirst).ansiText satisfies string | undefined',
      'if (richFirst) materializeTerminalRichLineRange(richPrepared, richFirst, richMaterializeOptions).ansiText satisfies string | undefined',
      'if (terminalSelection) extractTerminalRichSelection(richPrepared, terminalSelection, { indexes: bundle }) satisfies TerminalRichSelectionExtraction',
      'extractTerminalRichSourceRange(richPrepared, { sourceStart: 0, sourceEnd: 2 }, { indexes: bundle }) satisfies TerminalRichSelectionExtraction',
      'extractTerminalRichSourceRange(richPrepared, { sourceStart: 0, sourceEnd: 2 }, { indexes: bundle }).richFragments[0] satisfies TerminalRichSelectionExtractionFragment | undefined',
      '',
    ].join('\n'),
  )

  run(['npx', '--no-install', 'tsc', '-p', 'tsconfig.json'], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  run(['npx', '--no-install', 'tsc', '-p', 'tsconfig.recipes-runtime.json'], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  run(['node', '.recipe-runtime/recipes.js'], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { layoutTerminal, prepareTerminal } from '${packageName}'`,
      "const prepared = prepareTerminal('hello')",
      "layoutTerminal(prepared, { columns: '80' })",
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Type 'string' is not assignable to type 'number'.")

  for (const badPreparedField of forbiddenPreparedHandleDeclarationTokens) {
    await writeFile(
      path.join(projectDir, 'index.ts'),
      [
        `import { prepareTerminal } from '${packageName}'`,
        "const prepared = prepareTerminal('hello')",
        `void prepared.${badPreparedField}`,
        '',
      ].join('\n'),
    )
    expectBadTypeScript(projectDir, `Property '${badPreparedField}' does not exist`)
  }

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalRangeIndex } from '${packageName}'`,
      "const rangeIndex = createTerminalRangeIndex([{ id: 'a', kind: 'x', sourceStart: 0, sourceEnd: 1 }])",
      'void rangeIndex.byStart',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'byStart' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalRangeIndex, type TerminalRangeData } from '${packageName}'`,
      'const badData: TerminalRangeData = { run: () => undefined }',
      "createTerminalRangeIndex([{ id: 'a', kind: 'x', sourceStart: 0, sourceEnd: 1, data: badData }])",
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Type '() => undefined' is not assignable")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalSearchSession, prepareTerminal } from '${packageName}'`,
      "const prepared = prepareTerminal('hello')",
      "const session = createTerminalSearchSession(prepared, 'hello')",
      'void session.matches',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'matches' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalSearchSession, prepareTerminal } from '${packageName}'`,
      "const prepared = prepareTerminal('hello')",
      "const session = createTerminalSearchSession(prepared, 'hello')",
      'void session.next',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'next' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalLayoutBundle, createTerminalSelectionFromCoordinates, prepareTerminal } from '${packageName}'`,
      "const prepared = prepareTerminal('hello')",
      'const bundle = createTerminalLayoutBundle(prepared, { columns: 80 })',
      'const selection = createTerminalSelectionFromCoordinates(prepared, bundle, { anchor: { row: 0, column: 0 }, focus: { row: 0, column: 1 } })',
      'if (selection) void selection.clipboard',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'clipboard' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { createTerminalLayoutBundle, extractTerminalSourceRange, prepareTerminal } from '${packageName}'`,
      "const prepared = prepareTerminal('hello')",
      'const bundle = createTerminalLayoutBundle(prepared, { columns: 80 })',
      'const extraction = extractTerminalSourceRange(prepared, { sourceStart: 0, sourceEnd: 1 }, { indexes: bundle })',
      'void extraction.clipboardText',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'clipboardText' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { prepareTerminalRichInline } from '${packageName}/terminal-rich-inline'`,
      "const richPrepared = prepareTerminalRichInline('hello')",
      'void richPrepared.rawText',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'rawText' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { prepareTerminalRichInline } from '${packageName}/terminal-rich-inline'`,
      "const richPrepared = prepareTerminalRichInline('\\x07')",
      'const diagnostic = richPrepared.diagnostics[0]',
      'if (diagnostic) void diagnostic.sequence',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'sequence' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { prepareTerminalRichInline } from '${packageName}/terminal-rich-inline'`,
      "const richPrepared = prepareTerminalRichInline('hello', { rawRetention: 'fingerprint' })",
      'if (richPrepared.raw) void richPrepared.raw.text',
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Property 'text' does not exist")

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { prepareTerminalRichInline } from '${packageName}/terminal-rich-inline'`,
      "prepareTerminalRichInline('hello', { rawRetention: 'full' })",
      '',
    ].join('\n'),
  )
  expectBadTypeScript(projectDir, "Type '\"full\"' is not assignable")

  for (const badExport of forbiddenRootTypeExports) {
    await writeFile(
      path.join(projectDir, 'index.ts'),
      [
        `import { ${badExport} } from '${packageName}'`,
        `void ${badExport}`,
        '',
      ].join('\n'),
    )
    expectBadTypeScript(projectDir, "has no exported member")
  }

  for (const badExport of richSidecarOnlyExports) {
    await writeFile(
      path.join(projectDir, 'index.ts'),
      [
        `import { ${badExport} } from '${packageName}'`,
        `void ${badExport}`,
        '',
      ].join('\n'),
    )
    expectBadTypeScript(projectDir, "has no exported member")
  }

  for (const badSubpath of forbiddenPackageSubpaths) {
    await writeFile(
      path.join(projectDir, 'index.ts'),
      [
        `import * as bad from '${packageName}/${badSubpath}'`,
        'void bad',
        '',
      ].join('\n'),
    )
    expectBadTypeScript(projectDir, 'Cannot find module')
  }

  console.log('ts ok')
}

function expectBadTypeScript(projectDir: string, expected: string): void {
  const badCompile = run(
    ['npx', '--no-install', 'tsc', '-p', 'tsconfig.json'],
    {
      cwd: projectDir,
      stdout: 'pipe',
      stderr: 'pipe',
      allowFailure: true,
    },
  )

  if (badCompile.exitCode === 0) {
    throw new Error('Expected TypeScript consumer misuse to fail, but it compiled successfully.')
  }

  const combinedOutput = `${badCompile.stdout}${badCompile.stderr}`
  if (!combinedOutput.includes(expected)) {
    throw new Error(`Unexpected TypeScript consumer error output:\n${combinedOutput}`)
  }
}

function pinnedTypeScriptVersion(): string {
  const version = packageJson.devDependencies?.['typescript']
  if (typeof version !== 'string') {
    throw new Error('package.json devDependencies.typescript must be pinned for smoke tests')
  }
  return version
}

function jsonForGeneratedSource(value: unknown): string {
  return JSON.stringify(value)
}

function assertJsonEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch:\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`)
  }
}

async function createProject(dir: string, pkg: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

async function installTarball(projectDir: string, tarballPath: string): Promise<void> {
  run(['npm', 'install', '--ignore-scripts', '--no-package-lock', tarballPath], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
}

function run(
  cmd: string[],
  options: {
    cwd: string
    stdout: 'inherit' | 'pipe'
    stderr: 'inherit' | 'pipe'
    allowFailure?: boolean
    env?: Record<string, string>
  },
): { exitCode: number, stdout: string, stderr: string } {
  const result = Bun.spawnSync(cmd, {
    cwd: options.cwd,
    stdout: options.stdout,
    stderr: options.stderr,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  })

  const stdout = options.stdout === 'pipe' ? new TextDecoder().decode(result.stdout) : ''
  const stderr = options.stderr === 'pipe' ? new TextDecoder().decode(result.stderr) : ''

  if (!options.allowFailure && result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${cmd.join(' ')}`)
  }

  return {
    exitCode: result.exitCode,
    stdout,
    stderr,
  }
}
