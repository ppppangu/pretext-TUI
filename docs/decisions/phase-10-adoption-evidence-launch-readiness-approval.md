<!-- 补建说明：该文件为后续补建，用于记录 Phase 10 adoption evidence 与 launch-readiness 的审批、证据入口和剩余风险；当前进度：final review 结论为 approve with documented residual risk，未声明 stable 0.1。 -->
# Phase 10 Adoption Evidence And Launch-Readiness Approval

## Review State

Approval state: **approve with documented residual risk**.

This record closes Phase 10 adoption evidence and launch-readiness packaging. It does not approve a stable `0.1` API, a public launch campaign, or any named-host integration.

## Scope

Phase 10 packages the prior hardening work into a reviewable adoption and launch-readiness story:

- public API boundary and incubating/stable/private surface matrix
- production/security posture for host-neutral rich terminal text handling
- host-neutral adoption recipes that use public entry points only
- reproducible benchmark evidence with report ids, raw samples, runtime metadata, and semantic caveats
- modelled memory-budget evidence for package-owned structures
- marketing and launch-copy guardrails that avoid unsupported claims

Out of scope for Phase 10:

- stable `0.1` promotion for incubating APIs
- renderer, terminal emulator, PTY, clipboard, filesystem, persistence, or app-shell behavior
- named-host adapters or integration claims
- arbitrary insert/delete/replace editing
- destructive prefix eviction or host retention policy
- broad speed, process-memory, or security supremacy claims

## Evidence Anchors

Primary evidence and adoption references:

- [Public API boundary](../contracts/public-api-boundary.md) for stable candidates, incubating surfaces, private surfaces, and unsupported product behavior.
- [Incubating API approval index](incubating-api-approval-index.md) for phase status and blockers before stable `0.1`.
- [Adoption evidence pack](../evidence/adoption-evidence-pack.md), [kernel capability matrix](../evidence/kernel-capability-matrix.md), and [correctness matrix](../evidence/correctness-matrix.md) for the Phase 10 evidence-map view.
- [Evidence README](../evidence/README.md) and [benchmark claim guardrails](../evidence/benchmark-claims.md) for report-id citation rules.
- Report `competitive-tui-20260427-3e95bef-clean-8760e911` under [benchmark reports](../evidence/benchmark-reports/competitive-tui-20260427-3e95bef-clean-8760e911.json), especially workload `large-page-seek` and the report semantic matrix.
- [Host-neutral recipes](../recipes/README.md): structured transcript viewport, generic agent transcript, terminal pane resize, editor source mapping, and rich ANSI log viewer.
- [Production notes](../production/README.md), [security/support/provenance matrix](../production/security-support-provenance-matrix.md), and [terminal security profile](../contracts/terminal-security-profile.md) for supported rich sidecar posture and non-goals.
- [Adoption growth playbook](../marketing/adoption-growth-playbook.md) for launch-copy shape, forbidden benchmark wording, and channel checklist.

## Readiness Summary

Phase 10 can say the repository has a bounded adoption evidence pack:

- The public/private API boundary is documented, and advanced surfaces remain explicitly incubating.
- Evidence matrices collect capability, correctness, production, and benchmark provenance without copying dynamic timing numbers into prose.
- Recipes exist for common host-neutral patterns and are framed as adoption patterns, not bundled integrations.
- Benchmark evidence has a clean local report id with raw samples, runtime/dependency metadata, source hashes, and comparator semantic caveats.
- The release gate includes benchmark counters and modelled kernel-owned memory budgets.
- Marketing copy has explicit claim guardrails for benchmark, append, renderer, and named-host wording.

Final review conclusion: **approve with documented residual risk**.

Review swarm conclusions:

- docs/claim review: approve with documented residual risk
- public API/tests review: approve
- evidence/gate review: approve with documented residual risk

## Gates

Focused Phase 10 gates:

- `bun test tests/tui/phase10-evidence-pack.test.ts tests/tui/recipe-public-imports.test.ts tests/tui/benchmark-claim-guard.test.ts tests/tui/benchmark-evidence.test.ts tests/tui/release-gate-consistency.test.ts`
- `bun run typecheck:tui-validation`
- `bun run package-smoke-test`
- `git diff --check`

Phase close-out gate:

- `bun run prepublishOnly`

## Accepted Residual Risk

- **Incubating APIs remain incubating.** Owner: API/package maintainers. Follow-up gate: future stable `0.1` approval must update the incubating API index, public API boundary, API snapshot, and package smoke coverage. Not blocking because Phase 10 is an evidence/readiness packaging phase, not an API promotion phase.
- **Clean report is local evidence only.** Owner: evidence maintainers. Follow-up gate: `phase10-evidence-pack.test.ts` checks the report's clean baseline, ancestor relation, and benchmark-relevant file hashes; any benchmark-source/package change requires a fresh clean report before new performance copy cites it. Not blocking because the report is explicitly `local-evidence-only` and Markdown does not copy dynamic values.
- **Memory budgets are modelled package-owned evidence.** Owner: performance maintainers. Follow-up gate: add a separate heap/allocation evidence path before any process-memory claim. Not blocking because all Phase 10 memory language is scoped to package-owned structures.
- **Search sessions store initial matches.** Owner: future search stabilization. Follow-up gate: bounded or streamed search design before stable low-memory search claims. Not blocking because the current search API remains incubating and counters/budgets expose stored-match behavior.
- **Long unbroken append tails remain conservative.** Owner: append storage maintainers. Follow-up gate: keep the long-unbroken memory workload in `memory-budget-check:tui` until a stronger retention policy lands. Not blocking because claims stay append-only and do not promise destructive prefix eviction or arbitrary editing.
- **Rich raw-visible provenance remains current map data, not a public audit API.** Owner: rich sidecar maintainers. Follow-up gate: separate provenance/audit API proposal before stronger audit claims. Not blocking because rich claims stay metadata/policy-bound.
- **Human review remains required for launch copy.** Owner: release/marketing maintainers. Follow-up gate: run claim guards and manual review for any new public copy. Not blocking because automated guards already cover copied dynamic numbers and common overclaim drift.

## Conclusion

Conclusion: **approve with documented residual risk**.

Phase 10 completed the adoption evidence pack, capability/correctness/security matrices, incubating API approval index, generic agent transcript recipe, clean local evidence report citation, public-import recipe scan, package-smoke recipe consumer coverage, and launch-copy guardrails. No incubating public API is promoted to stable `0.1`.
