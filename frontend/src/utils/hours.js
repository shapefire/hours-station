/**
 * Mirror backend hours rule for live preview in forms.
 * raw >= 6 → deduct 0.5; else no deduct; 1 decimal.
 */
export function computeHoursBreakdown(startTime, endTime) {
  const start = parseHm(startTime)
  const end = parseHm(endTime)
  if (!start || !end) {
    return { ok: false, reason: '时段无效', raw: null, deduct: null, effective: null }
  }
  const rawMinutes = end.totalMinutes - start.totalMinutes
  if (rawMinutes <= 0) {
    return { ok: false, reason: '结束须晚于开始', raw: null, deduct: null, effective: null }
  }

  const raw = round1(rawMinutes / 60)
  const deduct = raw >= 6 ? 0.5 : 0
  const effective = round1(raw - deduct)
  return { ok: true, reason: null, raw, deduct, effective }
}

function parseHm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').slice(0, 5))
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes, totalMinutes: hours * 60 + minutes }
}

function round1(n) {
  return Math.round(n * 10) / 10
}

export function formatHoursNumber(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
