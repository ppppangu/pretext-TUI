// 补建说明：该文件为后续补建，用于为 append-only cell-flow 提供内部 normalized-source prepare 入口；当前进度：Phase 9 从 public terminal module export 中拆出，保持公共 API 不扩张。
import {
  prepareNormalizedWithSegments,
  type PrepareOptions,
} from './layout.js'
import { assertPlainTerminalInput } from './terminal-plain-input.js'
import type { TerminalPrepareOptions } from './terminal.js'
import {
  createPreparedTerminalText,
  type PreparedTerminalText,
} from './terminal-prepared-reader.js'

export function prepareNormalizedTerminalSource(
  text: string,
  options: TerminalPrepareOptions = {},
): PreparedTerminalText {
  assertPlainTerminalInput(text)
  const prepareOptions: PrepareOptions = {}
  if (options.whiteSpace !== undefined) prepareOptions.whiteSpace = options.whiteSpace
  if (options.wordBreak !== undefined) prepareOptions.wordBreak = options.wordBreak
  if (options.widthProfile !== undefined) prepareOptions.widthProfile = options.widthProfile
  if (options.tabSize !== undefined) prepareOptions.tabSize = options.tabSize
  return createPreparedTerminalText(prepareNormalizedWithSegments(text, 'terminal', prepareOptions))
}
