import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/client.js'
import TimeField from './TimeField.jsx'
import { applySkipDeductionNote } from '../utils/skipDeductionNote.js'

const STATUS_OPTIONS = [
  { value: 'on_duty', label: '到岗' },
  { value: 'rest', label: '休息' },
  { value: 'leave', label: '请假' },
  { value: 'support', label: '支援' },
]

const ERROR_LABEL = {
  missing_support_times: '支援须填写时段',
  missing_duty_times: '到岗须填写时段',
  invalid_time_range: '结束须晚于开始',
  incomplete_ot_times: '加班开始与结束须同时填写',
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = String(dateKey).split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function toTimeValue(value) {
  const raw = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(raw) ? raw : ''
}

function timeOrNull(value) {
  return toTimeValue(value) || null
}

function isPairIncomplete(start, end) {
  return Boolean(toTimeValue(start)) !== Boolean(toTimeValue(end))
}

function recomputeEntryErrors(entry) {
  const errors = []
  const status = entry.status || 'on_duty'
  const start = timeOrNull(entry.start_time)
  const end = timeOrNull(entry.end_time)
  const otStart = timeOrNull(entry.ot_start_time)
  const otEnd = timeOrNull(entry.ot_end_time)

  const mainInvalid = Boolean(start && end && end <= start)
  const otInvalid = Boolean(otStart && otEnd && otEnd <= otStart)
  if (mainInvalid || otInvalid) errors.push('invalid_time_range')
  if (isPairIncomplete(otStart, otEnd)) errors.push('incomplete_ot_times')

  if (status === 'support' && (!start || !end)) {
    errors.push('missing_support_times')
  } else if (status === 'on_duty' && (!start || !end)) {
    errors.push('missing_duty_times')
  }

  return errors
}

function normalizeEntry(entry) {
  const next = {
    name: entry.name || '',
    status: entry.status || 'on_duty',
    start_time: toTimeValue(entry.start_time),
    end_time: toTimeValue(entry.end_time),
    ot_start_time: toTimeValue(entry.ot_start_time),
    ot_end_time: toTimeValue(entry.ot_end_time),
    is_trial: !!entry.is_trial,
    skip_deduction: !!entry.skip_deduction,
    note: entry.note || '',
  }
  return { ...next, errors: recomputeEntryErrors(next) }
}

function normalizePreviewDays(days, previousDays) {
  const prevByDate = new Map()
  if (previousDays) {
    for (const day of previousDays) {
      prevByDate.set(day.work_date, day)
    }
  }

  return (Array.isArray(days) ? days : []).map((day) => {
    const prevDay = prevByDate.get(day.work_date)
    const prevEntryMap = new Map()
    if (prevDay) {
      for (const entry of prevDay.entries) {
        prevEntryMap.set(entry.name, entry)
      }
    }

    const entries = (day.entries || []).map((entry) => {
      const parsed = normalizeEntry(entry)
      const prev = prevEntryMap.get(parsed.name)
      if (!prev) return parsed

      const merged = { ...parsed }
      if (!parsed.start_time && prev.start_time) merged.start_time = prev.start_time
      if (!parsed.end_time && prev.end_time) merged.end_time = prev.end_time
      if (!parsed.ot_start_time && prev.ot_start_time) merged.ot_start_time = prev.ot_start_time
      if (!parsed.ot_end_time && prev.ot_end_time) merged.ot_end_time = prev.ot_end_time
      if (parsed.status === 'on_duty' && prev.status !== 'on_duty') merged.status = prev.status
      if (!parsed.is_trial && prev.is_trial) merged.is_trial = prev.is_trial
      if (!parsed.skip_deduction && prev.skip_deduction) merged.skip_deduction = prev.skip_deduction
      if (!parsed.note && prev.note) merged.note = prev.note
      merged.errors = recomputeEntryErrors(merged)
      return merged
    })

    return {
      work_date: day.work_date,
      day_note: prevDay ? prevDay.day_note : (day.day_note ?? ''),
      original_day_note: day.day_note ?? null,
      entries,
      errors: Array.isArray(day.errors) ? day.errors : [],
    }
  })
}

function hasBlockingErrors(days) {
  return days.some(
    (day) =>
      (day.errors && day.errors.length > 0) ||
      day.entries.some((entry) => entry.errors.length > 0),
  )
}

function dayNoteForCommit(day) {
  const trimmed = String(day.day_note ?? '').trim()
  const original = day.original_day_note
  if (trimmed === (original ?? '')) return original
  return trimmed
}

function buildCommitDays(days) {
  return days.map((day) => {
    const payload = {
      work_date: day.work_date,
      entries: day.entries.map((entry) => {
        const status = entry.status || 'on_duty'
        const restOrLeave = status === 'rest' || status === 'leave'
        return {
          name: entry.name,
          status,
          start_time: restOrLeave ? null : timeOrNull(entry.start_time),
          end_time: restOrLeave ? null : timeOrNull(entry.end_time),
          ot_start_time: timeOrNull(entry.ot_start_time),
          ot_end_time: timeOrNull(entry.ot_end_time),
          is_trial: status === 'on_duty' ? !!entry.is_trial : false,
          skip_deduction: status === 'on_duty' ? !!entry.skip_deduction : false,
          note: String(entry.note || '').trim() || null,
        }
      }),
    }
    const dayNote = dayNoteForCommit(day)
    if (dayNote !== null) payload.day_note = dayNote
    return payload
  })
}

function errorLabel(code) {
  return ERROR_LABEL[code] || code
}

export default function RosterTextImportModal({ open, year, onClose, onSuccess }) {
  const titleId = useId()
  const pasteRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const phaseRef = useRef('edit_text')
  const openRef = useRef(open)
  const parseRequestIdRef = useRef(0)
  const parsingRef = useRef(false)
  const daySectionRefs = useRef(new Map())
  const unparsedRef = useRef(null)
  const [phase, setPhase] = useState('edit_text')
  const [text, setText] = useState('')
  const [days, setDays] = useState([])
  const [unparsedLines, setUnparsedLines] = useState([])
  const [error, setError] = useState(null)
  const [parseBusy, setParseBusy] = useState(false)

  onCloseRef.current = onClose
  phaseRef.current = phase
  openRef.current = open

  const busy = phase === 'submitting'
  const canParse = Boolean(text.trim()) && Number.isInteger(year) && !busy && !parseBusy
  const canCommit = phase === 'preview' && days.length > 0 && !hasBlockingErrors(days)

  useEffect(() => {
    if (!open) {
      parseRequestIdRef.current += 1
      parsingRef.current = false
      setParseBusy(false)
      return
    }
    setPhase('edit_text')
    setText('')
    setDays([])
    setUnparsedLines([])
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (phaseRef.current === 'submitting') return
      onCloseRef.current?.()
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open || phase !== 'edit_text') return
    pasteRef.current?.focus()
  }, [open, phase])

  const daySectionRef = useCallback((workDate) => (el) => {
    if (el) daySectionRefs.current.set(workDate, el)
    else daySectionRefs.current.delete(workDate)
  }, [])

  function scrollToDay(workDate) {
    daySectionRefs.current.get(workDate)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollToUnparsed() {
    unparsedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const errorDays = days.filter(
    (day) => (day.errors && day.errors.length > 0) || day.entries.some((e) => e.errors.length > 0),
  )
  const totalErrors = errorDays.reduce(
    (sum, day) =>
      sum +
      (day.errors ? day.errors.length : 0) +
      day.entries.reduce((s, e) => s + e.errors.length, 0),
    0,
  )

  if (!open) return null

  function handleBackdropClick() {
    if (busy) return
    onClose?.()
  }

  async function handleParse() {
    if (!canParse || parsingRef.current) return
    parsingRef.current = true
    const requestId = ++parseRequestIdRef.current
    setError(null)
    setParseBusy(true)
    try {
      const result = await api.post('/api/entries/import/preview', {
        text,
        year,
      })
      if (requestId !== parseRequestIdRef.current || !openRef.current) return
      setDays((prev) => normalizePreviewDays(result?.days, prev))
      setUnparsedLines(Array.isArray(result?.unparsed_lines) ? result.unparsed_lines : [])
      setPhase('preview')
    } catch (err) {
      if (requestId !== parseRequestIdRef.current || !openRef.current) return
      setError(err?.message || '解析失败')
    } finally {
      if (requestId === parseRequestIdRef.current) {
        parsingRef.current = false
        setParseBusy(false)
      }
    }
  }

  function updateDay(dayIndex, patch) {
    setDays((prev) =>
      prev.map((day, index) => (index === dayIndex ? { ...day, ...patch } : day)),
    )
  }

  function updateEntry(dayIndex, entryIndex, patch) {
    setDays((prev) =>
      prev.map((day, di) => {
        if (di !== dayIndex) return day
        const entries = day.entries.map((entry, ei) => {
          if (ei !== entryIndex) return entry
          const next = { ...entry, ...patch }
          if (patch.status === 'rest' || patch.status === 'leave') {
            next.start_time = ''
            next.end_time = ''
            next.is_trial = false
            next.skip_deduction = false
            next.note = applySkipDeductionNote(next.note, false)
          } else if (patch.status === 'support') {
            next.is_trial = false
            next.skip_deduction = false
            next.note = applySkipDeductionNote(next.note, false)
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'skip_deduction')) {
            next.skip_deduction = !!patch.skip_deduction && next.status === 'on_duty'
            next.note = applySkipDeductionNote(next.note, next.skip_deduction)
          }
          next.errors = recomputeEntryErrors(next)
          return next
        })
        return { ...day, entries }
      }),
    )
  }

  async function handleCommit() {
    if (!canCommit || busy) return
    setError(null)
    setPhase('submitting')
    try {
      await api.post('/api/entries/import/commit', { days: buildCommitDays(days) })
      onSuccess?.()
    } catch (err) {
      setError(err?.message || '导入失败')
      setPhase('preview')
    }
  }

  const modal = (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="modal roster-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId} className="modal__title">
              文本导入
            </h2>
            <p className="modal__subtitle">
              粘贴多日排班文本，按日历年 {year} 解析后预览确认
            </p>
          </div>
          <div className="modal__header-actions">
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onClose}
              disabled={busy}
              aria-label="关闭导入"
            >
              ×
            </button>
          </div>
        </header>

        <div className="roster-import-modal__body">
          {phase === 'edit_text' ? (
            <label className="roster-import-modal__paste">
              <span>排班文本</span>
              <textarea
                ref={pasteRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={parseBusy}
                placeholder={'8月1 周六\n8-16梓野（早值）7.5\n休息：苑菱'}
                aria-label="排班文本"
              />
            </label>
          ) : (
            <div className="roster-import-modal__preview">
              {phase === 'preview' && (totalErrors > 0 || unparsedLines.length > 0) ? (
                <div className="roster-import-summary" role="alert">
                  {totalErrors > 0 ? (
                    <span className="roster-import-summary__errors">
                      {totalErrors}处错误：
                      {errorDays.map((day, i) => (
                        <span key={day.work_date}>
                          {i > 0 ? '、' : ''}
                          <button
                            type="button"
                            className="roster-import-summary__link"
                            onClick={() => scrollToDay(day.work_date)}
                          >
                            {formatDisplayDate(day.work_date)}
                          </button>
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {unparsedLines.length > 0 ? (
                    <button
                      type="button"
                      className="roster-import-summary__link"
                      onClick={scrollToUnparsed}
                    >
                      {unparsedLines.length}行未识别
                    </button>
                  ) : null}
                </div>
              ) : null}

              {days.length === 0 ? (
                <p className="roster-import-modal__empty">没有解析出可导入的日期。</p>
              ) : null}

              {days.map((day, dayIndex) => (
                <section key={day.work_date || dayIndex} className="roster-import-day" ref={daySectionRef(day.work_date)}>
                  <div className="roster-import-day__head">
                    <h3 className="roster-import-day__title">{formatDisplayDate(day.work_date)}</h3>
                    <label className="roster-import-day__note">
                      <span>整日备注</span>
                      <input
                        type="text"
                        value={day.day_note}
                        onChange={(event) => updateDay(dayIndex, { day_note: event.target.value })}
                        disabled={busy}
                        maxLength={500}
                        placeholder="可选"
                        aria-label={`${formatDisplayDate(day.work_date)} 整日备注`}
                      />
                    </label>
                  </div>

                  {day.errors.length > 0 ? (
                    <ul className="roster-import-day__errors">
                      {day.errors.map((code) => (
                        <li key={code}>{errorLabel(code)}</li>
                      ))}
                    </ul>
                  ) : null}

                  {day.entries.length === 0 ? (
                    <p className="roster-import-modal__empty">该日暂无人员。</p>
                  ) : (
                    <div className="roster-import-table-wrap">
                      <table className="roster-import-table">
                        <thead>
                          <tr>
                            <th>姓名</th>
                            <th>状态</th>
                            <th>主时段</th>
                            <th>加班</th>
                            <th>试工</th>
                            <th>没吃饭</th>
                            <th>备注</th>
                            <th>问题</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.entries.map((entry, entryIndex) => {
                            const mainLocked = entry.status === 'rest' || entry.status === 'leave'
                            const rowError = entry.errors.length > 0
                            return (
                              <tr
                                key={`${day.work_date}-${entry.name}-${entryIndex}`}
                                className={rowError ? 'roster-import-table__row--error' : undefined}
                              >
                                <td className="roster-import-table__name">{entry.name}</td>
                                <td>
                                  <select
                                    className="roster-import-table__select"
                                    value={entry.status}
                                    disabled={busy}
                                    aria-label={`${entry.name} 状态`}
                                    onChange={(event) =>
                                      updateEntry(dayIndex, entryIndex, { status: event.target.value })
                                    }
                                  >
                                    {STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <div className="roster-import__times">
                                    <TimeField
                                      value={entry.start_time}
                                      onChange={(value) =>
                                        updateEntry(dayIndex, entryIndex, { start_time: value })
                                      }
                                      disabled={busy || mainLocked}
                                      aria-label={`${entry.name} 开始`}
                                    />
                                    <span className="roster-import__times-sep" aria-hidden="true">
                                      –
                                    </span>
                                    <TimeField
                                      value={entry.end_time}
                                      onChange={(value) =>
                                        updateEntry(dayIndex, entryIndex, { end_time: value })
                                      }
                                      disabled={busy || mainLocked}
                                      aria-label={`${entry.name} 结束`}
                                    />
                                  </div>
                                </td>
                                <td>
                                  <div className="roster-import__times">
                                    <TimeField
                                      value={entry.ot_start_time}
                                      onChange={(value) =>
                                        updateEntry(dayIndex, entryIndex, { ot_start_time: value })
                                      }
                                      disabled={busy}
                                      aria-label={`${entry.name} 加班开始`}
                                    />
                                    <span className="roster-import__times-sep" aria-hidden="true">
                                      –
                                    </span>
                                    <TimeField
                                      value={entry.ot_end_time}
                                      onChange={(value) =>
                                        updateEntry(dayIndex, entryIndex, { ot_end_time: value })
                                      }
                                      disabled={busy}
                                      aria-label={`${entry.name} 加班结束`}
                                    />
                                  </div>
                                </td>
                                <td className="roster-import-table__trial">
                                  <input
                                    type="checkbox"
                                    checked={!!entry.is_trial}
                                    disabled={busy || entry.status !== 'on_duty'}
                                    aria-label={`${entry.name} 试工`}
                                    onChange={(event) =>
                                      updateEntry(dayIndex, entryIndex, { is_trial: event.target.checked })
                                    }
                                  />
                                </td>
                                <td className="roster-import-table__trial">
                                  <input
                                    type="checkbox"
                                    checked={!!entry.skip_deduction}
                                    disabled={busy || entry.status !== 'on_duty'}
                                    aria-label={`${entry.name} 没吃饭`}
                                    onChange={(event) =>
                                      updateEntry(dayIndex, entryIndex, {
                                        skip_deduction: event.target.checked,
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="roster-import-table__note"
                                    value={entry.note}
                                    disabled={busy}
                                    maxLength={500}
                                    aria-label={`${entry.name} 备注`}
                                    onChange={(event) =>
                                      updateEntry(dayIndex, entryIndex, { note: event.target.value })
                                    }
                                  />
                                </td>
                                <td className="roster-import-table__issues">
                                  {entry.errors.length
                                    ? entry.errors.map(errorLabel).join('；')
                                    : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}

              {unparsedLines.length > 0 ? (
                <section className="roster-import-unparsed" ref={unparsedRef}>
                  <h3 className="roster-import-day__title">未识别的行</h3>
                  <p className="roster-import-unparsed__hint">以下行不会提交。</p>
                  <ul>
                    {unparsedLines.map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="roster-import-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="roster-import-modal__footer">
          {phase === 'edit_text' ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleParse}
                disabled={!canParse}
              >
                {parseBusy ? '解析中…' : '解析预览'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setError(null)
                  setPhase('edit_text')
                }}
                disabled={busy}
              >
                返回修改
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleCommit}
                disabled={busy || !canCommit}
                title={!canCommit ? '请先修正标红行的阻断错误' : undefined}
              >
                {busy ? '导入中…' : '确认导入'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
