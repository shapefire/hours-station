import { useId, useMemo } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const BASE_MINUTES = ['00', '30']

function toTimeValue(value) {
  const raw = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(raw) ? raw : ''
}

function parseTime(value) {
  const raw = toTimeValue(value) || '07:30'
  return { hour: raw.slice(0, 2), minute: raw.slice(3, 5) }
}

/**
 * Native hour + minute selects.
 * Custom overlays are unreliable on real iOS/Android touch (DevTools emulation often still uses mouse/click).
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
  const hourId = idProp || `${autoId}-hour`
  const minuteId = `${autoId}-minute`

  const timeValue = toTimeValue(value) || '07:30'
  const { hour, minute } = parseTime(timeValue)

  const minuteChoices = useMemo(() => {
    if (BASE_MINUTES.includes(minute)) return BASE_MINUTES
    return [...BASE_MINUTES, minute].sort()
  }, [minute])

  function emit(nextHour, nextMinute) {
    onChange?.(`${nextHour}:${nextMinute}`)
  }

  return (
    <div className="time-field" role="group" aria-label={ariaLabel}>
      {name ? <input type="hidden" name={name} value={timeValue} /> : null}
      <select
        id={hourId}
        className="time-field__select time-field__select--hour"
        value={hour}
        disabled={disabled}
        required={required}
        aria-label={`${ariaLabel} · 时`}
        onChange={(event) => emit(event.target.value, minute)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="time-field__sep" aria-hidden="true">
        :
      </span>
      <select
        id={minuteId}
        className="time-field__select time-field__select--minute"
        value={minute}
        disabled={disabled}
        required={required}
        aria-label={`${ariaLabel} · 分`}
        onChange={(event) => emit(hour, event.target.value)}
      >
        {minuteChoices.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}
