// 补建说明：该文件为后续补建，用于在 buildMergedSegmentation 接缝后提供 probe 参数化的 ASCII 词扫描 DFA：
// 参数（mid 连接位、word-like 状态集）在每个活跃 Intl.Segmenter 实例首次使用时从真实分词器探测提取，
// 拟合后的扫描器必须逐段精确复现探测流，否则对该实例永久禁用并回退原 Intl 整串循环；探测电池包含
// 跨类 mid 形式与 C0 控制字符/DEL 硬化用例；当前进度：首版落地（扫描器 + 探测协议 + 验证电池）。

// ---------------------------------------------------------------------------
// Character classes over the 7-bit code unit space. Structurally fixed; their
// adequacy is validated transitively by the probe verification battery (any
// live behavior the classes cannot express fails verification and disables
// the scanner). The scanner itself never sees '\r' or '\n': the segmentation
// seam's span driver partitions at [\r\n] code units and owns those
// emissions, so the scanner has no CR/LF states.
const CLASS_OTHER = 0
const CLASS_LETTER = 1
const CLASS_DIGIT = 2
const CLASS_ENL = 3 // '_' (UAX-29 ExtendNumLet)
const CLASS_SPACE = 4

const charClasses = new Uint8Array(128)
for (let code = 0x41; code <= 0x5a; code++) charClasses[code] = CLASS_LETTER
for (let code = 0x61; code <= 0x7a; code++) charClasses[code] = CLASS_LETTER
for (let code = 0x30; code <= 0x39; code++) charClasses[code] = CLASS_DIGIT
charClasses[0x5f] = CLASS_ENL
charClasses[0x20] = CLASS_SPACE

// Word-like status machine states (fitted to ICU rule-status mechanics):
// letter -> LETTER, digit -> NUMBER, '_' after '_' -> LETTER, '_' otherwise
// keeps the current status. isWordLike = wordLikeStatuses[finalStatus].
const STATUS_NONE = 0
const STATUS_LETTER = 1
const STATUS_NUMBER = 2

export type WordScanVerdict =
  | { enabled: true, midBits: Uint8Array, wordLikeStatuses: Uint8Array }
  | { enabled: false }

export type WordScanBuffers = {
  starts: Int32Array
  ends: Int32Array
  wordLike: Uint8Array
}

// Module-level reusable output buffers (grow-doubling, never shrunk): the
// scanner emits (start, end, wordLike) triplets with zero per-segment object
// allocation. Growth swaps the arrays inside this one stable object, so
// callers must re-read the fields after each scan call.
const scanBuffers: WordScanBuffers = {
  starts: new Int32Array(1024),
  ends: new Int32Array(1024),
  wordLike: new Uint8Array(1024),
}

export function getWordScanBuffers(): WordScanBuffers {
  return scanBuffers
}

function growWordScanBuffers(): void {
  const capacity = scanBuffers.starts.length * 2
  const starts = new Int32Array(capacity)
  starts.set(scanBuffers.starts)
  const ends = new Int32Array(capacity)
  ends.set(scanBuffers.ends)
  const wordLike = new Uint8Array(capacity)
  wordLike.set(scanBuffers.wordLike)
  scanBuffers.starts = starts
  scanBuffers.ends = ends
  scanBuffers.wordLike = wordLike
}

