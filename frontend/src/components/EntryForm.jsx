import { useEffect, useId, useState } from 'react'
import api from '../api/client.js'

const EMPTY = {
  name: '',
  start_time: '07:30',
  end_time: '16:00',
  note: '',
}

function entryToForm(entry) {
  if (!entry) return { ...EMPTY }
  return {
    name: entry.employee_name || '',
    start_time: entry.start_time || '07:30',
    end_time: entry.end_time || '16:00',
    note: entry.note || '',
  }
}

export default function EntryForm({
  mode = 'create',
  initialEntry = null,
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}) {
  const formId = useId()
  const listId = `${formId}-employees`
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(() => entryToForm(initialEntry))
  const [hints, setHints] = useState([])

  useEffect(() => {
    setForm(entryToForm(initialEntry))
  }, [initialEntry])

  useEffect(() => {
    if (isEdit) return undefined
    const q = form.name.trim()
    if (!q) {
      setHints([])
      return undefined
    }

    const timer = setTimeout(() => {
      api
        .get(`/api/employees?q=${encodeURIComponent(q)}`)
        .then((rows) => setHints(Array.isArray(rows) ? rows : []))
        .catch(() => setHints([]))
    }, 200)

    return () => clearTimeout(timer)
  }, [form.name, isEdit])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const payload = {
      name: form.name.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      note: form.note.trim() ? form.note.trim() : null,
    }
    onSubmit?.(payload)
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="entry-form__row">
        <label className="entry-form__field">
          <span>姓名</span>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            list={isEdit ? undefined : listId}
            required
            maxLength={64}
            disabled={busy || isEdit}
            autoComplete="off"
            placeholder="输入或选择员工"
          />
          {!isEdit ? (
            <datalist id={listId}>
              {hints.map((emp) => (
                <option key={emp.id} value={emp.name} />
              ))}
            </datalist>
          ) : null}
        </label>
      </div>

      <div className="entry-form__row entry-form__row--times">
        <label className="entry-form__field">
          <span>开始</span>
          <input
            type="time"
            name="start_time"
            value={form.start_time}
            onChange={(e) => updateField('start_time', e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="entry-form__field">
          <span>结束</span>
          <input
            type="time"
            name="end_time"
            value={form.end_time}
            onChange={(e) => updateField('end_time', e.target.value)}
            required
            disabled={busy}
          />
        </label>
      </div>

      <label className="entry-form__field">
        <span>备注</span>
        <input
          type="text"
          name="note"
          value={form.note}
          onChange={(e) => updateField('note', e.target.value)}
          disabled={busy}
          placeholder="可选"
        />
      </label>

      {error ? <p className="entry-form__error">{error}</p> : null}

      <div className="entry-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? '保存中…' : isEdit ? '保存修改' : '新增登记'}
        </button>
      </div>
    </form>
  )
}
