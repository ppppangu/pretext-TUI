// 补建说明：该文件为后续补建，用于验证 Phase 10 adoption evidence pack、matrix、approval index 与 clean report 引用不会漂移；当前进度：首版覆盖矩阵存在性、公开 runtime export 覆盖、gate 引用与 clean evidence report 元数据。
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import {
  richPublicRuntimeExports,
  terminalPublicRuntimeExports,
} from '../../scripts/public-api-contract.js'
import { readBenchmarkEvidenceReport } from '../../scripts/tui-benchmark-evidence.js'

const repoRoot = path.resolve(import.meta.dir, '../..')
const cleanReportId = 'competitive-tui-20260427-3e95bef-clean-8760e911'
const cleanReportPath = path.join(
  repoRoot,
  'docs/evidence/benchmark-reports',
  `${cleanReportId}.json`,
)

const phase10Files = [
  'docs/evidence/kernel-capability-matrix.md',
  'docs/evidence/correctness-matrix.md',
  'docs/evidence/adoption-evidence-pack.md',
  'docs/production/security-support-provenance-matrix.md',
  'docs/recipes/agent-transcript-generic.md',
  'docs/decisions/incubating-api-approval-index.md',
  'docs/decisions/phase-10-adoption-evidence-launch-readiness-approval.md',
]

describe('phase 10 adoption evidence pack', () => {
  test('new Phase 10 docs carry補建说明 and cite the clean report id without dynamic numbers', async () => {
    for (const relativePath of phase10Files) {
      const content = await readProjectFile(relativePath)
      expect(content).toContain('补建说明')
      expect(content).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ms|ops\/sec|ops\/s)\b/i)
      expect(content).not.toMatch(/\b(?:p50|p95|mean|stdev|min|max)\s*[:=]\s*\d/i)
    }

    const evidencePack = await readProjectFile('docs/evidence/adoption-evidence-pack.md')
    expect(evidencePack).toContain(cleanReportId)
    expect(evidencePack).toContain('Timing values, ratios, percentiles, and sample tables remain in the JSON report')
  })

  test('kernel capability matrix covers every current public runtime export', async () => {
    const content = await readProjectFile('docs/evidence/kernel-capability-matrix.md')

    for (const exportName of [...terminalPublicRuntimeExports, ...richPublicRuntimeExports]) {
      expect(content).toContain(`\`${exportName}\``)
    }
  })

  test('incubating API approval index links every phase approval record before Phase 10 closure', async () => {
    const content = await readProjectFile('docs/decisions/incubating-api-approval-index.md')
    const requiredApprovalRecords = [
      'phase-1-2-coordinate-projection-approval.md',
      'phase-3-layout-bundle-approval.md',
      'phase-4-range-sidecar-approval.md',
      'phase-5-search-session-approval.md',
      'phase-6-selection-extraction-approval.md',
      'phase-7-rich-metadata-hardening-approval.md',
      'phase-8-true-chunked-append-approval.md',
      'phase-9-performance-memory-evidence-approval.md',
      'phase-10-adoption-evidence-launch-readiness-approval.md',
    ]

    for (const record of requiredApprovalRecords) {
      expect(content).toContain(record)
    }
    expect(content).toContain('not a stable `0.1` promotion record')
  })

  test('correctness and production matrices cite the required release gates and stay within support boundaries', async () => {
    const correctness = await readProjectFile('docs/evidence/correctness-matrix.md')
    for (const required of [
      'bun run tui-oracle-check',
      'bun run tui-corpus-check',
      'bun run tui-fuzz --seed=ci --cases=2000',
      'bun run benchmark-check:tui',
      'bun run memory-budget-check:tui',
      'bun run package-smoke-test',
      'tests/tui/chunked-append-parity.test.ts',
    ]) {
      expect(correctness).toContain(required)
    }

    const production = await readProjectFile('docs/production/security-support-provenance-matrix.md')
    expect(production).toContain('Public package entry points are limited')
    expect(production).toContain('This is metadata extraction with policy limits')
    expect(production).not.toMatch(/\b(?:SBOM|attestation|npm provenance)\b/i)
  })

  test('accepted clean benchmark report remains local-evidence-only and provenance-backed', async () => {
    const rawReport = JSON.parse(await readFile(cleanReportPath, 'utf8')) as {
      metadata?: { note?: unknown }
    }
    const report = await readBenchmarkEvidenceReport(cleanReportPath)
    const ancestorCheck = Bun.spawnSync(['git', 'merge-base', '--is-ancestor', report.git.commit ?? '', 'HEAD'], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    expect(rawReport.metadata?.note).toContain('补建说明')
    expect(report.reportId).toBe(cleanReportId)
    expect(report.git.dirty).toBe(false)
    expect(report.git.shortCommit).toBe('3e95bef')
    expect(ancestorCheck.exitCode).toBe(0)
    expect(report.claimability).toBe('local-evidence-only')
    expect(report.command.packageScript).toBe('benchmark:evidence:tui')
    await expectReportSourceHashesToMatchCurrentFiles(report)
    expect(report.workloads.some(workload => workload.id === 'large-page-seek')).toBe(true)
    expect(report.semanticMatrix.length).toBeGreaterThan(0)
  })
})

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8')
}

async function expectReportSourceHashesToMatchCurrentFiles(report: Awaited<ReturnType<typeof readBenchmarkEvidenceReport>>): Promise<void> {
  for (const [scriptPath, expectedHash] of Object.entries(report.sources.scriptHashes)) {
    await expectFileHash(scriptPath, expectedHash)
  }
  await expectFileHash(report.sources.configPath, report.sources.configHash)
  await expectFileHash('package.json', report.sources.packageJsonHash)
  if (report.sources.lockfileHash !== null) {
    await expectFileHash('bun.lock', report.sources.lockfileHash)
  }
}

async function expectFileHash(relativePath: string, expectedHash: string): Promise<void> {
  const buffer = await readFile(path.join(repoRoot, relativePath))
  expect(crypto.createHash('sha256').update(buffer).digest('hex')).toBe(expectedHash)
}
