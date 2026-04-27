// 补建说明：该文件为后续补建，用于提供 Phase 6 host-neutral selection/extraction 数据模型；当前进度：首版基于 public projection 与 internal source materialization 组合实现，不包含 clipboard/highlight/mouse 状态机。
import type {
  PreparedTerminalText,
  TerminalLineRange,
} from './terminal.js'
import {
  materializePreparedTerminalSourceTextRange,
  materializeTerminalLineSourceRange,
} from './terminal-line-source.js'
import { getInternalPreparedTerminalReader } from './terminal-prepared-reader.js'
import {
  projectTerminalCoordinate,
  projectTerminalSourceRange,
  type TerminalCoordinateSourceProjection,
  type TerminalProjectionIndexInput,
  type TerminalSourceRangeProjection,
  type TerminalSourceRangeProjectionFragment,
  type TerminalSourceRangeProjectionRequest,
} from './terminal-coordinate-projection.js'
import type { TerminalSourceOffsetBias } from './terminal-source-offset-index.js'
import {
  getTerminalRangesForSourceRange,
  type TerminalRange,
  type TerminalRangeIndex,
} from './terminal-range-index.js'

export type TerminalSelectionMode = 'linear'
export type TerminalSelectionDirection = 'forward' | 'backward' | 'collapsed'

export type TerminalSelectionCoordinate = Readonly<{
  bias?: TerminalSourceOffsetBias
  column: number
  row: number
}>

export type TerminalSelectionRequest = Readonly<{
  anchor: TerminalSelectionCoordinate
  focus: TerminalSelectionCoordinate
  mode?: TerminalSelectionMode
}>

export type TerminalSelection = Readonly<{
  kind: 'terminal-selection@1'
  anchor: TerminalCoordinateSourceProjection
  collapsed: boolean
  direction: TerminalSelectionDirection
  focus: TerminalCoordinateSourceProjection
  mode: TerminalSelectionMode
  projection: TerminalSourceRangeProjection
  rowEnd: number
  rowStart: number
  sourceEnd: number
  sourceStart: number
}>

export type TerminalSourceRangeExtractionRequest = TerminalSourceRangeProjectionRequest

export type TerminalSelectionExtractionOptions = Readonly<{
  indexes: TerminalProjectionIndexInput
  rangeIndex?: TerminalRangeIndex
}>

export type TerminalSelectionExtractionFragment = Readonly<{
  kind: 'terminal-selection-extraction-fragment@1'
  endColumn: number
  line: TerminalLineRange
  row: number
  sourceEnd: number
  sourceStart: number
  sourceText: string
  startColumn: number
  text: string
}>

export type TerminalSelectionExtraction = Readonly<{
  kind: 'terminal-selection-extraction@1'
  projection: TerminalSourceRangeProjection
  rangeMatches?: readonly TerminalRange[]
  requestedSourceEnd: number
  requestedSourceStart: number
  rowEnd: number
  rowFragments: readonly TerminalSelectionExtractionFragment[]
  rowStart: number
  sourceEnd: number
  sourceStart: number
  sourceText: string
  visibleRows: readonly string[]
  visibleText: string
}>

export function createTerminalSelectionFromCoordinates(
  prepared: PreparedTerminalText,
  indexes: TerminalProjectionIndexInput,
  request: TerminalSelectionRequest,
): TerminalSelection | null {
  const normalized = normalizeSelectionRequest(request)
  const anchor = projectTerminalCoordinate(prepared, indexes, normalized.anchor)
  const focus = projectTerminalCoordinate(prepared, indexes, normalized.focus)
  if (anchor === null || focus === null) return null

  const direction = compareSelectionEndpoints(anchor, focus)
  const sourceStart = Math.min(anchor.sourceOffset, focus.sourceOffset)
  const sourceEnd = Math.max(sourceStart, Math.max(anchor.sourceOffset, focus.sourceOffset))
  const projection = freezeTerminalSourceRangeProjection(projectTerminalSourceRange(
    prepared,
    indexes,
    { sourceStart, sourceEnd },
  ))

  return Object.freeze({
    kind: 'terminal-selection@1',
    anchor: freezeTerminalCoordinateSourceProjection(anchor),
    collapsed: projection.sourceStart === projection.sourceEnd,
    direction,
    focus: freezeTerminalCoordinateSourceProjection(focus),
    mode: normalized.mode,
    projection,
    rowStart: projection.start.row,
    rowEnd: projection.end.row,
    sourceStart: projection.sourceStart,
    sourceEnd: projection.sourceEnd,
  })
}

