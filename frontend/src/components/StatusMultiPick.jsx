import { useEffect, useId, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import Metric from './Metric.jsx'
import RosterStatusBadge from './RosterStatusBadge.jsx'

export default function StatusMultiPick({
  open,
  title,
  initialSelected = [],
  occupiedMap = {},
  allowStatusLabel,
  monthYear = null,
  month = null,
  onConfirm,
  onClose,
}) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [roster, setRoster] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const initialKey = useMemo(
    () => [...initialSelected].sort().join('\0'),
    [initialSelected],
  )
  const showMonthStats = monthYear != null && month != null

  useEffect(() => {
    if (!open) return undefined
    setSelected(new Set(initialSelected))
    setError(null)
    setLoading(true)
    closeRef.current?.focus()

    const params = new URLSearchParams()
    if (showMonthStats) {
      params.set('year', String(monthYear))
      params.set('month', String(month))
    }
    const qs = params.toString()

    let cancelled = false
    api
      .get(`/api/employees${qs ? `?${qs}` : ''}`)
      .then((rows) => {
        if (cancelled) return
        setRoster(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (cancelled) return
        setRoster([])
        setError('花名册加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelled = true
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open/initialKey
  }, [open, initialKey, onClose, monthYear, month, showMonthStats])

  if (!open) return null

  function isOccupied(name) {
    const label = occupiedMap[name]
    if (!label) return false
    if (allowStatusLabel && label === allowStatusLabel) return false
    return true
  }

  function toggleName(name) {
    if (isOccupied(name)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleConfirm() {
    onConfirm?.([...selected])
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal status-multi-pick"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <div className="modal__header-actions">
            <button
              ref={closeRef}
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        </header>

        <div className="status-multi-pick__body">
          {loading ? <p className="status-multi-pick__status">加载中…</p> : null}
          {error ? <p className="status-multi-pick__error">{error}</p> : null}
          {!loading && !error && roster.length === 0 ? (
            <p className="status-multi-pick__status">花名册为空</p>
          ) : null}

          {!loading && !error && roster.length > 0 ? (
            <ul className="status-multi-pick__list">
              {showMonthStats ? (
                <li className="status-multi-pick__colhead" role="presentation">
                  <span className="status-multi-pick__colhead-check" aria-hidden="true" />
                  <span>姓名</span>
                  <span>已休息</span>
                </li>
              ) : null}
              {roster.map((emp) => {
                const name = emp.name
                const occupied = isOccupied(name)
                const occupiedLabel = occupiedMap[name]
                const checked = selected.has(name)
                return (
                  <li key={emp.id || name}>
                    <label
                      className={[
                        'status-multi-pick__option',
                        showMonthStats ? 'status-multi-pick__option--stats' : '',
                        occupied ? 'is-disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={occupied}
                        onChange={() => toggleName(name)}
                      />
                      <span className="status-multi-pick__name">
                        <span className="status-multi-pick__name-text">{name}</span>
                        {occupied && occupiedLabel ? (
                          <RosterStatusBadge label={occupiedLabel} />
                        ) : null}
                      </span>
                      {showMonthStats ? (
                        <span className="status-multi-pick__rest-days">
                          <Metric
                            value={emp.month_rest_days != null ? emp.month_rest_days : 0}
                            unit="天"
                            chip
                          />
                        </span>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>

        <footer className="status-multi-pick__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={loading}>
            确认（{selected.size}）
          </button>
        </footer>
      </div>
    </div>
  )
}
