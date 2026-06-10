// 补建说明：该文件为后续补建，用于执行 Task 7 的 deterministic TUI fuzz invariant 校验；当前进度：首版生成 token stream 并打印失败复现，不自动写入 seed 目录。
import { prepareTerminal, type TerminalLayoutOptions, type TerminalPrepareOptions } from '../src/public/index.js'
import {
  layoutNextTerminalRichLineRange,
  materializeTerminalRichLineRange,
  prepareTerminalRichInline,
} from '../src/rich/terminal-rich-inline.js'
import {
  TERMINAL_START_CURSOR,
} from '../src/public/index.js'
import {
  assert,
  assertTerminalInvariants,
  createSeededRandom,
  parseCliArgs,
  pick,
} from '../tests/tui/validation-helpers.js'

const args = parseCliArgs()
const seed = String(args['seed'] ?? 'local')
const cases = Number(args['cases'] ?? 500)
assert(Number.isInteger(cases) && cases > 0, `--cases must be a positive integer, got ${args['cases']}`)

const random = createSeededRandom(seed)
const tokenBuckets = [
  ['hello', 'world', 'terminal', 'layout', 'superlongwordwithoutbreaks'],
  [' ', '  ', '\t', '\n', '\r\n', '\f'],
  ['世界', '漢字', 'こんにちは', '안녕하세요', '。', '、'],
  ['مرحبا', 'שלום', 'چغد', 'नमस्ते'],
  ['😀', '👩‍💻', '🇺🇸', '1️⃣', '✈︎', '✈️'],
  ['\u200B', '\u00AD', '\u00A0', '\u202F', '\u2060', '\uFEFF'],
  ['https://example.test/path?q=1', 'foo/bar/baz.ts:42', '[INFO]', '=>'],
] as const

try {
  for (let i = 0; i < cases; i++) {
    const tokenCount = 1 + Math.floor(random() * 36)
    const tokens: string[] = []
    for (let j = 0; j < tokenCount; j++) {
      tokens.push(pick(random, pick(random, tokenBuckets)))
    }
    const text = tokens.join('')
    const prepare: TerminalPrepareOptions = {
      whiteSpace: pick(random, ['normal', 'pre-wrap'] as const),
      wordBreak: pick(random, ['normal', 'keep-all'] as const),
      tabSize: pick(random, [1, 2, 4, 8] as const),
    }
    if (random() < 0.25) prepare.widthProfile = { ambiguousWidth: 'wide' }
    if (random() < 0.15) prepare.widthProfile = { ...(typeof prepare.widthProfile === 'object' ? prepare.widthProfile : {}), emojiWidth: 'narrow' }
    const columns = pick(random, [1, 2, 3, 4, 5, 8, 12, 20, 40, 80] as const)
    const layout: TerminalLayoutOptions = {
      columns,
      startColumn: random() < 0.25 ? Math.floor(random() * columns) : 0,
    }

    const prepared = prepareTerminal(text, prepare)
    assertTerminalInvariants(prepared, layout)

    if (random() < 0.2) {
      const raw = `\x1b[31m${text}\x1b[0m\x1b[2K`
      const rich = prepareTerminalRichInline(raw, prepare)
      const first = layoutNextTerminalRichLineRange(rich, TERMINAL_START_CURSOR, layout)
      if (first !== null) {
        const materialized = materializeTerminalRichLineRange(rich, first)
        assert(materialized.fragments.map(fragment => fragment.text).join('') === materialized.text, 'rich fragments did not join to text')
      }
    }
  }
} catch (error) {
  console.error('TUI fuzz failure reproduction:')
  console.error(JSON.stringify({ seed, cases }, null, 2))
  throw error
}

console.log(`TUI fuzz passed: seed=${seed} cases=${cases}`)
