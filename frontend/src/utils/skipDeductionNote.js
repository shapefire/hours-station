export const SKIP_DEDUCTION_NOTE = '未休息不扣减'

export function applySkipDeductionNote(note, skip) {
  const parts = String(note || '')
    .split('、')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== SKIP_DEDUCTION_NOTE)
  if (skip) parts.push(SKIP_DEDUCTION_NOTE)
  return parts.join('、')
}
