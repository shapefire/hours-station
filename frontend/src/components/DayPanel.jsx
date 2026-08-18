import { useEffect, useRef, useState } from 'react'
import EntryForm from './EntryForm.jsx'
import EmployeeNameField from './EmployeeNameField.jsx'
import TimeField from './TimeField.jsx'
import DayPreviewModal from './DayPreviewModal.jsx'
import RosterTextImportModal from './RosterTextImportModal.jsx'
import Metric from './Metric.jsx'
import HoursBreakdown from './HoursBreakdown.jsx'
import NoteField from './NoteField.jsx'
import StatusMultiPick from './StatusMultiPick.jsx'
import SupportForm from './SupportForm.jsx'
import DayNoteEditor from './DayNoteEditor.jsx'

const STATUS_LABEL = {
  on_duty: '到岗',
  rest: '休息',
  leave: '请假',
  support: '支援',
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return '—'
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()]
  return `${m}月${d}日 周${weekday}`
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

function normalizeOtTimes(start, end) {
  const ot_start_time = toTimeInputValue(start) || null
  const ot_end_time = toTimeInputValue(end) || null
  return { ot_start_time, ot_end_time }
}

function isOtPairIncomplete(start, end) {
  return Boolean(toTimeInputValue(start)) !== Boolean(toTimeInputValue(end))
}

function formatOtLabel(entry) {
  const start = toTimeInputValue(entry?.ot_start_time)
  const end = toTimeInputValue(entry?.ot_end_time)
  if (!start || !end) return null
  return `加班 ${start}–${end}`
}

function formatMainRange(entry) {
  const start = toTimeInputValue(entry?.start_time)
  const end = toTimeInputValue(entry?.end_time)
  if (!start || !end) return null
  return `${start}–${end}`
}

function EntryTimeRange({ entry, showMain = true }) {
  const otLabel = formatOtLabel(entry)
  const main = showMain ? formatMainRange(entry) : null
  if (!main && !otLabel) return null
  return (
    <span className="day-panel__time">
      {main ? <span>{main}</span> : null}
      {otLabel ? <span className="day-panel__ot">{otLabel}</span> : null}
    </span>
  )
}

function EntryTimeBlock({ entry, fallback = null }) {
  const main = formatMainRange(entry)
  const otLabel = formatOtLabel(entry)
  if (!main && !otLabel && !fallback) return <span className="day-panel__time-block" />
  return (
    <span className="day-panel__time-block">
      <span className="day-panel__time-main">{main || fallback}</span>
      {otLabel ? <span className="day-panel__ot">{otLabel}</span> : null}
    </span>
  )
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
  const [otStartTime, setOtStartTime] = useState('')
  const [otEndTime, setOtEndTime] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setName('')
    setStartTime(toTimeInputValue(sourceEntry?.start_time) || '07:30')
    setEndTime(toTimeInputValue(sourceEntry?.end_time) || '16:00')
    setOtStartTime(toTimeInputValue(sourceEntry?.ot_start_time))
    setOtEndTime(toTimeInputValue(sourceEntry?.ot_end_time))
    setNote(sourceEntry?.note || '')
  }, [
    sourceEntry?.id,
    sourceEntry?.start_time,
    sourceEntry?.end_time,
    sourceEntry?.ot_start_time,
    sourceEntry?.ot_end_time,
    sourceEntry?.note,
  ])

  const otIncomplete = isOtPairIncomplete(otStartTime, otEndTime)
  const otReady = Boolean(otStartTime) && Boolean(otEndTime)

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (occupiedMap[trimmed]) return
    if (otIncomplete) return
    onSubmit?.({
      name: trimmed,
      start_time: startTime,
      end_time: endTime,
      ...normalizeOtTimes(otStartTime, otEndTime),
      note: note.trim() ? note.trim() : null,
      status: 'on_duty',
      is_external: !!sourceEntry?.is_external,
      is_trial: !!sourceEntry?.is_trial,
    })
  }

  return (
    <li className="day-panel__item day-panel__item--duty day-panel__item--draft">
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
        <div className="day-panel__draft-times">
          <div className="day-panel__draft-field">
            <span>加班开始</span>
            <TimeField
              value={otStartTime}
              onChange={setOtStartTime}
              disabled={busy}
              aria-label="加班开始时间"
            />
          </div>
          <div className="day-panel__draft-field">
            <span>加班结束</span>
            <TimeField
              value={otEndTime}
              onChange={setOtEndTime}
              disabled={busy}
              aria-label="加班结束时间"
            />
          </div>
        </div>
        {otStartTime || otEndTime ? (
          <div className="entry-form__ot-clear">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => {
                setOtStartTime('')
                setOtEndTime('')
              }}
            >
              清空加班
            </button>
          </div>
        ) : null}
        {otReady ? (
          <div className="entry-form__ot-hours">
            <span className="entry-form__ot-hours-label">加班</span>
            <HoursBreakdown startTime={otStartTime} endTime={otEndTime} />
          </div>
        ) : null}
        {otIncomplete ? (
          <p className="day-panel__draft-error">加班开始与结束须同时填写</p>
        ) : null}
        <label className="day-panel__draft-field">
          <span>备注</span>
          <NoteField
            value={note}
            onChange={setNote}
            disabled={busy}
            maxLength={500}
            placeholder="可选，可多选预设或输入"
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
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy || otIncomplete}>
            {busy ? '复制中…' : '完成'}
          </button>
        </div>
      </form>
    </li>
  )
}

