function formatShortDate(dateKey) {
  if (!dateKey) return '—'
  const [, m, d] = dateKey.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export default function PasteModeBar({ fromDate, count = 0, onCancel }) {
  return (
    <div className="paste-mode-bar" role="status" aria-live="polite">
      <div className="paste-mode-bar__text">
        <strong>粘贴模式</strong>
        <span>
          来源 {formatShortDate(fromDate)} · {count} 条 — 点击月历目标日完成复制
        </span>
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
        取消（Esc）
      </button>
    </div>
  )
}
