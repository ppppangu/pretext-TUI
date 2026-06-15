// 补建说明：该文件为后续补建，用于钉住承重律「Prepare 与 columns 无关」（F3 §8.1）；当前进度：
// 已有 coordinate-projection.test.ts:442 证了 reuse-consistency 那一半，此处补缺失的 reuse≡fresh
// 半——同一个 prepared 在多个宽度下 relayout 的输出与 from-scratch prepare 逐字段相等，且 geometry
// 只 build 一次，即 resize 只重 layout 不重 prepare（disturbance-rejection 的证明）。
import { describe, expect, test } from 'bun:test'
import { serializeLineRanges } from './validation-helpers.js'
import { prepareTerminal, type TerminalPrepareOptions } from '../../src/public/index.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/telemetry/terminal-performance-counters.js'

describe('width-independence of prepare (resize re-runs only layout)', () => {
  test('a reused prepared lays out byte-identically to a fresh prepare at every width, and geometry builds once', () => {
    const text = 'A\tB 世界 e\u0301 😀\ntrans\u00ADatlantic hello world keep-all 界界界 lorem ipsum dolor sit'
    const opts = { whiteSpace: 'pre-wrap', tabSize: 4 } satisfies TerminalPrepareOptions
    const cols = [1, 8, 40, 120]

    // Prepare ONCE; relayout at every width. Column-independent geometry must build exactly
    // once across all relayouts — re-preparing on resize would silently change this to >1.
    resetTerminalPerformanceCounters()
    const reused = prepareTerminal(text, opts)
    const reusedByCol = new Map(cols.map(c => [c, serializeLineRanges(reused, { columns: c })]))
    expect(snapshotTerminalPerformanceCounters().preparedGeometryBuilds).toBe(1)
    disableTerminalPerformanceCounters()

    // reuse ≡ fresh: the cached prepared produces output identical to a from-scratch prepare
    // at each width. (The reuse-consistency half — same anchor reprojects across widths — is
    // pinned at coordinate-projection.test.ts:442; this is the missing equivalence half.)
    for (const c of cols) {
      expect(reusedByCol.get(c)).toEqual(serializeLineRanges(prepareTerminal(text, opts), { columns: c }))
    }
  })
})
