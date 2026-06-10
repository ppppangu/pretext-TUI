// 补建说明：该文件为后续补建，用于验证 Phase 4 generic range sidecar index 的公共 API 与 host-neutral 边界；当前进度：首版覆盖查询语义、不可变 inert data、校验和 forged handle 拒绝。
import { describe, expect, test } from 'bun:test'
import {
  appendTerminalRanges,
  createTerminalRangeIndex,
  getTerminalRangesAtSourceOffset,
  getTerminalRangesForSourceRange,
  type TerminalRange,
  type TerminalRangeIndex,
} from '../../src/public/index.js'
// getTerminalRangeIndexMemoryEstimate and the performance counters are not part of
// the public facade, so the append cost/footprint coverage imports them directly
// from the semantic module the public wrapper delegates to.
import { getTerminalRangeIndexMemoryEstimate } from '../../src/semantic/terminal-range-index.js'
import {
  disableTerminalPerformanceCounters,
  resetTerminalPerformanceCounters,
  snapshotTerminalPerformanceCounters,
} from '../../src/telemetry/terminal-performance-counters.js'

function ids(ranges: readonly TerminalRange[]): readonly string[] {
  return ranges.map(range => range.id)
}

describe('terminal range index', () => {
  test('queries point and source-range overlaps with stable source ordering', () => {
    const index = createTerminalRangeIndex([
      { id: 'late', kind: 'block', sourceStart: 12, sourceEnd: 20 },
      { id: 'outer', kind: 'block', sourceStart: 0, sourceEnd: 20, tags: ['visible'] },
      { id: 'point-5', kind: 'marker', sourceStart: 5, sourceEnd: 5 },
      { id: 'inner', kind: 'annotation', sourceStart: 4, sourceEnd: 8 },
      { id: 'boundary', kind: 'marker', sourceStart: 8, sourceEnd: 8 },
    ])

    expect(ids(getTerminalRangesAtSourceOffset(index, 5))).toEqual(['outer', 'inner', 'point-5'])
    expect(ids(getTerminalRangesAtSourceOffset(index, 8))).toEqual(['outer', 'boundary'])
    expect(ids(getTerminalRangesForSourceRange(index, { sourceStart: 5, sourceEnd: 12 }))).toEqual([
      'outer',
      'inner',
      'point-5',
      'boundary',
    ])
    expect(ids(getTerminalRangesForSourceRange(index, { sourceStart: 8, sourceEnd: 8 }))).toEqual([
      'outer',
      'boundary',
    ])
    expect(ids(getTerminalRangesForSourceRange(index, { sourceStart: 20, sourceEnd: 20 }))).toEqual([])
  })

  test('copies and freezes tags and inert data without interpreting range kind', () => {
    const tags = ['a']
    const data = { payload: { severity: 'low' }, list: [1, 'two'] }
    const index = createTerminalRangeIndex([
      { id: 'generic', kind: 'any-host-owned-kind', sourceStart: 0, sourceEnd: 3, tags, data },
    ])
    tags.push('mutated')
    data.payload.severity = 'high'
    data.list.push('mutated')

    const [range] = getTerminalRangesAtSourceOffset(index, 1)
    expect(range).toEqual({
      id: 'generic',
      kind: 'any-host-owned-kind',
      sourceStart: 0,
      sourceEnd: 3,
      tags: ['a'],
      data: { list: [1, 'two'], payload: { severity: 'low' } },
    })
    expect(Object.isFrozen(range)).toBe(true)
    expect(Object.isFrozen(range?.tags)).toBe(true)
    expect(Object.isFrozen(range?.data)).toBe(true)
    expect(Object.isFrozen((range?.data as { payload: object }).payload)).toBe(true)
  })

  test('rejects malformed ranges, duplicate ids, and active data shapes', () => {
    expect(() => createTerminalRangeIndex([{ id: '', kind: 'x', sourceStart: 0, sourceEnd: 1 }])).toThrow(
      'Terminal range id',
    )
    expect(() => createTerminalRangeIndex([{ id: 'a', kind: '', sourceStart: 0, sourceEnd: 1 }])).toThrow(
      'Terminal range kind',
    )
    expect(() => createTerminalRangeIndex([{ id: 'a', kind: 'x', sourceStart: -1, sourceEnd: 1 }])).toThrow(
      'sourceStart',
    )
    expect(() => createTerminalRangeIndex([{ id: 'a', kind: 'x', sourceStart: 2, sourceEnd: 1 }])).toThrow(
      'sourceEnd must be >= sourceStart',
    )
    expect(() => createTerminalRangeIndex([
      { id: 'dup', kind: 'x', sourceStart: 0, sourceEnd: 1 },
      { id: 'dup', kind: 'y', sourceStart: 1, sourceEnd: 2 },
    ])).toThrow('id must be unique')
    expect(() => createTerminalRangeIndex([{
      id: 'fn',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: { run: (() => undefined) as never },
    }])).toThrow('inert JSON-like data')
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => createTerminalRangeIndex([{
      id: 'cycle',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: cyclic as never,
    }])).toThrow('must not contain cycles')
    const withAccessor = {}
    Object.defineProperty(withAccessor, 'value', {
      enumerable: true,
      get() {
        return 'active'
      },
    })
    expect(() => createTerminalRangeIndex([{
      id: 'accessor',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: withAccessor as never,
    }])).toThrow('must be a data property')
    const withHidden = {}
    Object.defineProperty(withHidden, 'value', {
      enumerable: false,
      value: 'hidden',
    })
    expect(() => createTerminalRangeIndex([{
      id: 'hidden',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: withHidden as never,
    }])).toThrow('must be enumerable')
    const withSymbol = { [Symbol('secret')]: 'x' }
    expect(() => createTerminalRangeIndex([{
      id: 'symbol',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: withSymbol as never,
    }])).toThrow('symbol keys')
    const withProtoKey = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>
    expect(() => createTerminalRangeIndex([{
      id: 'proto-key',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: withProtoKey as never,
    }])).toThrow('is not allowed')
    const activeArray: unknown[] = []
    Object.defineProperty(activeArray, '0', {
      enumerable: true,
      get() {
        throw new Error('getter should not execute')
      },
    })
    expect(() => createTerminalRangeIndex([{
      id: 'active-array',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: activeArray as never,
    }])).toThrow('must be a data property')
    expect(() => createTerminalRangeIndex([{
      id: 'sparse-array',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: new Array(1) as never,
    }])).toThrow('sparse array holes')
    const arrayWithExtra = [1] as unknown[] & { run?: () => void }
    arrayWithExtra.run = () => undefined
    expect(() => createTerminalRangeIndex([{
      id: 'array-extra',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: arrayWithExtra as never,
    }])).toThrow('is not allowed')
    const activeTags: string[] = []
    Object.defineProperty(activeTags, '0', {
      enumerable: true,
      get() {
        throw new Error('tag getter should not execute')
      },
    })
    expect(() => createTerminalRangeIndex([{
      id: 'active-tags',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      tags: activeTags,
    }])).toThrow('must be a data property')
    let activeRangesGetterCount = 0
    const activeRanges: TerminalRange[] = []
    Object.defineProperty(activeRanges, '0', {
      enumerable: true,
      get() {
        activeRangesGetterCount++
        throw new Error('range getter should not execute')
      },
    })
    expect(() => createTerminalRangeIndex(activeRanges)).toThrow('must be a data property')
    expect(activeRangesGetterCount).toBe(0)
    let proxyTrapCount = 0
    const proxiedData = new Proxy({ value: true }, {
      getPrototypeOf(target) {
        proxyTrapCount++
        return Reflect.getPrototypeOf(target)
      },
      ownKeys(target) {
        proxyTrapCount++
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, property) {
        proxyTrapCount++
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    expect(() => createTerminalRangeIndex([{
      id: 'proxy',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: proxiedData as never,
    }])).toThrow('Proxy object')
    expect(proxyTrapCount).toBe(0)
    const shared = { ok: true }
    expect(createTerminalRangeIndex([{
      id: 'shared',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: { a: shared, b: shared },
    }]).kind).toBe('terminal-range-index@1')
  })

  test('rejects invalid queries and forged handles', () => {
    const index = createTerminalRangeIndex([{ id: 'a', kind: 'x', sourceStart: 0, sourceEnd: 1 }])
    const forged = Object.freeze({ kind: 'terminal-range-index@1' }) as TerminalRangeIndex

    expect(() => getTerminalRangesAtSourceOffset(index, Number.NaN)).toThrow('sourceOffset')
    expect(() => getTerminalRangesForSourceRange(index, null as never)).toThrow('query must be an object')
    expect(() => getTerminalRangesForSourceRange(index, [] as never)).toThrow('query must be an object')
    expect(() => getTerminalRangesForSourceRange(index, { sourceStart: 3, sourceEnd: 2 })).toThrow(
      'sourceEnd must be >= sourceStart',
    )
    expect(() => getTerminalRangesAtSourceOffset(forged, 0)).toThrow('Invalid terminal range index handle')
    expect(() => getTerminalRangesForSourceRange(forged, { sourceStart: 0, sourceEnd: 1 })).toThrow(
      'Invalid terminal range index handle',
    )
  })

  test('keeps large sparse indexes queryable without changing ordering semantics', () => {
    const ranges: TerminalRange[] = []
    for (let i = 0; i < 1000; i++) {
      ranges.push({
        id: `r-${String(i).padStart(4, '0')}`,
        kind: i % 2 === 0 ? 'even' : 'odd',
        sourceStart: i * 3,
        sourceEnd: i * 3 + 2,
      })
    }
    ranges.push({ id: 'wide', kind: 'wide', sourceStart: 1500, sourceEnd: 1800 })
    const index = createTerminalRangeIndex(ranges)

    expect(ids(getTerminalRangesAtSourceOffset(index, 1501))).toEqual(['wide', 'r-0500'])
    expect(getTerminalRangesForSourceRange(index, { sourceStart: 1490, sourceEnd: 1510 }).length).toBeGreaterThan(3)
  })
})

const FIXTURE_RANGES: readonly TerminalRange[] = [
  { id: 'late', kind: 'block', sourceStart: 12, sourceEnd: 20 },
  { id: 'outer', kind: 'block', sourceStart: 0, sourceEnd: 20, tags: ['visible'] },
  { id: 'point-5', kind: 'marker', sourceStart: 5, sourceEnd: 5 },
  { id: 'inner', kind: 'annotation', sourceStart: 4, sourceEnd: 8 },
  { id: 'boundary', kind: 'marker', sourceStart: 8, sourceEnd: 8 },
]

function probeOffsets(ranges: readonly TerminalRange[]): readonly number[] {
  const offsets = new Set<number>([0])
  let max = 0
  for (const range of ranges) {
    max = Math.max(max, range.sourceEnd)
    for (const value of [range.sourceStart, range.sourceEnd]) {
      offsets.add(value)
      if (value > 0) offsets.add(value - 1)
      offsets.add(value + 1)
    }
  }
  offsets.add(max + 2)
  return [...offsets].filter(value => value >= 0).sort((a, b) => a - b)
}

function assertAppendParity(base: readonly TerminalRange[], append: readonly TerminalRange[]): void {
  const appended = appendTerminalRanges(createTerminalRangeIndex(base), append)
  const oneShot = createTerminalRangeIndex([...base, ...append])
  const offsets = probeOffsets([...base, ...append])
  for (const offset of offsets) {
    expect(ids(getTerminalRangesAtSourceOffset(appended, offset)))
      .toEqual(ids(getTerminalRangesAtSourceOffset(oneShot, offset)))
  }
  for (const start of offsets) {
    for (const end of offsets) {
      if (end < start) continue
      expect(ids(getTerminalRangesForSourceRange(appended, { sourceStart: start, sourceEnd: end })))
        .toEqual(ids(getTerminalRangesForSourceRange(oneShot, { sourceStart: start, sourceEnd: end })))
    }
  }
}

describe('appendTerminalRanges', () => {
  test('matches one-shot construction across every partition of the fixture set', () => {
    for (let split = 0; split <= FIXTURE_RANGES.length; split++) {
      assertAppendParity(FIXTURE_RANGES.slice(0, split), FIXTURE_RANGES.slice(split))
    }
  })

  test('matches one-shot when appended ranges sit before, inside, and equal to base positions', () => {
    const base: readonly TerminalRange[] = [
      { id: 'mid', kind: 'block', sourceStart: 8, sourceEnd: 16 },
      { id: 'mid-point', kind: 'marker', sourceStart: 10, sourceEnd: 10 },
    ]
    const append: readonly TerminalRange[] = [
      { id: 'before', kind: 'block', sourceStart: 0, sourceEnd: 4 },
      { id: 'inside', kind: 'annotation', sourceStart: 9, sourceEnd: 12 },
      { id: 'equal-start', kind: 'annotation', sourceStart: 8, sourceEnd: 24 },
      { id: 'after', kind: 'block', sourceStart: 30, sourceEnd: 40 },
    ]
    assertAppendParity(base, append)
  })

  test('matches one-shot when tiebreaks straddle the batch boundary', () => {
    // Same sourceStart with different sourceEnd, and same start+end with different
    // id/kind, split so the comparator must order across the base/append boundary.
    const base: readonly TerminalRange[] = [
      { id: 'span-wide', kind: 'block', sourceStart: 4, sourceEnd: 12 },
      { id: 'tie-b', kind: 'zeta', sourceStart: 6, sourceEnd: 9 },
    ]
    const append: readonly TerminalRange[] = [
      { id: 'span-narrow', kind: 'block', sourceStart: 4, sourceEnd: 8 },
      { id: 'tie-a', kind: 'alpha', sourceStart: 6, sourceEnd: 9 },
      { id: 'tie-c', kind: 'alpha', sourceStart: 6, sourceEnd: 9 },
    ]
    assertAppendParity(base, append)
    const appended = appendTerminalRanges(createTerminalRangeIndex(base), append)
    // sourceEnd desc then id asc then kind asc decide order at the same sourceStart.
    expect(ids(getTerminalRangesForSourceRange(appended, { sourceStart: 4, sourceEnd: 13 }))).toEqual([
      'span-wide',
      'span-narrow',
      'tie-a',
      'tie-b',
      'tie-c',
    ])
  })

  test('rejects duplicate ids across batches and leaves the base index intact', () => {
    const base = createTerminalRangeIndex([
      { id: 'keep', kind: 'block', sourceStart: 0, sourceEnd: 4 },
      { id: 'dup', kind: 'block', sourceStart: 4, sourceEnd: 8 },
    ])
    expect(() => appendTerminalRanges(base, [
      { id: 'fresh', kind: 'block', sourceStart: 8, sourceEnd: 12 },
      { id: 'dup', kind: 'other', sourceStart: 12, sourceEnd: 16 },
    ])).toThrow('id must be unique')
    // Intra-batch duplicates within the appended array throw the same way.
    expect(() => appendTerminalRanges(base, [
      { id: 'twin', kind: 'block', sourceStart: 8, sourceEnd: 12 },
      { id: 'twin', kind: 'block', sourceStart: 16, sourceEnd: 20 },
    ])).toThrow('id must be unique')
    // The base handle is untouched and still queryable after the rejected append.
    expect(ids(getTerminalRangesAtSourceOffset(base, 1))).toEqual(['keep'])
    expect(ids(getTerminalRangesForSourceRange(base, { sourceStart: 0, sourceEnd: 8 }))).toEqual(['keep', 'dup'])
  })

  test('treats empty appends and appends onto empty-built indexes uniformly', () => {
    const base = createTerminalRangeIndex(FIXTURE_RANGES)
    const empty = appendTerminalRanges(base, [])
    expect(empty.kind).toBe('terminal-range-index@1')
    expect(empty).not.toBe(base)
    // Empty append returns a fresh, usable handle with identical query results.
    for (const offset of probeOffsets(FIXTURE_RANGES)) {
      expect(ids(getTerminalRangesAtSourceOffset(empty, offset)))
        .toEqual(ids(getTerminalRangesAtSourceOffset(base, offset)))
    }
    // Appending onto an empty-built index equals one-shot construction.
    assertAppendParity([], FIXTURE_RANGES)
    const fromEmpty = appendTerminalRanges(createTerminalRangeIndex([]), FIXTURE_RANGES)
    expect(ids(getTerminalRangesAtSourceOffset(fromEmpty, 5))).toEqual(['outer', 'inner', 'point-5'])
  })

  test('reuses constructor validation messages and never executes active newRanges members', () => {
    const base = createTerminalRangeIndex([{ id: 'base', kind: 'x', sourceStart: 0, sourceEnd: 1 }])
    expect(() => appendTerminalRanges(base, null as never)).toThrow('Terminal ranges must be an array')
    expect(() => appendTerminalRanges(base, [{ id: '', kind: 'x', sourceStart: 0, sourceEnd: 1 }])).toThrow(
      'Terminal range id',
    )
    expect(() => appendTerminalRanges(base, [{ id: 'k', kind: 'x', sourceStart: 2, sourceEnd: 1 }])).toThrow(
      'sourceEnd must be >= sourceStart',
    )
    expect(() => appendTerminalRanges(base, [{
      id: 'fn',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: { run: (() => undefined) as never },
    }])).toThrow('inert JSON-like data')
    let activeRangesGetterCount = 0
    const activeRanges: TerminalRange[] = []
    Object.defineProperty(activeRanges, '0', {
      enumerable: true,
      get() {
        activeRangesGetterCount++
        throw new Error('range getter should not execute')
      },
    })
    expect(() => appendTerminalRanges(base, activeRanges)).toThrow('must be a data property')
    expect(activeRangesGetterCount).toBe(0)
    let proxyTrapCount = 0
    const proxiedData = new Proxy({ value: true }, {
      getPrototypeOf(target) {
        proxyTrapCount++
        return Reflect.getPrototypeOf(target)
      },
      ownKeys(target) {
        proxyTrapCount++
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, property) {
        proxyTrapCount++
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    expect(() => appendTerminalRanges(base, [{
      id: 'proxy',
      kind: 'x',
      sourceStart: 0,
      sourceEnd: 1,
      data: proxiedData as never,
    }])).toThrow('Proxy object')
    expect(proxyTrapCount).toBe(0)
  })

  test('rejects forged handles before any allocation', () => {
    const forged = Object.freeze({ kind: 'terminal-range-index@1' }) as TerminalRangeIndex
    expect(() => appendTerminalRanges(forged, [{ id: 'a', kind: 'x', sourceStart: 0, sourceEnd: 1 }])).toThrow(
      'Invalid terminal range index handle',
    )
  })

  test('chained appends equal a single one-shot construction', () => {
    const batches: readonly TerminalRange[][] = [
      [{ id: 'b0-a', kind: 'block', sourceStart: 0, sourceEnd: 6 }, { id: 'b0-b', kind: 'marker', sourceStart: 3, sourceEnd: 3 }],
      [{ id: 'b1-a', kind: 'block', sourceStart: 6, sourceEnd: 14 }],
      [{ id: 'b2-a', kind: 'annotation', sourceStart: 2, sourceEnd: 18 }, { id: 'b2-b', kind: 'block', sourceStart: 14, sourceEnd: 20 }],
      [{ id: 'b3-a', kind: 'marker', sourceStart: 10, sourceEnd: 10 }],
    ]
    let chained = createTerminalRangeIndex(batches[0]!)
    for (let i = 1; i < batches.length; i++) {
      chained = appendTerminalRanges(chained, batches[i]!)
    }
    const oneShot = createTerminalRangeIndex(batches.flat())
    for (const offset of probeOffsets(batches.flat())) {
      expect(ids(getTerminalRangesAtSourceOffset(chained, offset)))
        .toEqual(ids(getTerminalRangesAtSourceOffset(oneShot, offset)))
    }
  })

  test('records append counters and never revalidates base ranges', () => {
    resetTerminalPerformanceCounters()
    try {
      const base = createTerminalRangeIndex([
        { id: 'a', kind: 'block', sourceStart: 0, sourceEnd: 4 },
        { id: 'b', kind: 'block', sourceStart: 4, sourceEnd: 8 },
      ])
      const afterBuild = snapshotTerminalPerformanceCounters()
      expect(afterBuild.terminalRangeIndexBuilds).toBe(1)
      expect(afterBuild.terminalRangeIndexRanges).toBe(2)
      expect(afterBuild.terminalRangeIndexAppends).toBe(0)

      appendTerminalRanges(base, [
        { id: 'c', kind: 'block', sourceStart: 8, sourceEnd: 12 },
        { id: 'd', kind: 'block', sourceStart: 12, sourceEnd: 16 },
        { id: 'e', kind: 'block', sourceStart: 16, sourceEnd: 20 },
      ])
      const afterAppend = snapshotTerminalPerformanceCounters()
      expect(afterAppend.terminalRangeIndexAppends).toBe(1)
      expect(afterAppend.terminalRangeIndexAppendedRanges).toBe(3)
      expect(afterAppend.terminalRangeIndexRevalidatedRanges).toBe(0)
      // No extra one-shot build/range work is attributed to the append path.
      expect(afterAppend.terminalRangeIndexBuilds).toBe(1)
      expect(afterAppend.terminalRangeIndexRanges).toBe(2)
    } finally {
      disableTerminalPerformanceCounters()
    }
  })

  test('appended index reports the same memory footprint as the one-shot equivalent', () => {
    const base = FIXTURE_RANGES.slice(0, 2)
    const append = FIXTURE_RANGES.slice(2)
    const appended = appendTerminalRanges(createTerminalRangeIndex(base), append)
    const oneShot = createTerminalRangeIndex([...base, ...append])
    const appendedEstimate = getTerminalRangeIndexMemoryEstimate(appended as never, 'parity')
    const oneShotEstimate = getTerminalRangeIndexMemoryEstimate(oneShot as never, 'parity')
    expect(appendedEstimate).toEqual(oneShotEstimate)
  })
})
