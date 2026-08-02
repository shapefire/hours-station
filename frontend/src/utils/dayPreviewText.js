/** Approximate display width: CJK = 2, ASCII = 1. */
export function displayWidth(str) {
  let width = 0
  for (const ch of String(str)) {
    const code = ch.codePointAt(0)
    width += code > 0xff ? 2 : 1
  }
  return width
}

export function padEndWidth(str, width) {
  const pad = Math.max(0, width - displayWidth(str))
  return `${str}${' '.repeat(pad)}`
}

export function padStartWidth(str, width) {
  const pad = Math.max(0, width - displayWidth(str))
  return `${' '.repeat(pad)}${str}`
}

/** Format "07:30" → "7:30". */
export function formatPreviewTime(value) {
  const raw = String(value || '').slice(0, 5)
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return raw
  return `${Number(match[1])}:${match[2]}`
}

/** "8.0" → "8", "7.5" → "7.5" */
export function formatPreviewHours(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  return Number.isInteger(n) ? String(n) : String(n)
}

function entryParts(entry) {
  const name = `${entry?.employee_name?.trim() || '—'}：`
  const range = `${formatPreviewTime(entry?.start_time)}-${formatPreviewTime(entry?.end_time)}`
  const hours = `${formatPreviewHours(entry?.effective_hours)}h`
  const note = entry?.note?.trim()
  return { name, range, hours, note }
}

export function sumPreviewHours(entries = []) {
  const total = entries.reduce((acc, entry) => acc + Number(entry?.effective_hours || 0), 0)
  return formatPreviewHours(total.toFixed(1))
}

export function formatDayPreviewHeader(dateLabel, entries = []) {
  const date = String(dateLabel || '').trim() || '当日'
  return `${date}  合计 ${sumPreviewHours(entries)}h`
}

/**
 * 2026年8月2日  合计 32.5h
 * 张三：  7:30-16:00   8h  (开门)
 * 李四：  8:30-16:00  7.5h  (制机位)
 */
export function formatDayPreviewText(entries = [], { dateLabel = '' } = {}) {
  if (!entries.length) return ''

  const rows = entries.map(entryParts)
  const nameWidth = Math.max(...rows.map((r) => displayWidth(r.name)), 6)
  const rangeWidth = Math.max(...rows.map((r) => displayWidth(r.range)), 11)
  const hoursWidth = Math.max(...rows.map((r) => displayWidth(r.hours)), 3)

  const body = rows
    .map(({ name, range, hours, note }) => {
      const base = [
        padEndWidth(name, nameWidth),
        padEndWidth(range, rangeWidth),
        padStartWidth(hours, hoursWidth),
      ].join('  ')
      if (!note) return base
      // Long notes go on the next line to avoid horizontal scrolling.
      if (displayWidth(note) > 12 || displayWidth(`${base}  (${note})`) > 42) {
        return `${base}\n  (${note})`
      }
      return `${base}  (${note})`
    })
    .join('\n')

  if (!dateLabel) return body
  return `${formatDayPreviewHeader(dateLabel, entries)}\n${body}`
}
