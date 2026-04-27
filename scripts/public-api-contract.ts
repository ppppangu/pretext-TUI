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
  'SECURITY.md',
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
  'SECURITY.md',
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

const terminalStableRuntimeExportNames = [
  'TERMINAL_START_CURSOR',
  'layoutNextTerminalLineRange',
  'layoutTerminal',
  'materializeTerminalLineRange',
  'measureTerminalLineStats',
  'prepareTerminal',
  'walkTerminalLineRanges',
]

const terminalIncubatingRuntimeExportNames = [
  'appendTerminalCellFlow',
  'createTerminalLineIndex',
  'createTerminalLayoutBundle',
  'createTerminalPageCache',
  'createTerminalRangeIndex',
  'createTerminalSearchSession',
  'createTerminalSelectionFromCoordinates',
  'createTerminalSourceOffsetIndex',
  'extractTerminalSelection',
  'extractTerminalSourceRange',
  'getTerminalCellFlowGeneration',
  'getTerminalCellFlowPrepared',
  'getTerminalCursorForSourceOffset',
  'getTerminalLayoutBundlePage',
  'getTerminalLineIndexMetadata',
  'getTerminalLineIndexStats',
  'getTerminalLinePage',
  'getTerminalLineRangeAtRow',
  'getTerminalPageCacheStats',
  'getTerminalRangesAtSourceOffset',
  'getTerminalRangesForSourceRange',
  'getTerminalSearchMatchAfterSourceOffset',
  'getTerminalSearchMatchBeforeSourceOffset',
  'getTerminalSearchMatchesForSourceRange',
  'getTerminalSearchSessionMatchCount',
  'getTerminalSourceOffsetForCursor',
  'invalidateTerminalLineIndex',
  'invalidateTerminalLayoutBundle',
  'invalidateTerminalPageCache',
  'materializeTerminalLinePage',
  'materializeTerminalLineRanges',
  'measureTerminalLineIndexRows',
  'prepareTerminalCellFlow',
  'projectTerminalCoordinate',
  'projectTerminalCursor',
  'projectTerminalRow',
  'projectTerminalSourceOffset',
  'projectTerminalSourceRange',
]

const terminalRuntimeExportNames = [
  ...terminalStableRuntimeExportNames,
  ...terminalIncubatingRuntimeExportNames,
]

export const terminalStableRuntimeExports = Object.freeze([...terminalStableRuntimeExportNames].sort())
export const terminalIncubatingRuntimeExports = Object.freeze([...terminalIncubatingRuntimeExportNames].sort())
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
  'TerminalCoordinateProjectionRequest',
  'TerminalCoordinateSourceProjection',
  'TerminalCoordinateProjection',
  'TerminalCursor',
  'TerminalFixedLayoutOptions',
  'TerminalCellCoordinate',
  'TerminalLayoutOptions',
  'TerminalLayoutBundle',
  'TerminalLayoutBundleInvalidation',
  'TerminalLayoutBundleInvalidationResult',
  'TerminalLayoutBundleOptions',
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
  'TerminalProjectionIndexInput',
  'TerminalProjectionIndexes',
  'TerminalRange',
  'TerminalRangeData',
  'TerminalRangeIndex',
  'TerminalRangeQuery',
  'TerminalRowProjection',
  'TerminalSearchMatch',
  'TerminalSearchMode',
  'TerminalSearchOptions',
  'TerminalSearchQuery',
  'TerminalSearchRangeIndexScope',
  'TerminalSearchScope',
  'TerminalSearchSession',
  'TerminalSearchSourceRangeQuery',
  'TerminalSelection',
  'TerminalSelectionCoordinate',
  'TerminalSelectionDirection',
  'TerminalSelectionExtraction',
  'TerminalSelectionExtractionFragment',
  'TerminalSelectionExtractionOptions',
  'TerminalSelectionMode',
  'TerminalSelectionRequest',
  'TerminalSourceLookupResult',
  'TerminalSourceOffsetBias',
  'TerminalSourceOffsetIndex',
  'TerminalSourceProjection',
  'TerminalSourceProjectionOptions',
  'TerminalSourceRangeExtractionRequest',
  'TerminalSourceRangeProjection',
  'TerminalSourceRangeProjectionFragment',
  'TerminalSourceRangeProjectionRequest',
  'TerminalWidthProfile',
  'TerminalWidthProfileInput',
  ...terminalRuntimeExportNames,
])].sort())

const richRuntimeExportNames = [
  'extractTerminalRichSelection',
  'extractTerminalRichSourceRange',
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
  'TerminalRichSelectionExtraction',
  'TerminalRichSelectionExtractionFragment',
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
  'src/terminal-layout-bundle.ts',
  'src/terminal-line-index.ts',
  'src/terminal-line-source.ts',
  'src/terminal-materialize.ts',
  'src/terminal-normalized-source.ts',
  'src/terminal-page-cache.ts',
  'src/terminal-range-index.ts',
  'src/terminal-reader-store.ts',
  'src/terminal-rich-inline.ts',
  'src/terminal-search-session.ts',
  'src/terminal-selection.ts',
  'src/terminal-source-offset-index.ts',
])

export const readerBoundaryStorageRuntimeFiles = Object.freeze([
  'src/terminal-prepared-reader.ts',
])

