// 补建说明：该文件为后续补建，用于提供 Task 7 的 TUI-only 静态门禁；当前进度：Batch 6 preflight 继续拒绝浏览器/DOM/宿主 app 依赖，并复用公共契约扫描 runtime reader-boundary 回退与未分类 runtime 文件。
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  findReaderBoundaryRuntimeFindings,
  readerBoundaryRuntimeFiles,
  readerBoundaryRuntimeClassificationTokens,
  readerBoundaryStorageRuntimeFiles,
} from './public-api-contract.js'

const root = process.cwd()
const includeRoots = [
  'src',
  'scripts',
  'tests/tui',
  'fixtures',
  'package.json',
  'tsconfig.tui.json',
  'tsconfig.build.json',
  'tsconfig.tui-validation.json',
  '.github/workflows',
]
const ignoredDirs = new Set(['node_modules', 'dist', '.git'])
const codeFileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])
const textFileExtensions = new Set(['.json', '.yml', '.yaml', '.md', '.txt'])
const readerBoundaryRuntimeFileSet = new Set(readerBoundaryRuntimeFiles)
const readerBoundaryStorageRuntimeFileSet = new Set(readerBoundaryStorageRuntimeFiles)

type Finding = {
  file: string
  pattern: string
  reason: string
}

const findings: Finding[] = []

for (const entry of includeRoots) {
  const absolute = path.join(root, entry)
  if (!(await exists(absolute))) continue
  await scanPath(absolute)
}

