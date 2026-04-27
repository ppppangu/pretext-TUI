// 补建说明：该文件为后续补建，用于验证 Task 1 的通用 TUI 文本内核公共 API 边界；当前进度：首版覆盖 runtime export allowlist、opaque handle 形态与 forged handle 拒绝。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  forbiddenRootRuntimeExports,
  terminalIncubatingRuntimeExports,
  richPublicRuntimeExports,
  terminalStableRuntimeExports,
  terminalPublicRuntimeExports,
} from '../../scripts/public-api-contract.js'
import * as publicFacade from '../../src/public-index.js'
import * as root from '../../src/index.js'
import * as rich from '../../src/terminal-rich-inline.js'
import type {
  PreparedTerminalCellFlow,
  PreparedTerminalText,
  TerminalLayoutBundle,
  TerminalLineIndex,
  TerminalPageCache,
  TerminalRangeIndex,
  TerminalSourceOffsetIndex,
} from '../../src/index.js'

type RuntimeModule = Record<string, unknown>
const repoRoot = path.resolve(import.meta.dir, '../..')

describe('public API boundary', () => {
  test('root re-exports the canonical public facade and rich runtime exports stay intentionally host-neutral', () => {
    expect(terminalPublicRuntimeExports).toContain('projectTerminalSourceOffset')
    expect(terminalPublicRuntimeExports).toContain('projectTerminalCursor')
    expect(terminalPublicRuntimeExports).toContain('projectTerminalRow')
    expect(terminalIncubatingRuntimeExports).toContain('projectTerminalCoordinate')
    expect(terminalIncubatingRuntimeExports).toContain('projectTerminalSourceRange')
    expect(terminalIncubatingRuntimeExports).toContain('createTerminalLayoutBundle')
    expect(terminalIncubatingRuntimeExports).toContain('getTerminalLayoutBundlePage')
    expect(terminalIncubatingRuntimeExports).toContain('invalidateTerminalLayoutBundle')
    expect(terminalIncubatingRuntimeExports).toContain('createTerminalRangeIndex')
    expect(terminalIncubatingRuntimeExports).toContain('getTerminalRangesAtSourceOffset')
    expect(terminalIncubatingRuntimeExports).toContain('getTerminalRangesForSourceRange')
    expect(terminalStableRuntimeExports).toContain('prepareTerminal')
    expect(terminalStableRuntimeExports).not.toContain('projectTerminalCoordinate')
    expect(terminalStableRuntimeExports).not.toContain('createTerminalLayoutBundle')
    expect(terminalStableRuntimeExports).not.toContain('appendTerminalCellFlow')
    expect(Object.keys(publicFacade).sort()).toEqual([...terminalPublicRuntimeExports])
    expect(Object.keys(root).sort()).toEqual([...terminalPublicRuntimeExports])
    expect(Object.keys(rich).sort()).toEqual([...richPublicRuntimeExports])
    for (const name of terminalPublicRuntimeExports) {
      expect((root as RuntimeModule)[name]).toBe((publicFacade as RuntimeModule)[name])
    }
    for (const name of forbiddenRootRuntimeExports) {
      expect(root).not.toHaveProperty(name)
    }
  })

  test('source root stays a thin re-export of the canonical public facade', async () => {
    const indexSource = await readFile(path.join(repoRoot, 'src/index.ts'), 'utf8')
    const executableLines = indexSource
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('//'))

    expect(executableLines).toEqual(["export * from './public-index.js'"])
    expect(indexSource).not.toMatch(/^import\s/mu)
    expect(indexSource).not.toMatch(/^export\s+(?:declare\s+)?(?:type|interface|function|const|class|enum)\s+/mu)
  })

  test('public handles do not expose mutable prepared/index/cache storage', () => {
    const prepared = root.prepareTerminal('general TUI text kernel\nnot a host adapter', {
      whiteSpace: 'pre-wrap',
    })
    const sourceIndex = root.createTerminalSourceOffsetIndex(prepared)
    const lineIndex = root.createTerminalLineIndex(prepared, { columns: 16 })
    const pageCache = root.createTerminalPageCache(prepared, lineIndex)
    const bundle = root.createTerminalLayoutBundle(prepared, { columns: 16 })
    const flow = root.prepareTerminalCellFlow('streaming terminal text', { whiteSpace: 'pre-wrap' })
    const rangeIndex = root.createTerminalRangeIndex([{ id: 'a', kind: 'generic', sourceStart: 0, sourceEnd: 8 }])

    for (const handle of [prepared, sourceIndex, lineIndex, pageCache, bundle, flow, rangeIndex]) {
      expect(Reflect.ownKeys(handle)).toEqual(['kind'])
      expect(Object.isFrozen(handle)).toBe(true)
    }
  })

  test('forged opaque handles are rejected by capability boundaries', () => {
    const prepared = root.prepareTerminal('hello', { whiteSpace: 'pre-wrap' })
    const lineIndex = root.createTerminalLineIndex(prepared, { columns: 8 })

    const forgedPrepared = Object.freeze({ kind: 'prepared-terminal-text@1' }) as PreparedTerminalText
    const forgedSourceIndex = Object.freeze({ kind: 'terminal-source-offset-index@1' }) as TerminalSourceOffsetIndex
    const forgedLineIndex = Object.freeze({ kind: 'terminal-line-index@1' }) as TerminalLineIndex
    const forgedPageCache = Object.freeze({ kind: 'terminal-page-cache@1' }) as TerminalPageCache
    const forgedBundle = Object.freeze({ kind: 'terminal-layout-bundle@1' }) as TerminalLayoutBundle
    const forgedRangeIndex = Object.freeze({ kind: 'terminal-range-index@1' }) as TerminalRangeIndex
    const forgedFlow = Object.freeze({ kind: 'prepared-terminal-cell-flow@1' }) as PreparedTerminalCellFlow

    expect(() => root.layoutTerminal(forgedPrepared, { columns: 8 })).toThrow('Invalid prepared terminal text handle')
    expect(() => root.createTerminalSourceOffsetIndex(forgedPrepared)).toThrow('Invalid prepared terminal text handle')
    expect(() => root.invalidateTerminalLineIndex(forgedPrepared, lineIndex, { generation: 1 })).toThrow('Invalid prepared terminal text handle')
    expect(() => root.getTerminalCursorForSourceOffset(prepared, forgedSourceIndex, 0)).toThrow('Invalid terminal source offset index handle')
    expect(() => root.getTerminalLineRangeAtRow(prepared, forgedLineIndex, 0)).toThrow('Invalid terminal line index handle')
    expect(() => root.getTerminalLinePage(prepared, forgedPageCache, lineIndex, { startRow: 0, rowCount: 1 })).toThrow('Invalid terminal page cache handle')
    expect(() => root.getTerminalLayoutBundlePage(prepared, forgedBundle, { startRow: 0, rowCount: 1 })).toThrow('Invalid terminal layout bundle handle')
    expect(() => root.invalidateTerminalLayoutBundle(prepared, forgedBundle, { generation: 1 })).toThrow('Invalid terminal layout bundle handle')
    expect(() => root.projectTerminalSourceOffset(prepared, forgedBundle, 0)).toThrow('Invalid terminal layout bundle handle')
    expect(() => root.getTerminalRangesAtSourceOffset(forgedRangeIndex, 0)).toThrow('Invalid terminal range index handle')
    expect(() => root.getTerminalRangesForSourceRange(forgedRangeIndex, { sourceStart: 0, sourceEnd: 1 })).toThrow('Invalid terminal range index handle')
    expect(() => root.getTerminalCellFlowPrepared(forgedFlow)).toThrow('Invalid terminal cell flow handle')
  })

  test('line index invalidation accepts matching source identity and rejects different layout identity', () => {
    const prepared = root.prepareTerminal('Ωa', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const sameIdentityDifferentSource = root.prepareTerminal('Ωb', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const differentTabSize = root.prepareTerminal('Ωa', { whiteSpace: 'pre-wrap', tabSize: 8 })
    const differentWidthProfile = root.prepareTerminal('Ωa', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
      widthProfile: { ambiguousWidth: 'wide' },
    })
    const lineIndex = root.createTerminalLineIndex(prepared, { columns: 2, generation: 0 })

    expect(() => root.invalidateTerminalLineIndex(differentTabSize, lineIndex, { generation: 1 })).toThrow(
      'different layout identity',
    )
    expect(root.getTerminalLineIndexMetadata(lineIndex).generation).toBe(0)
    expect(() => root.invalidateTerminalLineIndex(differentWidthProfile, lineIndex, { generation: 1 })).toThrow(
      'different layout identity',
    )
    expect(root.getTerminalLineIndexMetadata(lineIndex).generation).toBe(0)
    expect(root.invalidateTerminalLineIndex(sameIdentityDifferentSource, lineIndex, { generation: 1 })).toEqual({
      kind: 'terminal-line-index-invalidation@1',
      generation: 1,
    })
  })
})
