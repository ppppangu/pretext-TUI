// 补建说明：该文件为后续补建，用于验证 Phase 9 performance counter schema 覆盖 range/search/selection 证据路径；当前进度：首版确保新增 counters 被真实操作记录。
import { describe, expect, test } from 'bun:test'
import { prepareTerminal } from '../../src/terminal.js'
import { createTerminalLayoutBundle } from '../../src/terminal-layout-bundle.js'
import {
  createTerminalRangeIndex,
  getTerminalRangesForSourceRange,
} from '../../src/terminal-range-index.js'
import {
  createTerminalSearchSession,
  getTerminalSearchMatchesForSourceRange,
} from '../../src/terminal-search-session.js'
import {
  createTerminalSelectionFromCoordinates,
  extractTerminalSelection,
} from '../../src/terminal-selection.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/terminal-performance-counters.js'

describe('terminal performance counters', () => {
  test('range, search, and selection evidence counters are recorded by kernel operations', () => {
    resetTerminalPerformanceCounters()
    try {
      const prepared = prepareTerminal('alpha beta gamma\nalpha beta tail', { whiteSpace: 'pre-wrap' })
      const bundle = createTerminalLayoutBundle(prepared, {
        columns: 12,
        anchorInterval: 4,
        pageSize: 4,
        maxPages: 2,
      })
      const rangeIndex = createTerminalRangeIndex([
        { id: 'a', kind: 'generic', sourceStart: 0, sourceEnd: 10 },
        { id: 'b', kind: 'generic', sourceStart: 6, sourceEnd: 24 },
      ])
      getTerminalRangesForSourceRange(rangeIndex, { sourceStart: 2, sourceEnd: 18 })

      const session = createTerminalSearchSession(prepared, 'alpha', { indexes: bundle })
      getTerminalSearchMatchesForSourceRange(session, { sourceStart: 0, sourceEnd: 32 })

      const selection = createTerminalSelectionFromCoordinates(prepared, bundle, {
        anchor: { row: 0, column: 0 },
        focus: { row: 1, column: 5 },
      })
      expect(selection).not.toBeNull()
      extractTerminalSelection(prepared, selection!, { indexes: bundle, rangeIndex })

      const counters = snapshotTerminalPerformanceCounters()
      expect(counters.terminalRangeIndexBuilds).toBe(1)
      expect(counters.terminalRangeIndexLookups).toBeGreaterThanOrEqual(2)
      expect(counters.terminalRangeIndexSteps).toBeGreaterThan(0)
      expect(counters.terminalRangeIndexMatches).toBeGreaterThan(0)
      expect(counters.terminalSearchSourceMaterializations).toBe(1)
      expect(counters.terminalSearchStoredMatches).toBeGreaterThan(0)
      expect(counters.terminalSearchStoredMatchCodeUnits).toBeGreaterThan(0)
      expect(counters.terminalSearchReturnedMatches).toBeGreaterThan(0)
      expect(counters.terminalSelectionCoordinateRequests).toBe(1)
      expect(counters.terminalSelectionExtractionRequests).toBe(1)
      expect(counters.terminalSelectionProjectionFragments).toBeGreaterThan(0)
      expect(counters.terminalSelectionRangeIndexLookups).toBe(1)
      expect(counters.terminalSelectionSourceCodeUnits).toBeGreaterThan(0)
      expect(counters.terminalSelectionVisibleCodeUnits).toBeGreaterThan(0)
    } finally {
      disableTerminalPerformanceCounters()
    }
  })
})