if (findings.length > 0) {
  console.error('TUI static gate failed:')
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.pattern} (${finding.reason})`)
  }
  process.exit(1)
}

console.log('TUI static gate passed')

async function scanPath(absolutePath: string): Promise<void> {
  const info = await stat(absolutePath)
  if (info.isDirectory()) {
    const base = path.basename(absolutePath)
    if (ignoredDirs.has(base)) return
    const entries = await readdir(absolutePath)
    for (const entry of entries) {
      await scanPath(path.join(absolutePath, entry))
    }
    return
  }

  const extension = path.extname(absolutePath)
  if (!codeFileExtensions.has(extension) && !textFileExtensions.has(extension)) return
  const relative = normalizePath(path.relative(root, absolutePath))
  if (relative === 'scripts/tui-static-gate.ts') return
  const raw = await readFile(absolutePath, 'utf8')

  if (codeFileExtensions.has(extension)) {
    scanCode(relative, raw)
  } else {
    scanConfig(relative, raw)
  }
}

function scanCode(file: string, raw: string): void {
  const stripped = stripCommentsAndStrings(raw)
  const codePatterns: Array<[RegExp, string]> = [
    [/\b(window|document|navigator|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas|Path2D|ImageBitmap)\b/g, 'browser or DOM global in active code'],
    [/\b(measureText|getBoundingClientRect|requestAnimationFrame)\b/g, 'browser measurement/rendering API in active code'],
  ]
  const hostBoundaryPatterns: Array<[RegExp, string]> = [
    [/\b(clipboard|Clipboard|writeText|readText|Selection|Range|MouseEvent|KeyboardEvent)\b/g, 'selection UI or clipboard API in active code'],
    [/\b(pty|pseudo-?terminal|spawnPty|terminal emulator|renderer|render tree|component tree)\b/gi, 'PTY, emulator, or renderer concept in active code'],
    [/\b(codex|claude-code|nvim|tmux)\b/gi, 'named-host adapter concept in active code'],
    [/\b(pane tree|file browser|workspace adapter|focus router|command runner)\b/gi, 'host application concept in package validation code'],
  ]
  if (!isHostBoundaryValidationFile(file)) {
    codePatterns.push(...hostBoundaryPatterns)
  }
  for (const [pattern, reason] of codePatterns) {
    for (const match of stripped.matchAll(pattern)) {
      findings.push({ file, pattern: match[0]!, reason })
    }
  }

  const importPatterns: Array<[RegExp, string]> = [
    [/\bfrom\s+['"](?:playwright|puppeteer|jsdom|happy-dom)['"]/g, 'browser automation/dom package import'],
    [/\bimport\s*\(\s*['"](?:playwright|puppeteer|jsdom|happy-dom)['"]\s*\)/g, 'browser automation/dom package import'],
    [/\bfrom\s+['"](?:node-pty|xterm|xterm-headless|blessed|ink|react|react-dom|solid-js|vue|svelte)['"]/g, 'host UI/PTY package import'],
    [/\bimport\s*\(\s*['"](?:node-pty|xterm|xterm-headless|blessed|ink|react|react-dom|solid-js|vue|svelte)['"]\s*\)/g, 'host UI/PTY package import'],
  ]
  for (const [pattern, reason] of importPatterns) {
    for (const match of raw.matchAll(pattern)) {
      findings.push({ file, pattern: match[0]!, reason })
    }
  }

  if (readerBoundaryRuntimeFileSet.has(file)) {
    for (const finding of findReaderBoundaryRuntimeFindings(raw)) {
      findings.push({
        file,
        pattern: finding.match,
        reason: 'terminal runtime must use reader/geometry capability, not legacy prepared/debug storage',
      })
    }
  }

  if (isUnclassifiedTerminalRuntimeFile(file, stripped)) {
    findings.push({
      file,
      pattern: 'PreparedTerminal*',
      reason: 'terminal runtime file uses prepared reader/text capabilities but is not classified in the reader-boundary contract',
    })
  }
}

function isUnclassifiedTerminalRuntimeFile(file: string, stripped: string): boolean {
  if (!file.startsWith('src/terminal') || !file.endsWith('.ts') || file.endsWith('.test.ts')) {
    return false
  }
  if (readerBoundaryRuntimeFileSet.has(file) || readerBoundaryStorageRuntimeFileSet.has(file)) {
    return false
  }
  return readerBoundaryRuntimeClassificationTokens.some(token => stripped.includes(token))
}

function scanConfig(file: string, raw: string): void {
  const configPatterns: Array<[RegExp, string]> = [
    [/\b(playwright|puppeteer|jsdom|happy-dom)\b/g, 'browser automation/dom package in config'],
    [/\b(node-pty|xterm|xterm-headless|blessed|ink|react|react-dom|solid-js|vue|svelte)\b/g, 'host UI/PTY dependency in active config'],
    [/\b(clipboard|Clipboard|MouseEvent|KeyboardEvent|terminal emulator|renderer)\b/g, 'selection UI, clipboard, or renderer concept in active config'],
    [/\b(codex|claude-code|nvim|tmux)\b/gi, 'named-host adapter concept in active config'],
    [/\b(site:build|pages\/|browser-automation|build-demo-site)\b/g, 'browser demo or page workflow in active config'],
    [/\b(Claude Code|pane system|file browser|workspace adapter|focus router|command runner)\b/gi, 'host application concept in package validation text'],
  ]
  for (const [pattern, reason] of configPatterns) {
    for (const line of raw.split(/\r?\n/)) {
      if (isStaticGateGuardrailLine(line)) continue
      for (const match of line.matchAll(pattern)) {
        findings.push({ file, pattern: match[0]!, reason })
      }
    }
  }
}

function isHostBoundaryValidationFile(file: string): boolean {
  return file === 'tests/tui/benchmark-claim-guard.test.ts' ||
    file === 'tests/tui/recipe-public-imports.test.ts'
}

function isStaticGateGuardrailLine(line: string): boolean {
  return /\b(?:do not|forbidden|avoid|must not|unsupported|must not imply|without|No)\b/i.test(line)
}

function stripCommentsAndStrings(source: string): string {
  let output = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        output += ' '
        i++
      }
      continue
    }
    if (ch === '/' && next === '*') {
      output += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        output += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        output += '  '
        i += 2
      }
      continue
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch
      output += ' '
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          output += '  '
          i += 2
          continue
        }
        const current = source[i]!
        output += current === '\n' ? '\n' : ' '
        i++
        if (current === quote) break
      }
      continue
    }
    output += ch
    i++
  }
  return output
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath)
    return true
  } catch {
    return false
  }
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
