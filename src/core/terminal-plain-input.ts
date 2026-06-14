// 补建说明：该文件为后续补建，用于集中保存 plain terminal input 的安全校验边界；当前进度：Phase 9 将 normalized-source 内部入口从 public terminal module 中拆出；新增 isRejectedPlainTerminalCodePoint 单一判定，assert 与 sanitizePlainTerminalInput 共用，供 host 复用引擎 reject 集（消除宿主侧重复正则）。
import { isTerminalBidiFormatControlCodePoint } from '../unicode/terminal-control-policy.js'

/**
 * The single definition of which code points are invalid in plain terminal text:
 * C0 controls except \t \n \r \f, DEL + C1 (0x7F–0x9F), and bidi format controls.
 * Both assertPlainTerminalInput (reject) and sanitizePlainTerminalInput (strip) use it,
 * so hosts never need to re-encode the set.
 */
export function isRejectedPlainTerminalCodePoint(code: number): boolean {
  const allowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d
  return (
    (((code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) && !allowedWhitespace) ||
    isTerminalBidiFormatControlCodePoint(code)
  )
}

export function assertPlainTerminalInput(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (!isRejectedPlainTerminalCodePoint(code)) continue
    const kind = isTerminalBidiFormatControlCodePoint(code) ? 'bidi format control' : 'control character'
    throw new Error(`Plain terminal text cannot contain ${kind} U+${code.toString(16).toUpperCase()}`)
  }
}

/**
 * Remove exactly the code points assertPlainTerminalInput would reject, so the result is
 * safe for the plain prepareTerminal path. Allowed whitespace (\t \n \r \f) is preserved;
 * returns the input unchanged when it is already clean. Does NOT strip ANSI/SGR escape
 * sequences — strip those first if present, or use the terminal-rich-inline path, which
 * keeps styling.
 */
export function sanitizePlainTerminalInput(text: string): string {
  let out: string | null = null
  for (let i = 0; i < text.length; i++) {
    if (isRejectedPlainTerminalCodePoint(text.charCodeAt(i))) {
      if (out === null) out = text.slice(0, i)
    } else if (out !== null) {
      out += text[i]
    }
  }
  return out ?? text
}
