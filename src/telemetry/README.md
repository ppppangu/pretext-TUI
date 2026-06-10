<!-- 补建说明：该目录说明为后续补建，用于记录 telemetry 层；当前进度：R2 目录分层迁移首版，包含 terminal-performance-counters.ts、terminal-memory-budget.ts。 -->
# Telemetry

Lowest layer (rank 0) of the terminal package. It hosts performance counters and the memory budget model used by higher layers to record work and bound cache growth.

As the DAG base it imports nothing from other layer directories; every other layer may depend on it.
