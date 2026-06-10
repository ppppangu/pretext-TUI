// 补建说明：该文件为后续补建，用于验证 Phase 5 source-first terminal search session 的公共 API 与 host-neutral 边界；当前进度：首版覆盖 literal/regex/case/whole-word/scope/projection/rich visible text/append recreation。
import { describe, expect, test } from 'bun:test'
import {
  appendTerminalCellFlow,
  createTerminalLineIndex,
  createTerminalLayoutBundle,
  createTerminalRangeIndex,
  createTerminalSearchSession,
  createTerminalSourceOffsetIndex,
  getTerminalCellFlowPrepared,
  getTerminalSearchMatchAfterSourceOffset,
  getTerminalSearchMatchBeforeSourceOffset,
  getTerminalSearchMatchesForSourceRange,
  getTerminalSearchSessionMatchCount,
  getTerminalSearchSessionStats,
  prepareTerminal,
  prepareTerminalCellFlow,
  type TerminalSearchMatch,
  type TerminalSearchSession,
} from '../../src/public/index.js'
import {
  prepareTerminalRichInline,
} from '../../src/public/public-terminal-rich-inline.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/telemetry/terminal-performance-counters.js'

function positions(matches: readonly TerminalSearchMatch[]): ReadonlyArray<readonly [number, number, string, string | undefined]> {
  return matches.map(match => [match.sourceStart, match.sourceEnd, match.matchText, match.scopeId])
}

