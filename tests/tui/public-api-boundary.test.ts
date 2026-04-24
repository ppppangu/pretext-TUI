// 补建说明：该文件为后续补建，用于验证 Task 1 的通用 TUI 文本内核公共 API 边界；当前进度：首版覆盖 runtime export allowlist、opaque handle 形态与 forged handle 拒绝。
import { describe, expect, test } from 'bun:test'
import * as root from '../../src/index.js'
import * as rich from '../../src/terminal-rich-inline.js'
import type {
  PreparedTerminalCellFlow,
  PreparedTerminalText,
  TerminalLineIndex,
  TerminalPageCache,
  TerminalSourceOffsetIndex,
} from '../../src/index.js'

const terminalRuntimeExports = [
  'TERMINAL_START_CURSOR',
  'appendTerminalCellFlow',
  'createTerminalLineIndex',
  'createTerminalPageCache',
  'createTerminalSourceOffsetIndex',
  'getTerminalCellFlowGeneration',
  'getTerminalCellFlowPrepared',
  'getTerminalCursorForSourceOffset',
  'getTerminalLineIndexMetadata',
  'getTerminalLineIndexStats',
  'getTerminalLinePage',
  'getTerminalLineRangeAtRow',
  'getTerminalPageCacheStats',
  'getTerminalSourceOffsetForCursor',
  'invalidateTerminalLineIndex',
  'invalidateTerminalPageCache',
  'layoutNextTerminalLineRange',
  'layoutTerminal',
  'materializeTerminalLinePage',
  'materializeTerminalLineRange',
  'materializeTerminalLineRanges',
  'measureTerminalLineIndexRows',
  'measureTerminalLineStats',
  'prepareTerminal',
  'prepareTerminalCellFlow',
  'walkTerminalLineRanges',
].sort()

const richRuntimeExports = [
  'layoutNextTerminalRichLineRange',
  'materializeTerminalRichLineRange',
  'prepareTerminalRichInline',
  'walkTerminalRichLineRanges',
].sort()

describe('public API boundary', () => {
  test('root and rich runtime exports stay intentionally host-neutral', () => {
    expect(Object.keys(root).sort()).toEqual(terminalRuntimeExports)
    expect(Object.keys(rich).sort()).toEqual(richRuntimeExports)
    expect(root).not.toHaveProperty('disableTerminalPerformanceCounters')
    expect(root).not.toHaveProperty('resetTerminalPerformanceCounters')
    expect(root).not.toHaveProperty('snapshotTerminalPerformanceCounters')
    expect(root).not.toHaveProperty('getTerminalLineRangesAtRows')
  })

  test('public handles do not expose mutable prepared/index/cache storage', () => {
    const prepared = root.prepareTerminal('general TUI text kernel\nnot a host adapter', {
      whiteSpace: 'pre-wrap',
    })
    const sourceIndex = root.createTerminalSourceOffsetIndex(prepared)
    const lineIndex = root.createTerminalLineIndex(prepared, { columns: 16 })
    const pageCache = root.createTerminalPageCache(prepared, lineIndex)
    const flow = root.prepareTerminalCellFlow('streaming terminal text', { whiteSpace: 'pre-wrap' })

    for (const handle of [prepared, sourceIndex, lineIndex, pageCache, flow]) {
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
    const forgedFlow = Object.freeze({ kind: 'prepared-terminal-cell-flow@1' }) as PreparedTerminalCellFlow

    expect(() => root.layoutTerminal(forgedPrepared, { columns: 8 })).toThrow('Invalid prepared terminal text handle')
    expect(() => root.createTerminalSourceOffsetIndex(forgedPrepared)).toThrow('Invalid prepared terminal text handle')
    expect(() => root.invalidateTerminalLineIndex(forgedPrepared, lineIndex, { generation: 1 })).toThrow('Invalid prepared terminal text handle')
    expect(() => root.getTerminalCursorForSourceOffset(prepared, forgedSourceIndex, 0)).toThrow('Invalid terminal source offset index handle')
    expect(() => root.getTerminalLineRangeAtRow(prepared, forgedLineIndex, 0)).toThrow('Invalid terminal line index handle')
    expect(() => root.getTerminalLinePage(prepared, forgedPageCache, lineIndex, { startRow: 0, rowCount: 1 })).toThrow('Invalid terminal page cache handle')
    expect(() => root.getTerminalCellFlowPrepared(forgedFlow)).toThrow('Invalid terminal cell flow handle')
  })

  test('line index invalidation rejects prepared text with a different layout identity', () => {
    const prepared = root.prepareTerminal('hello', { whiteSpace: 'pre-wrap', tabSize: 4 })
    const differentTabSize = root.prepareTerminal('hello world', { whiteSpace: 'pre-wrap', tabSize: 8 })
    const lineIndex = root.createTerminalLineIndex(prepared, { columns: 8 })

    expect(() => root.invalidateTerminalLineIndex(differentTabSize, lineIndex, { generation: 1 })).toThrow(
      'different layout identity',
    )
  })
})
