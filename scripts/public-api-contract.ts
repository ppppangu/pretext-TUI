// 补建说明：该文件为后续补建，用于集中维护 validation-only 的公共 API/reader 边界契约；当前进度：Batch 6B.1 统一 public API、package smoke 与 runtime reader-boundary 静态门禁常量。
export const expectedPackageExports = {
  '.': {
    types: './dist/index.d.ts',
    import: './dist/index.js',
    default: './dist/index.js',
  },
  './terminal': {
    types: './dist/terminal.d.ts',
    import: './dist/terminal.js',
    default: './dist/terminal.js',
  },
  './terminal-rich-inline': {
    types: './dist/terminal-rich-inline.d.ts',
    import: './dist/terminal-rich-inline.js',
    default: './dist/terminal-rich-inline.js',
  },
  './package.json': './package.json',
} as const

export const expectedPackageExportKeys = Object.freeze(Object.keys(expectedPackageExports).sort())

export const expectedPackageFiles = Object.freeze([
  'CHANGELOG.md',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/terminal.js',
  'dist/terminal.d.ts',
  'dist/terminal-rich-inline.js',
  'dist/terminal-rich-inline.d.ts',
  'dist/internal',
])

export const requiredTarballFiles = Object.freeze([
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/terminal.js',
  'dist/terminal.d.ts',
  'dist/terminal-rich-inline.js',
  'dist/terminal-rich-inline.d.ts',
  'dist/internal/index.js',
  'dist/internal/index.d.ts',
  'dist/internal/terminal.js',
  'dist/internal/terminal.d.ts',
  'dist/internal/terminal-rich-inline.js',
  'dist/internal/terminal-rich-inline.d.ts',
])

export const allowedRootDistFiles = Object.freeze([
  'dist/index.js',
  'dist/index.d.ts',
  'dist/terminal.js',
  'dist/terminal.d.ts',
  'dist/terminal-rich-inline.js',
  'dist/terminal-rich-inline.d.ts',
])

const terminalRuntimeExportNames = [
  'TERMINAL_START_CURSOR',
  'appendTerminalCellFlow',
  'createTerminalLineIndex',
  'createTerminalPageCache',
  'createTerminalSourceOffsetIndex',
  'getTerminalCellFlowGeneration',
  'getTerminalCellFlowPrepared',
  'getTerminalCursorForSourceOffset',
  'getTerminalLineIndexMetadata',
  'getTerminalLineIndexStats',
  'getTerminalLinePage',
  'getTerminalLineRangeAtRow',
  'getTerminalPageCacheStats',
  'getTerminalSourceOffsetForCursor',
  'invalidateTerminalLineIndex',
  'invalidateTerminalPageCache',
  'layoutNextTerminalLineRange',
  'layoutTerminal',
  'materializeTerminalLinePage',
  'materializeTerminalLineRange',
  'materializeTerminalLineRanges',
  'measureTerminalLineIndexRows',
  'measureTerminalLineStats',
  'prepareTerminal',
  'prepareTerminalCellFlow',
  'projectTerminalCursor',
  'projectTerminalRow',
  'projectTerminalSourceOffset',
  'walkTerminalLineRanges',
]

export const terminalPublicRuntimeExports = Object.freeze([...terminalRuntimeExportNames].sort())

export const terminalPublicDeclarationExports = Object.freeze([...new Set([
  'AmbiguousWidthPolicy',
  'ControlCharPolicy',
  'EmojiWidthPolicy',
  'MaterializedTerminalLine',
  'PreparedTerminalCellFlow',
  'PreparedTerminalText',
  'RegionalIndicatorPolicy',
  'TERMINAL_START_CURSOR',
  'TerminalAppendInvalidation',
  'TerminalAppendOptions',
  'TerminalAppendResult',
  'TerminalAppendStrategy',
  'TerminalCoordinateProjection',
  'TerminalCursor',
  'TerminalFixedLayoutOptions',
  'TerminalCellCoordinate',
  'TerminalLayoutOptions',
  'TerminalLayoutResult',
  'TerminalLineBreak',
  'TerminalLineIndex',
  'TerminalLineIndexInvalidation',
  'TerminalLineIndexInvalidationResult',
  'TerminalLineIndexMetadata',
  'TerminalLineIndexStats',
  'TerminalLinePage',
  'TerminalLinePageRequest',
  'TerminalLineRange',
  'TerminalLineStats',
  'TerminalPageCache',
  'TerminalPageCacheOptions',
  'TerminalPageCacheStats',
  'TerminalPrepareOptions',
  'TerminalProjectionIndexes',
  'TerminalRowProjection',
  'TerminalSourceLookupResult',
  'TerminalSourceOffsetBias',
  'TerminalSourceOffsetIndex',
  'TerminalSourceProjection',
  'TerminalSourceProjectionOptions',
  'TerminalWidthProfile',
  'TerminalWidthProfileInput',
  ...terminalRuntimeExportNames,
])].sort())

