export const SKIP_DEDUCTION_NOTE = '没吃饭不扣减'
const LEGACY_SKIP_DEDUCTION_NOTES = new Set(['未休息不扣减'])

export function applySkipDeductionNote(note, skip) {
  const parts = String(note || '')
    .split('、')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== SKIP_DEDUCTION_NOTE && !LEGACY_SKIP_DEDUCTION_NOTES.has(p))
  if (skip) parts.push(SKIP_DEDUCTION_NOTE)
  return parts.join('、')
}
