import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
 * Mobile-safe tap binder for iOS Safari + Android Chrome/WebView.
 * - Touch/pen: fire on pointerup (click is often delayed or dropped)
 * - Mouse/keyboard: fire on click
 * - Debounce avoids pointerup+click double invocation
 * Never preventDefault on pointerdown (kills click on mobile browsers).
 */
function useMobileTap(handler) {
  const handlerRef = useRef(handler)
  const lastAtRef = useRef(0)
  const armedPtrRef = useRef(null)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  const fire = useCallback((event) => {
    const now = Date.now()
    if (now - lastAtRef.current < 450) return
    lastAtRef.current = now
    event?.stopPropagation?.()
    handlerRef.current?.(event)
  }, [])

  return {
    onPointerDown: (event) => {
      if (!event.isPrimary) return
      armedPtrRef.current = event.pointerId
    },
    onPointerUp: (event) => {
      if (!event.isPrimary) return
      if (armedPtrRef.current !== event.pointerId) return
      armedPtrRef.current = null
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        fire(event)
      }
    },
    onPointerCancel: () => {
      armedPtrRef.current = null
    },
    onClick: (event) => {
      fire(event)
    },
  }
}

/**
 * Compact HH:MM field. Picker uses a body portal sheet so overflow parents
 * cannot clip taps; works on phone/tablet (iOS + Android).
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
  const hourListRef = useRef(null)
  const minuteListRef = useRef(null)
  const bodyLockRef = useRef(null)
  const suppressOpenUntilRef = useRef(0)
  const [open, setOpen] = useState(false)

  const timeValue = toTimeValue(value) || '07:30'
  const { hour, minute } = parseTime(timeValue)
  const minutes = minuteOptions(minute)

  const closePopup = useCallback(() => {
    // Block ghost clicks / delayed clicks from reopening on mobile.
    suppressOpenUntilRef.current = Date.now() + 600
    setOpen(false)
    window.setTimeout(() => {
      const input = document.getElementById(inputId)
      if (input instanceof HTMLElement) input.blur()
    }, 0)
  }, [inputId])

  const openPopup = useCallback(() => {
    if (disabled) return
    if (Date.now() < suppressOpenUntilRef.current) return
    setOpen(true)
  }, [disabled])

  const pickHour = useCallback(
    (h) => {
      onChange?.(`${h}:${minute}`)
    },
    [minute, onChange],
  )

  const pickMinute = useCallback(
    (m) => {
      onChange?.(`${hour}:${m}`)
    },
    [hour, onChange],
  )

  const doneTap = useMobileTap(closePopup)
  const backdropTap = useMobileTap(closePopup)
  const openTap = useMobileTap(openPopup)

  useEffect(() => {
    if (!open) return undefined

    const scrollY = window.scrollY || window.pageYOffset
    bodyLockRef.current = scrollY
    const { body, documentElement } = document
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: documentElement.style.overflow,
    }
    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'

    function onKeyDown(event) {
      if (event.key === 'Escape') closePopup()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.width = prev.bodyWidth
      documentElement.style.overflow = prev.htmlOverflow
      window.scrollTo(0, bodyLockRef.current ?? 0)
    }
  }, [open, closePopup])

  useEffect(() => {
    if (!open) return
    const hourEl = hourListRef.current?.querySelector('[aria-selected="true"]')
    const minuteEl = minuteListRef.current?.querySelector('[aria-selected="true"]')
    hourEl?.scrollIntoView({ block: 'center' })
    minuteEl?.scrollIntoView({ block: 'center' })
  }, [open, hour, minute])

  const sheet =
    open && !disabled && typeof document !== 'undefined'
      ? createPortal(
          <div className="time-field-layer" role="presentation">
            <button
              type="button"
              className="time-field-layer__backdrop"
              aria-label="关闭时间选择"
              {...backdropTap}
            />
            <div
              id={popupId}
              className="time-field-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`${ariaLabel}选择`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="time-field-sheet__head">
                <strong>{ariaLabel}</strong>
                <span className="time-field-sheet__value">{timeValue}</span>
              </div>
              <div className="time-field-sheet__columns">
                <div className="time-field-sheet__col">
                  <div className="time-field-sheet__col-label">时</div>
                  <ul
                    ref={hourListRef}
                    className="time-field-sheet__list"
                    role="listbox"
                    aria-label="时"
                  >
                    {HOURS.map((h) => (
                      <HourOption
                        key={h}
                        hour={h}
                        selected={h === hour}
                        onPick={pickHour}
                      />
                    ))}
                  </ul>
                </div>
                <div className="time-field-sheet__col">
                  <div className="time-field-sheet__col-label">分</div>
                  <ul
                    ref={minuteListRef}
                    className="time-field-sheet__list"
                    role="listbox"
                    aria-label="分"
                  >
                    {minutes.map((m) => (
                      <MinuteOption
                        key={m}
                        minute={m}
                        selected={m === minute}
                        onPick={pickMinute}
                      />
                    ))}
                  </ul>
                </div>
              </div>
              <div className="time-field-sheet__actions">
                <button
                  type="button"
                  className="btn btn--primary time-field-sheet__done"
                  {...doneTap}
                >
                  完成
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="time-field">
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
        enterKeyHint="done"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        {...(disabled ? {} : openTap)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPopup()
          }
        }}
      />
      {sheet}
    </div>
  )
}

function HourOption({ hour, selected, onPick }) {
  const tap = useMobileTap(() => onPick(hour))
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        className={
          selected
            ? 'time-field-sheet__option time-field-sheet__option--active'
            : 'time-field-sheet__option'
        }
        {...tap}
      >
        {hour}
      </button>
    </li>
  )
}

function MinuteOption({ minute, selected, onPick }) {
  const tap = useMobileTap(() => onPick(minute))
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        className={
          selected
            ? 'time-field-sheet__option time-field-sheet__option--active'
            : 'time-field-sheet__option'
        }
        {...tap}
      >
        {minute}
      </button>
    </li>
  )
}
