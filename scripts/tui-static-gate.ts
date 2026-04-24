// 补建说明：该文件为后续补建，用于提供 Task 7 的 TUI-only 静态门禁；当前进度：首版扫描活跃源码、验证脚本、测试、package metadata 与 CI workflow，拒绝浏览器/DOM/Canvas/宿主 app 依赖。
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

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
    [/\b(pane tree|file browser|workspace adapter|focus router|command runner)\b/gi, 'host application concept in package validation code'],
  ]
  for (const [pattern, reason] of codePatterns) {
    for (const match of stripped.matchAll(pattern)) {
      findings.push({ file, pattern: match[0]!, reason })
    }
  }

  const importPatterns: Array<[RegExp, string]> = [
    [/\bfrom\s+['"](?:playwright|puppeteer|jsdom|happy-dom)['"]/g, 'browser automation/dom package import'],
    [/\bimport\s*\(\s*['"](?:playwright|puppeteer|jsdom|happy-dom)['"]\s*\)/g, 'browser automation/dom package import'],
  ]
  for (const [pattern, reason] of importPatterns) {
    for (const match of raw.matchAll(pattern)) {
      findings.push({ file, pattern: match[0]!, reason })
    }
  }
}

function scanConfig(file: string, raw: string): void {
  const configPatterns: Array<[RegExp, string]> = [
    [/\b(playwright|puppeteer|jsdom|happy-dom)\b/g, 'browser automation/dom package in config'],
    [/\b(site:build|pages\/|browser-automation|build-demo-site)\b/g, 'browser demo or page workflow in active config'],
    [/\b(Claude Code|pane system|file browser|workspace adapter|focus router|command runner)\b/gi, 'host application concept in package validation text'],
  ]
  for (const [pattern, reason] of configPatterns) {
    for (const match of raw.matchAll(pattern)) {
      findings.push({ file, pattern: match[0]!, reason })
    }
  }
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
