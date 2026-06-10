// 补建说明：该文件为后续补建，用于承载 plain core 与 rich sidecar 共享的终端控制字符安全判断；当前进度：Task 2 review 修正，将 bidi format/control 判断从 rich policy 中抽到通用边界。

export function isTerminalBidiFormatControlCodePoint(code: number): boolean {
  return (
    code === 0x061c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  )
}

export function hasTerminalBidiFormatControls(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isTerminalBidiFormatControlCodePoint(text.charCodeAt(i))) return true
  }
  return false
}

export function hasUnsafeTerminalControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x1b) {
      return true
    }
  }
  return false
}
