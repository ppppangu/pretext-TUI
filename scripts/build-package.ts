// 补建说明：该文件为后续补建，用于生成 publishable package dist 布局；当前进度：Task 2 review 修正，公共 .d.ts 改由 src/public-* TypeScript facade 生成，避免 build 脚本维护第二套 API 真相源。
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')

await rm(distDir, { recursive: true, force: true })
run('tsc', ['-p', 'tsconfig.build.json'])

await writePublicWrapper({
  publicName: 'index',
  internalName: 'public-index',
})
await writePublicAlias({
  publicName: 'terminal',
  targetPublicName: 'index',
})
await writePublicWrapper({
  publicName: 'terminal-rich-inline',
  internalName: 'public-terminal-rich-inline',
  declarationTransform: declaration => declaration.replaceAll('./public-index.js', './index.js'),
})

type WrapperOptions = {
  publicName: string
  internalName: string
  declarationTransform?: (declaration: string) => string
}

async function writePublicWrapper(options: WrapperOptions): Promise<void> {
  await mkdir(distDir, { recursive: true })
  await writeFile(
    path.join(distDir, `${options.publicName}.js`),
    [
      `export * from './internal/${options.internalName}.js'`,
      '',
    ].join('\n'),
    'utf8',
  )
  const internalDeclarationPath = path.join(distDir, 'internal', `${options.internalName}.d.ts`)
  const declaration = await readFile(internalDeclarationPath, 'utf8')
  await writeFile(
    path.join(distDir, `${options.publicName}.d.ts`),
    options.declarationTransform?.(declaration) ?? declaration,
    'utf8',
  )
}

async function writePublicAlias(options: { publicName: string; targetPublicName: string }): Promise<void> {
  await writeFile(
    path.join(distDir, `${options.publicName}.js`),
    [
      `export * from './${options.targetPublicName}.js'`,
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(distDir, `${options.publicName}.d.ts`),
    `export * from './${options.targetPublicName}.js'\n`,
    'utf8',
  )
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
  }
}
