<!-- 补建说明：该文件为后续补建，用于把 Phase 10 adoption review 所需的证据入口、允许引用与剩余风险整理成一页；当前进度：Phase 10 已 approve with documented residual risk，host-neutral 且不复制动态 benchmark 数字。 -->
# Adoption Evidence Pack

This pack gives reviewers one place to find Phase 10 adoption evidence for `pretext-TUI`. Phase 10 is approved with documented residual risk; this pack should be used with the contracts and release gates, not as a replacement for them, and it does not promote incubating APIs to stable `0.1`.

## Evidence Bundle

| Review question | Evidence to cite | Acceptable claim shape |
| --- | --- | --- |
| What is the package? | `README.md`, `docs/contracts/public-api-boundary.md`, `docs/contracts/host-app-boundary.md` | Host-neutral terminal-cell text layout primitives with public data APIs. |
| What is public? | `package.json` exports, `docs/contracts/public-api-boundary.md`, `tests/tui/public-api-boundary.test.ts`, `bun run api-snapshot-check` | Public entry points are the root facade, the terminal alias, rich inline metadata, and package metadata. |
| What validates correctness? | `docs/evidence/correctness-matrix.md`, `src/terminal-core.test.ts`, `tests/tui/public-layout.test.ts`, `bun run tui-oracle-check`, `bun run tui-corpus-check`, `bun run tui-fuzz --seed=ci --cases=2000` | Correctness is backed by representative unit tests, oracle checks, corpus invariants, and deterministic fuzzing. |
| What validates large-text helpers? | `tests/tui/virtual-text.test.ts`, `tests/tui/layout-bundle.test.ts`, `tests/tui/performance-counters.test.ts`, `bun run benchmark-check:tui` | Fixed-column index/page/bundle helpers have parity and regression telemetry for package-owned operations. |
| What validates append-only flow? | `tests/tui/chunked-append-parity.test.ts`, `tests/tui/layout-bundle.test.ts`, `benchmarks/tui.json`, `benchmarks/tui-memory-budgets.json` | Append-only flow is incubating and covered by parity, invalidation, counter, and modeled budget evidence. |
| What validates rich metadata safety? | `docs/production/security-support-provenance-matrix.md`, `docs/contracts/terminal-security-profile.md`, `tests/tui/rich-security-gate.test.ts` | Rich inline metadata is opt-in, policy-bound, redacted by default where diagnostics are exposed, and data-only. |
| What validates package consumption? | `bun run package-smoke-test`, `bun run api-snapshot-check`, `scripts/build-package.ts`, `package.json` files list | JS and TS consumers are checked against the packaged public surface. |
| What supports comparison evidence? | `docs/evidence/benchmark-reports/competitive-tui-20260427-b7106de-clean-a9dfeebf.json`, `docs/evidence/benchmark-claims.md`, `tests/tui/benchmark-evidence.test.ts` | Optional local text-layout comparison evidence can cite the clean report id and workload ids, with numbers left in JSON. |

## Clean Report Citation

Use this exact citation when adoption copy needs a benchmark evidence reference:

```text
See clean evidence report competitive-tui-20260427-b7106de-clean-a9dfeebf for raw samples, provenance metadata, workload ids, and semantic caveats.
```

Timing values, ratios, percentiles, and sample tables remain in the JSON report. Markdown prose should cite only the report id, workload ids, provenance metadata, and semantic caveats.

Relevant workload ids in that report:

- `plain-full-wrap`
- `unicode-resize-relayout`
- `rich-sgr-wrap`
- `rich-osc8-wrap`
- `large-page-seek`

## Review Checklist

- Public examples import only public entry points.
- Claims separate release gates from optional comparison reports.
- Incubating surfaces are labeled as incubating.
- Rich inline claims describe metadata and policy, not broad terminal safety.
- Memory-budget claims describe package-owned structures, not a whole application footprint.
- Append claims stay append-only and do not imply arbitrary editing or prefix eviction.
- Host-specific adapter claims are absent.

## Residual Risks

- Several useful surfaces are still incubating before the first stable contract.
- Source-first search currently stores initial matches; bounded or streaming search is a future stabilization item.
- Optional comparison reports are local evidence artifacts and require clean-report provenance before public citation.
- Human review remains necessary for new adoption copy because automated guards cannot catch every overclaim.
