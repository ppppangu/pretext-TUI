// 补建说明：该文件为后续补建，用于提供 Task 9 的 bounded terminal range/page materialization helpers；当前进度：首版只 materialize 调用方请求的 ranges/pages。
import {
  materializeTerminalLineRange,
  type MaterializedTerminalLine,
  type PreparedTerminalText,
  type TerminalLineRange,
} from './terminal.js'
import type { TerminalLinePage } from './terminal-page-cache.js'

export function materializeTerminalLineRanges(
  prepared: PreparedTerminalText,
  lines: readonly TerminalLineRange[],
): readonly MaterializedTerminalLine[] {
  return lines.map(line => materializeTerminalLineRange(prepared, line))
}

export function materializeTerminalLinePage(
  prepared: PreparedTerminalText,
  page: TerminalLinePage,
): readonly MaterializedTerminalLine[] {
  return materializeTerminalLineRanges(prepared, page.lines)
}
