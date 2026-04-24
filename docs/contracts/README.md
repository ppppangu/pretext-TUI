<!-- 补建说明：该目录为后续补建，用于保存 pretext-TUI 纯 TUI 包的规范契约与边界文档；当前进度：Task 2 已补入 terminal rich security profile，用于约束 raw/ANSI/OSC8/bidi/DoS 安全边界。 -->
# Contract Documents

This directory contains normative contracts for `pretext-TUI`.

Current purpose:
- define terminal-cell layout semantics before implementation changes
- keep the package boundary host-neutral and publishable
- prevent browser, renderer, pane-management, or workspace concerns from leaking into the package
- define which entry points and data shapes can become public API

Current progress:
- `terminal-contract.md` freezes the core TUI text semantics
- `host-app-boundary.md` freezes what belongs to consumers instead of this package
- `public-api-boundary.md` freezes the public/private API story for future recipes, declarations, and package smoke checks
- `terminal-security-profile.md` freezes rich sidecar security profiles, raw retention, diagnostics, OSC8, bidi controls, and ANSI re-emission policy
