import { useEffect, useId, useState } from 'react'
import api from '../api/client.js'
import EntryForm from './EntryForm.jsx'

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = dateKey.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function sumHours(entries) {
  return entries
    .reduce((acc, e) => acc + Number(e.effective_hours || 0), 0)
    .toFixed(1)
}

function DraftCopyRow({ sourceEntry, busy, error, onSubmit, onCancel }) {
  const formId = useId()
  const listId = `${formId}-employees`
  const [name, setName] = useState('')
  const [hints, setHints] = useState([])

  useEffect(() => {
    setName('')
  }, [sourceEntry?.id])

  useEffect(() => {
    const q = name.trim()
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
  }, [name])

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit?.(trimmed)
  }

  return (
    <li className="day-panel__item day-panel__item--draft">
      <form className="day-panel__draft-form" onSubmit={handleSubmit}>
        <div className="day-panel__row">
          <label className="day-panel__draft-name">
            <span className="visually-hidden">姓名</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              list={listId}
              required
              maxLength={64}
              disabled={busy}
              autoComplete="off"
              autoFocus
              placeholder="输入或选择姓名"
            />
            <datalist id={listId}>
              {hints.map((emp) => (
                <option key={emp.id} value={emp.name} />
              ))}
            </datalist>
          </label>
          <span className="day-panel__time">
            {sourceEntry.start_time}–{sourceEntry.end_time}
          </span>
          <span className="day-panel__hours">{sourceEntry.effective_hours}h</span>
        </div>
        {sourceEntry.note ? (
          <p className="day-panel__note">{sourceEntry.note}</p>
        ) : null}
        {error ? <p className="day-panel__draft-error">{error}</p> : null}
        <div className="day-panel__item-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? '复制中…' : '完成'}
          </button>
        </div>
      </form>
    </li>
  )
}

export default function DayPanel({
  selectedDate,
  entries = [],
  loading = false,
  formMode = null,
  editingEntry = null,
  formError = null,
  formBusy = false,
  draftCopy = null,
  draftError = null,
  draftBusy = false,
  pasteMode = null,
  onAdd,
  onEdit,
  onDelete,
  onFormSubmit,
  onFormCancel,
  onCopyDay,
  onCopyPerson,
  onDraftSubmit,
  onDraftCancel,
}) {
  const totalHours = sumHours(entries)
  const peopleCount = entries.length
  const actionsLocked = Boolean(formMode || draftCopy || pasteMode)

  return (
    <section className="day-panel" aria-label="日明细">
      <header className="day-panel__header">
        <div>
          <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
          <p className="day-panel__stats">
            {peopleCount} 人 · 合计 {totalHours}h
          </p>
        </div>
        <div className="day-panel__header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCopyDay}
            disabled={!selectedDate || peopleCount === 0 || actionsLocked}
          >
            复制到…
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onAdd}
            disabled={!selectedDate || formMode === 'create' || Boolean(draftCopy || pasteMode)}
          >
            新增
          </button>
        </div>
      </header>

      <div className="day-panel__body">
        {loading ? <p className="day-panel__status">加载中…</p> : null}

        {!loading && entries.length === 0 && formMode !== 'create' && !draftCopy ? (
          <p className="day-panel__status">当日暂无登记，点击「新增」开始录入。</p>
        ) : null}

        <ul className="day-panel__list">
          {entries.map((entry) => {
            const isEditing = formMode === 'edit' && editingEntry?.id === entry.id
            return (
              <li key={entry.id} className="day-panel__item">
                {isEditing ? (
                  <EntryForm
                    mode="edit"
                    initialEntry={editingEntry}
                    onSubmit={onFormSubmit}
                    onCancel={onFormCancel}
                    busy={formBusy}
                    error={formError}
                  />
                ) : (
                  <>
                    <div className="day-panel__row">
                      <span className="day-panel__name">{entry.employee_name}</span>
                      <span className="day-panel__time">
                        {entry.start_time}–{entry.end_time}
                      </span>
                      <span className="day-panel__hours">{entry.effective_hours}h</span>
                    </div>
                    {entry.note ? (
                      <p className="day-panel__note">{entry.note}</p>
                    ) : null}
                    <div className="day-panel__item-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onCopyPerson(entry)}
                        disabled={actionsLocked}
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onEdit(entry)}
                        disabled={actionsLocked}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onDelete(entry)}
                        disabled={actionsLocked}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}

          {draftCopy?.sourceEntry ? (
            <DraftCopyRow
              sourceEntry={draftCopy.sourceEntry}
              busy={draftBusy}
              error={draftError}
              onSubmit={onDraftSubmit}
              onCancel={onDraftCancel}
            />
          ) : null}
        </ul>

        {formMode === 'create' ? (
          <div className="day-panel__create">
            <h3 className="day-panel__create-title">新增登记</h3>
            <EntryForm
              mode="create"
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              busy={formBusy}
              error={formError}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
