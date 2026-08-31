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

export function allowedReviewMonths(today = new Date()) {
  const current = { year: today.getFullYear(), month: today.getMonth() + 1 }
  const def = defaultReviewYearMonth(today)
  const key = (x) => `${x.year}-${x.month}`
  const map = new Map([[key(def), def], [key(current), current]])
  return [...map.values()]
}
