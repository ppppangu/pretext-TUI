// 补建说明：该文件为后续补建，用于提供 pretext-TUI 的包级 terminal-first 导出入口；当前进度：Task 9 已导出 terminal core、rich-free virtual text primitives 与 opaque handle accessors。
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

export {
  appendTerminalCellFlow,
  getTerminalCellFlowGeneration,
  getTerminalCellFlowPrepared,
  prepareTerminalCellFlow,
} from './terminal-cell-flow.js'

export type {
  PreparedTerminalCellFlow,
  TerminalAppendInvalidation,
  TerminalAppendOptions,
  TerminalAppendResult,
  TerminalAppendStrategy,
} from './terminal-cell-flow.js'

export {
  getTerminalLineIndexStats,
  getTerminalLineIndexMetadata,
  createTerminalLineIndex,
  getTerminalLineRangeAtRow,
  invalidateTerminalLineIndex,
  measureTerminalLineIndexRows,
} from './terminal-line-index.js'

export type {
  TerminalFixedLayoutOptions,
  TerminalLineIndex,
  TerminalLineIndexInvalidation,
  TerminalLineIndexInvalidationResult,
  TerminalLineIndexMetadata,
  TerminalLineIndexStats,
} from './terminal-line-index.js'

export {
  materializeTerminalLinePage,
  materializeTerminalLineRanges,
} from './terminal-materialize.js'

export {
  createTerminalPageCache,
  getTerminalLinePage,
  getTerminalPageCacheStats,
  invalidateTerminalPageCache,
} from './terminal-page-cache.js'

export type {
  TerminalLinePage,
  TerminalLinePageRequest,
  TerminalPageCache,
  TerminalPageCacheOptions,
  TerminalPageCacheStats,
} from './terminal-page-cache.js'

export {
  createTerminalSourceOffsetIndex,
  getTerminalCursorForSourceOffset,
  getTerminalSourceOffsetForCursor,
} from './terminal-source-offset-index.js'

export type {
  TerminalSourceLookupResult,
  TerminalSourceOffsetBias,
  TerminalSourceOffsetIndex,
} from './terminal-source-offset-index.js'
