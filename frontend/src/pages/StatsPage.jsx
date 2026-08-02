import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import StatsPeopleTable from '../components/StatsPeopleTable.jsx'

function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export default function StatsPage() {
  const initial = useMemo(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }, [])

  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tableKey, setTableKey] = useState(0)
  const fetchSeqRef = useRef(0)

  const refreshStats = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    try {
      setLoading(true)
      setError(null)
      const data = await api.get(
        `/api/stats/monthly?year=${viewYear}&month=${viewMonth}`,
      )
      if (seq !== fetchSeqRef.current) return
      setStats(data)
    } catch (err) {
      if (seq !== fetchSeqRef.current) return
      setStats(null)
      setError(err.message || '加载月度统计失败')
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
      }
    }
  }, [viewYear, viewMonth])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  function handlePrevMonth() {
    const next = shiftMonth(viewYear, viewMonth, -1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setTableKey((k) => k + 1)
  }

  function handleNextMonth() {
    const next = shiftMonth(viewYear, viewMonth, 1)
    setViewYear(next.year)
    setViewMonth(next.month)
    setTableKey((k) => k + 1)
  }

  const people = stats?.people ?? []

  return (
    <div className="stats-page">
      <header className="stats-page__header">
        <div className="stats-page__nav">
          <button
            type="button"
            className="month-calendar__nav-btn"
            onClick={handlePrevMonth}
            aria-label="上一月"
          >
            ‹
          </button>
          <h1 className="stats-page__title">
            {viewYear}年{viewMonth}月
          </h1>
          <button
            type="button"
            className="month-calendar__nav-btn"
            onClick={handleNextMonth}
            aria-label="下一月"
          >
            ›
          </button>
        </div>
        <p className="stats-page__subtitle">管理者统计看板</p>
      </header>

      {error ? (
        <div className="stats-page__banner" role="alert">
          {error}
        </div>
      ) : null}

      <section className="stats-kpi" aria-label="月度摘要">
        <div className="stats-kpi__item">
          <span className="stats-kpi__label">当月总工时</span>
          <span className="stats-kpi__value">
            {loading && !stats ? '…' : (stats?.total_hours ?? '0.0')}
          </span>
        </div>
        <div className="stats-kpi__item">
          <span className="stats-kpi__label">登记人数</span>
          <span className="stats-kpi__value">
            {loading && !stats ? '…' : (stats?.employee_count ?? 0)}
          </span>
        </div>
        <div className="stats-kpi__item">
          <span className="stats-kpi__label">出勤人天</span>
          <span className="stats-kpi__value">
            {loading && !stats ? '…' : (stats?.attendance_person_days ?? 0)}
          </span>
        </div>
      </section>

      <section className="stats-page__table-section" aria-label="按人汇总">
        {loading && !stats ? (
          <p className="stats-page__status">加载中…</p>
        ) : (
          <StatsPeopleTable
            key={tableKey}
            year={viewYear}
            month={viewMonth}
            people={people}
          />
        )}
      </section>
    </div>
  )
}
