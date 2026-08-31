export function defaultReviewYearMonth(today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const d = today.getDate()
  if (d === 1) {
    if (m === 1) return { year: y - 1, month: 12 }
    return { year: y, month: m - 1 }
  }
  return { year: y, month: m }
}

function shiftMonth(year, month, delta) {
  let y = year
  let m = month + delta
  while (m < 1) {
    m += 12
    y -= 1
  }
  while (m > 12) {
    m -= 12
    y += 1
  }
  return { year: y, month: m }
}

/** Default month first, then current and the two preceding months (deduped). */
export function allowedReviewMonths(today = new Date()) {
  const current = { year: today.getFullYear(), month: today.getMonth() + 1 }
  const def = defaultReviewYearMonth(today)
  const candidates = [
    def,
    current,
    shiftMonth(current.year, current.month, -1),
    shiftMonth(current.year, current.month, -2),
  ]
  const key = (x) => `${x.year}-${x.month}`
  const map = new Map()
  for (const item of candidates) {
    map.set(key(item), item)
  }
  return [...map.values()]
}
