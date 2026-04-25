<!-- 补建说明：该目录为后续补建，用于承载 pretext-TUI 从浏览器版 Pretext 迁移到纯 TUI 方案时的设计、执行与发布说明；当前进度：已包含 contracts、evidence、production notes、recipes、plans、marketing notes 与 roadmap，本页作为文档 reference map 与 fact-source hierarchy 入口。 -->
# Documentation Reference Map

This directory was added as part of the TUI migration planning work for `pretext-TUI`.

## Purpose

- keep migration design notes and implementation plans close to the fork
- separate future TUI-facing documentation from the browser-oriented upstream docs
- map repository-only references without replacing the shipped package README

## Fact-Source Hierarchy

When repository documents disagree, use this hierarchy before updating copy:

1. Published package surface facts come from `package.json`, declaration/API snapshot gates, package smoke tests, and the files emitted under the public `dist/` facade.
2. Public consumer positioning comes from the root [README.md](../README.md), with API stability and private-boundary details governed by [contracts/public-api-boundary.md](contracts/public-api-boundary.md).
3. Terminal behavior is governed by [contracts/terminal-contract.md](contracts/terminal-contract.md).
4. Host ownership and non-goals are governed by [contracts/host-app-boundary.md](contracts/host-app-boundary.md).
5. Security reporting and release-support posture are governed by [../SECURITY.md](../SECURITY.md), with rich inline policy details in [contracts/terminal-security-profile.md](contracts/terminal-security-profile.md).
6. Benchmark numbers live only in generated JSON reports under `docs/evidence/benchmark-reports/`. Prose may cite report ids and workload ids, but must not copy dynamic timing values.
7. Contributor commands and active validation gates are listed in [../DEVELOPMENT.md](../DEVELOPMENT.md).
8. [../STATUS.md](../STATUS.md), [../TODO.md](../TODO.md), roadmap files, plans, and marketing notes are reference material. They cannot override the package surface, contracts, security policy, or benchmark evidence reports.

Public examples should use the canonical public facade: the package root `pretext-tui` for core terminal APIs, `pretext-tui/terminal` only as the explicit terminal alias, and `pretext-tui/terminal-rich-inline` only for the opt-in incubating rich sidecar. Repository-only internals, generated validation helpers, and host-specific adapter promises are not public API.

## Directory Map

- `docs/contracts/` contains public API, terminal behavior, host-boundary, and terminal-security contracts
- `docs/evidence/` contains benchmark evidence rules, claim guardrails, and optional report output locations
- `docs/production/` contains production and security readiness notes
- `docs/plans/` contains the detailed terminal-layout implementation plan and the post-publishability master plan
- `docs/recipes/` contains host-neutral adoption recipes that use only public package entry points
- `docs/marketing/` contains launch copy and performance-claim guardrails
- `docs/roadmap/` contains the adoption, performance, benchmark, and enterprise-readiness roadmap synthesized from technical and marketing reviews