// Scans the pure-ASCII span [from, to) of text (no code unit >= 0x80, no
// '\r'/'\n' — both guaranteed by the seam's span driver) and writes the word
// segment stream into the module buffers. Returns the segment count.
//
// Shape: alphanumeric/underscore run consumer tracking (status, lastClass);
// after each run, a single-char mid lookahead joins through the mid only when
// the flanking classes are identical and in {LETTER, DIGIT} and the probed
// midBits permit (bit0 letter-context, bit1 digit-context); space runs
// coalesce (WSegSpace); every other char is a single segment.
export function scanAsciiWordSegments(
  text: string,
  from: number,
  to: number,
  midBits: Uint8Array,
  wordLikeStatuses: Uint8Array,
): number {
  let starts = scanBuffers.starts
  let ends = scanBuffers.ends
  let wordLike = scanBuffers.wordLike
  let capacity = starts.length
  let n = 0
  let i = from
  while (i < to) {
    const klass = charClasses[text.charCodeAt(i)]!
    const segStart = i
    let segWordLike = 0
    if (klass === CLASS_LETTER || klass === CLASS_DIGIT || klass === CLASS_ENL) {
      let status = STATUS_NONE
      let lastClass = CLASS_OTHER
      for (;;) {
        while (i < to) {
          const runClass = charClasses[text.charCodeAt(i)]!
          if (runClass === CLASS_LETTER) {
            status = STATUS_LETTER
            lastClass = CLASS_LETTER
            i++
          } else if (runClass === CLASS_DIGIT) {
            status = STATUS_NUMBER
            lastClass = CLASS_DIGIT
            i++
          } else if (runClass === CLASS_ENL) {
            if (lastClass === CLASS_ENL) status = STATUS_LETTER
            lastClass = CLASS_ENL
            i++
          } else {
            break
          }
        }
        if (i + 1 < to && (lastClass === CLASS_LETTER || lastClass === CLASS_DIGIT)) {
          const mid = midBits[text.charCodeAt(i)]!
          if (mid !== 0) {
            const nextClass = charClasses[text.charCodeAt(i + 1)]!
            if (lastClass === CLASS_LETTER && nextClass === CLASS_LETTER && (mid & 1) !== 0) {
              i++
              continue
            }
            if (lastClass === CLASS_DIGIT && nextClass === CLASS_DIGIT && (mid & 2) !== 0) {
              i++
              continue
            }
          }
        }
        break
      }
      segWordLike = wordLikeStatuses[status]!
    } else if (klass === CLASS_SPACE) {
      i++
      while (i < to && text.charCodeAt(i) === 0x20) i++
    } else {
      i++
    }
    if (n === capacity) {
      growWordScanBuffers()
      starts = scanBuffers.starts
      ends = scanBuffers.ends
      wordLike = scanBuffers.wordLike
      capacity = starts.length
    }
    starts[n] = segStart
    ends[n] = i
    wordLike[n] = segWordLike
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Probe battery. One shared fixture used by the runtime probe AND the
// permanent differential gate (tests/tui/analysis-word-scan-differential
// .test.ts) so the two can never drift apart.
export function buildWordScanProbeCases(): string[] {
  const cases: string[] = []
  const seen = new Set<string>()
  const push = (probeCase: string): void => {
    if (seen.has(probeCase)) return
    seen.add(probeCase)
    cases.push(probeCase)
  }
  // Designer battery: every ASCII punctuation char in same-class contexts,
  // doubled-mid forms, edge forms, and the bare char.
  for (let code = 0x21; code <= 0x7e; code++) {
    const klass = charClasses[code]!
    if (klass !== CLASS_OTHER && klass !== CLASS_ENL) continue
    const x = String.fromCharCode(code)
    push(`a${x}b`)
    push(`1${x}2`)
    push(`a${x}${x}b`)
    push(`1${x}${x}2`)
    push(`a${x}`)
    push(`${x}a`)
    push(`1${x}`)
    push(`${x}1`)
    push(x)
    // Hardening (divergence critique, binding): cross-class mid forms. A
    // tailoring that joined letter-mid-digit or ExtendNumLet-adjacent forms
    // is unrepresentable by the class-equality DFA, so it must be visible to
    // verification and force the disabled verdict.
    push(`a${x}1`)
    push(`1${x}a`)
    push(`_${x}a`)
    push(`a${x}_`)
    push(`_${x}1`)
    push(`1${x}_`)
    push(`_${x}_`)
  }
  // Underscore (ExtendNumLet) matrix to length 3 plus mixed anchors.
  for (const probeCase of [
    '_', '__', '___', 'a_', '1_', '_1', '_a', 'a__', '1__', '__a', '__1',
    'a_b', '1_2', 'a_1', '1_a', 'A1_b2', 'x86_64', 'a_.b', 'a._b',
  ]) {
    push(probeCase)
  }
  // Mixed alphanumerics and mid-bearing words.
  for (const probeCase of [
    'a', '1', 'ab', '12', 'a1', '1a', 'abc123', '123abc', '0x1F', '1e9',
    'v1.2', 'a1.b2', "don't", '1,000', '3.14',
  ]) {
    push(probeCase)
  }
  // Space runs (WSegSpace coalescing) and tab/vertical-tab whitespace.
  for (const probeCase of ['a b', 'a  b', 'a   b', ' a', 'a ', '  ', '\t', '\t\t', 'a\t\tb', 'a\x0bb']) {
    push(probeCase)
  }
  // Span-driver newline emissions: each '\n' one segment, '\r\n' pair one
  // segment, lone '\r' one segment, all non-word-like. Verification compares
  // the driver model against the live stream, so these emissions are
  // probe-pinned exactly like the scanner parameters.
  for (const probeCase of ['a\nb', 'a\n\nb', 'a\r\nb', 'a\rb', 'a\r\n\r\nb', 'a\n\r\nb', 'a\r\rb']) {
    push(probeCase)
  }
  // Hardening (divergence critique, binding): C0 controls and DEL, alone and
  // between letters ('\n'/'\r' are exercised as span-driver cases above).
  for (let code = 0x00; code <= 0x1f; code++) {
    if (code === 0x0a || code === 0x0d) continue
    const control = String.fromCharCode(code)
    push(control)
    push(`a${control}b`)
  }
  push('\x7f')
  push('a\x7fb')
  return cases
}

export function buildWordScanProbeCorpus(): string {
  // '\n' is an unconditional UAX-29 word boundary on both sides (WB3a/WB3b),
  // so one composite string segments every case in a single live pass.
  return buildWordScanProbeCases().join('\n')
}

// Reference driver shared by probe verification and the differential gate:
// replicates the segmentation seam's span partition over an all-ASCII input
// and runs the fitted scanner on every between-newline span. Probe/test use
// only — allocates plain arrays.
export function predictHybridWordSegments(
  text: string,
  midBits: Uint8Array,
  wordLikeStatuses: Uint8Array,
): { starts: number[], ends: number[], wordLike: number[] } {
  const starts: number[] = []
  const ends: number[] = []
  const wordLike: number[] = []
  const len = text.length
  let cursor = 0
  while (cursor < len) {
    let spanEnd = cursor
    while (spanEnd < len) {
      const code = text.charCodeAt(spanEnd)
      if (code === 0x0a || code === 0x0d) break
      spanEnd++
    }
    if (spanEnd > cursor) {
      const segmentCount = scanAsciiWordSegments(text, cursor, spanEnd, midBits, wordLikeStatuses)
      for (let j = 0; j < segmentCount; j++) {
        starts.push(scanBuffers.starts[j]!)
        ends.push(scanBuffers.ends[j]!)
        wordLike.push(scanBuffers.wordLike[j]!)
      }
    }
    if (spanEnd === len) break
    let next = spanEnd + 1
    if (text.charCodeAt(spanEnd) === 0x0d && next < len && text.charCodeAt(next) === 0x0a) next++
    starts.push(spanEnd)
    ends.push(next)
    wordLike.push(0)
    cursor = next
  }
  return { starts, ends, wordLike }
}

// ---------------------------------------------------------------------------
// Verdict lifecycle. Keyed by the live Intl.Segmenter INSTANCE (WeakMap), not
// by locale name: setSegmenterLocale and clearGraphemeSegmenters null the
// instance, so every existing invalidation path automatically yields a fresh
// instance that re-probes lazily on first use. No extra wiring needed.
const wordScanVerdicts = new WeakMap<Intl.Segmenter, WordScanVerdict>()
const disabledWordScanVerdict: WordScanVerdict = { enabled: false }

export function getWordScanVerdict(wordSegmenter: Intl.Segmenter): WordScanVerdict {
  let verdict = wordScanVerdicts.get(wordSegmenter)
  if (verdict === undefined) {
    verdict = probeWordScanVerdict(wordSegmenter)
    wordScanVerdicts.set(wordSegmenter, verdict)
  }
  return verdict
}

// Test-only: pin or clear the memoized verdict for one live segmenter
// instance (null restores normal lazy probing). Used by the differential gate
// to force the disabled path and to restore the probed verdict; never call
// this from runtime code.
export function __setWordScanVerdictForTesting(
  wordSegmenter: Intl.Segmenter,
  verdict: WordScanVerdict | null,
): void {
  if (verdict === null) {
    wordScanVerdicts.delete(wordSegmenter)
  } else {
    wordScanVerdicts.set(wordSegmenter, verdict)
  }
}

function probeWordScanVerdict(wordSegmenter: Intl.Segmenter): WordScanVerdict {
  const cases = buildWordScanProbeCases()
  const corpus = cases.join('\n')

  // One live pass over the composite corpus, recorded as a flat stream.
  const liveStarts: number[] = []
  const liveEnds: number[] = []
  const liveWordLike: number[] = []
  const liveSlotByStart = new Map<number, number>()
  for (const s of wordSegmenter.segment(corpus)) {
    liveSlotByStart.set(s.index, liveStarts.length)
    liveStarts.push(s.index)
    liveEnds.push(s.index + s.segment.length)
    liveWordLike.push(s.isWordLike === true ? 1 : 0)
  }

  const caseStartByText = new Map<string, number>()
  let offset = 0
  for (const probeCase of cases) {
    caseStartByText.set(probeCase, offset)
    offset += probeCase.length + 1
  }
  const segmentEndAt = (start: number): number => {
    const slot = liveSlotByStart.get(start)
    return slot === undefined ? -1 : liveEnds[slot]!
  }
  const segmentWordLikeAt = (start: number): number => {
    const slot = liveSlotByStart.get(start)
    return slot === undefined ? 0 : liveWordLike[slot]!
  }

  // Parameter extraction. Verification below is the real gate: any live
  // behavior the parameter space cannot represent (cross-class joins,
  // double-mid joins, control-char fusions, ...) fails to reproduce the
  // stream and yields the permanent disabled verdict for this instance.
  const midBits = new Uint8Array(128)
  for (let code = 0x21; code <= 0x7e; code++) {
    if (charClasses[code] !== CLASS_OTHER) continue
    const x = String.fromCharCode(code)
    const letterStart = caseStartByText.get(`a${x}b`)!
    const digitStart = caseStartByText.get(`1${x}2`)!
    let bits = 0
    if (segmentEndAt(letterStart) === letterStart + 3) bits |= 1
    if (segmentEndAt(digitStart) === digitStart + 3) bits |= 2
    midBits[code] = bits
  }

  const wordLikeStatuses = new Uint8Array(3)
  const letterProbeStart = caseStartByText.get('ab')!
  const numberProbeStart = caseStartByText.get('12')!
  const noneProbeStart = caseStartByText.get('_')!
  if (
    segmentEndAt(letterProbeStart) !== letterProbeStart + 2 ||
    segmentEndAt(numberProbeStart) !== numberProbeStart + 2 ||
    segmentEndAt(noneProbeStart) !== noneProbeStart + 1
  ) {
    return disabledWordScanVerdict
  }
  wordLikeStatuses[STATUS_LETTER] = segmentWordLikeAt(letterProbeStart)
  wordLikeStatuses[STATUS_NUMBER] = segmentWordLikeAt(numberProbeStart)
  wordLikeStatuses[STATUS_NONE] = segmentWordLikeAt(noneProbeStart)

  // Verification: the fitted scanner, driven exactly like the segmentation
  // seam, must reproduce every (start, end, wordLike) of the live stream.
  const predicted = predictHybridWordSegments(corpus, midBits, wordLikeStatuses)
  if (predicted.starts.length !== liveStarts.length) return disabledWordScanVerdict
  for (let slot = 0; slot < liveStarts.length; slot++) {
    if (
      predicted.starts[slot] !== liveStarts[slot] ||
      predicted.ends[slot] !== liveEnds[slot] ||
      predicted.wordLike[slot] !== liveWordLike[slot]
    ) {
      return disabledWordScanVerdict
    }
  }

  return { enabled: true, midBits, wordLikeStatuses }
}
