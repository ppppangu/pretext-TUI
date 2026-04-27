// 补建说明：该文件为后续补建，用于集中保存 plain terminal input 的安全校验边界；当前进度：Phase 9 将 normalized-source 内部入口从 public terminal module 中拆出。
import { isTerminalBidiFormatControlCodePoint } from './terminal-control-policy.js'

export function assertPlainTerminalInput(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const ch = text[i]!
    const allowedWhitespace = ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f'
    if ((code <= 0x1f || (code >= 0x7f && code <= 0x9f)) && !allowedWhitespace) {
      throw new Error(`Plain terminal text cannot contain control character U+${code.toString(16).toUpperCase()}`)
    }
    if (isTerminalBidiFormatControlCodePoint(code)) {
      throw new Error(`Plain terminal text cannot contain bidi format control U+${code.toString(16).toUpperCase()}`)
    }
  }
}
