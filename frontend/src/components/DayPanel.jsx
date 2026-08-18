import { useEffect, useRef, useState } from 'react'
import EntryForm from './EntryForm.jsx'
import EmployeeNameField from './EmployeeNameField.jsx'
import TimeField from './TimeField.jsx'
import DayPreviewModal from './DayPreviewModal.jsx'
import Metric from './Metric.jsx'
import HoursBreakdown from './HoursBreakdown.jsx'
import NoteField from './NoteField.jsx'
import StatusMultiPick from './StatusMultiPick.jsx'
import SupportForm from './SupportForm.jsx'

const STATUS_LABEL = {
  on_duty: '到岗',
  rest: '休息',
  leave: '请假',
  support: '支援',
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = dateKey.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function entryStatus(entry) {
  return entry?.status || 'on_duty'
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

function buildOccupiedMap(entries) {
  const map = {}
  for (const entry of entries) {
    const name = entry.employee_name
    if (!name) continue
    map[name] = STATUS_LABEL[entryStatus(entry)] || entryStatus(entry)
  }
  return map
}

function DraftCopyRow({
  sourceEntry,
  busy,
  error,
  onSubmit,
  onCancel,
  monthYear = null,
  month = null,
  occupiedMap = {},
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
    if (occupiedMap[trimmed]) return
    onSubmit?.({
      name: trimmed,
      start_time: startTime,
      end_time: endTime,
      note: note.trim() ? note.trim() : null,
      status: 'on_duty',
      is_external: !!sourceEntry?.is_external,
      is_trial: !!sourceEntry?.is_trial,
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
            occupiedMap={occupiedMap}
          />
        </label>
        <div className="day-panel__draft-times">
          <div className="day-panel__draft-field">
            <span>开始</span>
            <TimeField
              value={startTime}
              onChange={setStartTime}
              required
              disabled={busy}
              aria-label="开始时间"
            />
          </div>
          <div className="day-panel__draft-field">
            <span>结束</span>
            <TimeField
              value={endTime}
              onChange={setEndTime}
              required
              disabled={busy}
              aria-label="结束时间"
            />
          </div>
        </div>
        <HoursBreakdown startTime={startTime} endTime={endTime} />
        <label className="day-panel__draft-field">
          <span>备注</span>
          <NoteField
            value={note}
            onChange={setNote}
            disabled={busy}
            maxLength={500}
            placeholder="可选，选择预设或输入"
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

function StatusChipSection({ title, entries, actionsLocked, onAdd, onRemove }) {
  return (
    <section className="day-panel__section">
      <div className="day-panel__section-head">
        <h3 className="day-panel__section-title">
          {title}
          <span className="day-panel__section-count">{entries.length}</span>
        </h3>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onAdd}
          disabled={actionsLocked}
        >
          + 添加
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="day-panel__section-empty">暂无</p>
      ) : (
        <ul className="day-panel__chips">
          {entries.map((entry) => (
            <li key={entry.id} className="chip">
              <span className="chip__label">{entry.employee_name}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`移除 ${entry.employee_name}`}
                disabled={actionsLocked}
                onClick={() => onRemove(entry)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  statusSyncBusy = false,
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
  onAddRestLeave,
  onRemoveEntry,
  onAddSupport,
  onEditSupport,
}) {
  const bodyRef = useRef(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [multiPick, setMultiPick] = useState(null)
  const [addingSupport, setAddingSupport] = useState(false)
  const [supportError, setSupportError] = useState(null)
  const [supportBusy, setSupportBusy] = useState(false)

  const duty = entries.filter((e) => entryStatus(e) === 'on_duty')
  const rest = entries.filter((e) => entryStatus(e) === 'rest')
  const leave = entries.filter((e) => entryStatus(e) === 'leave')
  const support = entries.filter((e) => entryStatus(e) === 'support')

  const totalHours = sumHours(duty)
  const dutyCount = duty.length
  const allCount = entries.length
  const actionsLocked = Boolean(
    formMode || draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy,
  )
  const occupiedMap = buildOccupiedMap(entries)

  useEffect(() => {
    if (formMode === 'create' || addingSupport || draftCopy?.sourceEntry) {
      bodyRef.current?.scrollTo({ top: 0 })
    }
  }, [formMode, addingSupport, draftCopy?.sourceEntry])

  useEffect(() => {
    setPreviewOpen(false)
    setMultiPick(null)
    setAddingSupport(false)
    setSupportError(null)
  }, [selectedDate])

  useEffect(() => {
    if (formMode) {
      setAddingSupport(false)
      setSupportError(null)
    }
  }, [formMode])

  function openMultiPick(status) {
    const current = status === 'rest' ? rest : leave
    setMultiPick({
      status,
      title: status === 'rest' ? '选择休息人员' : '选择请假人员',
      allowStatusLabel: STATUS_LABEL[status],
      initialSelected: current.map((e) => e.employee_name),
    })
  }

  function handleMultiPickConfirm(names) {
    if (!multiPick) return
    const { status } = multiPick
    setMultiPick(null)
    onAddRestLeave?.(status, names)
  }

  async function handleSupportCreate(payload) {
    setSupportBusy(true)
    setSupportError(null)
    try {
      await onAddSupport?.(payload)
      setAddingSupport(false)
    } catch (err) {
      setSupportError(err?.message || '新增支援失败')
    } finally {
      setSupportBusy(false)
    }
  }

  function handleStartAddSupport() {
    onFormCancel?.()
    onDraftCancel?.()
    setSupportError(null)
    setAddingSupport(true)
  }

  const emptyDay =
    !loading &&
    entries.length === 0 &&
    formMode !== 'create' &&
    !addingSupport &&
    !draftCopy

  return (
    <section className="day-panel" aria-label="日明细">
      <header className="day-panel__header">
        <div className="day-panel__header-main">
          <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
          <p className="day-panel__stats">
            到岗 <Metric value={dutyCount} unit="人" chip /> · 本店合计{' '}
            <Metric value={totalHours} unit="h" chip />
          </p>
          <p className="day-panel__summary">
            休息 {rest.length} · 请假 {leave.length} · 支援 {support.length}
          </p>
        </div>
        <div className="day-panel__header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setPreviewOpen(true)}
            disabled={!selectedDate || allCount === 0}
            title="预览当日安排，便于复制到微信"
          >
            预览
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCopyDay}
            disabled={!selectedDate || allCount === 0 || actionsLocked}
          >
            复制到…
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={onClearDay}
            disabled={!selectedDate || allCount === 0 || actionsLocked}
            title="清空当日全部安排"
          >
            清空当日
          </button>
        </div>
      </header>

      <div className="day-panel__body" ref={bodyRef}>
        {loading ? <p className="day-panel__status">加载中…</p> : null}

        {emptyDay ? (
          <p className="day-panel__status">当日暂无登记，点击「新增到岗」开始录入。</p>
        ) : null}

        <div className="day-panel__columns">
          <div className="day-panel__col day-panel__col--duty">
            <section className="day-panel__section">
              <div className="day-panel__section-head">
                <h3 className="day-panel__section-title">
                  到岗安排
                  <span className="day-panel__section-count">{dutyCount}</span>
                </h3>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onAdd}
                  disabled={
                    !selectedDate ||
                    formMode === 'create' ||
                    Boolean(draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy)
                  }
                >
                  新增到岗
                </button>
              </div>

              {formMode === 'create' ? (
                <div className="day-panel__create">
                  <h3 className="day-panel__create-title">新增到岗</h3>
                  <EntryForm
                    mode="create"
                    onSubmit={onFormSubmit}
                    onCancel={onFormCancel}
                    busy={formBusy}
                    error={formError}
                    monthYear={monthYear}
                    month={month}
                    occupiedMap={occupiedMap}
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
                    occupiedMap={occupiedMap}
                  />
                ) : null}

                {duty.map((entry) => {
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
                            <span className="day-panel__name">
                              {entry.employee_name}
                              {entry.is_external ? (
                                <span className="badge badge--external">外援</span>
                              ) : null}
                              {entry.is_trial ? (
                                <span className="badge badge--trial">试工</span>
                              ) : null}
                            </span>
                            <span className="day-panel__time">
                              {entry.start_time}–{entry.end_time}
                            </span>
                            <span className="day-panel__hours">
                              <Metric value={entry.effective_hours} unit="h" chip />
                            </span>
                          </div>
                          {entry.note ? <p className="day-panel__note">{entry.note}</p> : null}
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
              {!loading && duty.length === 0 && formMode !== 'create' && !draftCopy ? (
                <p className="day-panel__section-empty">暂无到岗安排</p>
              ) : null}
            </section>
          </div>

          <div className="day-panel__col day-panel__col--status">
            <StatusChipSection
              title="休息人员"
              entries={rest}
              actionsLocked={actionsLocked}
              onAdd={() => openMultiPick('rest')}
              onRemove={(entry) => onRemoveEntry?.(entry)}
            />

            <StatusChipSection
              title="请假人员"
              entries={leave}
              actionsLocked={actionsLocked}
              onAdd={() => openMultiPick('leave')}
              onRemove={(entry) => onRemoveEntry?.(entry)}
            />

            <section className="day-panel__section">
              <div className="day-panel__section-head">
                <h3 className="day-panel__section-title">
                  支援（本店外派）
                  <span className="day-panel__section-count">{support.length}</span>
                </h3>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleStartAddSupport}
                  disabled={!selectedDate || actionsLocked || addingSupport}
                >
                  + 添加
                </button>
              </div>

              {addingSupport ? (
                <div className="day-panel__create day-panel__create--support">
                  <h3 className="day-panel__create-title">新增支援</h3>
                  <SupportForm
                    mode="create"
                    onSubmit={handleSupportCreate}
                    onCancel={() => {
                      setAddingSupport(false)
                      setSupportError(null)
                    }}
                    busy={supportBusy}
                    error={supportError}
                    monthYear={monthYear}
                    month={month}
                    occupiedMap={occupiedMap}
                  />
                </div>
              ) : null}

              <ul className="day-panel__list">
                {support.map((entry) => {
                  const isEditing = formMode === 'edit-support' && editingEntry?.id === entry.id
                  return (
                    <li key={entry.id} className="day-panel__item day-panel__support-item">
                      {isEditing ? (
                        <SupportForm
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
                            <span className="day-panel__name">
                              {entry.employee_name}
                              <span className="badge badge--support">支援</span>
                            </span>
                            <span className="day-panel__time">
                              {entry.start_time}–{entry.end_time}
                            </span>
                            <span className="day-panel__hours">
                              <Metric value={entry.effective_hours} unit="h" chip />
                            </span>
                          </div>
                          <p className="day-panel__support-note">不计入本店工时</p>
                          {entry.note ? <p className="day-panel__note">{entry.note}</p> : null}
                          <div className="day-panel__item-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => onEditSupport?.(entry)}
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
              {!loading && support.length === 0 && !addingSupport ? (
                <p className="day-panel__section-empty">暂无支援安排</p>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <DayPreviewModal
        open={previewOpen}
        dateLabel={formatDisplayDate(selectedDate)}
        entries={entries}
        onClose={() => setPreviewOpen(false)}
      />

      {multiPick ? (
        <StatusMultiPick
          open
          title={multiPick.title}
          initialSelected={multiPick.initialSelected}
          occupiedMap={occupiedMap}
          allowStatusLabel={multiPick.allowStatusLabel}
          monthYear={monthYear}
          month={month}
          onConfirm={handleMultiPickConfirm}
          onClose={() => setMultiPick(null)}
        />
      ) : null}
    </section>
  )
}
