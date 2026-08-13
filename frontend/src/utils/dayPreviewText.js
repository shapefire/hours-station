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
  let n = entry?.employee_name?.trim() || '—'
  const tags = []
  if (entry?.is_external) tags.push('外援')
  if (entry?.is_trial) tags.push('试工')
  if (tags.length) n = `${n}[${tags.join(',')}]`
  return `${n}：`
}

function dutyEntryParts(entry) {
  const name = dutyNameLabel(entry)
  const range = `${formatPreviewTime(entry?.start_time)}-${formatPreviewTime(entry?.end_time)}`
  const hours = `${formatPreviewHours(entry?.effective_hours)}h`
  const note = entry?.note?.trim()
  return { name, range, hours, note }
}

function formatDutyBlock(dutyEntries) {
  const rows = dutyEntries.map(dutyEntryParts)
  const nameWidth = Math.max(...rows.map((r) => displayWidth(r.name)), 6)
  const rangeWidth = Math.max(...rows.map((r) => displayWidth(r.range)), 11)
  const hoursWidth = Math.max(...rows.map((r) => displayWidth(r.hours)), 3)

  return rows
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
}

/** Sum only on_duty effective hours (missing status treated as on_duty). */
export function sumPreviewHours(entries = []) {
  const list = Array.isArray(entries) ? entries : []
  const total = list.reduce((acc, entry) => {
    if ((entry?.status || 'on_duty') !== 'on_duty') return acc
    return acc + Number(entry?.effective_hours || 0)
  }, 0)
  return formatPreviewHours(total.toFixed(1))
}

export function formatDayPreviewHeader(dateLabel, entries = []) {
  const date = String(dateLabel || '').trim() || '当日'
  return `${date}  合计 ${sumPreviewHours(entries)}h`
}

/**
 * 2026年8月2日  合计 32.5h
 * 张三[外援]：  7:30-16:00   8h  (开门)
 * 休息：李四、王五
 * 请假：赵六
 * 支援：
 * 钱七：  9:00-12:00  (支援·不计入本店)
 */
export function formatDayPreviewText(entries = [], { dateLabel = '' } = {}) {
  const list = Array.isArray(entries) ? entries : []
  if (!list.length) return ''

  const duty = list.filter((e) => (e.status || 'on_duty') === 'on_duty')
  const rest = list.filter((e) => e.status === 'rest')
  const leave = list.filter((e) => e.status === 'leave')
  const support = list.filter((e) => e.status === 'support')

  const sections = []
  if (duty.length) {
    sections.push(formatDutyBlock(duty))
  }
  if (rest.length) {
    sections.push(`休息：${rest.map((e) => e.employee_name).join('、')}`)
  }
  if (leave.length) {
    sections.push(`请假：${leave.map((e) => e.employee_name).join('、')}`)
  }
  if (support.length) {
    const lines = support.map((e) => {
      const range = `${formatPreviewTime(e.start_time)}-${formatPreviewTime(e.end_time)}`
      return `${e.employee_name}：  ${range}  (支援·不计入本店)`
    })
    sections.push(`支援：\n${lines.join('\n')}`)
  }

  const body = sections.join('\n')
  if (!dateLabel) return body
  return `${formatDayPreviewHeader(dateLabel, duty)}\n${body}`
}
