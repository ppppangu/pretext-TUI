<!-- 补建说明：该目录为后续补建，用于保存 pretext-TUI 纯 TUI 包的规范契约与边界文档；当前进度：Task 1 正在冻结终端语义与 host-app 边界。 -->
# Contract Documents

This directory contains normative contracts for `pretext-TUI`.

Current purpose:
- define terminal-cell layout semantics before implementation changes
- keep the package boundary host-neutral and publishable
- prevent browser, renderer, pane-management, or workspace concerns from leaking into the package

Current progress:
- `terminal-contract.md` freezes the core TUI text semantics
- `host-app-boundary.md` freezes what belongs to consumers instead of this package
