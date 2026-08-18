const STATUS_BADGE_CLASS = {
  到岗: 'badge--on-duty',
  休息: 'badge--rest-status',
  请假: 'badge--leave',
  支援: 'badge--roster-support',
}

export default function RosterStatusBadge({ label }) {
  if (!label) return null
  const modifier = STATUS_BADGE_CLASS[label] || 'badge--on-duty'
  return <span className={`badge roster-status-badge ${modifier}`}>{label}</span>
}
