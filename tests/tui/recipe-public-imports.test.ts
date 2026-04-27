// 补建说明：该文件为后续补建，用于验证 Task 3 recipes 只依赖公开包入口并保持 host-neutral 文案边界；当前进度：首版扫描 docs/recipes 与 README，防止 private import、宿主专用适配和 renderer 依赖漂移。
import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dir, '../..')
const recipesDir = path.join(repoRoot, 'docs/recipes')

const requiredRecipeFiles = [
  'README.md',
  'transcript-viewport.md',
  'agent-transcript-generic.md',
  'terminal-pane-resize.md',
  'editor-source-mapping.md',
  'log-viewer-rich-ansi.md',
]

const allowedRecipeImportSpecifiers = Object.freeze([
  'pretext-tui',
  'pretext-tui/terminal',
  'pretext-tui/terminal-rich-inline',
])

const forbiddenImportPatterns = [
  /from ['"][^'"]*(?:src\/|dist\/internal)/,
  /from ['"]pretext-tui\/(?:layout|analysis|line-break|terminal-line-index|terminal-layout-bundle|terminal-page-cache|terminal-range-index|terminal-search|terminal-search-session|source-search|find|terminal-cell-flow|terminal-source-offset-index|terminal-prepared-reader|terminal-grapheme-geometry|terminal-performance-counters|internal|public-index|public-terminal-rich-inline|terminal-control-policy|security|profiles|terminal-security|rich-policy|browser|enterprise|interactive-cli)/,
]

const forbiddenHostSpecificPatterns = [
  /\btmux control\b/i,
  /\bnvim RPC\b/i,
  dashedPhrasePattern('named', 'host'),
  spacedPhrasePattern('host', 'runtime'),
  spacedPhrasePattern('runtime', 'behavior'),
  /\bReact renderer\b/i,
  /\bInk\b/,
  /\bBlessed\b/,
]

const requiredHostBoundaryPhrases = [
  'Host Owns',
  'Package Owns',
]

const incubatingSymbolPattern =
  /\b(?:createTerminalLineIndex|createTerminalLayoutBundle|getTerminalLayoutBundlePage|invalidateTerminalLayoutBundle|createTerminalRangeIndex|getTerminalRangesAtSourceOffset|getTerminalRangesForSourceRange|createTerminalSearchSession|getTerminalSearchSessionMatchCount|getTerminalSearchMatchesForSourceRange|getTerminalSearchMatchAfterSourceOffset|getTerminalSearchMatchBeforeSourceOffset|createTerminalSelectionFromCoordinates|extractTerminalSelection|extractTerminalSourceRange|extractTerminalRichSelection|extractTerminalRichSourceRange|createTerminalPageCache|getTerminalLinePage|createTerminalSourceOffsetIndex|prepareTerminalRichInline|materializeTerminalRichLineRange|prepareTerminalCellFlow|appendTerminalCellFlow)\b/

describe('host-neutral recipe docs', () => {
  test('required recipe files exist', async () => {
    const files = await readdir(recipesDir)
    for (const file of requiredRecipeFiles) {
      expect(files).toContain(file)
    }
  })

  test('recipe files have補建说明, host boundary sections, and public imports only', async () => {
    for (const file of requiredRecipeFiles) {
      const content = await readFile(path.join(recipesDir, file), 'utf8')
      expect(content).toContain('补建说明')

      for (const pattern of forbiddenImportPatterns) {
        expect(content).not.toMatch(pattern)
      }

      if (file !== 'README.md') {
        const importSpecifiers = extractTypeScriptImportSpecifiers(content)
        expect(importSpecifiers.length).toBeGreaterThan(0)
        for (const specifier of importSpecifiers) {
          expect(allowedRecipeImportSpecifiers).toContain(specifier)
        }

        for (const phrase of requiredHostBoundaryPhrases) {
          expect(content).toContain(phrase)
        }
        expect(content).toMatch(/from 'pretext-tui(?:\/terminal|\/terminal-rich-inline)?'/)
        if (incubatingSymbolPattern.test(content)) {
          expect(content).toContain('Incubating API Note')
        }
      }
    }
  })

  test('recipes and README avoid host-specific adapter wording', async () => {
    const files = [...requiredRecipeFiles.map(file => path.join(recipesDir, file)), path.join(repoRoot, 'README.md')]

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf8')
      for (const pattern of forbiddenHostSpecificPatterns) {
        expect(content).not.toMatch(pattern)
      }
    }
  })
})

function extractTypeScriptImportSpecifiers(markdown: string): string[] {
  const specifiers: string[] = []
  const codeFencePattern = /```(?:ts|typescript)\r?\n([\s\S]*?)```/g
  for (const fence of markdown.matchAll(codeFencePattern)) {
    const code = fence[1] ?? ''
    const importPattern =
      /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    for (const match of code.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3]
      if (specifier === undefined) continue
      specifiers.push(specifier)
    }
  }
  return specifiers
}

function dashedPhrasePattern(...words: readonly string[]): RegExp {
  return new RegExp(`\\b${words.map(escapeRegExp).join('-')}\\b`, 'i')
}

function spacedPhrasePattern(...words: readonly string[]): RegExp {
  return new RegExp(`\\b${words.map(escapeRegExp).join('\\s+')}\\b`, 'i')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