const richRuntimeExportNames = [
  'layoutNextTerminalRichLineRange',
  'materializeTerminalRichLineRange',
  'prepareTerminalRichInline',
  'walkTerminalRichLineRanges',
]

export const richPublicRuntimeExports = Object.freeze([...richRuntimeExportNames].sort())

export const richPublicDeclarationExports = Object.freeze([...new Set([
  'MaterializedTerminalRichLine',
  'PreparedTerminalRichInline',
  'TerminalRichAnsiReemitPolicy',
  'TerminalRichBidiFormatPolicy',
  'TerminalRichCompleteness',
  'TerminalRichControlFamily',
  'TerminalRichDiagnostic',
  'TerminalRichDiagnosticPolicy',
  'TerminalRichFragment',
  'TerminalRichLimits',
  'TerminalRichMaterializeOptions',
  'TerminalRichOsc8UriPolicy',
  'TerminalRichPolicySummary',
  'TerminalRichPrepareOptions',
  'TerminalRichRawRetentionPolicy',
  'TerminalRichRawSummary',
  'TerminalRichSecurityPolicyInput',
  'TerminalRichSecurityProfileName',
  'TerminalRichSpan',
  'TerminalRichStyle',
  'TerminalRichUnsupportedControlMode',
  ...richRuntimeExportNames,
])].sort())

export const forbiddenPreparedHandleDeclarationTokens = Object.freeze([
  'breakableFitAdvances',
  'chunks',
  'discretionaryHyphenWidth',
  'geometry',
  'hasSegmentBreakAfter',
  'letterSpacing',
  'lineEndFitAdvances',
  'lineEndPaintAdvances',
  'reader',
  'segLevels',
  'segmentBreaksAfter',
  'segmentKind',
  'segmentSourceStart',
  'segmentText',
  'simpleLineWalkFastPath',
  'sourceText',
  'sourceLength',
  'sourceSlice',
  'sourceTextRange',
  'segments',
  'segmentCount',
  'sourceStarts',
  'spacingGraphemeCounts',
  'kinds',
  'widthProfile',
  'widths',
  'tabStopAdvance',
  'legacyPreparedForDebugSnapshot',
  'sourceTextForDebugSnapshot',
])

export const readerBoundaryRuntimeFiles = Object.freeze([
  'src/terminal.ts',
  'src/terminal-cell-flow.ts',
  'src/terminal-coordinate-projection.ts',
  'src/terminal-grapheme-geometry.ts',
  'src/terminal-line-index.ts',
  'src/terminal-line-source.ts',
  'src/terminal-materialize.ts',
  'src/terminal-page-cache.ts',
  'src/terminal-rich-inline.ts',
  'src/terminal-source-offset-index.ts',
])

export const forbiddenReaderBoundaryRuntimeTokens = Object.freeze([
  'getInternalPreparedTerminalText',
  'getInternalPreparedTerminalTextDebugSnapshot',
  'PreparedTextWithSegments',
  'PreparedTerminalTextDebugSnapshot',
  'legacyPreparedForDebugSnapshot',
  'sourceTextForDebugSnapshot',
])

export type ReaderBoundaryRuntimeFinding = Readonly<{
  match: string
  token: string
}>

export function findReaderBoundaryRuntimeFindings(source: string): ReaderBoundaryRuntimeFinding[] {
  const stripped = stripCommentsAndStrings(source)
  const findings: ReaderBoundaryRuntimeFinding[] = []
  for (const token of forbiddenReaderBoundaryRuntimeTokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g')
    for (const match of stripped.matchAll(pattern)) {
      findings.push({
        match: match[0]!,
        token,
      })
    }
  }
  return findings
}

export const forbiddenPublicDeclarationTokens = Object.freeze([
  './internal/',
  './layout.js',
  './analysis.js',
  './ansi-tokenize.js',
  './terminal-line-source.js',
  './terminal-coordinate-projection.js',
  './terminal-grapheme-geometry.js',
  './terminal-performance-counters.js',
  './terminal-prepared-reader.js',
  'terminal-line-source',
  'PreparedTerminalTextState',
  'PreparedTerminalTextChunkDebugSnapshot',
  'PreparedTextWithSegments',
  'TerminalSegmentGeometry',
  'discretionaryHyphenWidth',
  'letterSpacing',
  'simpleLineWalkFastPath',
  'segments: string',
  'sourceStarts',
  'sourceLength',
  'sourceSlice',
  'sourceTextRange',
  'segmentCount',
  'kinds:',
  'widths:',
  'tabStopAdvance',
  'legacyPreparedForDebugSnapshot',
  'sourceTextForDebugSnapshot',
  'PreparedTerminalReader',
  'PreparedTerminalTextDebugSnapshot',
  'getInternalPreparedTerminalReader',
  'getInternalPreparedTerminalGeometry',
  'getInternalPreparedTerminalTextDebugSnapshot',
  'getInternalPreparedTerminalText',
  'createPreparedTerminalText',
  'createPreparedTerminalTextFromReader',
  'createArrayPreparedTerminalReader',
  'internalPreparedTerminalTextState',
  'copyPreparedTerminalTextDebugSnapshot',
  'PreparedTerminalGeometry',
  'createPreparedTerminalGeometry',
  'getTerminalSegmentGeometry',
  'getTerminalCursorSourceOffset',
  'getTerminalSegmentGrapheme',
  'getTerminalSegmentGraphemeCount',
  'getTerminalSegmentWidthAt',
  'getTerminalSegmentWidthRange',
  'TerminalPerformanceCounter',
  'disableTerminalPerformanceCounters',
  'resetTerminalPerformanceCounters',
  'snapshotTerminalPerformanceCounters',
  'materializeTerminalLineSourceRange',
  'getTerminalLineSourceBoundaryOffsets',
])

