<!-- 补建说明：该文件为后续补建，用于记录 Phase 9 performance/memory/evidence gate 的设计、执行与 review 审批；当前进度：final review 结论为 approve with documented residual risk，阶段收口 gate 已纳入 release-gate:tui。 -->
# Phase 9 Performance, Memory Budgets, And Evidence Approval

## Scope

Phase 9 keeps the package host-neutral and evidence-focused. It does not add public exports, named-host adapters, renderer behavior, process persistence, clipboard behavior, or a second pipeline.

Implemented work:

- Internal performance counters now cover generic range-index lookup/build behavior, search session materialization/scope/storage/return behavior, and selection projection/extraction behavior.
- `terminal-memory-budget@1` models kernel-owned structures for layout bundles, source/range indexes, search sessions, selection extraction, rich sidecars, and append-only cell flows.
- `memory-budget-check:tui` reads `benchmarks/tui-memory-budgets.json` and fails closed on schema drift, unknown categories, and exceeded model budgets.
- `release-gate:tui` is now the canonical package release command, and `prepublishOnly` delegates to it.
- Release-gate consistency tests keep `package.json` and `status/tui-dashboard.json` aligned.
- Claim guardrails now scan `CHANGELOG.md` and forbid unsupported memory/performance overclaims.
- The known long-unbroken append tail residual is exercised by a dedicated memory workload so Phase 9 evidence does not silently skip it.

## Design Conclusion

Use modelled estimates for Phase 9 rather than process heap measurements. The model is deterministic, reviewable, and limited to package-owned structures; host UI memory, renderer caches, terminal emulator state, and application data remain outside the package boundary.

## Focused Gates

Focused implementation gates run:

- `bun run typecheck:tui`
- `bun run typecheck:tui-validation`
- `bun test tests/tui/memory-budget.test.ts tests/tui/performance-counters.test.ts tests/tui/benchmark-config.test.ts tests/tui/release-gate-consistency.test.ts`
- `bun test tests/tui/benchmark-claim-guard.test.ts tests/tui/benchmark-evidence.test.ts`
- `bun run benchmark-check:tui`
- `bun run memory-budget-check:tui`

Review swarm status: request-changes findings on public export drift, memory false-pass risks, and docs drift were fixed. Final review found no remaining findings.

Review conclusion: **approve with documented residual risk**.

Phase close-out gates passed through `bun run prepublishOnly`:

- `bun run check`
- `bun run test:tui`
- `bun run tui-oracle-check`
- `bun run tui-corpus-check`
- `bun run tui-fuzz --seed=ci --cases=2000`
- `bun run benchmark-check:tui`
- `bun run memory-budget-check:tui`
- `bun run terminal-demo-check`
- `bun run api-snapshot-check`
- `bun run package-smoke-test`

## Claim Restrictions

- Do not present `memory-budget-check:tui` as process heap evidence.
- Do not present release benchmark counters as public competitive benchmark evidence.
- Do not claim broad speed, process memory, renderer, app-shell, or named-host behavior.
- Do not claim arbitrary editing or destructive prefix eviction.

## Accepted Residual Risk

- **Modelled memory, not heap snapshots.** Owner: kernel maintainers. Follow-up gate: keep `memory-budget-check:tui` deterministic and add a separate heap/allocation evidence path only after clean-report policy exists. Not blocking because Phase 9 claims are explicitly limited to package-owned modelled structures.
- **Search sessions store all initial matches.** Owner: Phase 10/API stabilization. Follow-up gate: add bounded/streamed search design before any stable search-memory claim. Not blocking because counters and memory budgets expose stored-match behavior and no public low-memory search claim is made.
- **Long unbroken append tails remain conservative.** Owner: future append storage compaction work. Follow-up gate: `chunked-append-long-unbroken-memory` remains in `memory-budget-check:tui`; any future stronger append-memory claim must first reduce this workload or document a retention policy. Not blocking because Phase 8 already accepted this residual and Phase 9 now exercises it instead of hiding it.
