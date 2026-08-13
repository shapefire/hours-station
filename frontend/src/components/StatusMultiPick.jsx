import { useEffect, useId, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'

export default function StatusMultiPick({
  open,
  title,
  initialSelected = [],
  occupiedMap = {},
  allowStatusLabel,
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

  useEffect(() => {
    if (!open) return undefined
    setSelected(new Set(initialSelected))
    setError(null)
    setLoading(true)
    closeRef.current?.focus()

    let cancelled = false
    api
      .get('/api/employees')
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
  }, [open, initialKey, onClose])

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

          <ul className="status-multi-pick__list">
            {roster.map((emp) => {
              const name = emp.name
              const occupied = isOccupied(name)
              const occupiedLabel = occupiedMap[name]
              const checked = selected.has(name)
              return (
                <li key={emp.id || name}>
                  <label
                    className={
                      occupied
                        ? 'status-multi-pick__option is-disabled'
                        : 'status-multi-pick__option'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={occupied}
                      onChange={() => toggleName(name)}
                    />
                    <span className="status-multi-pick__name">{name}</span>
                    {occupied && occupiedLabel ? (
                      <span className="status-multi-pick__hint">已{occupiedLabel}</span>
                    ) : null}
                  </label>
                </li>
              )
            })}
          </ul>
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
