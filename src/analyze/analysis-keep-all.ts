// 补建说明：该文件为 R1 重构新增，集中 word-break:keep-all 的 CJK 成组规则（groupKeepAllRuns），供 analysis 段流与 layout 量测单元共用，消除 layout 侧重复；当前进度：行为冻结迁移。
import { canContinueKeepAllTextRun } from './analysis-text-predicates.js'

// Shared keep-all grouping loop over a contiguous run of `count` text elements.
// Groups are bounded by `canContinueKeepAllTextRun(previousElementText, ...)`
// (the PREVIOUS element gates whether the current one keeps the run going). A
// group that contains CJK collapses to a single merged element via
// `emitMergedRange`; a single-element group, or any non-CJK group, emits its
// elements unchanged via `emitOriginal`. Callers decide what `emitOriginal` /
// `emitMergedRange` push, so the same control flow serves both the analysis
// segment stream and the layout measurement units.
export function groupKeepAllRuns(
  count: number,
  textAt: (index: number) => string,
  containsCJKAt: (index: number) => boolean,
  breakAfterPunctuation: boolean,
  emitOriginal: (index: number) => void,
  emitMergedRange: (start: number, end: number) => void,
): void {
  let groupStart = -1
  let groupContainsCJK = false

  function flushGroup(end: number): void {
    if (groupStart < 0) return

    if (groupContainsCJK) {
      if (groupStart + 1 === end) {
        emitOriginal(groupStart)
      } else {
        emitMergedRange(groupStart, end)
      }
    } else {
      for (let i = groupStart; i < end; i++) emitOriginal(i)
    }

    groupStart = -1
    groupContainsCJK = false
  }

  for (let i = 0; i < count; i++) {
    if (
      groupStart >= 0 &&
      !canContinueKeepAllTextRun(textAt(i - 1), breakAfterPunctuation)
    ) {
      flushGroup(i)
    }
    if (groupStart < 0) groupStart = i
    groupContainsCJK = groupContainsCJK || containsCJKAt(i)
  }

  flushGroup(count)
}
