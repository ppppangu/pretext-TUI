// 补建说明：该文件为后续补建，用于验证 prepared reader 的内部 debug snapshot 与 public opaque handle 边界；当前进度：Batch 6A.1 扩展 internal reader parity、WeakMap forged rejection 与 public runtime import policy。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as root from '../../src/index.js'
import {
  getInternalPreparedTerminalGeometry,
  getInternalPreparedTerminalReader,
  getInternalPreparedTerminalText,
  getInternalPreparedTerminalTextDebugSnapshot,
  type PreparedTerminalReader,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/terminal-prepared-reader.js'
import { materializePreparedTerminalSourceTextRange } from '../../src/terminal-line-source.js'
import type { PreparedTerminalText } from '../../src/index.js'

const repoRoot = path.resolve(import.meta.dir, '../..')

describe('prepared reader capability boundary', () => {
  test('prepared handles stay frozen and structurally opaque', () => {
    const prepared = root.prepareTerminal('alpha\tbeta\nשלום terminal', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    })

    expect(Object.isFrozen(prepared)).toBe(true)
    expect(Reflect.ownKeys(prepared)).toEqual(['kind'])
    expect(Reflect.set(prepared, 'sourceText', 'leak')).toBe(false)
    expect(prepared).not.toHaveProperty('sourceText')
    expect(prepared).not.toHaveProperty('segments')
    expect(prepared).not.toHaveProperty('widths')
  })

  test('internal reader mirrors legacy prepared storage through a narrow runtime surface', () => {
    for (const fixture of [
      {
        text: ' alpha\t beta\r\n gamma ',
        options: { whiteSpace: 'normal' },
      },
      {
        text: 'alpha\r\nbeta\rgamma\fomega\n',
        options: { whiteSpace: 'pre-wrap', tabSize: 4 },
      },
      {
        text: 'tab\tsoft\u00ADzero\u200Bword\u2060join\uFEFFtail',
        options: { whiteSpace: 'pre-wrap', tabSize: 8 },
      },
      {
        text: 'e\u0301 👩‍💻 🇺🇸 Ω',
        options: { whiteSpace: 'pre-wrap', widthProfile: { ambiguousWidth: 'wide' } },
      },
    ] as const) {
      const prepared = root.prepareTerminal(
        fixture.text,
        fixture.options,
      ) as unknown as InternalPreparedTerminalText
      const live = getInternalPreparedTerminalText(prepared)
      const reader = getInternalPreparedTerminalReader(prepared)

      expect(reader.kind).toBe('prepared-terminal-reader@1')
      expect(reader.segmentCount).toBe(live.segments.length)
      expect(reader.sourceLength).toBe(live.sourceText.length)
      expect(reader.tabStopAdvance).toBe(live.tabStopAdvance)
      expect(reader.widthProfile).toEqual(live.widthProfile)
      expect(reader).not.toHaveProperty('legacyPreparedForDebugSnapshot')
      expect(reader).not.toHaveProperty('sourceTextForDebugSnapshot')
      expect(reader).not.toHaveProperty('sourceSlice')
      expect(reader).not.toHaveProperty('sourceTextRange')

      const geometry = getInternalPreparedTerminalGeometry(prepared)
      expect(geometry.reader).toBe(reader)
      expect(geometry).not.toHaveProperty('prepared')

      for (let segmentIndex = 0; segmentIndex < live.segments.length; segmentIndex++) {
        expect(reader.segmentText(segmentIndex)).toBe(live.segments[segmentIndex])
        expect(reader.segmentKind(segmentIndex)).toBe(live.kinds[segmentIndex])
        expect(reader.segmentSourceStart(segmentIndex)).toBe(live.sourceStarts[segmentIndex] ?? live.sourceText.length)
        expect(reader.hasSegmentBreakAfter(segmentIndex)).toBe(live.segmentBreaksAfter[segmentIndex] ?? false)
      }

      expect(reader.segmentText(live.segments.length)).toBeUndefined()
      expect(reader.segmentKind(live.segments.length)).toBeUndefined()
      expect(reader.segmentSourceStart(live.segments.length)).toBe(live.sourceText.length)
      expect(reader.hasSegmentBreakAfter(live.segments.length)).toBe(false)
    }
  })

  test('debug snapshots are copied structural data, not live prepared storage', () => {
    const prepared = root.prepareTerminal('alpha beta\nשלום\tterminal', {
      whiteSpace: 'pre-wrap',
      tabSize: 4,
    }) as unknown as InternalPreparedTerminalText
    const live = getInternalPreparedTerminalText(prepared)
    const snapshot = getInternalPreparedTerminalTextDebugSnapshot(prepared)

    expect(snapshot.kind).toBe('prepared-terminal-text-debug-snapshot@1')
    expect(snapshot.sourceText).toBe(live.sourceText)
    expect(snapshot.segments).toEqual(live.segments)
    expect(snapshot.segments).not.toBe(live.segments)
    expect(snapshot.sourceStarts).toEqual(live.sourceStarts)
    expect(snapshot.sourceStarts).not.toBe(live.sourceStarts)
    expect(snapshot.widths).toEqual(live.widths)
    expect(snapshot.widths).not.toBe(live.widths)
    expect(snapshot.kinds).toEqual(live.kinds)
    expect(snapshot.kinds).not.toBe(live.kinds)
    expect(snapshot.segmentBreaksAfter).toEqual(live.segmentBreaksAfter)
    expect(snapshot.segmentBreaksAfter).not.toBe(live.segmentBreaksAfter)
    expect(snapshot.chunks).toEqual(live.chunks)
    expect(snapshot.chunks).not.toBe(live.chunks)
    expect(snapshot.widthProfile).toEqual(live.widthProfile)
    expect(snapshot.widthProfile).not.toBe(live.widthProfile)

    if (snapshot.chunks[0] !== undefined && live.chunks[0] !== undefined) {
      expect(snapshot.chunks[0]).not.toBe(live.chunks[0])
    }

    const firstBreakableIndex = snapshot.breakableFitAdvances.findIndex(advances => advances !== null)
    if (firstBreakableIndex >= 0) {
      const snapshotAdvances = snapshot.breakableFitAdvances[firstBreakableIndex]
      const liveAdvances = live.breakableFitAdvances[firstBreakableIndex]
      expect(snapshotAdvances).toEqual(liveAdvances)
      if (snapshotAdvances !== null && liveAdvances !== null) {
        expect(snapshotAdvances).not.toBe(liveAdvances)
      }
    }

    if (live.segLevels !== null) {
      expect(snapshot.segLevels).toEqual(Array.from(live.segLevels))
      expect(snapshot.segLevels).not.toBe(live.segLevels)
    }

    const originalFirstSegment = snapshot.segments[0]
    const originalFirstSourceStart = snapshot.sourceStarts[0]
    ;(snapshot.segments as string[])[0] = 'mutated outside state'
    ;(snapshot.sourceStarts as number[])[0] = 999
    ;(snapshot.widthProfile as { defaultTabSize: number }).defaultTabSize = 99

    const nextSnapshot = getInternalPreparedTerminalTextDebugSnapshot(prepared)
    expect(nextSnapshot.segments[0]).toBe(originalFirstSegment)
    expect(nextSnapshot.sourceStarts[0]).toBe(originalFirstSourceStart)
    expect(nextSnapshot.widthProfile.defaultTabSize).toBe(live.widthProfile.defaultTabSize)
  })

  test('empty prepared text snapshots still expose a real terminal width profile', () => {
    const prepared = root.prepareTerminal('', { whiteSpace: 'pre-wrap' }) as unknown as InternalPreparedTerminalText
    const snapshot = getInternalPreparedTerminalTextDebugSnapshot(prepared)

    expect(snapshot.sourceText).toBe('')
    expect(snapshot.segments).toEqual([])
    expect(snapshot.widthProfile.kind).toBe('terminal-width-profile')
    expect(snapshot.widthProfile.cacheKey).toContain('terminal-width-profile')
    expect(snapshot.widthProfile.defaultTabSize).toBeGreaterThan(0)
  })

  test('source text range reconstruction seeks near the requested source range', () => {
    const base = root.prepareTerminal('x', { whiteSpace: 'pre-wrap' }) as unknown as InternalPreparedTerminalText
    const baseReader = getInternalPreparedTerminalReader(base)
    let segmentTextCalls = 0
    const segmentCount = 1024
    const reader = Object.freeze({
      kind: 'prepared-terminal-reader@1',
      get segmentCount() {
        return segmentCount
      },
      get sourceLength() {
        return segmentCount
      },
      get tabStopAdvance() {
        return baseReader.tabStopAdvance
      },
      get widthProfile() {
        return baseReader.widthProfile
      },
      hasSegmentBreakAfter() {
        return false
      },
      segmentKind() {
        return 'text'
      },
      segmentSourceStart(segmentIndex: number) {
        return segmentIndex >= 0 && segmentIndex < segmentCount ? segmentIndex : segmentCount
      },
      segmentText(segmentIndex: number) {
        segmentTextCalls++
        return segmentIndex >= 0 && segmentIndex < segmentCount ? 'x' : undefined
      },
    }) satisfies PreparedTerminalReader

    expect(materializePreparedTerminalSourceTextRange(reader, segmentCount - 2, segmentCount - 1)).toBe('x')
    expect(segmentTextCalls).toBeLessThan(32)
    expect(reader).not.toHaveProperty('sourceTextRange')
    expect(reader).not.toHaveProperty('sourceSlice')
  })

  test('WeakMap-gated reader APIs reject forged and cloned handles', () => {
    const prepared = root.prepareTerminal('valid', { whiteSpace: 'pre-wrap' })
    const forged = Object.freeze({ kind: 'prepared-terminal-text@1' }) as PreparedTerminalText
    const cloned = Object.freeze({ ...prepared }) as PreparedTerminalText

    for (const handle of [forged, cloned]) {
      expect(() => root.layoutTerminal(handle, { columns: 8 })).toThrow('Invalid prepared terminal text handle')
      expect(() => getInternalPreparedTerminalText(handle as unknown as InternalPreparedTerminalText)).toThrow(
        'Invalid prepared terminal text handle',
      )
      expect(() => getInternalPreparedTerminalReader(handle as unknown as InternalPreparedTerminalText)).toThrow(
        'Invalid prepared terminal text handle',
      )
      expect(() => getInternalPreparedTerminalGeometry(handle as unknown as InternalPreparedTerminalText)).toThrow(
        'Invalid prepared terminal text handle',
      )
      expect(() => getInternalPreparedTerminalTextDebugSnapshot(
        handle as unknown as InternalPreparedTerminalText,
      )).toThrow('Invalid prepared terminal text handle')
    }
  })

  test('public runtime modules do not import or export private prepared reader or geometry subpaths', async () => {
    const publicRuntimeFiles = [
      'src/index.ts',
      'src/public-index.ts',
      'src/public-terminal-rich-inline.ts',
    ]
    const forbiddenPublicRuntimeTokens = [
      "from './terminal-prepared-reader.js'",
      "from './terminal-grapheme-geometry.js'",
      'terminal-prepared-reader',
      'terminal-grapheme-geometry',
      'PreparedTerminalReader',
      'PreparedTerminalGeometry',
      'getInternalPreparedTerminalReader',
      'getInternalPreparedTerminalGeometry',
      'getInternalPreparedTerminalTextDebugSnapshot',
    ]

    for (const file of publicRuntimeFiles) {
      const content = await readFile(path.join(repoRoot, file), 'utf8')
      for (const token of forbiddenPublicRuntimeTokens) {
        expect(content).not.toContain(token)
      }
    }

    const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([
      '.',
      './package.json',
      './terminal',
      './terminal-rich-inline',
    ])
    const packageExports = JSON.stringify(packageJson.exports)
    for (const token of forbiddenPublicRuntimeTokens) {
      expect(packageExports).not.toContain(token)
    }
  })
})
