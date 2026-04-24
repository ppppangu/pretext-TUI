import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = process.cwd()
const keepTemp = process.argv.includes('--keep-temp')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'pretext-package-smoke-'))
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
  name: string
  private?: boolean
  main?: string
  types?: string
  exports?: Record<string, unknown>
}
const packageName = packageJson.name
let succeeded = false

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
  if (packageJson.private === true) throw new Error('package.json must not be private for publish smoke')
  if (packageJson.main !== './dist/index.js') throw new Error(`Unexpected main: ${packageJson.main}`)
  if (packageJson.types !== './dist/index.d.ts') throw new Error(`Unexpected types: ${packageJson.types}`)

  const exports = packageJson.exports as {
    '.'?: { types?: string; import?: string; default?: string }
    './terminal'?: { types?: string; import?: string; default?: string }
    './terminal-rich-inline'?: { types?: string; import?: string; default?: string }
    './package.json'?: string
  }
  const exportKeys = Object.keys(exports).sort()
  const expectedExportKeys = ['.', './package.json', './terminal', './terminal-rich-inline']
  if (JSON.stringify(exportKeys) !== JSON.stringify(expectedExportKeys)) {
    throw new Error(`Unexpected export keys: ${JSON.stringify(exportKeys)}`)
  }

  for (const key of ['.', './terminal'] as const) {
    const value = exports[key]
    const conditionKeys = Object.keys(value ?? {}).sort()
    if (JSON.stringify(conditionKeys) !== JSON.stringify(['default', 'import', 'types'])) {
      throw new Error(`Unexpected export conditions for ${key}: ${JSON.stringify(conditionKeys)}`)
    }
    if (
      value?.types !== './dist/index.d.ts' ||
      value.import !== './dist/index.js' ||
      value.default !== './dist/index.js'
    ) {
      throw new Error(`Unexpected export for ${key}: ${JSON.stringify(value)}`)
    }
  }

  if (exports['./package.json'] !== './package.json') {
    throw new Error('package.json subpath export must be preserved')
  }
  const rich = exports['./terminal-rich-inline']
  const richConditionKeys = Object.keys(rich ?? {}).sort()
  if (JSON.stringify(richConditionKeys) !== JSON.stringify(['default', 'import', 'types'])) {
    throw new Error(`Unexpected export conditions for ./terminal-rich-inline: ${JSON.stringify(richConditionKeys)}`)
  }
  if (
    rich?.types !== './dist/terminal-rich-inline.d.ts' ||
    rich.import !== './dist/terminal-rich-inline.js' ||
    rich.default !== './dist/terminal-rich-inline.js'
  ) {
    throw new Error(`Unexpected export for ./terminal-rich-inline: ${JSON.stringify(rich)}`)
  }
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

  for (const required of [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/terminal.js',
    'dist/terminal.d.ts',
    'dist/terminal-rich-inline.js',
    'dist/terminal-rich-inline.d.ts',
    'dist/ansi-tokenize.js',
    'dist/ansi-tokenize.d.ts',
  ]) {
    if (!files.has(required)) throw new Error(`Tarball missing required file: ${required}`)
  }

  for (const file of files) {
    if (
      file.startsWith('src/') ||
      file.startsWith('scripts/') ||
      file.startsWith('docs/') ||
      file.startsWith('corpora/') ||
      file.startsWith('site/') ||
      file.startsWith('pages/') ||
      file === 'dist/rich-inline.js' ||
      file === 'dist/rich-inline.d.ts' ||
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
      "const terminalRuntimeExports = ['TERMINAL_START_CURSOR', 'appendTerminalCellFlow', 'createTerminalLineIndex', 'createTerminalPageCache', 'createTerminalSourceOffsetIndex', 'getTerminalCellFlowGeneration', 'getTerminalCellFlowPrepared', 'getTerminalCursorForSourceOffset', 'getTerminalLineIndexMetadata', 'getTerminalLineIndexStats', 'getTerminalLinePage', 'getTerminalLineRangeAtRow', 'getTerminalPageCacheStats', 'getTerminalSourceOffsetForCursor', 'invalidateTerminalLineIndex', 'invalidateTerminalPageCache', 'layoutNextTerminalLineRange', 'layoutTerminal', 'materializeTerminalLinePage', 'materializeTerminalLineRange', 'materializeTerminalLineRanges', 'measureTerminalLineIndexRows', 'measureTerminalLineStats', 'prepareTerminal', 'prepareTerminalCellFlow', 'walkTerminalLineRanges'].sort()",
      "const richRuntimeExports = ['layoutNextTerminalRichLineRange', 'materializeTerminalRichLineRange', 'prepareTerminalRichInline', 'walkTerminalRichLineRanges'].sort()",
      "for (const [label, surface, expected] of [['root', root, terminalRuntimeExports], ['terminal', terminal, terminalRuntimeExports], ['rich', rich, richRuntimeExports]]) {",
      "  const actual = Object.keys(surface).sort()",
      "  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} exports changed: ${JSON.stringify(actual)}`)",
      '}',
      "const prepared = root.prepareTerminal('x\\t世界\\nz', { whiteSpace: 'pre-wrap', tabSize: 4, widthProfile: { ambiguousWidth: 'wide' } })",
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
      'const lookup = root.getTerminalCursorForSourceOffset(prepared, sourceIndex, 1)',
      "if (root.getTerminalSourceOffsetForCursor(prepared, lookup.cursor, sourceIndex) !== lookup.sourceOffset) throw new Error('bad source lookup')",
      'const lineIndex = root.createTerminalLineIndex(prepared, { columns: 8, startColumn: 2, anchorInterval: 2 })',
      "if (root.getTerminalLineIndexMetadata(lineIndex).columns !== 8) throw new Error('bad line index metadata')",
      "if (root.getTerminalLineIndexStats(lineIndex).anchorCount < 1) throw new Error('bad line index stats')",
      'const pageCache = root.createTerminalPageCache(prepared, lineIndex, { pageSize: 2, maxPages: 2 })',
      'const page = root.getTerminalLinePage(prepared, pageCache, lineIndex, { startRow: 0, rowCount: 2 })',
      "if (root.materializeTerminalLinePage(prepared, page).length !== page.lines.length) throw new Error('bad page materialization')",
      "if (root.materializeTerminalLineRanges(prepared, page.lines).length !== page.lines.length) throw new Error('bad range materialization')",
      "const flow = root.prepareTerminalCellFlow('hello\\nworld', { whiteSpace: 'pre-wrap' })",
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
      "if (!rich.materializeTerminalRichLineRange(richPrepared, richLine).ansiText.includes('\\x1b[31m')) throw new Error('bad rich ansi output')",
      "for (const bad of ['demos', 'assets', 'rich-inline', 'layout', 'terminal-line-index', 'terminal-page-cache', 'terminal-cell-flow', 'terminal-source-offset-index', 'dist/layout.js', 'dist/ansi-tokenize.js', 'src/index.ts', 'browser', 'ansi-tokenize']) {",
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
        skipLibCheck: true,
      },
      include: ['index.ts'],
    }, null, 2) + '\n',
  )

  await writeFile(
    path.join(projectDir, 'index.ts'),
    [
      `import { appendTerminalCellFlow, createTerminalLineIndex, createTerminalPageCache, createTerminalSourceOffsetIndex, getTerminalCellFlowGeneration, getTerminalCellFlowPrepared, getTerminalCursorForSourceOffset, getTerminalLineIndexMetadata, getTerminalLineIndexStats, getTerminalLinePage, getTerminalPageCacheStats, getTerminalSourceOffsetForCursor, invalidateTerminalLineIndex, invalidateTerminalPageCache, materializeTerminalLinePage, materializeTerminalLineRanges, measureTerminalLineIndexRows, layoutTerminal, prepareTerminal, prepareTerminalCellFlow, walkTerminalLineRanges, type PreparedTerminalCellFlow, type TerminalAppendInvalidation, type TerminalAppendOptions, type TerminalAppendResult, type TerminalAppendStrategy, type TerminalFixedLayoutOptions, type TerminalLineIndex, type TerminalLineIndexInvalidation, type TerminalLineIndexInvalidationResult, type TerminalLineIndexMetadata, type TerminalLineIndexStats, type TerminalLinePage, type TerminalLinePageRequest, type TerminalLineRange, type TerminalPageCache, type TerminalPageCacheOptions, type TerminalPageCacheStats, type TerminalSourceLookupResult, type TerminalSourceOffsetBias, type TerminalSourceOffsetIndex } from '${packageName}'`,
      `import { layoutNextTerminalLineRange, layoutTerminal as layoutFromSubpath, materializeTerminalLineRange, prepareTerminal as prepareFromSubpath } from '${packageName}/terminal'`,
      `import { prepareTerminalRichInline, layoutNextTerminalRichLineRange, materializeTerminalRichLineRange } from '${packageName}/terminal-rich-inline'`,
      "const prepared = prepareTerminal('hello 世界', { whiteSpace: 'pre-wrap', tabSize: 4 })",
      'const result = layoutTerminal(prepared, { columns: 8 })',
      'result.rows satisfies number',
      'const lines: TerminalLineRange[] = []',
      'walkTerminalLineRanges(prepared, { columns: 8 }, line => lines.push(line))',
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
      'getTerminalLineIndexMetadata(lineIndex) satisfies TerminalLineIndexMetadata',
      'getTerminalLineIndexMetadata(lineIndex).columns satisfies number',
      'getTerminalLineIndexStats(lineIndex) satisfies TerminalLineIndexStats',
      'measureTerminalLineIndexRows(prepared, lineIndex) satisfies number',
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
      'layoutFromSubpath(prepared2, { columns: 80 }).rows satisfies number',
      'const first = layoutNextTerminalLineRange(prepared2, { kind: "terminal-cursor@1", segmentIndex: 0, graphemeIndex: 0 }, { columns: 80 })',
      'if (first) materializeTerminalLineRange(prepared2, first).text satisfies string',
      "const richPrepared = prepareTerminalRichInline('\\x1b[31mred\\x1b[0m')",
      'const richFirst = layoutNextTerminalRichLineRange(richPrepared, { kind: "terminal-cursor@1", segmentIndex: 0, graphemeIndex: 0 }, { columns: 80 })',
      'if (richFirst) materializeTerminalRichLineRange(richPrepared, richFirst).ansiText satisfies string',
      '',
    ].join('\n'),
  )

  run(['bunx', 'tsc', '-p', 'tsconfig.json'], {
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

  for (const badExport of ['prepare', 'layout', 'prepareWithSegments', 'layoutWithLines']) {
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

  for (const badExport of ['prepareTerminalRichInline', 'layoutNextTerminalRichLineRange', 'materializeTerminalRichLineRange']) {
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

  console.log('ts ok')
}

function expectBadTypeScript(projectDir: string, expected: string): void {
  const badCompile = run(
    ['bunx', 'tsc', '-p', 'tsconfig.json'],
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
