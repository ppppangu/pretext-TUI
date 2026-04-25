// 补建说明：该文件为后续补建，用于验证 prepared reader 的内部 debug snapshot 与 public opaque handle 边界；当前进度：首版覆盖 frozen handle、WeakMap forged rejection、snapshot copy 语义和 public runtime import policy。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as root from '../../src/index.js'
import {
  getInternalPreparedTerminalText,
  getInternalPreparedTerminalTextDebugSnapshot,
  type PreparedTerminalText as InternalPreparedTerminalText,
} from '../../src/terminal-prepared-reader.js'
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

  test('WeakMap-gated reader APIs reject forged and cloned handles', () => {
    const prepared = root.prepareTerminal('valid', { whiteSpace: 'pre-wrap' })
    const forged = Object.freeze({ kind: 'prepared-terminal-text@1' }) as PreparedTerminalText
    const cloned = Object.freeze({ ...prepared }) as PreparedTerminalText

    for (const handle of [forged, cloned]) {
      expect(() => root.layoutTerminal(handle, { columns: 8 })).toThrow('Invalid prepared terminal text handle')
      expect(() => getInternalPreparedTerminalText(handle as unknown as InternalPreparedTerminalText)).toThrow(
        'Invalid prepared terminal text handle',
      )
      expect(() => getInternalPreparedTerminalTextDebugSnapshot(
        handle as unknown as InternalPreparedTerminalText,
      )).toThrow('Invalid prepared terminal text handle')
    }
  })

  test('public runtime modules do not import or export the private prepared reader subpath', async () => {
    const publicRuntimeFiles = [
      'src/index.ts',
      'src/public-index.ts',
      'src/public-terminal-rich-inline.ts',
    ]
    for (const file of publicRuntimeFiles) {
      const content = await readFile(path.join(repoRoot, file), 'utf8')
      expect(content).not.toMatch(/from ['"]\.\/terminal-prepared-reader\.js['"]/)
      expect(content).not.toContain('getInternalPreparedTerminalTextDebugSnapshot')
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
    expect(JSON.stringify(packageJson.exports)).not.toContain('terminal-prepared-reader')
  })
})
