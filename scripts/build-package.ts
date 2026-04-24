// 补建说明：该文件为后续补建，用于生成 Task 10 的 publishable package dist 布局；当前进度：将 tsc 产物收拢到 dist/internal，并生成根层 public wrapper。
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')

await rm(distDir, { recursive: true, force: true })
run('tsc', ['-p', 'tsconfig.build.json'])

await writePublicWrapper('index', 'index')
await writePublicWrapper('terminal', 'index')
await writePublicWrapper('terminal-rich-inline', 'terminal-rich-inline')

async function writePublicWrapper(publicName: string, internalName: string): Promise<void> {
  await mkdir(distDir, { recursive: true })
  await writeFile(
    path.join(distDir, `${publicName}.js`),
    [
      `export * from './internal/${internalName}.js'`,
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(distDir, `${publicName}.d.ts`),
    [
      `export * from './internal/${internalName}.js'`,
      '',
    ].join('\n'),
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
