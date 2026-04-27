// 补建说明：该文件为后续补建，用于给 pretext-tui 静态官网添加轻量交互；当前进度：包含 header 状态、复制按钮与嵌入式 TUI layout playground，无外部依赖，部署目录为 website/。
const header = document.querySelector('[data-site-header]')
const copyButtons = document.querySelectorAll('[data-copy]')
const columnsRange = document.querySelector('#columns-range')
const columnsOutput = document.querySelector('#columns-output')
const windowRange = document.querySelector('#window-range')
const windowOutput = document.querySelector('#window-output')
const searchInput = document.querySelector('#demo-search')
const demoColumns = document.querySelector('[data-demo-columns]')
const terminalPreview = document.querySelector('#terminal-preview')
const rowInspector = document.querySelector('#row-inspector')
const sourceUnitsMetric = document.querySelector('[data-demo-source-units]')
const totalRowsMetric = document.querySelector('[data-demo-total-rows]')
const visibleRowsMetric = document.querySelector('[data-demo-visible-rows]')
const searchHitsMetric = document.querySelector('[data-demo-search-hits]')

const viewportRows = 12
let selectedRow = 0
let viewportDefaultApplied = false

const demoSource = [
  '$ agent run --transcript ./sessions/1842.log',
  'system: collecting command output, patches, markdown notes, and ANSI status lines into one terminal buffer.',
  'build: prepareTerminal(source, { whiteSpace: "pre-wrap", tabSize: 4 }) keeps source analysis reusable across column widths.',
  'layout: columns changed from 52 to 80; source metadata stays prepared while row ranges are recalculated for the host.',
  'page: getTerminalLayoutBundlePage(prepared, bundle, { startRow: 403, rowCount: 24 }) materializes only the visible rows.',
  'map: source offset 12894 projects to terminal row 403 column 17 for editor diagnostics and click-to-source workflows.',
  'range: generic sidecar data marks a diagnostic block without teaching the kernel what a diagnostic means.',
  'search: /error \\d+/i finds ERROR 214 in source text first; row and column projection happens only when requested.',
  'rich: SGR color spans and OSC8 link metadata live in the opt-in rich sidecar, away from plain terminal layout.',
  'boundary: host owns rendering, scroll state, keyboard focus, clipboard, link opening, persistence, and product behavior.',
  'note: this website panel is a browser host demo; the npm package remains terminal-first and does not ship renderer code.',
].join('\n')

function setHeaderState() {
  header?.classList.toggle('is-scrolled', window.scrollY > 12)
}

function getInputNumber(input, fallback) {
  return input instanceof HTMLInputElement ? Number.parseInt(input.value, 10) : fallback
}

function applyResponsiveDemoDefaults() {
  if (!(columnsRange instanceof HTMLInputElement)) return
  columnsRange.value = window.innerWidth <= 620 ? '40' : '64'
}

function wrapSource(source, columns) {
  const rows = []
  let absoluteOffset = 0

  for (const paragraph of source.split('\n')) {
    let localStart = 0

    if (paragraph.length === 0) {
      rows.push({ sourceStart: absoluteOffset, sourceEnd: absoluteOffset, text: '' })
      absoluteOffset += 1
      continue
    }

    while (localStart < paragraph.length) {
      const remaining = paragraph.length - localStart
      let take = Math.min(columns, remaining)

      if (remaining > columns) {
        const slice = paragraph.slice(localStart, localStart + columns + 1)
        const breakAt = slice.lastIndexOf(' ')
        if (breakAt > 8) take = breakAt
      }

      const raw = paragraph.slice(localStart, localStart + take)
      const trimmed = raw.replace(/\s+$/u, '')
      const sourceStart = absoluteOffset + localStart
      const sourceEnd = sourceStart + trimmed.length
      rows.push({
        sourceStart,
        sourceEnd,
        text: trimmed,
      })

      localStart += take
      while (paragraph[localStart] === ' ') localStart += 1
    }

    absoluteOffset += paragraph.length + 1
  }

  return rows.map((row, index) => ({ ...row, row: index }))
}

function countMatches(source, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) return 0

  const normalizedSource = source.toLowerCase()
  let count = 0
  let index = 0

  while (index < normalizedSource.length) {
    const found = normalizedSource.indexOf(normalizedQuery, index)
    if (found === -1) break
    count += 1
    index = found + normalizedQuery.length
  }

  return count
}

