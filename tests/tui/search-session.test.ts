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
  prepareTerminal,
  prepareTerminalCellFlow,
  type TerminalSearchMatch,
  type TerminalSearchSession,
} from '../../src/index.js'
import {
  prepareTerminalRichInline,
} from '../../src/public-terminal-rich-inline.js'

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
})
