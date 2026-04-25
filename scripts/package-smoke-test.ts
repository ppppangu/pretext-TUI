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
      "const flow = root.prepareTerminalCellFlow('hello\\nworld', { whiteSpace: 'pre-wrap' })",
      "assertOpaqueHandle('cell flow', flow)",
      "const flowIndex = root.createTerminalLineIndex(root.getTerminalCellFlowPrepared(flow), { columns: 8, generation: root.getTerminalCellFlowGeneration(flow) })",
      "const flowCache = root.createTerminalPageCache(root.getTerminalCellFlowPrepared(flow), flowIndex, { pageSize: 2, maxPages: 2 })",
      "root.getTerminalLinePage(root.getTerminalCellFlowPrepared(flow), flowCache, flowIndex, { startRow: 0, rowCount: 2 })",
      "const appended = root.appendTerminalCellFlow(flow, '\\nnext')",
      "if (root.getTerminalCellFlowGeneration(appended.flow) !== root.getTerminalCellFlowGeneration(flow) + 1) throw new Error('bad append generation')",
      "const lineInvalidation = root.invalidateTerminalLineIndex(root.getTerminalCellFlowPrepared(appended.flow), flowIndex, appended.invalidation)",
      "root.invalidateTerminalPageCache(flowCache, lineInvalidation)",
      "if (root.getTerminalPageCacheStats(flowCache).invalidatedPages < 1) throw new Error('bad page invalidation')",
      "const richPrepared = rich.prepareTerminalRichInline('\\x1b[31mred\\x1b[0m')",
      "const richLine = rich.layoutNextTerminalRichLineRange(richPrepared, root.TERMINAL_START_CURSOR, { columns: 10 })",
      "if (richLine === null) throw new Error('bad rich next line')",
      "if ('rawText' in richPrepared) throw new Error('rich prepared leaked rawText')",
      "if (richPrepared.raw !== undefined) throw new Error('default rich profile retained raw')",
      "if (rich.materializeTerminalRichLineRange(richPrepared, richLine).ansiText !== undefined) throw new Error('rich ansi output must be opt-in')",
      "if (!rich.materializeTerminalRichLineRange(richPrepared, richLine, { ansiText: 'sgr' }).ansiText.includes('\\x1b[31m')) throw new Error('bad rich ansi output')",
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
      `import { createTerminalLineIndex, createTerminalPageCache, createTerminalSourceOffsetIndex, getTerminalLinePage, getTerminalLineRangeAtRow, materializeTerminalLinePage, prepareTerminal, projectTerminalSourceOffset, type MaterializedTerminalLine, type TerminalProjectionIndexes } from '${packageName}'`,
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
      '  const index = createTerminalLineIndex(prepared, { columns, anchorInterval: 64 })',
      '  const cache = createTerminalPageCache(prepared, index, { pageSize: 64, maxPages: 4 })',
      '  const page = getTerminalLinePage(prepared, cache, index, { startRow: 0, rowCount: 12 })',
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
      `import { TERMINAL_START_CURSOR, appendTerminalCellFlow, createTerminalLineIndex, createTerminalPageCache, createTerminalSourceOffsetIndex, getTerminalCellFlowGeneration, getTerminalCellFlowPrepared, getTerminalCursorForSourceOffset, getTerminalLineIndexMetadata, getTerminalLineIndexStats, getTerminalLinePage, getTerminalLineRangeAtRow, getTerminalPageCacheStats, getTerminalSourceOffsetForCursor, invalidateTerminalLineIndex, invalidateTerminalPageCache, layoutNextTerminalLineRange, materializeTerminalLinePage, materializeTerminalLineRange, materializeTerminalLineRanges, measureTerminalLineIndexRows, measureTerminalLineStats, layoutTerminal, prepareTerminal, prepareTerminalCellFlow, projectTerminalCursor, projectTerminalRow, projectTerminalSourceOffset, walkTerminalLineRanges, type PreparedTerminalCellFlow, type TerminalAppendInvalidation, type TerminalAppendOptions, type TerminalAppendResult, type TerminalAppendStrategy, type TerminalCellCoordinate, type TerminalCoordinateProjection, type TerminalFixedLayoutOptions, type TerminalLineIndex, type TerminalLineIndexInvalidation, type TerminalLineIndexInvalidationResult, type TerminalLineIndexMetadata, type TerminalLineIndexStats, type TerminalLinePage, type TerminalLinePageRequest, type TerminalLineRange, type TerminalPageCache, type TerminalPageCacheOptions, type TerminalPageCacheStats, type TerminalProjectionIndexes, type TerminalRowProjection, type TerminalSourceLookupResult, type TerminalSourceOffsetBias, type TerminalSourceOffsetIndex, type TerminalSourceProjection, type TerminalSourceProjectionOptions } from '${packageName}'`,
      `import { layoutNextTerminalLineRange as layoutNextFromSubpath, layoutTerminal as layoutFromSubpath, materializeTerminalLineRange as materializeFromSubpath, prepareTerminal as prepareFromSubpath, projectTerminalSourceOffset as projectSourceFromSubpath } from '${packageName}/terminal'`,
      `import { prepareTerminalRichInline, layoutNextTerminalRichLineRange, materializeTerminalRichLineRange, walkTerminalRichLineRanges, type TerminalRichDiagnostic, type TerminalRichMaterializeOptions, type TerminalRichPrepareOptions, type TerminalRichSecurityProfileName } from '${packageName}/terminal-rich-inline'`,
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
      'type ProjectionTypeSmoke = { cell: TerminalCellCoordinate; coordinate: TerminalCoordinateProjection; indexes: TerminalProjectionIndexes; options: TerminalSourceProjectionOptions; row: TerminalRowProjection; source: TerminalSourceProjection }',
      'const projectionTypeSmoke = null as unknown as ProjectionTypeSmoke',
      'void projectionTypeSmoke',
      'const projection = projectTerminalSourceOffset(prepared, sourceIndex, lineIndex, 1, sourceBias)',
      'projection satisfies TerminalCoordinateProjection',
      "if (projection.kind !== 'terminal-coordinate-projection@1') throw new Error('projection kind mismatch')",
      "if (projection.coordinate.row !== projection.row || projection.coordinate.column !== projection.column) throw new Error('projection coordinate mirror mismatch')",
      'projectTerminalCursor(prepared, sourceIndex, lineIndex, projection.cursor) satisfies TerminalSourceProjection',
      'projectTerminalRow(prepared, lineIndex, projection.row) satisfies TerminalRowProjection | null',
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
      "const flow = prepareTerminalCellFlow('hello')",
      'flow satisfies PreparedTerminalCellFlow',
      "const flowIndex = createTerminalLineIndex(getTerminalCellFlowPrepared(flow), { columns: 8, generation: getTerminalCellFlowGeneration(flow) })",
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
