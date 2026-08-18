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

function dutyNameLabel(entry) {
  return entry?.employee_name?.trim() || '—'
}

function appendNoteTag(note, tag, enabled) {
  if (!enabled) return note
  if (note.includes(tag)) return note
  return note ? `${note}、${tag}` : tag
}

function formatOtNotePart(entry) {
  if (!entry?.ot_start_time || !entry?.ot_end_time) return ''
  const start = formatPreviewTime(entry.ot_start_time)
  const end = formatPreviewTime(entry.ot_end_time)
  return `加班 ${start}-${end}`
}

function previewDutyNote(entry) {
  let note = entry?.note?.trim() || ''
  note = appendNoteTag(note, '外援', !!entry?.is_external)
  note = appendNoteTag(note, '试工', !!entry?.is_trial)
  const ot = formatOtNotePart(entry)
  if (ot) {
    const range = `${formatPreviewTime(entry.ot_start_time)}-${formatPreviewTime(entry.ot_end_time)}`
    if (!note.includes(ot) && !note.includes(range)) {
      note = note ? `${note}、${ot}` : ot
    }
  }
  return note
}

function dutyEntryParts(entry) {
  const name = dutyNameLabel(entry)
  const range = `${formatPreviewTime(entry?.start_time)}-${formatPreviewTime(entry?.end_time)}`
  const hours = `${formatPreviewHours(entry?.effective_hours)}h`
  const note = previewDutyNote(entry)
  return { name, range, hours, note }
}

function formatDutyBlock(dutyEntries) {
  const rows = dutyEntries.map(dutyEntryParts)
  const rangeWidth = Math.max(...rows.map((r) => displayWidth(r.range)), 11)
  const nameWidth = Math.max(...rows.map((r) => displayWidth(r.name)), 4)
  const noteStrs = rows.map((r) => (r.note ? `（${r.note}）` : ''))
  const hasNotes = noteStrs.some(Boolean)
  const noteWidth = hasNotes ? Math.max(...noteStrs.map((s) => displayWidth(s)), 0) : 0
  const hoursWidth = Math.max(...rows.map((r) => displayWidth(r.hours)), 3)

  return rows
    .map(({ name, range, hours }, index) => {
      const parts = [
        padEndWidth(range, rangeWidth),
        padEndWidth(name, nameWidth),
      ]
      if (hasNotes) {
        parts.push(padEndWidth(noteStrs[index], noteWidth))
      }
      parts.push(padStartWidth(hours, hoursWidth))
      return parts.join('  ')
    })
    .join('\n')
}

/** Sum only on_duty entries (missing status treated as on_duty). */
export function sumPreviewHours(entries = []) {
  const list = Array.isArray(entries) ? entries : []
  const total = list
    .filter((entry) => (entry?.status || 'on_duty') === 'on_duty')
    .reduce((acc, entry) => acc + Number(entry?.effective_hours || 0), 0)
  return formatPreviewHours(total.toFixed(1))
}

export function formatDayPreviewHeader(dateLabel, dayNote = '') {
  const date = String(dateLabel || '').trim() || '当日'
  const note = String(dayNote || '').trim()
  return note ? `${date}  ${note}` : date
}

function formatSupportPerson(entry) {
  const name = entry?.employee_name?.trim() || '—'
  const range =
    entry?.start_time && entry?.end_time
      ? `${formatPreviewTime(entry.start_time)}-${formatPreviewTime(entry.end_time)}`
      : ''
  const note = entry?.note?.trim() || ''
  const inner = [range, note].filter(Boolean).join('、')
  return inner ? `${name}（${inner}）` : name
}

function formatRestLeavePerson(entry) {
  const name = entry?.employee_name?.trim() || '—'
  const ot = formatOtNotePart(entry)
  return ot ? `${name}（${ot}）` : name
}

/**
 * 2026年8月2日  来货
 * 7:30-16:00  张三  （开门）                     8h
 * 8:30-16:00  李四  （制机位、外援）               7.5h
 * 8:00-16:00  苑菱  （早值、加班 22:00-23:30）     9h
 * 8:00-13:00  林航  （水果位、试工）               5h
 *
 * 休息：王五、继鹏（加班 22:00-23:30）
 * 请假：钱七
 * 支援：洁怡（12:00-21:00、上社）、孙八（9:00-17:00）
 * 总：32.5h
 */
export function formatDayPreviewText(entries = [], { dateLabel = '', dayNote = '' } = {}) {
  const list = Array.isArray(entries) ? entries : []
  if (!list.length) return ''

  const duty = list.filter((e) => (e.status || 'on_duty') === 'on_duty')
  const rest = list.filter((e) => e.status === 'rest')
  const leave = list.filter((e) => e.status === 'leave')
  const support = list.filter((e) => e.status === 'support')

  const sections = []
  if (dateLabel || String(dayNote || '').trim()) {
    sections.push(formatDayPreviewHeader(dateLabel, dayNote))
  }
  if (duty.length) {
    sections.push(formatDutyBlock(duty))
  }
  if (rest.length) {
    sections.push(`\n休息：${rest.map(formatRestLeavePerson).join('、')}`)
  }
  if (leave.length) {
    sections.push(`请假：${leave.map(formatRestLeavePerson).join('、')}`)
  }
  if (support.length) {
    sections.push(`支援：${support.map(formatSupportPerson).join('、')}`)
  }
  sections.push(`总：${sumPreviewHours(duty)}h`)
  return sections.join('\n')
}
