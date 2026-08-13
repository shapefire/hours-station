import { useEffect, useState } from 'react'
import EmployeeNameField from './EmployeeNameField.jsx'
import TimeField from './TimeField.jsx'
import HoursBreakdown from './HoursBreakdown.jsx'
import NoteField from './NoteField.jsx'

const EMPTY = {
  name: '',
  start_time: '07:30',
  end_time: '16:00',
  note: '',
}

function toTimeInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function entryToForm(entry) {
  if (!entry) return { ...EMPTY }
  return {
    name: entry.employee_name || '',
    start_time: toTimeInputValue(entry.start_time) || '07:30',
    end_time: toTimeInputValue(entry.end_time) || '16:00',
    note: entry.note || '',
  }
}

export default function SupportForm({
  mode = 'create',
  initialEntry = null,
  onSubmit,
  onCancel,
  busy = false,
  error = null,
  monthYear = null,
  month = null,
  occupiedMap = {},
}) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(() => entryToForm(initialEntry))

  useEffect(() => {
    setForm(entryToForm(initialEntry))
  }, [initialEntry])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = form.name.trim()
    if (!isEdit && !trimmed) return
    if (!isEdit && occupiedMap[trimmed]) return
    onSubmit?.({
      name: trimmed,
      start_time: form.start_time,
      end_time: form.end_time,
      note: form.note.trim() ? form.note.trim() : null,
      status: 'support',
    })
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="entry-form__row">
        <label className="entry-form__field">
          <span>姓名</span>
          {isEdit ? (
            <input type="text" value={form.name} disabled readOnly />
          ) : (
            <EmployeeNameField
              value={form.name}
              onChange={(name) => updateField('name', name)}
              disabled={busy}
              required
              autoFocus
              placeholder="选择花名册或输入新姓名"
              monthYear={monthYear}
              month={month}
              occupiedMap={occupiedMap}
            />
          )}
        </label>
      </div>

      <div className="entry-form__row entry-form__row--times">
        <div className="entry-form__field">
          <span>开始</span>
          <TimeField
            value={form.start_time}
            onChange={(v) => updateField('start_time', v)}
            required
            disabled={busy}
            aria-label="开始时间"
          />
        </div>
        <div className="entry-form__field">
          <span>结束</span>
          <TimeField
            value={form.end_time}
            onChange={(v) => updateField('end_time', v)}
            required
            disabled={busy}
            aria-label="结束时间"
          />
        </div>
      </div>

      <HoursBreakdown startTime={form.start_time} endTime={form.end_time} />

      <label className="entry-form__field">
        <span>备注</span>
        <NoteField
          value={form.note}
          onChange={(note) => updateField('note', note)}
          disabled={busy}
          maxLength={500}
          placeholder="可选，目标店铺等"
        />
      </label>

      <p className="day-panel__support-note">不计入本店工时</p>

      {error ? <p className="entry-form__error">{error}</p> : null}

      <div className="entry-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? '保存中…' : isEdit ? '保存修改' : '新增支援'}
        </button>
      </div>
    </form>
  )
}