describe('terminal search session', () => {
  test('finds literal matches in source order with opaque immutable handles and matches', () => {
    const prepared = prepareTerminal('alpha beta alpha alphabet', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'alpha')

    expect(Reflect.ownKeys(session)).toEqual(['kind'])
    expect(Object.isFrozen(session)).toBe(true)
    expect(getTerminalSearchSessionMatchCount(session)).toBe(3)
    expect(positions(getTerminalSearchMatchesForSourceRange(session))).toEqual([
      [0, 5, 'alpha', undefined],
      [11, 16, 'alpha', undefined],
      [17, 22, 'alpha', undefined],
    ])

    const after = getTerminalSearchMatchAfterSourceOffset(session, 1)
    const before = getTerminalSearchMatchBeforeSourceOffset(session, 17)
    expect(after?.sourceStart).toBe(11)
    expect(before?.sourceStart).toBe(11)
    expect(after && Object.isFrozen(after)).toBe(true)
    expect(after).not.toHaveProperty('row')
    expect(after).not.toHaveProperty('column')
    expect(after).not.toHaveProperty('highlight')
    expect(after).not.toHaveProperty('active')
  })

  test('supports case-insensitive literal search and rejects empty queries and forged sessions', () => {
    const prepared = prepareTerminal('Error error ERROR', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'error', { caseSensitive: false })
    const forged = Object.freeze({ kind: 'terminal-search-session@1' }) as TerminalSearchSession

    expect(getTerminalSearchSessionMatchCount(session)).toBe(3)
    expect(() => createTerminalSearchSession(prepared, '')).toThrow('must not be empty')
    expect(() => getTerminalSearchSessionMatchCount(forged)).toThrow('Invalid terminal search session handle')
  })

  test('supports regex search without mutating caller regex state and rejects zero-width regex matches', () => {
    const prepared = prepareTerminal('id:1 id:22 id:x', { whiteSpace: 'pre-wrap' })
    const regex = /id:\d+/y
    regex.lastIndex = 5
    const session = createTerminalSearchSession(prepared, regex, { mode: 'regex' })

    expect(regex.lastIndex).toBe(5)
    expect(positions(getTerminalSearchMatchesForSourceRange(session))).toEqual([
      [0, 4, 'id:1', undefined],
      [5, 10, 'id:22', undefined],
    ])
    expect(() => createTerminalSearchSession(prepared, /(?=id)/, { mode: 'regex' })).toThrow('zero-width')
    expect(() => createTerminalSearchSession(prepared, '(', { mode: 'regex' })).toThrow('Invalid terminal regex')
  })

  test('filters whole-word matches with package-owned ASCII word boundaries', () => {
    const prepared = prepareTerminal('foo _foo foo-bar foo1 foo caféfoo foo café', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'foo', { wholeWord: true })

    expect(positions(getTerminalSearchMatchesForSourceRange(session))).toEqual([
      [0, 3, 'foo', undefined],
      [9, 12, 'foo', undefined],
      [22, 25, 'foo', undefined],
      [30, 33, 'foo', undefined],
      [34, 37, 'foo', undefined],
    ])
  })

  test('limits matches to explicit scopes and range-index scopes without interpreting host data', () => {
    const prepared = prepareTerminal('one two one two one', { whiteSpace: 'pre-wrap' })
    const explicit = createTerminalSearchSession(prepared, 'one', {
      scope: [
        { scopeId: 'a', sourceStart: 0, sourceEnd: 7 },
        { scopeId: 'b', sourceStart: 8, sourceEnd: 19 },
      ],
    })
    const rangeIndex = createTerminalRangeIndex([
      { id: 'first', kind: 'host-owned', sourceStart: 0, sourceEnd: 7, data: { payloadId: 'p1' } },
      { id: 'second', kind: 'host-owned', sourceStart: 8, sourceEnd: 19, tags: ['generic'] },
    ])
    const scopedByIndex = createTerminalSearchSession(prepared, 'one', {
      scope: { rangeIndex },
    })

    expect(positions(getTerminalSearchMatchesForSourceRange(explicit))).toEqual([
      [0, 3, 'one', 'a'],
      [8, 11, 'one', 'b'],
      [16, 19, 'one', 'b'],
    ])
    expect(positions(getTerminalSearchMatchesForSourceRange(explicit, { scopeId: 'b' }))).toEqual([
      [8, 11, 'one', 'b'],
      [16, 19, 'one', 'b'],
    ])
    expect(positions(getTerminalSearchMatchesForSourceRange(scopedByIndex))).toEqual([
      [0, 3, 'one', 'first'],
      [8, 11, 'one', 'second'],
      [16, 19, 'one', 'second'],
    ])
  })

  test('projects hits only when projection indexes are supplied', () => {
    const prepared = prepareTerminal('abcdef', { whiteSpace: 'pre-wrap' })
    const bundle = createTerminalLayoutBundle(prepared, { columns: 3 })
    const plain = createTerminalSearchSession(prepared, 'cde')
    const projected = createTerminalSearchSession(prepared, 'cde', { indexes: bundle })

    expect(getTerminalSearchMatchesForSourceRange(plain)[0]).not.toHaveProperty('projection')
    const match = getTerminalSearchMatchesForSourceRange(projected)[0]
    expect(match?.projection?.fragments.map(fragment => ({
      row: fragment.row,
      sourceStart: fragment.sourceStart,
      sourceEnd: fragment.sourceEnd,
    }))).toEqual([
      { row: 0, sourceStart: 2, sourceEnd: 3 },
      { row: 1, sourceStart: 3, sourceEnd: 5 },
    ])
  })

  test('searches rich sanitized visible text, not raw ANSI bytes', () => {
    const rich = prepareTerminalRichInline('\x1b[31mred\x1b[0m and \x1b]8;;https://e.test\x1b\\link\x1b]8;;\x1b\\')
    const visible = createTerminalSearchSession(rich.prepared, 'red')
    const rawEscape = createTerminalSearchSession(rich.prepared, '\x1b[31m')

    expect(positions(getTerminalSearchMatchesForSourceRange(visible))).toEqual([
      [0, 3, 'red', undefined],
    ])
    expect(getTerminalSearchSessionMatchCount(rawEscape)).toBe(0)
  })

  test('snapshots index-pair containers while keeping opaque handles as capabilities', () => {
    const prepared = prepareTerminal('abcdef', { whiteSpace: 'pre-wrap' })
    const sourceIndex = createTerminalSourceOffsetIndex(prepared)
    const lineIndex = createTerminalLineIndex(prepared, { columns: 3 })
    const indexes = { sourceIndex, lineIndex }
    const session = createTerminalSearchSession(prepared, 'cde', { indexes })
    const other = prepareTerminal('other', { whiteSpace: 'pre-wrap' })

    indexes.sourceIndex = createTerminalSourceOffsetIndex(other)

    expect(getTerminalSearchMatchesForSourceRange(session)[0]?.projection?.fragments.map(fragment => fragment.row)).toEqual([0, 1])
    expect(() => createTerminalSearchSession(prepared, 'cde', {
      indexes: createTerminalLayoutBundle(other, { columns: 3 }),
    })).toThrow()
  })

  test('append flows require a new session for the new prepared source', () => {
    const flow = prepareTerminalCellFlow('alpha', { whiteSpace: 'pre-wrap' })
    const before = createTerminalSearchSession(getTerminalCellFlowPrepared(flow), 'beta')
    const appended = appendTerminalCellFlow(flow, ' beta')
    const after = createTerminalSearchSession(getTerminalCellFlowPrepared(appended.flow), 'beta')

    expect(getTerminalSearchSessionMatchCount(before)).toBe(0)
    expect(positions(getTerminalSearchMatchesForSourceRange(after))).toEqual([
      [6, 10, 'beta', undefined],
    ])
  })

  test('range queries are source-first overlap queries and limit-bounded', () => {
    const prepared = prepareTerminal('abcde--abcde', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'abcde')

    expect(positions(getTerminalSearchMatchesForSourceRange(session, {
      sourceStart: 2,
      sourceEnd: 8,
      limit: 1,
    }))).toEqual([
      [0, 5, 'abcde', undefined],
    ])
    expect(positions(getTerminalSearchMatchesForSourceRange(session, {
      sourceStart: 2,
      sourceEnd: 8,
    }))).toEqual([
      [0, 5, 'abcde', undefined],
      [7, 12, 'abcde', undefined],
    ])
    expect(positions(getTerminalSearchMatchesForSourceRange(session, {
      sourceStart: 3,
      sourceEnd: 3,
    }))).toEqual([
      [0, 5, 'abcde', undefined],
    ])
    expect(getTerminalSearchMatchesForSourceRange(session, {
      sourceStart: 5,
      sourceEnd: 5,
    })).toEqual([])
  })

  test('rejects malformed query, scope, offset, range, and limit options', () => {
    const prepared = prepareTerminal('alpha beta', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'alpha')

    expect(() => createTerminalSearchSession(prepared, 'alpha', { mode: 'glob' as never })).toThrow('Terminal search mode')
    expect(() => createTerminalSearchSession(prepared, { pattern: 1 } as never, { mode: 'regex' })).toThrow('pattern must be a string')
    expect(() => createTerminalSearchSession(prepared, { text: 1 } as never)).toThrow('text must be a string')
    expect(() => createTerminalSearchSession(prepared, 'alpha', { scope: [] })).toThrow('at least one source range')
    expect(() => createTerminalSearchSession(prepared, 'alpha', {
      scope: { scopeId: '', sourceStart: 0, sourceEnd: 5 },
    })).toThrow('scopeId must be a non-empty string')
    expect(() => getTerminalSearchMatchesForSourceRange(session, { limit: -1 })).toThrow('limit')
    expect(() => getTerminalSearchMatchesForSourceRange(session, { limit: 1.5 })).toThrow('limit')
    expect(() => getTerminalSearchMatchesForSourceRange(session, { sourceStart: 2, sourceEnd: 1 })).toThrow('sourceEnd must be >=')
    expect(() => getTerminalSearchMatchAfterSourceOffset(session, -1)).toThrow('sourceOffset')
    expect(() => getTerminalSearchMatchBeforeSourceOffset(session, 1.5)).toThrow('sourceOffset')
  })

  test('matchLimit above the match count keeps every match and reports an untruncated session', () => {
    const prepared = prepareTerminal('alpha beta alpha alphabet', { whiteSpace: 'pre-wrap' })
    const uncapped = createTerminalSearchSession(prepared, 'alpha')
    const capped = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 8 })

    expect(positions(getTerminalSearchMatchesForSourceRange(capped))).toEqual(
      positions(getTerminalSearchMatchesForSourceRange(uncapped)),
    )
    expect(getTerminalSearchSessionMatchCount(capped)).toBe(3)
    expect(getTerminalSearchSessionStats(capped)).toEqual({
      kind: 'terminal-search-session-stats@1',
      matchLimit: 8,
      storedMatchCount: 3,
      truncated: false,
    })
  })

  test('matchLimit keeps the first matches in source order and drops the rest with no rescan', () => {
    resetTerminalPerformanceCounters()
    try {
      const prepared = prepareTerminal('alpha alpha alpha alpha alpha', { whiteSpace: 'pre-wrap' })
      const capped = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 2 })

      expect(positions(getTerminalSearchMatchesForSourceRange(capped))).toEqual([
        [0, 5, 'alpha', undefined],
        [6, 11, 'alpha', undefined],
      ])
      expect(getTerminalSearchSessionMatchCount(capped)).toBe(2)
      expect(getTerminalSearchSessionStats(capped)).toEqual({
        kind: 'terminal-search-session-stats@1',
        matchLimit: 2,
        storedMatchCount: 2,
        truncated: true,
      })
      // The dropped matches do not exist in the session: a range query over the
      // tail returns nothing rather than rescanning the source.
      expect(getTerminalSearchMatchesForSourceRange(capped, { sourceStart: 12, sourceEnd: 29 })).toEqual([])

      const counters = snapshotTerminalPerformanceCounters()
      expect(counters.terminalSearchSessionsTruncated).toBe(1)
      expect(counters.terminalSearchTruncatedMatches).toBe(3)
      expect(counters.terminalSearchStoredMatches).toBe(2)
      expect(counters.terminalSearchMatches).toBe(5)
    } finally {
      disableTerminalPerformanceCounters()
    }
  })

  test('omitting matchLimit keeps today\'s unbounded behaviour and a null limit in stats', () => {
    const prepared = prepareTerminal('alpha beta alpha alphabet', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'alpha')

    expect(positions(getTerminalSearchMatchesForSourceRange(session))).toEqual([
      [0, 5, 'alpha', undefined],
      [11, 16, 'alpha', undefined],
      [17, 22, 'alpha', undefined],
    ])
    expect(getTerminalSearchSessionStats(session)).toEqual({
      kind: 'terminal-search-session-stats@1',
      matchLimit: null,
      storedMatchCount: 3,
      truncated: false,
    })
  })

  test('matchLimit is applied after scope fan-out, cutting between scoped copies of one raw match', () => {
    const prepared = prepareTerminal('aa', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'a', {
      matchLimit: 3,
      scope: [
        { scopeId: 'a', sourceStart: 0, sourceEnd: 2 },
        { scopeId: 'b', sourceStart: 0, sourceEnd: 2 },
      ],
    })

    // Raw matches [0,1] and [1,2] each fan into one copy per overlapping scope.
    // After the canonical (sourceStart, sourceEnd, scopeId) sort the cap of 3
    // keeps both copies of [0,1] but only the first scoped copy of [1,2].
    expect(positions(getTerminalSearchMatchesForSourceRange(session))).toEqual([
      [0, 1, 'a', 'a'],
      [0, 1, 'a', 'b'],
      [1, 2, 'a', 'a'],
    ])
    expect(getTerminalSearchSessionStats(session)).toMatchObject({
      matchLimit: 3,
      storedMatchCount: 3,
      truncated: true,
    })
  })

  test('matchLimit composes with regex, and with case-insensitive whole-word matching', () => {
    const prepared = prepareTerminal('id:1 id:22 id:333 id:4', { whiteSpace: 'pre-wrap' })
    const regexCapped = createTerminalSearchSession(prepared, /id:\d+/, { mode: 'regex', matchLimit: 2 })

    expect(positions(getTerminalSearchMatchesForSourceRange(regexCapped))).toEqual([
      [0, 4, 'id:1', undefined],
      [5, 10, 'id:22', undefined],
    ])
    expect(getTerminalSearchSessionStats(regexCapped).truncated).toBe(true)

    const wordPrepared = prepareTerminal('Foo foo FOO foobar foo', { whiteSpace: 'pre-wrap' })
    const wordCapped = createTerminalSearchSession(wordPrepared, 'foo', {
      caseSensitive: false,
      wholeWord: true,
      matchLimit: 2,
    })

    expect(positions(getTerminalSearchMatchesForSourceRange(wordCapped))).toEqual([
      [0, 3, 'Foo', undefined],
      [4, 7, 'foo', undefined],
    ])
    expect(getTerminalSearchSessionStats(wordCapped)).toMatchObject({
      matchLimit: 2,
      storedMatchCount: 2,
      truncated: true,
    })
  })

  test('navigation and range queries respect the truncation boundary without rescanning', () => {
    const prepared = prepareTerminal('alpha alpha alpha alpha alpha', { whiteSpace: 'pre-wrap' })
    const capped = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 2 })

    // Last stored match is [6, 11]. after() past it sees no further stored match.
    expect(getTerminalSearchMatchAfterSourceOffset(capped, 12)).toBeNull()
    // before() just inside the boundary still surfaces the last stored match.
    expect(getTerminalSearchMatchBeforeSourceOffset(capped, 11)?.sourceStart).toBe(6)
    // A range fully beyond the boundary is empty.
    expect(getTerminalSearchMatchesForSourceRange(capped, { sourceStart: 12, sourceEnd: 29 })).toEqual([])
  })

  test('per-query limit and matchLimit are orthogonal, with the stored cap dominating', () => {
    const prepared = prepareTerminal('alpha alpha alpha alpha alpha', { whiteSpace: 'pre-wrap' })
    const capped = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 2 })

    // A larger per-query limit cannot resurrect matches dropped by the stored cap.
    expect(positions(getTerminalSearchMatchesForSourceRange(capped, { limit: 4 }))).toEqual([
      [0, 5, 'alpha', undefined],
      [6, 11, 'alpha', undefined],
    ])
    // A smaller per-query limit still slices the stored set as usual.
    expect(positions(getTerminalSearchMatchesForSourceRange(capped, { limit: 1 }))).toEqual([
      [0, 5, 'alpha', undefined],
    ])
  })

  test('re-scoping after the last stored match surfaces the next matches as a continuation', () => {
    const prepared = prepareTerminal('alpha alpha alpha alpha alpha', { whiteSpace: 'pre-wrap' })
    const first = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 2 })
    const firstMatches = getTerminalSearchMatchesForSourceRange(first)
    const lastStored = firstMatches[firstMatches.length - 1]!

    const continuation = createTerminalSearchSession(prepared, 'alpha', {
      matchLimit: 2,
      scope: { sourceStart: lastStored.sourceEnd, sourceEnd: 29 },
    })

    expect(positions(getTerminalSearchMatchesForSourceRange(continuation))).toEqual([
      [12, 17, 'alpha', undefined],
      [18, 23, 'alpha', undefined],
    ])
    expect(getTerminalSearchSessionStats(continuation).truncated).toBe(true)
  })

  test('rejects non-positive and non-integer matchLimit values', () => {
    const prepared = prepareTerminal('alpha beta', { whiteSpace: 'pre-wrap' })

    expect(() => createTerminalSearchSession(prepared, 'alpha', { matchLimit: 0 })).toThrow('matchLimit')
    expect(() => createTerminalSearchSession(prepared, 'alpha', { matchLimit: -1 })).toThrow('matchLimit')
    expect(() => createTerminalSearchSession(prepared, 'alpha', { matchLimit: 1.5 })).toThrow('matchLimit')
    expect(() => createTerminalSearchSession(prepared, 'alpha', { matchLimit: Number.NaN })).toThrow('matchLimit')
  })

  test('rejects forged session handles and returns a frozen stats object', () => {
    const prepared = prepareTerminal('alpha beta', { whiteSpace: 'pre-wrap' })
    const session = createTerminalSearchSession(prepared, 'alpha', { matchLimit: 4 })
    const forged = Object.freeze({ kind: 'terminal-search-session@1' }) as TerminalSearchSession

    expect(() => getTerminalSearchSessionStats(forged)).toThrow('Invalid terminal search session handle')
    const stats = getTerminalSearchSessionStats(session)
    expect(Object.isFrozen(stats)).toBe(true)
    expect(stats.kind).toBe('terminal-search-session-stats@1')
  })
})
