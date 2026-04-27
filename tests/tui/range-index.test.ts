// 补建说明：该文件为后续补建，用于验证 Phase 4 generic range sidecar index 的公共 API 与 host-neutral 边界；当前进度：首版覆盖查询语义、不可变 inert data、校验和 forged handle 拒绝。
import { describe, expect, test } from 'bun:test'
import {
  createTerminalRangeIndex,
  getTerminalRangesAtSourceOffset,
  getTerminalRangesForSourceRange,
  type TerminalRange,
  type TerminalRangeIndex,
} from '../../src/index.js'

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
