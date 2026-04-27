<!-- 补建说明：该目录说明为后续补建，用于记录 workflow 文件用途；当前进度：CI workflow 与 release-gate:tui 对齐，并使用完整 git 历史支持 evidence provenance 检查。 -->
# Workflows

Workflow files here validate the TUI package surface and do not build browser demos or host application integrations. The TUI workflow fetches full git history so evidence provenance tests can verify report commits against `HEAD`.