export function extractTerminalSourceRange(
  prepared: PreparedTerminalText,
  request: TerminalSourceRangeExtractionRequest,
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtraction {
  const normalizedOptions = normalizeExtractionOptions(options)
  return buildTerminalSelectionExtraction(
    prepared,
    request,
    normalizedOptions,
  )
}

export function extractTerminalSelection(
  prepared: PreparedTerminalText,
  selection: TerminalSelection,
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtraction {
  const normalizedSelection = normalizeTerminalSelection(selection)
  const normalizedOptions = normalizeExtractionOptions(options)
  return buildTerminalSelectionExtraction(
    prepared,
    {
      sourceStart: normalizedSelection.sourceStart,
      sourceEnd: normalizedSelection.sourceEnd,
    },
    normalizedOptions,
  )
}

function buildTerminalSelectionExtraction(
  prepared: PreparedTerminalText,
  request: TerminalSourceRangeExtractionRequest,
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtraction {
  const projection = freezeTerminalSourceRangeProjection(projectTerminalSourceRange(
    prepared,
    options.indexes,
    request,
  ))
  const reader = getInternalPreparedTerminalReader(prepared)
  const sourceText = materializePreparedTerminalSourceTextRange(
    reader,
    projection.sourceStart,
    projection.sourceEnd,
  )
  const rowFragments = Object.freeze(projection.fragments.map(fragment =>
    buildTerminalSelectionExtractionFragment(prepared, reader, fragment),
  ))
  const visibleRows = buildVisibleRows(rowFragments)
  const extraction: {
    kind: 'terminal-selection-extraction@1'
    projection: TerminalSourceRangeProjection
    rangeMatches?: readonly TerminalRange[]
    requestedSourceEnd: number
    requestedSourceStart: number
    rowEnd: number
    rowFragments: readonly TerminalSelectionExtractionFragment[]
    rowStart: number
    sourceEnd: number
    sourceStart: number
    sourceText: string
    visibleRows: readonly string[]
    visibleText: string
  } = {
    kind: 'terminal-selection-extraction@1',
    projection,
    requestedSourceStart: projection.requestedSourceStart,
    requestedSourceEnd: projection.requestedSourceEnd,
    rowStart: projection.start.row,
    rowEnd: projection.end.row,
    rowFragments,
    sourceStart: projection.sourceStart,
    sourceEnd: projection.sourceEnd,
    sourceText,
    visibleRows,
    visibleText: visibleRows.join('\n'),
  }
  if (options.rangeIndex !== undefined) {
    extraction.rangeMatches = getTerminalRangesForSourceRange(
      options.rangeIndex,
      {
        sourceStart: projection.sourceStart,
        sourceEnd: projection.sourceEnd,
      },
    )
  }
  return Object.freeze(extraction)
}

function buildTerminalSelectionExtractionFragment(
  prepared: PreparedTerminalText,
  reader: ReturnType<typeof getInternalPreparedTerminalReader>,
  fragment: TerminalSourceRangeProjectionFragment,
): TerminalSelectionExtractionFragment {
  const materialized = materializeTerminalLineSourceRange(
    prepared,
    fragment.line,
    fragment.sourceStart,
    fragment.sourceEnd,
    fragment.startColumn,
  )
  return Object.freeze({
    kind: 'terminal-selection-extraction-fragment@1',
    row: fragment.row,
    line: fragment.line,
    sourceStart: fragment.sourceStart,
    sourceEnd: fragment.sourceEnd,
    startColumn: fragment.startColumn,
    endColumn: fragment.endColumn,
    text: materialized.text,
    sourceText: materializePreparedTerminalSourceTextRange(
      reader,
      fragment.sourceStart,
      fragment.sourceEnd,
    ),
  })
}

function buildVisibleRows(
  fragments: readonly TerminalSelectionExtractionFragment[],
): readonly string[] {
  if (fragments.length === 0) return Object.freeze([])
  const firstRow = fragments[0]!.row
  const lastRow = fragments[fragments.length - 1]!.row
  const rows: string[] = []
  for (let row = firstRow; row <= lastRow; row++) rows.push('')
  for (const fragment of fragments) {
    rows[fragment.row - firstRow] += fragment.text
  }
  return Object.freeze(rows)
}

function normalizeSelectionRequest(request: TerminalSelectionRequest): Required<TerminalSelectionRequest> {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Terminal selection request must be an object')
  }
  const mode = request.mode ?? 'linear'
  if (mode !== 'linear') {
    throw new Error(`Terminal selection mode must be "linear", got ${String(mode)}`)
  }
  return Object.freeze({
    anchor: normalizeSelectionCoordinate(request.anchor, 'Terminal selection anchor'),
    focus: normalizeSelectionCoordinate(request.focus, 'Terminal selection focus'),
    mode,
  })
}

function normalizeSelectionCoordinate(
  coordinate: TerminalSelectionCoordinate,
  label: string,
): TerminalSelectionCoordinate {
  if (coordinate === null || typeof coordinate !== 'object' || Array.isArray(coordinate)) {
    throw new Error(`${label} must be an object`)
  }
  const normalized: {
    bias?: TerminalSourceOffsetBias
    column: number
    row: number
  } = {
    row: coordinate.row,
    column: coordinate.column,
  }
  if (coordinate.bias !== undefined) normalized.bias = coordinate.bias
  return Object.freeze(normalized)
}

function normalizeExtractionOptions(
  options: TerminalSelectionExtractionOptions,
): TerminalSelectionExtractionOptions {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Terminal selection extraction options must be an object')
  }
  if (!('indexes' in options)) {
    throw new Error('Terminal selection extraction options.indexes is required')
  }
  if (options.indexes === null || typeof options.indexes !== 'object' || Array.isArray(options.indexes)) {
    throw new Error('Terminal selection extraction options.indexes must be an object')
  }
  return options
}

function normalizeTerminalSelection(selection: TerminalSelection): TerminalSelection {
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new Error('Terminal selection must be an object')
  }
  if (selection.kind !== 'terminal-selection@1') {
    throw new Error('Invalid terminal selection')
  }
  if (selection.mode !== 'linear') {
    throw new Error('Terminal selection mode must be "linear"')
  }
  if (!Number.isInteger(selection.sourceStart) || selection.sourceStart < 0) {
    throw new Error('Terminal selection sourceStart must be a non-negative integer')
  }
  if (!Number.isInteger(selection.sourceEnd) || selection.sourceEnd < selection.sourceStart) {
    throw new Error('Terminal selection sourceEnd must be >= sourceStart')
  }
  return selection
}

