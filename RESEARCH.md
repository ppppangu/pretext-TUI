<!-- 补建说明：该文件为后续重写，用于把研究记录从旧渲染器轨道收敛到 pretext-TUI 的终端 cell 研究问题；当前进度：Task 7 后保留 active TUI research questions。 -->
# Research Log

This repository now uses the terminal-cell package contract as its active research center.

Current research questions:

- How much source-offset indexing is needed for fast seek and copy/search mapping?
- Which sparse-anchor spacing gives predictable large-text paging without eager materialization?
- Which benchmark counters best predict terminal resize, seek, and visible-window materialization latency?
- Which Unicode edge cases should graduate from fuzz discoveries into permanent goldens?

Historical source-project research remains available through git history. Do not treat old renderer-specific notes as active package guidance.
