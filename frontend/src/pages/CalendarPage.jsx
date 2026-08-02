import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/client.js'
import DayPanel from '../components/DayPanel.jsx'
import MonthCalendar, { toDateKey } from '../components/MonthCalendar.jsx'

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

  const daySummaryByDate = useMemo(() => {
    const map = {}
    for (const day of calendar?.days || []) {
      map[day.date] = day
    }
    return map
  }, [calendar])

  const refreshCalendar = useCallback(async () => {
    try {
      setCalendarError(null)
      const data = await api.get(`/api/calendar?year=${viewYear}&month=${viewMonth}`)
      setCalendar(data)
    } catch (err) {
      setCalendarError(err.message || '加载月历失败')
    }
  }, [viewYear, viewMonth])

  const refreshEntries = useCallback(async () => {
    if (!selectedDate) return
    try {
      setEntriesLoading(true)
      setEntriesError(null)
      const data = await api.get(`/api/entries?date=${selectedDate}`)
      setEntries(Array.isArray(data) ? data : [])
    } catch (err) {
      setEntries([])
      setEntriesError(err.message || '加载日明细失败')
    } finally {
      setEntriesLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    refreshCalendar()
  }, [refreshCalendar])

  useEffect(() => {
    refreshEntries()
  }, [refreshEntries])

  function handleSelectDate(dateKey) {
    const [y, m] = dateKey.split('-').map(Number)
    if (y !== viewYear || m !== viewMonth) {
      setViewYear(y)
      setViewMonth(m)
    }
    setSelectedDate(dateKey)
    setFormMode(null)
    setEditingEntry(null)
    setFormError(null)
  }

  function handlePrevMonth() {
    const next = shiftMonth(viewYear, viewMonth, -1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setSelectedDate(defaultSelectedForMonth(next.year, next.month))
    setFormMode(null)
    setEditingEntry(null)
    setFormError(null)
  }

  function handleNextMonth() {
    const next = shiftMonth(viewYear, viewMonth, 1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setSelectedDate(defaultSelectedForMonth(next.year, next.month))
    setFormMode(null)
    setEditingEntry(null)
    setFormError(null)
  }

  function handleAdd() {
    setFormMode('create')
    setEditingEntry(null)
    setFormError(null)
  }

  function handleEdit(entry) {
    setFormMode('edit')
    setEditingEntry(entry)
    setFormError(null)
  }

  function handleFormCancel() {
    setFormMode(null)
    setEditingEntry(null)
    setFormError(null)
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
        })
      } else if (formMode === 'edit' && editingEntry) {
        await api.patch(`/api/entries/${editingEntry.id}`, {
          start_time: payload.start_time,
          end_time: payload.end_time,
          note: payload.note,
        })
      }
      setFormMode(null)
      setEditingEntry(null)
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

  return (
    <div className="calendar-page">
      {(calendarError || entriesError) && (
        <div className="calendar-page__banner" role="alert">
          {calendarError || entriesError}
        </div>
      )}
      <MonthCalendar
        viewYear={viewYear}
        viewMonth={viewMonth}
        selectedDate={selectedDate}
        daySummaryByDate={daySummaryByDate}
        registeredDays={calendar?.registered_days ?? 0}
        monthTotalHours={calendar?.month_total_hours ?? '0.0'}
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
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onFormSubmit={handleFormSubmit}
        onFormCancel={handleFormCancel}
      />
    </div>
  )
}