function StatusChipSection({ title, entries, actionsLocked, onAdd, onRemove, onSaveOvertime, accent }) {
  return (
    <section className={`day-panel__section day-panel__section--${accent}`}>
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
        <ul className="day-panel__status-list">
          {entries.map((entry) => (
            <RestLeaveRow
              key={entry.id}
              entry={entry}
              actionsLocked={actionsLocked}
              onRemove={onRemove}
              onSaveOvertime={onSaveOvertime}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function RestLeaveRow({ entry, actionsLocked, onRemove, onSaveOvertime }) {
  const [open, setOpen] = useState(false)
  const [otStart, setOtStart] = useState(() => toTimeInputValue(entry.ot_start_time))
  const [otEnd, setOtEnd] = useState(() => toTimeInputValue(entry.ot_end_time))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setOtStart(toTimeInputValue(entry.ot_start_time))
    setOtEnd(toTimeInputValue(entry.ot_end_time))
    setError(null)
  }, [entry.id, entry.ot_start_time, entry.ot_end_time])

  const otIncomplete = isOtPairIncomplete(otStart, otEnd)
  const hasOt = Boolean(
    toTimeInputValue(entry.ot_start_time) && toTimeInputValue(entry.ot_end_time),
  )
  const hasHours = Number(entry.effective_hours) > 0

  function resetOtFromEntry() {
    setOtStart(toTimeInputValue(entry.ot_start_time))
    setOtEnd(toTimeInputValue(entry.ot_end_time))
    setError(null)
  }

  async function handleSave() {
    if (otIncomplete) return
    setBusy(true)
    setError(null)
    try {
      await onSaveOvertime?.(entry, normalizeOtTimes(otStart, otEnd))
      setOpen(false)
    } catch (err) {
      setError(err?.message || '保存加班失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleClearOvertime() {
    setBusy(true)
    setError(null)
    try {
      await onSaveOvertime?.(entry, { ot_start_time: null, ot_end_time: null })
      setOtStart('')
      setOtEnd('')
      setOpen(false)
    } catch (err) {
      setError(err?.message || '清空加班失败')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="day-panel__status-item">
      <div className="day-panel__status-row">
        <span className="chip">
          <span className="chip__label">{entry.employee_name}</span>
          <button
            type="button"
            className="chip__remove"
            aria-label={`移除 ${entry.employee_name}`}
            disabled={actionsLocked || busy}
            onClick={() => onRemove(entry)}
          >
            ×
          </button>
        </span>
        <EntryTimeRange entry={entry} showMain={false} />
        {hasHours ? (
          <span className="day-panel__hours">
            <Metric value={entry.effective_hours} unit="h" chip />
          </span>
        ) : null}
        {hasOt ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--danger"
            disabled={actionsLocked || busy}
            onClick={handleClearOvertime}
            title="删除已登记的加班时段"
          >
            {busy ? '…' : '删加班'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={actionsLocked || busy}
          onClick={() => {
            setOpen((prev) => {
              if (prev) resetOtFromEntry()
              return !prev
            })
          }}
        >
          {open ? '收起' : hasOt ? '改加班' : '加班'}
        </button>
      </div>
      {open ? (
        <div className="day-panel__ot-editor">
          <div className="entry-form__row entry-form__row--times">
            <div className="entry-form__field">
              <span>加班开始</span>
              <TimeField
                value={otStart}
                onChange={setOtStart}
                disabled={busy}
                aria-label="加班开始时间"
              />
            </div>
            <div className="entry-form__field">
              <span>加班结束</span>
              <TimeField
                value={otEnd}
                onChange={setOtEnd}
                disabled={busy}
                aria-label="加班结束时间"
              />
            </div>
          </div>
          {hasOt || otStart || otEnd ? (
            <div className="entry-form__ot-clear">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={handleClearOvertime}
              >
                清空加班
              </button>
            </div>
          ) : null}
          {otIncomplete ? (
            <p className="entry-form__error">加班开始与结束须同时填写</p>
          ) : null}
          {error ? <p className="entry-form__error">{error}</p> : null}
          <div className="entry-form__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setOpen(false)
                resetOtFromEntry()
              }}
              disabled={busy}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleSave}
              disabled={busy || otIncomplete || (!otStart && !otEnd && !hasOt)}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : null}
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
  onSaveOvertime,
  dayNote = null,
  onSaveDayNote,
  year = null,
  onImportSuccess,
}) {
  const bodyRef = useRef(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [multiPick, setMultiPick] = useState(null)
  const [addingSupport, setAddingSupport] = useState(false)
  const [supportError, setSupportError] = useState(null)
  const [supportBusy, setSupportBusy] = useState(false)

  const duty = entries.filter((e) => entryStatus(e) === 'on_duty')
  const rest = entries.filter((e) => entryStatus(e) === 'rest')
  const leave = entries.filter((e) => entryStatus(e) === 'leave')
  const support = entries.filter((e) => entryStatus(e) === 'support')

  const totalHours = sumHours(entries.filter((e) => entryStatus(e) !== 'support'))
  const dutyCount = duty.length
  const allCount = entries.length
  const actionsLocked = Boolean(
    formMode || draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy,
  )
  const occupiedMap = buildOccupiedMap(entries)

  useEffect(() => {
    // 到岗新增/快速复制在列表顶部；支援表单在底部，勿因 addingSupport 滚到顶。
    if (formMode === 'create' || draftCopy?.sourceEntry) {
      bodyRef.current?.scrollTo({ top: 0 })
    }
  }, [formMode, draftCopy?.sourceEntry])

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
        <div className="day-panel__header-top">
          <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
          <div className="day-panel__header-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onAdd}
              disabled={
                !selectedDate ||
                formMode === 'create' ||
                Boolean(draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy)
              }
              title="新增到岗"
              aria-label="新增到岗"
            >
              新增
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setImportOpen(true)}
              disabled={!selectedDate}
              title="文本导入"
              aria-label="文本导入"
            >
              导入
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPreviewOpen(true)}
              disabled={!selectedDate || allCount === 0}
              title="预览"
              aria-label="预览"
            >
              预览
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onCopyDay}
              disabled={!selectedDate || allCount === 0 || actionsLocked}
              title="复制到…"
              aria-label="复制到其他日期"
            >
              复制
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--danger btn--sm"
              onClick={onClearDay}
              disabled={!selectedDate || allCount === 0 || actionsLocked}
              title="清空当日"
              aria-label="清空当日"
            >
              清空
            </button>
          </div>
        </div>
        <p className="day-panel__stats">
          到岗 <Metric value={dutyCount} unit="人" chip /> · 本店合计{' '}
          <Metric value={totalHours} unit="h" chip />
        </p>
        <p className="day-panel__summary">
          休息 {rest.length} · 请假 {leave.length} · 支援 {support.length}
        </p>
        <DayNoteEditor
          key={selectedDate || 'none'}
          note={dayNote}
          onSave={onSaveDayNote}
          disabled={!selectedDate}
        />
      </header>

      <div className="day-panel__body" ref={bodyRef}>
        {loading ? <p className="day-panel__status">加载中…</p> : null}

        {emptyDay ? (
          <p className="day-panel__status">当日暂无登记，点击「新增」开始录入。</p>
        ) : null}

        <section className="day-panel__section">
          <div className="day-panel__section-head">
            <h3 className="day-panel__section-title">
              到岗安排
              <span className="day-panel__section-count">{dutyCount}</span>
            </h3>
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

          {draftCopy?.sourceEntry ? (
            <ul className="day-panel__list">
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
            </ul>
          ) : null}

          <ul className="day-panel__list day-panel__list--duty">
            {duty.map((entry) => {
              const isEditing = formMode === 'edit' && editingEntry?.id === entry.id
              return (
                <li
                  key={entry.id}
                  className={`day-panel__item day-panel__item--duty${isEditing ? ' day-panel__item--span' : ''}`}
                >
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
                    <div className="day-panel__entry">
                      <button
                        type="button"
                        className="day-panel__entry-main"
                        onClick={() => onEdit(entry)}
                        disabled={actionsLocked}
                        aria-label={`编辑 ${entry.employee_name}`}
                      >
                        <EntryTimeBlock entry={entry} />
                        <span className="day-panel__who">
                          <span className="day-panel__name">
                            {entry.employee_name}
                            {entry.is_external ? (
                              <span className="badge badge--external">外援</span>
                            ) : null}
                            {entry.is_trial ? (
                              <span className="badge badge--trial">试工</span>
                            ) : null}
                          </span>
                          {entry.note ? <span className="day-panel__note">{entry.note}</span> : null}
                        </span>
                        <span className="day-panel__hours">
                          <Metric value={entry.effective_hours} unit="h" chip />
                        </span>
                      </button>
                      <div className="day-panel__item-actions">
                        <button
                          type="button"
                          className="day-panel__link"
                          onClick={() => onCopyPerson(entry)}
                          disabled={actionsLocked}
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          className="day-panel__link"
                          onClick={() => onEdit(entry)}
                          disabled={actionsLocked}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="day-panel__link day-panel__link--danger"
                          onClick={() => onDelete(entry)}
                          disabled={actionsLocked}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {!loading && duty.length === 0 && formMode !== 'create' && !draftCopy ? (
            <p className="day-panel__section-empty">暂无到岗安排</p>
          ) : null}
        </section>

        <StatusChipSection
          title="休息人员"
          accent="rest"
          entries={rest}
          actionsLocked={actionsLocked}
          onAdd={() => openMultiPick('rest')}
          onRemove={(entry) => onRemoveEntry?.(entry)}
          onSaveOvertime={onSaveOvertime}
        />

        <StatusChipSection
          title="请假人员"
          accent="leave"
          entries={leave}
          actionsLocked={actionsLocked}
          onAdd={() => openMultiPick('leave')}
          onRemove={(entry) => onRemoveEntry?.(entry)}
          onSaveOvertime={onSaveOvertime}
        />

        <section className="day-panel__section day-panel__section--support">
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
                    <div className="day-panel__entry">
                      <button
                        type="button"
                        className="day-panel__entry-main"
                        onClick={() => onEditSupport?.(entry)}
                        disabled={actionsLocked}
                        aria-label={`编辑支援 ${entry.employee_name}`}
                      >
                        <EntryTimeBlock entry={entry} />
                        <span className="day-panel__who">
                          <span className="day-panel__name">
                            {entry.employee_name}
                            <span className="badge badge--support">支援</span>
                          </span>
                          <span className="day-panel__note">
                            {entry.note ? `${entry.note} · 不计入本店工时` : '不计入本店工时'}
                          </span>
                        </span>
                        <span className="day-panel__hours">
                          <Metric value={entry.effective_hours} unit="h" chip />
                        </span>
                      </button>
                      <div className="day-panel__item-actions">
                        <button
                          type="button"
                          className="day-panel__link"
                          onClick={() => onEditSupport?.(entry)}
                          disabled={actionsLocked}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="day-panel__link day-panel__link--danger"
                          onClick={() => onDelete(entry)}
                          disabled={actionsLocked}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {!loading && support.length === 0 && !addingSupport ? (
            <p className="day-panel__section-empty">暂无</p>
          ) : null}
        </section>
      </div>

      <DayPreviewModal
        open={previewOpen}
        dateLabel={formatDisplayDate(selectedDate)}
        dayNote={dayNote}
        entries={entries}
        onClose={() => setPreviewOpen(false)}
      />

      <RosterTextImportModal
        open={importOpen}
        year={year}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false)
          onImportSuccess?.()
        }}
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