export const readerBoundaryRuntimeClassificationTokens = Object.freeze([
  'PreparedTerminalText',
  'PreparedTerminalReader',
  'getInternalPreparedTerminal',
  'createPreparedTerminalText',
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
  './terminal-layout-bundle.js',
  './terminal-grapheme-geometry.js',
  './terminal-range-index.js',
  './terminal-search-session.js',
  './terminal-selection.js',
  './terminal-rich-span-index.js',
  './terminal-reader-store.js',
  './terminal-performance-counters.js',
  './terminal-prepared-reader.js',
  'terminal-line-source',
  'IndexedTerminalRange',
  'InternalTerminalRangeIndex',
  'rangeIndexStates',
  'byStart',
  'prefixMaxEnd',
  'internalRangeIndex',
  'InternalTerminalSearchMatch',
  'TerminalSearchSessionState',
  'NormalizedSearchQuery',
  'NormalizedSearchScope',
  'searchSessionStates',
  'internalSearchSession',
  'InternalTerminalSelection',
  'TerminalSelectionState',
  'terminalSelectionStates',
  'selectionStates',
  'internalSelection',
  'getInternalTerminalSelection',
  'copyTerminalSelectionToClipboard',
  'writeTerminalSelectionToClipboard',
  'Clipboard',
  'PreparedTerminalTextState',
  'PreparedTerminalTextChunkDebugSnapshot',
  'PreparedTerminalReaderStore',
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
  'createSingleStorePreparedTerminalText',
  'assertPreparedTerminalReaderStoreInvariants',
  'createCompositePreparedTerminalReader',
  'createCompositePreparedTerminalReaderStore',
  'createSingleStorePreparedTerminalReader',
  'createSingleStorePreparedTerminalReaderStore',
  'createPreparedTerminalReaderFromStore',
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
  'getTerminalLayoutBundleLineIndex',
  'getTerminalLayoutBundleProjectionIndexes',
  'getTerminalLayoutBundleStats',
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
  'IndexedTerminalRange',
  'InternalTerminalRangeIndex',
  'rangeIndexStates',
  'internalRangeIndex',
  'TerminalSearchSessionState',
  'searchSessionStates',
  'internalSearchSession',
  'InternalTerminalSelection',
  'TerminalSelectionState',
  'terminalSelectionStates',
  'selectionStates',
  'internalSelection',
  'getInternalTerminalSelection',
  'getTerminalLayoutBundleLineIndex',
  'getTerminalLayoutBundleProjectionIndexes',
  'getTerminalLayoutBundleStats',
  'PreparedTerminalReader',
  'PreparedTerminalGeometry',
  'PreparedTerminalReaderStore',
  'PreparedTerminalTextDebugSnapshot',
  'assertTerminalLineIndexPrepared',
  'getTerminalLineIndexIdentity',
  'getInternalPreparedTerminalReader',
  'getInternalPreparedTerminalGeometry',
  'getInternalPreparedTerminalTextDebugSnapshot',
  'createSingleStorePreparedTerminalText',
  'assertPreparedTerminalReaderStoreInvariants',
  'createCompositePreparedTerminalReader',
  'createCompositePreparedTerminalReaderStore',
  'createSingleStorePreparedTerminalReader',
  'createSingleStorePreparedTerminalReaderStore',
  'createPreparedTerminalReaderFromStore',
  'isTerminalSourceOffsetIndexForPrepared',
  'materializeTerminalLineSourceRange',
  'getTerminalLineSourceBoundaryOffsets',
])

export const richSidecarOnlyExports = Object.freeze([
  'prepareTerminalRichInline',
  'layoutNextTerminalRichLineRange',
  'materializeTerminalRichLineRange',
  'extractTerminalRichSelection',
  'extractTerminalRichSourceRange',
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
  'terminal-layout-bundle',
  'layout-bundle',
  'terminal-page-cache',
  'terminal-range-index',
  'range-index',
  'terminal-source-range-index',
  'source-range-index',
  'ranges',
  'annotations',
  'highlights',
  'selection',
  'terminal-selection',
  'source-selection',
  'selection-extraction',
  'terminal-selection-extraction',
  'extract',
  'extraction',
  'copy',
  'clipboard',
  'terminal-copy',
  'terminal-clipboard',
  'search',
  'terminal-search',
  'terminal-search-session',
  'source-search',
  'source-search-session',
  'find',
  'highlight',
  'diagnostics',
  'terminal-cell-flow',
  'terminal-source-offset-index',
  'terminal-string-width',
  'terminal-prepared-reader',
  'terminal-grapheme-geometry',
  'terminal-performance-counters',
  'terminal-memory-budget',
  'terminal-normalized-source',
  'terminal-plain-input',
  'terminal-rich-span-index',
  'rich-span-index',
  'raw-visible',
  'terminal-line-source',
  'terminal-coordinate-projection',
  'dist/internal/terminal-layout-bundle.js',
  'terminal-reader-store',
  'bidi',
  'generated/bidi-data',
  'internal/index',
  'internal/terminal',
  'internal/terminal-coordinate-projection',
  'internal/terminal-reader-store',
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
  'dist/internal/terminal-memory-budget.js',
  'dist/internal/terminal-normalized-source.js',
  'dist/internal/terminal-plain-input.js',
  'dist/internal/terminal-range-index.js',
  'dist/internal/terminal-search-session.js',
  'dist/internal/terminal-selection.js',
  'dist/internal/terminal-rich-span-index.js',
  'dist/internal/terminal-reader-store.js',
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
  'neovim',
  'vscode',
  'vs-code',
  'xterm',
  'xterm.js',
  'terminal-kit',
  'ratatui',
  'bubble-tea',
  'bubbletea',
  'textual',
  'wezterm',
  'zellij',
  'iterm',
  'iterm2',
  'kitty',
  'alacritty',
  'warp',
  'ghostty',
  'adapter',
  'adapters',
  'integration',
  'integrations',
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
