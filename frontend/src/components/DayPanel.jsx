import { useEffect, useRef, useState } from 'react'
import EntryForm from './EntryForm.jsx'
import EmployeeNameField from './EmployeeNameField.jsx'
import TimeField from './TimeField.jsx'
import DayPreviewModal from './DayPreviewModal.jsx'
import Metric from './Metric.jsx'

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

function toTimeInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function DraftCopyRow({
  sourceEntry,
  busy,
  error,
  onSubmit,
  onCancel,
  monthYear = null,
  month = null,
}) {
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('07:30')
  const [endTime, setEndTime] = useState('16:00')
  const [note, setNote] = useState('')

  useEffect(() => {
    setName('')
    setStartTime(toTimeInputValue(sourceEntry?.start_time) || '07:30')
    setEndTime(toTimeInputValue(sourceEntry?.end_time) || '16:00')
    setNote(sourceEntry?.note || '')
  }, [sourceEntry?.id, sourceEntry?.start_time, sourceEntry?.end_time, sourceEntry?.note])

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit?.({
      name: trimmed,
      start_time: startTime,
      end_time: endTime,
      note: note.trim() ? note.trim() : null,
    })
  }

  return (
    <li className="day-panel__item day-panel__item--draft">
      <form className="day-panel__draft-form" onSubmit={handleSubmit}>
        <p className="day-panel__draft-label">快速复制 · 来自 {sourceEntry.employee_name}</p>
        <label className="day-panel__draft-field">
          <span>姓名</span>
          <EmployeeNameField
            value={name}
            onChange={setName}
            disabled={busy}
            required
            autoFocus
            placeholder="选择花名册或输入新姓名"
            monthYear={monthYear}
            month={month}
          />
        </label>
        <div className="day-panel__draft-times">
          <label className="day-panel__draft-field">
            <span>开始</span>
            <TimeField
              value={startTime}
              onChange={setStartTime}
              required
              disabled={busy}
              aria-label="开始时间"
            />
          </label>
          <label className="day-panel__draft-field">
            <span>结束</span>
            <TimeField
              value={endTime}
              onChange={setEndTime}
              required
              disabled={busy}
              aria-label="结束时间"
            />
          </label>
        </div>
        <label className="day-panel__draft-field">
          <span>备注</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            maxLength={500}
            placeholder="可选"
          />
        </label>
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
  monthYear = null,
  month = null,
  onAdd,
  onEdit,
  onDelete,
  onFormSubmit,
  onFormCancel,
  onCopyDay,
  onClearDay,
  onCopyPerson,
  onDraftSubmit,
  onDraftCancel,
}) {
  const bodyRef = useRef(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const totalHours = sumHours(entries)
  const peopleCount = entries.length
  const actionsLocked = Boolean(formMode || draftCopy || pasteMode)

  useEffect(() => {
    if (formMode === 'create' || draftCopy?.sourceEntry) {
      bodyRef.current?.scrollTo({ top: 0 })
    }
  }, [formMode, draftCopy?.sourceEntry])

  useEffect(() => {
    setPreviewOpen(false)
  }, [selectedDate])

  return (
    <section className="day-panel" aria-label="日明细">
      <header className="day-panel__header">
        <div>
          <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
          <p className="day-panel__stats">
            <Metric value={peopleCount} unit="人" chip /> · 合计{' '}
            <Metric value={totalHours} unit="h" chip />
          </p>
        </div>
        <div className="day-panel__header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPreviewOpen(true)}
            disabled={!selectedDate || peopleCount === 0}
            title="预览当日安排，便于复制到微信"
          >
            预览
          </button>
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
            className="btn btn--ghost btn--danger"
            onClick={onClearDay}
            disabled={!selectedDate || peopleCount === 0 || actionsLocked}
            title="清空当日全部安排"
          >
            清空当日
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

      <div className="day-panel__body" ref={bodyRef}>
        {loading ? <p className="day-panel__status">加载中…</p> : null}

        {!loading && entries.length === 0 && formMode !== 'create' && !draftCopy ? (
          <p className="day-panel__status">当日暂无登记，点击「新增」开始录入。</p>
        ) : null}

        {formMode === 'create' ? (
          <div className="day-panel__create">
            <h3 className="day-panel__create-title">新增登记</h3>
            <EntryForm
              mode="create"
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              busy={formBusy}
              error={formError}
              monthYear={monthYear}
              month={month}
            />
          </div>
        ) : null}

        <ul className="day-panel__list">
          {draftCopy?.sourceEntry ? (
            <DraftCopyRow
              sourceEntry={draftCopy.sourceEntry}
              busy={draftBusy}
              error={draftError}
              onSubmit={onDraftSubmit}
              onCancel={onDraftCancel}
              monthYear={monthYear}
              month={month}
            />
          ) : null}

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
                    monthYear={monthYear}
                    month={month}
                  />
                ) : (
                  <>
                    <div className="day-panel__row">
                      <span className="day-panel__name">{entry.employee_name}</span>
                      <span className="day-panel__time">
                        {entry.start_time}–{entry.end_time}
                      </span>
                      <span className="day-panel__hours">
                        <Metric value={entry.effective_hours} unit="h" chip />
                      </span>
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
        </ul>
      </div>

      <DayPreviewModal
        open={previewOpen}
        dateLabel={formatDisplayDate(selectedDate)}
        entries={entries}
        onClose={() => setPreviewOpen(false)}
      />
    </section>
  )
}
