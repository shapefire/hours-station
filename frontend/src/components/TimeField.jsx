import { useEffect, useId, useRef, useState } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '30']

function toTimeValue(value) {
  const raw = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(raw) ? raw : ''
}

function parseTime(value) {
  const raw = toTimeValue(value) || '07:30'
  return { hour: raw.slice(0, 2), minute: raw.slice(3, 5) }
}

function minuteOptions(minute) {
  if (MINUTES.includes(minute)) return MINUTES
  return [...MINUTES, minute].sort()
}

/**
 * Keeps a compact HH:MM field look; opens a custom 时/分 popup.
 * Native browser pickers cannot expose a quick :30 option inside the dialog.
 */
export default function TimeField({
  value,
  onChange,
  disabled = false,
  required = false,
  id: idProp,
  name,
  'aria-label': ariaLabel = '时间',
}) {
  const autoId = useId()
  const inputId = idProp || `${autoId}-time`
  const popupId = `${autoId}-popup`
  const rootRef = useRef(null)
  const hourListRef = useRef(null)
  const minuteListRef = useRef(null)
  const [open, setOpen] = useState(false)

  const timeValue = toTimeValue(value) || '07:30'
  const { hour, minute } = parseTime(timeValue)
  const minutes = minuteOptions(minute)

  useEffect(() => {
    if (!open) return undefined
    function onDocPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const hourEl = hourListRef.current?.querySelector('[aria-selected="true"]')
    const minuteEl = minuteListRef.current?.querySelector('[aria-selected="true"]')
    hourEl?.scrollIntoView({ block: 'center' })
    minuteEl?.scrollIntoView({ block: 'center' })
  }, [open, hour, minute])

  function pick(nextHour, nextMinute) {
    onChange?.(`${nextHour}:${nextMinute}`)
  }

  function openPopup() {
    if (disabled) return
    setOpen(true)
  }

  return (
    <div className="time-field" ref={rootRef}>
      <input
        id={inputId}
        type="text"
        name={name}
        className="time-field__input"
        value={timeValue}
        readOnly
        required={required}
        disabled={disabled}
        inputMode="none"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={openPopup}
        onFocus={openPopup}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPopup()
          }
        }}
      />

      {open && !disabled ? (
        <div id={popupId} className="time-field__popup" role="dialog" aria-label={`${ariaLabel}选择`}>
          <div className="time-field__columns">
            <div className="time-field__col">
              <div className="time-field__col-label">时</div>
              <ul ref={hourListRef} className="time-field__list" role="listbox" aria-label="时">
                {HOURS.map((h) => (
                  <li key={h} role="option" aria-selected={h === hour}>
                    <button
                      type="button"
                      className={
                        h === hour
                          ? 'time-field__option time-field__option--active'
                          : 'time-field__option'
                      }
                      onClick={() => pick(h, minute)}
                    >
                      {h}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="time-field__col">
              <div className="time-field__col-label">分</div>
              <ul ref={minuteListRef} className="time-field__list" role="listbox" aria-label="分">
                {minutes.map((m) => (
                  <li key={m} role="option" aria-selected={m === minute}>
                    <button
                      type="button"
                      className={
                        m === minute
                          ? 'time-field__option time-field__option--active'
                          : 'time-field__option'
                      }
                      onClick={() => {
                        pick(hour, m)
                        setOpen(false)
                      }}
                    >
                      {m}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="time-field__popup-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
              完成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
