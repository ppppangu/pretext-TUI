// 补建说明：该文件为后续补建，用于为通用 TUI 文本内核提供 opaque prepared document handle 与内部 reader 能力边界；当前进度：Task 1 首版，先把现有 prepared segments 存储收进 WeakMap，后续 chunked reader 可在同一边界内替换实现。
import type { PreparedTextWithSegments } from './layout.js'
import {
  createPreparedTerminalGeometry,
  type PreparedTerminalGeometry,
} from './terminal-grapheme-geometry.js'

declare const preparedTerminalTextBrand: unique symbol

export type PreparedTerminalText = Readonly<{
  kind: 'prepared-terminal-text@1'
  readonly [preparedTerminalTextBrand]: true
}>

type PreparedTerminalTextState = {
  geometry: PreparedTerminalGeometry | null
  prepared: PreparedTextWithSegments
}

const preparedTerminalTextStates = new WeakMap<PreparedTerminalText, PreparedTerminalTextState>()

export function createPreparedTerminalText(
  prepared: PreparedTextWithSegments,
): PreparedTerminalText {
  const handle = Object.freeze({
    kind: 'prepared-terminal-text@1',
  }) as PreparedTerminalText
  preparedTerminalTextStates.set(handle, {
    geometry: null,
    prepared,
  })
  return handle
}

export function getInternalPreparedTerminalText(
  prepared: PreparedTerminalText,
): PreparedTextWithSegments {
  return internalPreparedTerminalTextState(prepared).prepared
}

export function getInternalPreparedTerminalGeometry(
  prepared: PreparedTerminalText,
): PreparedTerminalGeometry {
  const state = internalPreparedTerminalTextState(prepared)
  if (state.geometry !== null) {
    return state.geometry
  }
  state.geometry = createPreparedTerminalGeometry(state.prepared)
  return state.geometry
}

function internalPreparedTerminalTextState(prepared: PreparedTerminalText): PreparedTerminalTextState {
  const state = preparedTerminalTextStates.get(prepared)
  if (state === undefined) {
    throw new Error('Invalid prepared terminal text handle')
  }
  return state
}
