// 补建说明：该文件为后续补建，用于验证 Phase 9 release gate 与机器可读 dashboard/package scripts 保持一致；当前进度：首版覆盖 prepublish/release gate 和 required gate map。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dir, '../..')
const canonicalGateScripts = [
  'check',
  'test:tui',
  'tui-oracle-check',
  'tui-corpus-check',
  'tui-fuzz --seed=ci --cases=2000',
  'benchmark-check:tui',
  'memory-budget-check:tui',
  'terminal-demo-check',
  'api-snapshot-check',
  'package-smoke-test',
]
const canonicalCheckScript = 'bun run typecheck:tui && bun run typecheck:tui-validation && bun run tui-static-gate && oxlint --type-aware src'

describe('tui release gate consistency', () => {
  test('package prepublish delegates to the canonical release gate', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['prepublishOnly']).toBe('bun run release-gate:tui')
    expect(packageJson.scripts['check']).toBe(canonicalCheckScript)
    expect(packageJson.scripts['release-gate:tui']).toBe(canonicalGateScripts.map(script => `bun run ${script}`).join(' && '))
    expect(packageJson.scripts['memory-budget-check:tui']).toBe('bun run scripts/tui-memory-budget-check.ts')
  })

  test('status dashboard lists every release gate as required', async () => {
    const dashboard = JSON.parse(await readFile(path.join(repoRoot, 'status/tui-dashboard.json'), 'utf8')) as {
      gate: Record<string, string>
    }
    for (const script of canonicalGateScripts) {
      expect(dashboard.gate[script]).toContain('required')
    }
  })
})
