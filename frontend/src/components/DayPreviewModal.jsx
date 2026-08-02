import { useEffect, useId, useRef, useState } from 'react'
import { formatDayPreviewText, sumPreviewHours } from '../utils/dayPreviewText.js'
import Metric from './Metric.jsx'

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect
        x="5.5"
        y="5.5"
        width="8"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3.5 10.5H3A1.5 1.5 0 0 1 1.5 9V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function DayPreviewModal({
  open,
  dateLabel,
  entries = [],
  onClose,
}) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [copyState, setCopyState] = useState('idle')
  const totalHours = sumPreviewHours(entries)
  const text = formatDayPreviewText(entries, { dateLabel })
  const bodyText = formatDayPreviewText(entries)

  useEffect(() => {
    if (!open) {
      setCopyState('idle')
      return undefined
    }
    closeRef.current?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  async function handleCopy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
        setCopyState('copied')
        window.setTimeout(() => setCopyState('idle'), 1600)
      } catch {
        setCopyState('failed')
        window.setTimeout(() => setCopyState('idle'), 2000)
      }
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal day-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId} className="modal__title">
              当日预览
            </h2>
            <p className="modal__subtitle">
              {dateLabel}
              <span className="modal__subtitle-sep">·</span>
              合计 <Metric value={totalHours} unit="h" chip />
            </p>
          </div>
          <div className="modal__header-actions">
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={handleCopy}
              disabled={!text}
              title="复制到剪贴板"
              aria-label="复制到剪贴板"
            >
              <CopyIcon />
              <span>{copyState === 'copied' ? '已复制' : copyState === 'failed' ? '失败' : '复制'}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onClose}
              aria-label="关闭预览"
            >
              ×
            </button>
          </div>
        </header>

        <div className="day-preview-modal__body">
          {bodyText ? (
            <pre className="day-preview-modal__text">{bodyText}</pre>
          ) : (
            <p className="day-preview-modal__empty">当日暂无安排</p>
          )}
        </div>

        {copyState === 'copied' ? (
          <p className="day-preview-modal__hint" role="status">
            已复制，可到微信粘贴
          </p>
        ) : null}
      </div>
    </div>
  )
}
