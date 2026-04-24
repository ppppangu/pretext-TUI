<!-- 补建说明：该目录为后续补建，用于承载 pretext-TUI 从浏览器版 Pretext 迁移到纯 TUI 方案时的设计、执行与发布说明；当前进度：已包含 contracts、production notes、plans、marketing notes 与 post-publishability master plan。 -->
# Documentation Notes

This directory was added as part of the TUI migration planning work for `pretext-TUI`.

Current purpose:
- keep migration design notes and implementation plans close to the fork
- separate future TUI-facing documentation from the browser-oriented upstream docs

Current progress:
- `docs/contracts/` contains the terminal contract and host boundary
- `docs/evidence/` contains benchmark evidence rules, claim guardrails, and optional report output locations
- `docs/production/` contains production and security readiness notes
- `docs/plans/` contains the detailed terminal-layout implementation plan and the post-publishability master plan
- `docs/recipes/` contains host-neutral adoption recipes that use only public package entry points
- `docs/marketing/` contains launch copy and performance-claim guardrails
- `docs/roadmap/` contains the adoption, performance, benchmark, and enterprise-readiness roadmap synthesized from technical and marketing reviews
