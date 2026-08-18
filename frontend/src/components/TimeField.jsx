import { useId, useMemo } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const BASE_MINUTES = ['00', '30']

function toTimeValue(value) {
  const raw = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(raw) ? raw : ''
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

  const parsed = toTimeValue(value)
  const timeValue = parsed || (required ? '07:30' : '')
  const hour = timeValue ? timeValue.slice(0, 2) : ''
  const minute = timeValue ? timeValue.slice(3, 5) : ''

  const minuteChoices = useMemo(() => {
    if (!minute || BASE_MINUTES.includes(minute)) return BASE_MINUTES
    return [...BASE_MINUTES, minute].sort()
  }, [minute])

  function emit(nextHour, nextMinute) {
    if (!nextHour) {
      onChange?.('')
      return
    }
    onChange?.(`${nextHour}:${nextMinute || '00'}`)
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
        onChange={(event) => emit(event.target.value, minute || '00')}
      >
        {!required ? <option value="">—</option> : null}
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
        disabled={disabled || (!required && !hour)}
        required={required}
        aria-label={`${ariaLabel} · 分`}
        onChange={(event) => emit(hour, event.target.value)}
      >
        {!required && !hour ? <option value="">—</option> : null}
        {minuteChoices.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  )
}