function compareSelectionEndpoints(
  anchor: TerminalCoordinateSourceProjection,
  focus: TerminalCoordinateSourceProjection,
): TerminalSelectionDirection {
  if (anchor.sourceOffset < focus.sourceOffset) return 'forward'
  if (anchor.sourceOffset > focus.sourceOffset) return 'backward'
  if (anchor.row < focus.row) return 'forward'
  if (anchor.row > focus.row) return 'backward'
  if (anchor.column < focus.column) return 'forward'
  if (anchor.column > focus.column) return 'backward'
  return 'collapsed'
}

function freezeTerminalCoordinateSourceProjection(
  projection: TerminalCoordinateSourceProjection,
): TerminalCoordinateSourceProjection {
  return Object.freeze({
    ...projection,
    coordinate: Object.freeze({ ...projection.coordinate }),
    requestedCoordinate: Object.freeze({ ...projection.requestedCoordinate }),
  })
}

function freezeTerminalSourceRangeProjection(
  projection: TerminalSourceRangeProjection,
): TerminalSourceRangeProjection {
  return Object.freeze({
    ...projection,
    start: Object.freeze({
      ...projection.start,
      coordinate: Object.freeze({ ...projection.start.coordinate }),
    }),
    end: Object.freeze({
      ...projection.end,
      coordinate: Object.freeze({ ...projection.end.coordinate }),
    }),
    fragments: Object.freeze(projection.fragments.map(fragment =>
      Object.freeze({ ...fragment }),
    )),
  })
}
