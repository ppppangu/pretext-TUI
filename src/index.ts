// 补建说明：该文件为后续补建，用于提供 pretext-TUI 的包级 terminal-first 导出入口；当前进度：Task 4 首版，Task 5 将把 package exports 指向该入口。
export {
  TERMINAL_START_CURSOR,
  layoutNextTerminalLineRange,
  layoutTerminal,
  materializeTerminalLineRange,
  measureTerminalLineStats,
  prepareTerminal,
  walkTerminalLineRanges,
} from './terminal.js'

export type {
  MaterializedTerminalLine,
  PreparedTerminalText,
  TerminalCursor,
  TerminalLayoutOptions,
  TerminalLayoutResult,
  TerminalLineBreak,
  TerminalLineRange,
  TerminalLineStats,
  TerminalPrepareOptions,
} from './terminal.js'

export type {
  TerminalWidthProfile,
  TerminalWidthProfileInput,
} from './terminal-types.js'
