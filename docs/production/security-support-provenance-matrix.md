<!-- 补建说明：该文件为后续补建，用于汇总 pretext-TUI production/security/support/provenance 证据矩阵；当前进度：Phase 10 已 approve with documented residual risk，保持 host-neutral 并避免未实现的集成或广义安全/性能声明。 -->
# Security, Support, And Provenance Matrix

This matrix describes the production posture of the package-owned terminal text kernel. It is scoped to public data APIs, validation gates, package metadata, and documented limitations.

| Area | Current posture | Evidence | Support note |
| --- | --- | --- | --- |
| Public support surface | Public package entry points are limited to `pretext-tui`, `pretext-tui/terminal`, `pretext-tui/terminal-rich-inline`, and `pretext-tui/package.json`. | `package.json`, `docs/contracts/public-api-boundary.md`, `tests/tui/public-api-boundary.test.ts`, `bun run api-snapshot-check`, `bun run package-smoke-test` | New public subpaths require an explicit contract update and package smoke coverage. |
| Stable-candidate core | Core prepare/layout/range/materialize APIs are candidates for the first stable contract. | `docs/contracts/public-api-boundary.md`, `src/terminal-core.test.ts`, `tests/tui/public-layout.test.ts` | Treat core data shapes as high-care compatibility surfaces during adoption work. |
| Incubating helpers | Rich inline metadata, fixed-column indexes, page caches, layout bundles, source/range projection, search, selection/extraction, and append-only flow are useful but still incubating. | `docs/evidence/kernel-capability-matrix.md`, `tests/tui/*`, `STATUS.md` | Incubating APIs may be refined before a stable release; adoption copy should label them that way. |
| Rich inline policy | Rich inline input is opt-in, exposes visible text plus structured metadata, redacts diagnostics by default, and validates runtime policy values. | `docs/contracts/terminal-security-profile.md`, `tests/tui/rich-security-gate.test.ts`, `src/terminal-rich-inline.test.ts` | This is metadata extraction with policy limits, not a universal terminal safety guarantee. |
| Raw input provenance | Prepared rich handles expose no full raw payload by default; configured summaries use fingerprint/sample policy and redacted diagnostic records. | `docs/contracts/terminal-security-profile.md`, `tests/tui/rich-security-gate.test.ts` | Consumers that require full raw records must store and govern them outside this package. |
| URI metadata policy | Link-like rich metadata is scheme-checked, credential-checked, length-capped, and represented as data. | `tests/tui/rich-security-gate.test.ts`, `docs/contracts/terminal-security-profile.md` | The package returns metadata only; user actions and trust prompts are outside this package. |
| Bidi/control handling | Plain input rejects raw controls; rich input can sanitize or reject unsupported controls and bidi format controls according to policy. | `src/terminal-core.test.ts`, `tests/tui/rich-security-gate.test.ts`, `docs/contracts/terminal-security-profile.md` | Unsupported controls are not interpreted as behavior by the package. |
| DoS-oriented limits | Rich policy includes limits for input size, control size, spans, raw-visible map entries, diagnostics, URI size, and reconstruction output size. | `tests/tui/rich-security-gate.test.ts`, `src/public-terminal-rich-inline.ts` | Limits protect package-owned parsing/materialization work; callers still own upstream admission policy. |
| Package provenance | Package build and smoke tests validate public wrappers, declaration output, exports, and package file inventory. | `scripts/build-package.ts`, `scripts/package-smoke-test.ts`, `scripts/public-api-contract.ts`, `package.json` | Release provenance should cite scripts, package metadata, lockfile state, and the commit used for release artifacts. |
| Benchmark evidence provenance | Optional comparison reports include schema, report id, git cleanliness, script/config hashes, dependency metadata, workloads, raw samples, and semantic caveats. | `docs/evidence/benchmark-reports/competitive-tui-20260427-3e95bef-clean-8760e911.json`, `tests/tui/benchmark-evidence.test.ts`, `docs/evidence/benchmark-claims.md` | Cite report id and workload ids only; leave dynamic measurement values in JSON. |
| Modeled memory budgets | `memory-budget-check:tui` validates deterministic package-owned structure estimates for configured workloads. | `benchmarks/tui-memory-budgets.json`, `scripts/tui-memory-budget-check.ts`, `tests/tui/memory-budget.test.ts` | This evidence is not a whole-application memory claim. |
| Claim guardrails | Markdown evidence guards help guard against copied timing values and common overclaim phrases in public docs. | `tests/tui/benchmark-claim-guard.test.ts`, `docs/evidence/benchmark-claims.md` | Automated guards are a backstop; human review is still required for new adoption copy. |

## Support Boundaries

- Supported package evidence is tied to public entry points, release gates, and repository validation scripts.
- Host behavior, product policy, external storage, command execution, and application lifecycle are outside this package.
- Security statements should name the exact policy, test, or contract they rely on.
- Performance statements should cite release telemetry or clean report ids without copying dynamic numbers.

## Provenance Checklist

- Record the package version and commit for every release artifact.
- Keep the lockfile and `package.json` together when citing dependency state.
- Use `bun run release-gate:tui` as the canonical local release validation command.
- Use report `competitive-tui-20260427-3e95bef-clean-8760e911` only as clean optional comparison evidence and preserve its JSON as the numeric source.
- Keep generated evidence summaries traceable back to the source JSON report.
