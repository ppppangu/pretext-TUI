// 补建说明：该文件为后续补建，用于验证 README/STATUS/TODO/dashboard/evidence 当前事实源不会再次漂移；当前进度：覆盖版本、clean report id、append claim 与 check gate 文案同步。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dir, '../..')
const currentReportId = 'competitive-tui-20260615-05a8d54-clean-ad380eea'
const supersededLiveReportIds = [
  'competitive-tui-20260610-306debd-clean-fd7b8b9f',
  'competitive-tui-20260614-8bb092d-clean-054adcee',
]
const liveCitationFiles = [
  'README.md',
  'STATUS.md',
  'TODO.md',
  'docs/evidence/README.md',
  'docs/evidence/adoption-evidence-pack.md',
  'docs/evidence/kernel-capability-matrix.md',
  'docs/evidence/correctness-matrix.md',
  'docs/production/security-support-provenance-matrix.md',
  'docs/decisions/incubating-api-approval-index.md',
  'docs/roadmap/library-adoption-performance-roadmap.md',
]

describe('current TUI docs sync', () => {
  test('current package version is synchronized across public status entry points', async () => {
    const packageJson = JSON.parse(await readProjectFile('package.json')) as { version: string }
    const readme = await readProjectFile('README.md')
    const status = await readProjectFile('STATUS.md')
    const todo = await readProjectFile('TODO.md')
    const dashboard = JSON.parse(await readProjectFile('status/tui-dashboard.json')) as {
      scope: { releaseStatus: string }
    }

    expect(readme).toContain(`npm install pretext-tui@${packageJson.version}`)
    expect(readme).toContain(`Current package version: \`${packageJson.version}\``)
    expect(status).toContain(`\`${packageJson.version}\` \`pretext-TUI\``)
    expect(todo).toContain(`\`${packageJson.version}\` \`pretext-TUI\``)
    expect(dashboard.scope.releaseStatus).toContain(`${packageJson.version} release`)
  })

  test('live evidence citations point at the current clean report id only', async () => {
    for (const relativePath of liveCitationFiles) {
      const content = await readProjectFile(relativePath)
      expect(content).toContain(currentReportId)
      for (const oldReportId of supersededLiveReportIds) {
        expect(content).not.toContain(oldReportId)
      }
    }

    const dashboard = JSON.parse(await readProjectFile('status/tui-dashboard.json')) as {
      scope: { phase10LaunchReadiness: string }
      phase10: { evidenceReportId: string }
    }
    expect(dashboard.scope.phase10LaunchReadiness).toContain(currentReportId)
    expect(dashboard.phase10.evidenceReportId).toBe(currentReportId)
  })

  test('append and check-gate wording matches current implementation constraints', async () => {
    const readme = await readProjectFile('README.md')
    const packageJson = JSON.parse(await readProjectFile('package.json')) as { scripts: Record<string, string> }
    const dashboard = JSON.parse(await readProjectFile('status/tui-dashboard.json')) as {
      gate: Record<string, string>
    }

    expect(readme).not.toContain('without re-deriving totals after every append')
    expect(readme).toContain('bounded replay from retained anchors')
    expect(packageJson.scripts['check']).toContain('bun node_modules/.bin/oxlint --type-aware src')
    expect(dashboard.gate['bun node_modules/.bin/oxlint --type-aware src']).toContain('required')
  })
})

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8')
}