function appendHighlightedText(parent, text, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    parent.append(document.createTextNode(text))
    return
  }

  const normalizedText = text.toLowerCase()
  let cursor = 0

  while (cursor < text.length) {
    const found = normalizedText.indexOf(normalizedQuery, cursor)
    if (found === -1) {
      parent.append(document.createTextNode(text.slice(cursor)))
      break
    }

    if (found > cursor) parent.append(document.createTextNode(text.slice(cursor, found)))

    const mark = document.createElement('mark')
    mark.textContent = text.slice(found, found + normalizedQuery.length)
    parent.append(mark)
    cursor = found + normalizedQuery.length
  }
}

function updateInspector(row) {
  if (rowInspector === null) return

  rowInspector.textContent = [
    `row: ${row.row}`,
    `sourceStart: ${row.sourceStart}`,
    `sourceEnd: ${row.sourceEnd}`,
    `width: ${row.text.length} terminal cells in this demo host`,
    '',
    row.text,
  ].join('\n')
}

function renderPlayground() {
  if (!(columnsRange instanceof HTMLInputElement) || !(windowRange instanceof HTMLInputElement) || terminalPreview === null) return

  const columns = getInputNumber(columnsRange, 64)
  const rows = wrapSource(demoSource, columns)
  const maxStart = Math.max(0, rows.length - viewportRows)
  const query = searchInput instanceof HTMLInputElement ? searchInput.value : ''
  const normalizedQuery = query.trim().toLowerCase()
  let requestedStart = Math.min(getInputNumber(windowRange, 0), maxStart)

  if (!viewportDefaultApplied && normalizedQuery.length > 0) {
    const firstMatch = rows.find(row => row.text.toLowerCase().includes(normalizedQuery))
    if (firstMatch) requestedStart = Math.min(Math.max(0, firstMatch.row - Math.floor(viewportRows / 2)), maxStart)
    viewportDefaultApplied = true
  }

  const visibleRows = rows.slice(requestedStart, requestedStart + viewportRows)

  windowRange.max = String(maxStart)
  windowRange.value = String(requestedStart)
  selectedRow = Math.min(Math.max(selectedRow, requestedStart), requestedStart + visibleRows.length - 1)

  terminalPreview.textContent = ''

  for (const row of visibleRows) {
    const button = document.createElement('button')
    button.className = row.row === selectedRow ? 'terminal-row is-selected' : 'terminal-row'
    button.type = 'button'
    button.dataset.row = String(row.row)

    const gutter = document.createElement('span')
    gutter.className = 'row-gutter'
    gutter.textContent = String(row.row).padStart(3, '0')

    const text = document.createElement('span')
    text.className = 'row-text'
    appendHighlightedText(text, row.text.padEnd(Math.min(columns, 96), ' '), query)

    button.append(gutter, text)
    terminalPreview.append(button)
  }

  const inspected = rows[selectedRow] ?? visibleRows[0]
  if (inspected) updateInspector(inspected)

  if (columnsOutput !== null) columnsOutput.textContent = String(columns)
  if (windowOutput !== null) windowOutput.textContent = String(requestedStart)
  if (demoColumns !== null) demoColumns.textContent = `${columns} cols`
  if (sourceUnitsMetric !== null) sourceUnitsMetric.textContent = `${demoSource.length} code units`
  if (totalRowsMetric !== null) totalRowsMetric.textContent = String(rows.length)
  if (visibleRowsMetric !== null) visibleRowsMetric.textContent = `${visibleRows.length} rows`
  if (searchHitsMetric !== null) searchHitsMetric.textContent = String(countMatches(demoSource, query))
}

for (const button of copyButtons) {
  button.addEventListener('click', async () => {
    const value = button.getAttribute('data-copy') ?? ''
    try {
      await navigator.clipboard.writeText(value)
      button.textContent = 'Copied'
      window.setTimeout(() => {
        button.textContent = 'Copy'
      }, 1400)
    } catch {
      button.textContent = 'Select text'
      window.setTimeout(() => {
        button.textContent = 'Copy'
      }, 1400)
    }
  })
}

terminalPreview?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('[data-row]') : null
  if (!(target instanceof HTMLElement)) return
  selectedRow = Number.parseInt(target.dataset.row ?? '0', 10)
  renderPlayground()
})

window.addEventListener('scroll', setHeaderState, { passive: true })
columnsRange?.addEventListener('input', renderPlayground)
windowRange?.addEventListener('input', renderPlayground)
searchInput?.addEventListener('input', renderPlayground)
setHeaderState()
applyResponsiveDemoDefaults()
renderPlayground()