export const richPublicDeclarationForbiddenTokens = Object.freeze([
  'sequence: string',
  'ansiText: string',
  'text?: string',
  './terminal-rich-policy.js',
])

export const richPublicDeclarationForbiddenPatterns = Object.freeze([
  /\brawText\s*:\s*string\s*[;}]/u,
  /\bsequence\s*:\s*string\b/u,
  /\bansiText\s*:\s*string\b/u,
])

export const forbiddenRootRuntimeExports = Object.freeze([
  'disableTerminalPerformanceCounters',
  'getTerminalLineRangesAtRows',
  'getTerminalLineSourceBoundaryOffsets',
  'materializeTerminalLineSourceRange',
  'resetTerminalPerformanceCounters',
  'snapshotTerminalPerformanceCounters',
])

export const forbiddenRootTypeExports = Object.freeze([
  'prepare',
  'layout',
  'prepareWithSegments',
  'layoutWithLines',
  'PreparedTextWithSegments',
  'TerminalRowAnchor',
  'TerminalLineIndexIdentity',
  'PreparedTerminalReader',
  'PreparedTerminalGeometry',
  'PreparedTerminalTextDebugSnapshot',
  'assertTerminalLineIndexPrepared',
  'getTerminalLineIndexIdentity',
  'getInternalPreparedTerminalReader',
  'getInternalPreparedTerminalGeometry',
  'getInternalPreparedTerminalTextDebugSnapshot',
  'isTerminalSourceOffsetIndexForPrepared',
  'materializeTerminalLineSourceRange',
  'getTerminalLineSourceBoundaryOffsets',
])

export const richSidecarOnlyExports = Object.freeze([
  'prepareTerminalRichInline',
  'layoutNextTerminalRichLineRange',
  'materializeTerminalRichLineRange',
])

export const forbiddenPackageSubpaths = Object.freeze([
  'demos',
  'assets',
  'rich-inline',
  'layout',
  'analysis',
  'line-break',
  'measurement',
  'terminal-line-index',
  'terminal-page-cache',
  'terminal-cell-flow',
  'terminal-source-offset-index',
  'terminal-string-width',
  'terminal-prepared-reader',
  'terminal-grapheme-geometry',
  'terminal-performance-counters',
  'terminal-line-source',
  'terminal-coordinate-projection',
  'bidi',
  'generated/bidi-data',
  'internal/index',
  'internal/terminal',
  'internal/terminal-coordinate-projection',
  'internal/terminal-rich-inline',
  'public-index',
  'public-terminal-rich-inline',
  'terminal-control-policy',
  'dist/internal/index.js',
  'dist/internal/terminal.js',
  'dist/internal/terminal-prepared-reader.js',
  'dist/internal/terminal-grapheme-geometry.js',
  'dist/internal/terminal-line-source.js',
  'dist/internal/terminal-coordinate-projection.js',
  'dist/internal/terminal-cell-flow.js',
  'dist/layout.js',
  'dist/ansi-tokenize.js',
  'src/index.ts',
  'ansi-tokenize',
  'security',
  'profiles',
  'terminal-security',
  'rich-policy',
  'enterprise',
  'interactive-cli',
  'claude-code',
  'codex',
  'tmux',
  'nvim',
  'ink',
  'blessed',
  'react',
  'browser',
])

function stripCommentsAndStrings(source: string): string {
  let output = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        output += ' '
        i++
      }
      continue
    }
    if (ch === '/' && next === '*') {
      output += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        output += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        output += '  '
        i += 2
      }
      continue
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      const quote = ch
      output += ' '
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          output += '  '
          i += 2
          continue
        }
        const current = source[i]!
        output += current === '\n' ? '\n' : ' '
        i++
        if (current === quote) break
      }
      continue
    }
    output += ch
    i++
  }
  return output
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
