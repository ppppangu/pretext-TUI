// 补建说明：该文件为后续补建，用于把 Task 4 benchmark evidence 文案边界固化为测试；当前进度：首版扫描 README/docs，阻止动态性能数字和未标注 benchmark 术语漂移进公开叙述。
import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dir, '../..')
const markdownRoots = [
  'CHANGELOG.md',
  'README.md',
  'docs/README.md',
  'docs/contracts',
  'docs/evidence',
  'docs/marketing',
  'docs/production',
  'docs/recipes',
  'docs/roadmap',
]
const hostNeutralMarkdownRoots = [
  ...markdownRoots,
  'docs/plans',
]
const claimBoundaryMarkdownRoots = [
  'STATUS.md',
  'TODO.md',
  'docs/decisions',
]
const dynamicNumberPattern =
  /\b\d+(?:\.\d+)?\s*(?:ms|µs|us|ns|ops\/sec|ops\/s)\b|\b\d+(?:\.\d+)?\s*[x×]\b|(?:p50|p95|mean|stdev|min|max)\s*[:=]\s*\d/i
const benchmarkTelemetryPattern = /\b(?:elapsedMs|opsPerSecond|ratioToPretext|maxMilliseconds)\b/i
const overclaimPattern =
  /\b(?:fastest|faster than|times faster|speedup|outperform(?:s|ed)?|beats?|wins?|winner|orders? of magnitude|zero[- ]cost|zero[- ]copy|no overhead|constant memory|O\(1\) append|O\(1\) memory|bounded memory|instant(?:ly)?|always faster|universally faster|universal speed|performance guarantee|make layout cheap|fast resize|fast scroll)\b/i
const percentClaimPattern = /\b\d+(?:\.\d+)?\s*%\s*(?:faster|slower|less|more|improvement|reduction)\b/i
const hostSpecificPattern =
  /\b(?:Claude Code|claude-code|Codex|codex|agent CLI|agent-CLI|@anthropic-ai|model prose|tmux|nvim|Ink|Blessed|React renderer)\b/i
const forbiddenClaimPattern =
  /\b(?:true chunked append storage|named-host integration|broad ANSI safety|universal speed|universally faster|broad benchmark supremacy|chunked append storage has landed|existing integration)\b/i

describe('benchmark evidence claim guard', () => {
  test('public Markdown does not copy dynamic benchmark numbers out of JSON evidence reports', async () => {
    for (const file of await markdownFiles(markdownRoots)) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(dynamicNumberPattern)
    }
  })

  test('public Markdown does not cite raw benchmark telemetry field names as claims', async () => {
    for (const file of await markdownFiles(markdownRoots)) {
      const content = await readFile(file, 'utf8')
      expect(content).not.toMatch(benchmarkTelemetryPattern)
    }
  })

  test('public Markdown does not contain benchmark overclaim phrasing', async () => {
    for (const file of await markdownFiles(markdownRoots)) {
      const content = await readFile(file, 'utf8')
      const relevantLines = content
        .split(/\r?\n/)
        .filter(line => !isGuardrailLine(line))
        .join('\n')
      expect(relevantLines).not.toMatch(overclaimPattern)
      expect(relevantLines).not.toMatch(percentClaimPattern)
    }
  })

  test('public and planning Markdown keeps named-host and agent-CLI drift out of prose', async () => {
    for (const file of await markdownFiles(hostNeutralMarkdownRoots)) {
      const content = await readFile(file, 'utf8')
      const relevantLines = content
        .split(/\r?\n/)
        .filter(line => !isHostNeutralGuardrailLine(line))
        .join('\n')
      expect(relevantLines).not.toMatch(hostSpecificPattern)
    }
  })

  test('status, todo, and decision records keep claim boundaries negative or scoped', async () => {
    for (const file of await markdownFiles(claimBoundaryMarkdownRoots)) {
      const content = await readFile(file, 'utf8')
      const relevantLines = content
        .split(/\r?\n/)
        .filter(line => !isClaimBoundaryGuardrailLine(line))
        .join('\n')
      expect(relevantLines).not.toMatch(hostSpecificPattern)
      expect(relevantLines).not.toMatch(forbiddenClaimPattern)
      expect(relevantLines).not.toMatch(overclaimPattern)
      expect(relevantLines).not.toMatch(percentClaimPattern)
    }
  })
})

async function markdownFiles(entries: readonly string[]): Promise<string[]> {
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(repoRoot, entry)
    if (entry.endsWith('.md')) {
      files.push(absolute)
    } else {
      files.push(...await collectMarkdownFiles(absolute))
    }
  }
  return files
}

function isGuardrailLine(line: string): boolean {
  return /\b(?:do not|forbidden|avoid|must not|unsupported|without copying numbers|not copied)\b/i.test(line)
}

function isHostNeutralGuardrailLine(line: string): boolean {
  return /^\s*-\s*No\b/i.test(line) ||
    /\brg -n\b|\b(?:do not|forbidden|avoid|must not|unsupported|named-host|named host|outside this package|PTY control)\b/i.test(line)
}

function isClaimBoundaryGuardrailLine(line: string): boolean {
  return isGuardrailLine(line) ||
    isHostNeutralGuardrailLine(line) ||
    /\b(?:future work|future APIs|future adoption work|not implemented claims|not claims|Forbidden Claims|Do not claim|Residual Risk|claim restrictions|Follow-up gate)\b/i.test(line) ||
    /\b(?:does not implement|not implement|can be misread|continues? to state|remain(?:s)? full reprepare|future chunked storage)\b/i.test(line) ||
    /^\s*-\s*(?:true chunked append storage|named-host integration|broad ANSI safety|broad or universal speed superiority)\b/i.test(line)
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(absolute))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolute)
    }
  }
  return files
}
