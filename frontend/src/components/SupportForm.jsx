import { useEffect, useState } from 'react'
import EmployeeNameField from './EmployeeNameField.jsx'
import TimeField from './TimeField.jsx'
import HoursBreakdown from './HoursBreakdown.jsx'
import NoteField from './NoteField.jsx'

const EMPTY = {
  name: '',
  start_time: '07:30',
  end_time: '16:00',
  ot_start_time: '',
  ot_end_time: '',
  note: '',
}

function toTimeInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function normalizeOtTimes(start, end) {
  const ot_start_time = toTimeInputValue(start) || null
  const ot_end_time = toTimeInputValue(end) || null
  return { ot_start_time, ot_end_time }
}

function isOtPairIncomplete(start, end) {
  return Boolean(toTimeInputValue(start)) !== Boolean(toTimeInputValue(end))
}

function entryToForm(entry) {
  if (!entry) return { ...EMPTY }
  return {
    name: entry.employee_name || '',
    start_time: toTimeInputValue(entry.start_time) || '07:30',
    end_time: toTimeInputValue(entry.end_time) || '16:00',
    ot_start_time: toTimeInputValue(entry.ot_start_time),
    ot_end_time: toTimeInputValue(entry.ot_end_time),
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

  const otIncomplete = isOtPairIncomplete(form.ot_start_time, form.ot_end_time)
  const otReady = Boolean(form.ot_start_time) && Boolean(form.ot_end_time)

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = form.name.trim()
    if (!isEdit && !trimmed) return
    if (!isEdit && occupiedMap[trimmed]) return
    if (otIncomplete) return
    onSubmit?.({
      name: trimmed,
      start_time: form.start_time,
      end_time: form.end_time,
      ...normalizeOtTimes(form.ot_start_time, form.ot_end_time),
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

      <div className="entry-form__row entry-form__row--times">
        <div className="entry-form__field">
          <span>加班开始</span>
          <TimeField
            value={form.ot_start_time}
            onChange={(v) => updateField('ot_start_time', v)}
            disabled={busy}
            aria-label="加班开始时间"
          />
        </div>
        <div className="entry-form__field">
          <span>加班结束</span>
          <TimeField
            value={form.ot_end_time}
            onChange={(v) => updateField('ot_end_time', v)}
            disabled={busy}
            aria-label="加班结束时间"
          />
        </div>
      </div>

      {otReady ? (
        <div className="entry-form__ot-hours">
          <span className="entry-form__ot-hours-label">加班</span>
          <HoursBreakdown startTime={form.ot_start_time} endTime={form.ot_end_time} />
        </div>
      ) : null}

      {otIncomplete ? (
        <p className="entry-form__error">加班开始与结束须同时填写</p>
      ) : null}

      <label className="entry-form__field">
        <span>备注</span>
        <NoteField
          value={form.note}
          onChange={(note) => updateField('note', note)}
          disabled={busy}
          maxLength={500}
          placeholder="可选，可多选预设或输入"
        />
      </label>

      <p className="day-panel__support-note">不计入本店工时</p>

      {error ? <p className="entry-form__error">{error}</p> : null}

      <div className="entry-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy || otIncomplete}>
          {busy ? '保存中…' : isEdit ? '保存修改' : '新增支援'}
        </button>
      </div>
    </form>
  )
}
