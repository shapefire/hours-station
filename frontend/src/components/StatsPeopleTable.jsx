import { Fragment, useCallback, useState } from 'react'
import api from '../api/client.js'
import Metric from './Metric.jsx'

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function formatAvgHours(avg) {
  if (avg == null || avg === '' || avg === '—') return '—'
  return avg
}

function dayRowClass(status) {
  if (status === 'unassigned') return 'stats-days__row--rest'
  if (status === 'rest') return 'stats-days__row--rest'
  if (status === 'leave') return 'stats-days__row--leave'
  if (status === 'support') return 'stats-days__row--support'
  return undefined
}

function dayStatusLabel(day) {
  if (day.status === 'unassigned') return '未安排'
  if (day.status === 'rest') return '休息'
  if (day.status === 'leave') return '请假'
  if (day.status === 'support') {
    return `${day.start_time} – ${day.end_time}（支援）`
  }
  return `${day.start_time} – ${day.end_time}`
}

function DayDetailList({ days, expectedCount }) {
  const count = days?.length ?? 0
  const mismatch = expectedCount != null && count !== expectedCount

  return (
    <div className="stats-days">
      {mismatch ? (
        <p className="stats-days__warn" role="status">
          明细天数 {count} 与当月天数 {expectedCount} 不一致
        </p>
      ) : null}
      <table className="stats-days__table">
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">时段 / 状态</th>
            <th scope="col">当日工时</th>
          </tr>
        </thead>
        <tbody>
          {(days || []).map((day) => {
            const isUnassigned = day.status === 'unassigned'
            const isRest = day.status === 'rest'
            const isLeave = day.status === 'leave'
            const isSupport = day.status === 'support'
            const showHours = !isRest && !isLeave && !isUnassigned
            const labelClass = isUnassigned
              ? 'stats-days__rest-label'
              : isRest
                ? 'stats-days__rest-label'
                : isLeave
                  ? 'stats-days__leave-label'
                  : isSupport
                    ? 'stats-days__support-label'
                    : 'stats-days__time'

            return (
              <tr key={day.date} className={dayRowClass(day.status)}>
                <td>{day.date}</td>
                <td>
                  <span className={labelClass}>{dayStatusLabel(day)}</span>
                </td>
                <td className="stats-days__hours">
                  {showHours ? (
                    <Metric value={day.effective_hours} unit="h" chip />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="visually-hidden" data-testid="stats-days-count">
        {count}
      </p>
    </div>
  )
}

export default function StatsPeopleTable({ year, month, people }) {
  const [expandedId, setExpandedId] = useState(null)
  const [daysByEmployee, setDaysByEmployee] = useState({})
  const [loadingId, setLoadingId] = useState(null)
  const [errorById, setErrorById] = useState({})

  const expected = daysInMonth(year, month)

  const loadDays = useCallback(
    async (employeeId) => {
      if (daysByEmployee[employeeId]) return
      setLoadingId(employeeId)
      setErrorById((prev) => {
        const next = { ...prev }
        delete next[employeeId]
        return next
      })
      try {
        const data = await api.get(
          `/api/stats/monthly/${employeeId}/days?year=${year}&month=${month}`,
        )
        const days = Array.isArray(data?.days) ? data.days : []
        if (days.length !== expected) {
          console.warn(
            `[stats] employee ${employeeId}: rendered days ${days.length} !== month days ${expected}`,
          )
        }
        setDaysByEmployee((prev) => ({ ...prev, [employeeId]: days }))
      } catch (err) {
        setErrorById((prev) => ({
          ...prev,
          [employeeId]: err.message || '加载逐日明细失败',
        }))
      } finally {
        setLoadingId((current) => (current === employeeId ? null : current))
      }
    },
    [daysByEmployee, expected, month, year],
  )

  function handleToggle(employeeId) {
    if (expandedId === employeeId) {
      setExpandedId(null)
      return
    }
    setExpandedId(employeeId)
    loadDays(employeeId)
  }

  if (!people?.length) {
    return <p className="stats-page__empty">本月暂无登记员工。</p>
  }

  return (
    <div className="stats-people">
      <table className="stats-people__table">
        <thead>
          <tr>
            <th scope="col" className="stats-people__col-expand">
              <span className="visually-hidden">展开</span>
            </th>
            <th scope="col">姓名</th>
            <th scope="col">出勤天数</th>
            <th scope="col">休息天数</th>
            <th scope="col">请假天数</th>
            <th scope="col">支援天数</th>
            <th scope="col">支援工时</th>
            <th scope="col">总工时</th>
            <th scope="col">日均工时</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const id = person.employee_id
            const open = expandedId === id
            return (
              <Fragment key={id}>
                <tr className={open ? 'is-expanded' : undefined}>
                  <td className="stats-people__col-expand">
                    <button
                      type="button"
                      className="stats-people__expand-btn"
                      aria-expanded={open}
                      aria-label={open ? `收起 ${person.name}` : `展开 ${person.name}`}
                      onClick={() => handleToggle(id)}
                    >
                      {open ? '▾' : '▸'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="stats-people__name-btn"
                      aria-expanded={open}
                      onClick={() => handleToggle(id)}
                    >
                      {person.name}
                    </button>
                  </td>
                  <td className="stats-people__num">
                    <Metric value={person.attendance_days} unit="天" chip />
                  </td>
                  <td className="stats-people__num">
                    <Metric value={person.rest_days} unit="天" chip />
                  </td>
                  <td className="stats-people__num">
                    <Metric value={person.leave_days} unit="天" chip />
                  </td>
                  <td className="stats-people__num">
                    <Metric value={person.support_days} unit="天" chip />
                  </td>
                  <td className="stats-people__num stats-people__hours stats-people__support-hours">
                    <Metric value={person.support_hours} unit="h" chip />
                  </td>
                  <td className="stats-people__num stats-people__hours">
                    <Metric value={person.total_hours} unit="h" chip />
                  </td>
                  <td className="stats-people__num">
                    {formatAvgHours(person.avg_hours) === '—' ? (
                      '—'
                    ) : (
                      <Metric value={formatAvgHours(person.avg_hours)} unit="h" chip />
                    )}
                  </td>
                </tr>
                {open ? (
                  <tr className="stats-people__detail-row">
                    <td colSpan={9}>
                      <div className="stats-people__detail">
                        {loadingId === id && !daysByEmployee[id] ? (
                          <p className="stats-page__status">加载逐日明细…</p>
                        ) : null}
                        {errorById[id] ? (
                          <p className="stats-page__banner" role="alert">
                            {errorById[id]}
                          </p>
                        ) : null}
                        {daysByEmployee[id] ? (
                          <DayDetailList
                            days={daysByEmployee[id]}
                            expectedCount={expected}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
