import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import DayPanel from '../components/DayPanel.jsx'
import MonthCalendar, { toDateKey } from '../components/MonthCalendar.jsx'
import PasteModeBar from '../components/PasteModeBar.jsx'

function todayKey() {
  const now = new Date()
  return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function defaultSelectedForMonth(year, month) {
  const today = new Date()
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return todayKey()
  }
  return toDateKey(year, month, 1)
}

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function formatCopyDayFeedback(result) {
  const copied = result?.copied ?? 0
  const skipped = result?.skipped ?? 0
  const names = Array.isArray(result?.skipped_names) ? result.skipped_names : []
  let message = `已复制 ${copied} 条`
  if (skipped > 0) {
    message += `，跳过 ${skipped} 条`
    if (names.length) {
      message += `（${names.join('、')}）`
    }
  }
  return message
}

export default function CalendarPage() {
  const initial = useMemo(() => {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selected: todayKey(),
    }
  }, [])

  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)
  const [selectedDate, setSelectedDate] = useState(initial.selected)
  const [calendar, setCalendar] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [calendarError, setCalendarError] = useState(null)
  const [entriesError, setEntriesError] = useState(null)

  const [formMode, setFormMode] = useState(null)
  const [editingEntry, setEditingEntry] = useState(null)
  const [formError, setFormError] = useState(null)
  const [formBusy, setFormBusy] = useState(false)

  const [pasteMode, setPasteMode] = useState(null)
  const [draftCopy, setDraftCopy] = useState(null)
  const [draftError, setDraftError] = useState(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [pasteBusy, setPasteBusy] = useState(false)
  const calendarFetchSeqRef = useRef(0)
  const entriesFetchSeqRef = useRef(0)

  const daySummaryByDate = useMemo(() => {
    const map = {}
    for (const day of calendar?.days || []) {
      map[day.date] = day
    }
    return map
  }, [calendar])

  const refreshCalendar = useCallback(async () => {
    const seq = ++calendarFetchSeqRef.current
    try {
      setCalendarError(null)
      const data = await api.get(`/api/calendar?year=${viewYear}&month=${viewMonth}`)
      if (seq !== calendarFetchSeqRef.current) return
      setCalendar(data)
    } catch (err) {
      if (seq !== calendarFetchSeqRef.current) return
      setCalendarError(err.message || '加载月历失败')
    }
  }, [viewYear, viewMonth])

  const refreshEntries = useCallback(async () => {
    if (!selectedDate) return
    const seq = ++entriesFetchSeqRef.current
    try {
      setEntriesLoading(true)
      setEntriesError(null)
      const data = await api.get(`/api/entries?date=${selectedDate}`)
      if (seq !== entriesFetchSeqRef.current) return
      setEntries(Array.isArray(data) ? data : [])
    } catch (err) {
      if (seq !== entriesFetchSeqRef.current) return
      setEntries([])
      setEntriesError(err.message || '加载日明细失败')
    } finally {
      if (seq === entriesFetchSeqRef.current) {
        setEntriesLoading(false)
      }
    }
  }, [selectedDate])

  useEffect(() => {
    refreshCalendar()
  }, [refreshCalendar])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  useEffect(() => {
    if (!pasteMode) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPasteMode(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pasteMode])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [feedback])

  function clearFormState() {
    setFormMode(null)
    setEditingEntry(null)
    setFormError(null)
  }

  function clearDraftState() {
    setDraftCopy(null)
    setDraftError(null)
    setDraftBusy(false)
  }

  function handleSelectDate(dateKey) {
    if (pasteMode) {
      handlePasteTarget(dateKey)
      return
    }

    const [y, m] = dateKey.split('-').map(Number)
    if (y !== viewYear || m !== viewMonth) {
      setViewYear(y)
      setViewMonth(m)
    }
    setSelectedDate(dateKey)
    clearFormState()
    clearDraftState()
  }

  function handlePrevMonth() {
    const next = shiftMonth(viewYear, viewMonth, -1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setSelectedDate(defaultSelectedForMonth(next.year, next.month))
    clearFormState()
    clearDraftState()
  }

  function handleNextMonth() {
    const next = shiftMonth(viewYear, viewMonth, 1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setSelectedDate(defaultSelectedForMonth(next.year, next.month))
    clearFormState()
    clearDraftState()
  }

  function handleAdd() {
    clearDraftState()
    setPasteMode(null)
    setFormMode('create')
    setEditingEntry(null)
    setFormError(null)
  }

  function handleEdit(entry) {
    clearDraftState()
    setPasteMode(null)
    setFormMode('edit')
    setEditingEntry(entry)
    setFormError(null)
  }

  function handleFormCancel() {
    clearFormState()
  }

  async function handleFormSubmit(payload) {
    setFormBusy(true)
    setFormError(null)
    try {
      if (formMode === 'create') {
        await api.post('/api/entries', {
          work_date: selectedDate,
          name: payload.name,
          start_time: payload.start_time,
          end_time: payload.end_time,
          note: payload.note,
          status: 'on_duty',
          is_external: !!payload.is_external,
          is_trial: !!payload.is_trial,
        })
      } else if (formMode === 'edit' && editingEntry) {
        await api.patch(`/api/entries/${editingEntry.id}`, {
          start_time: payload.start_time,
          end_time: payload.end_time,
          note: payload.note,
          is_external: !!payload.is_external,
          is_trial: !!payload.is_trial,
        })
      }
      clearFormState()
      await Promise.all([refreshCalendar(), refreshEntries()])
    } catch (err) {
      setFormError(err.message || '保存失败')
    } finally {
      setFormBusy(false)
    }
  }

  async function handleDelete(entry) {
    const ok = window.confirm(`确认删除 ${entry.employee_name} 的当日安排？`)
    if (!ok) return
    try {
      await api.delete(`/api/entries/${entry.id}`)
      await Promise.all([refreshCalendar(), refreshEntries()])
    } catch (err) {
      window.alert(err.message || '删除失败')
    }
  }

  async function handleClearDay() {
    if (!selectedDate || entries.length === 0) return
    const ok = window.confirm(
      `确认清空 ${selectedDate} 的全部 ${entries.length} 条安排？此操作不可撤销。`,
    )
    if (!ok) return
    try {
      clearFormState()
      clearDraftState()
      await api.delete(`/api/entries?date=${encodeURIComponent(selectedDate)}`)
      setFeedback(`已清空 ${selectedDate} 的安排`)
      await Promise.all([refreshCalendar(), refreshEntries()])
    } catch (err) {
      window.alert(err.message || '清空失败')
    }
  }

  function handleCopyDay() {
    if (!selectedDate || entries.length === 0) {
      setFeedback('当日无安排可复制')
      return
    }
    clearFormState()
    clearDraftState()
    setPasteMode({ fromDate: selectedDate, count: entries.length })
    setFeedback(null)
  }

  function handleCancelPaste() {
    setPasteMode(null)
  }

  async function handlePasteTarget(toDate) {
    if (!pasteMode || pasteBusy) return
    if (toDate === pasteMode.fromDate) {
      setFeedback('请选择与来源不同的目标日')
      return
    }

    setPasteBusy(true)
    try {
      const result = await api.post('/api/entries/copy-day', {
        from_date: pasteMode.fromDate,
        to_date: toDate,
      })
      setPasteMode(null)
      setFeedback(formatCopyDayFeedback(result))

      const [y, m] = toDate.split('-').map(Number)
      const monthChanged = y !== viewYear || m !== viewMonth
      if (monthChanged) {
        setViewYear(y)
        setViewMonth(m)
      }
      setSelectedDate(toDate)
      clearFormState()
      clearDraftState()
      if (!monthChanged) {
        await refreshCalendar()
      }
    } catch (err) {
      setFeedback(err.message || '整日复制失败')
    } finally {
      setPasteBusy(false)
    }
  }

  function handleCopyPerson(entry) {
    clearFormState()
    setPasteMode(null)
    setDraftCopy({ sourceEntry: entry })
    setDraftError(null)
    setFeedback(null)
  }

  function handleDraftCancel() {
    clearDraftState()
  }

  async function handleDraftSubmit(payload) {
    if (!draftCopy?.sourceEntry || !selectedDate) return
    setDraftBusy(true)
    setDraftError(null)
    try {
      await api.post('/api/entries', {
        work_date: selectedDate,
        name: payload.name,
        start_time: payload.start_time,
        end_time: payload.end_time,
        note: payload.note,
      })
      clearDraftState()
      setFeedback(`已复制为「${payload.name}」`)
      await Promise.all([refreshCalendar(), refreshEntries()])
    } catch (err) {
      setDraftError(err.message || '单人复制失败')
    } finally {
      setDraftBusy(false)
    }
  }

  return (
    <div className={`calendar-page${pasteMode ? ' is-paste-mode' : ''}`}>
      {(pasteMode || feedback || calendarError || entriesError) ? (
        <div className="calendar-page__alerts">
          {pasteMode ? (
            <PasteModeBar
              fromDate={pasteMode.fromDate}
              count={pasteMode.count}
              onCancel={handleCancelPaste}
            />
          ) : null}
          {feedback ? (
            <div className="calendar-page__feedback" role="status">
              {feedback}
            </div>
          ) : null}
          {(calendarError || entriesError) && (
            <div className="calendar-page__banner" role="alert">
              {calendarError || entriesError}
            </div>
          )}
        </div>
      ) : null}

      <div className="calendar-page__workspace">
        <MonthCalendar
          viewYear={viewYear}
          viewMonth={viewMonth}
          selectedDate={selectedDate}
          daySummaryByDate={daySummaryByDate}
          registeredDays={calendar?.registered_days ?? 0}
          monthTotalHours={calendar?.month_total_hours ?? '0.0'}
          pasteMode={pasteMode}
          pasteSourceDate={pasteMode?.fromDate ?? null}
          onSelectDate={handleSelectDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />
        <DayPanel
          selectedDate={selectedDate}
          entries={entries}
          loading={entriesLoading}
          formMode={formMode}
          editingEntry={editingEntry}
          formError={formError}
          formBusy={formBusy}
          draftCopy={draftCopy}
          draftError={draftError}
          draftBusy={draftBusy}
          pasteMode={pasteMode}
          monthYear={viewYear}
          month={viewMonth}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onFormSubmit={handleFormSubmit}
          onFormCancel={handleFormCancel}
          onCopyDay={handleCopyDay}
          onClearDay={handleClearDay}
          onCopyPerson={handleCopyPerson}
          onDraftSubmit={handleDraftSubmit}
          onDraftCancel={handleDraftCancel}
        />
      </div>
    </div>
  )
}
