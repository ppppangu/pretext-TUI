<!-- 补建说明：该目录说明为后续补建，用于记录 TUI 验证栈入口；当前进度：Task 9 覆盖 public API invariants、rich inline invariants、virtual text primitives、goldens、corpus、fuzz 与 benchmark 脚本共享断言。 -->
# TUI Validation

This directory contains deterministic validation for the public terminal package surface.

The tests exercise exported terminal APIs, source-offset invariants, rich metadata materialization, browser-free behavior, virtual text paging, opaque handle boundaries, and append invalidation semantics.
