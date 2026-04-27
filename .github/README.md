<!-- 补建说明：该目录说明为后续补建，用于记录 pretext-TUI 的 GitHub automation 边界；当前进度：TUI validation CI 与 release-gate:tui 对齐，并使用完整 git 历史支持 evidence provenance 检查。 -->
# GitHub Automation

This directory contains repository automation for the `pretext-tui` terminal package validation gate.

The active workflow validates the TUI-only package surface. It does not build browser demos or host application integrations, and it fetches full git history so evidence provenance tests can verify benchmark report commits against `HEAD`.
