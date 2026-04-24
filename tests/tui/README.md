<!-- 补建说明：该目录说明为后续补建，用于记录 Task 7 的 TUI 验证栈入口；当前进度：首版覆盖 public API invariants、rich inline invariants、goldens、corpus、fuzz 与 benchmark 脚本共享断言。 -->
# TUI Validation

This directory contains deterministic validation for the public terminal package surface.

The tests exercise exported terminal APIs, source-offset invariants, rich metadata materialization, and browser-free behavior. Streaming, page-cache, and append assertions are added only after the virtual text primitives land.
