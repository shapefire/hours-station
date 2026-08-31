import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client.js'
import TimeField from '../components/TimeField.jsx'
import { allowedReviewMonths, defaultReviewYearMonth } from '../utils/reviewMonth.js'

const STATUS_LABEL = {
  on_duty: '到岗',
  rest: '休息',
  leave: '请假',
  support: '支援',
  unassigned: '未安排',
}

const DISPUTE_STATUS_LABEL = {
  pending: '待审核',
  confirmed: '已确认',
  rejected: '无效',
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return '—'
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()]
  return `${m}月${d}日 周${weekday}`
}

function formatTimeRange(start, end) {
  if (!start || !end) return '—'
  return `${start}–${end}`
}

function formatOtRange(start, end) {
  if (!start || !end) return null
  return `加班 ${start}–${end}`
}

function monthLabel({ year, month }) {
  return `${year}年${month}月`
}

function emptyDraft() {
  return {
    proposed_start_time: '',
    proposed_end_time: '',
    proposed_ot_start_time: '',
    proposed_ot_end_time: '',
    note: '',
  }
}

function draftFromDay(day) {
  return {
    proposed_start_time: day.start_time || '',
    proposed_end_time: day.end_time || '',
    proposed_ot_start_time: day.ot_start_time || '',
    proposed_ot_end_time: day.ot_end_time || '',
    note: '',
  }
}

function validateDraft(draft) {
  if (!draft.proposed_start_time || !draft.proposed_end_time) {
    return '主时段需填写开始与结束时间'
  }
  const hasOtStart = !!draft.proposed_ot_start_time
  const hasOtEnd = !!draft.proposed_ot_end_time
  if (hasOtStart !== hasOtEnd) {
    return '加班需同时填写开始与结束，或都留空'
  }
  return null
}

export default function EmployeeReviewPage() {
  const defaultYm = useMemo(() => defaultReviewYearMonth(), [])
  const allowedMonths = useMemo(() => allowedReviewMonths(), [])

  const [nameInput, setNameInput] = useState('')
  const [enteredName, setEnteredName] = useState(null)
  const [viewYear, setViewYear] = useState(defaultYm.year)
  const [viewMonth, setViewMonth] = useState(defaultYm.month)
  const [monthData, setMonthData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [draftDisputes, setDraftDisputes] = useState(() => new Map())
  const [expandedDays, setExpandedDays] = useState(() => new Set())
  const fetchSeqRef = useRef(0)

  const disputesByDate = useMemo(() => {
    const map = new Map()
    for (const dispute of monthData?.disputes || []) {
      map.set(dispute.work_date, dispute)
    }
    return map
  }, [monthData])

  const fetchMonth = useCallback(
    async (name, year, month) => {
      const seq = ++fetchSeqRef.current
      try {
        setLoading(true)
        setError(null)
        setMonthData(null)
        setDraftDisputes(new Map())
        setExpandedDays(new Set())
        const data = await api.get(
          `/api/reviews/employee-month?name=${encodeURIComponent(name)}&year=${year}&month=${month}`,
        )
        if (seq !== fetchSeqRef.current) return null
        setMonthData(data)
        return data
      } catch (err) {
        if (seq !== fetchSeqRef.current) return null
        setMonthData(null)
        setError(err.message || '加载核审数据失败')
        throw err
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!enteredName) return
    if (
      monthData?.year === viewYear &&
      monthData?.month === viewMonth &&
      monthData?.name === enteredName
    ) {
      return
    }
    fetchMonth(enteredName, viewYear, viewMonth).catch(() => {})
  }, [enteredName, viewYear, viewMonth, fetchMonth, monthData])

  async function handleEnter() {
    const trimmed = nameInput.trim()
    if (!trimmed) {
      setError('请输入姓名')
      return
    }
    setSubmitError(null)
    try {
      const data = await fetchMonth(trimmed, defaultYm.year, defaultYm.month)
      if (!data) return
      setViewYear(defaultYm.year)
      setViewMonth(defaultYm.month)
      setEnteredName(data.name)
      setNameInput(data.name)
    } catch {
      // Stay on name gate; fetchMonth already set error.
    }
  }

  function handleChangeName() {
    fetchSeqRef.current += 1
    setEnteredName(null)
    setMonthData(null)
    setDraftDisputes(new Map())
    setExpandedDays(new Set())
    setError(null)
    setSubmitError(null)
    setLoading(false)
    setNameInput('')
  }

  function handleMonthSelect(event) {
    const [year, month] = event.target.value.split('-').map(Number)
    setViewYear(year)
    setViewMonth(month)
    setSubmitError(null)
  }

  function toggleDisputeForm(dateKey) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) {
        next.delete(dateKey)
      } else {
        next.add(dateKey)
        setDraftDisputes((drafts) => {
          if (drafts.has(dateKey)) return drafts
          const day = monthData?.days?.find((d) => d.date === dateKey)
          const nextDrafts = new Map(drafts)
          nextDrafts.set(dateKey, day ? draftFromDay(day) : emptyDraft())
          return nextDrafts
        })
      }
      return next
    })
    setSubmitError(null)
  }

  function updateDraft(dateKey, patch) {
    setDraftDisputes((prev) => {
      const next = new Map(prev)
      const current = next.get(dateKey) || emptyDraft()
      next.set(dateKey, { ...current, ...patch })
      return next
    })
    setSubmitError(null)
  }

  function removeDraft(dateKey) {
    setDraftDisputes((prev) => {
      const next = new Map(prev)
      next.delete(dateKey)
      return next
    })
    setExpandedDays((prev) => {
      const next = new Set(prev)
      next.delete(dateKey)
      return next
    })
    setSubmitError(null)
  }

  async function handleSubmit() {
    if (!enteredName || !monthData || monthData.reviewed || submitting) return

    const entries = [...draftDisputes.entries()]
    for (const [dateKey, draft] of entries) {
      const err = validateDraft(draft)
      if (err) {
        setSubmitError(`${formatDisplayDate(dateKey)}：${err}`)
        return
      }
    }

    const confirmed = window.confirm(
      '确认提交本月核审？提交后不可再修改本月记录与异议。',
    )
    if (!confirmed) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      await api.post('/api/reviews/submit', {
        name: enteredName,
        year: viewYear,
        month: viewMonth,
        disputes: entries.map(([work_date, draft]) => ({
          work_date,
          proposed_start_time: draft.proposed_start_time,
          proposed_end_time: draft.proposed_end_time,
          proposed_ot_start_time: draft.proposed_ot_start_time || null,
          proposed_ot_end_time: draft.proposed_ot_end_time || null,
          note: draft.note?.trim() || null,
        })),
      })
      await fetchMonth(enteredName, viewYear, viewMonth)
    } catch (err) {
      setSubmitError(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMonthKey = `${viewYear}-${viewMonth}`

  return (
    <div className="review-page">
      <header className="review-page__header">
        <div>
          <h1 className="review-page__title">月度排班核对</h1>
          <p className="review-page__subtitle">输入花名册姓名（或导出短名）查看近月排班；有误可提异议后确认核审</p>
        </div>
      </header>

      {!enteredName ? (
        <section className="review-page__gate">
          <label className="review-page__gate-label">
            姓名
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleEnter()
              }}
              placeholder="花名册姓名或导出短名"
              autoComplete="name"
            />
          </label>
          <button type="button" className="btn btn--primary" onClick={handleEnter} disabled={loading}>
            {loading ? '加载中…' : '查看'}
          </button>
          {error ? <p className="review-page__error">{error}</p> : null}
        </section>
      ) : (
        <>
          <div className="review-page__toolbar">
            <p className="review-page__employee">
              <span className="review-page__employee-name">{enteredName}</span>
              {monthData?.reviewed ? (
                <span className="badge badge--on-duty">已核审</span>
              ) : (
                <span className="badge badge--trial">待核审</span>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm review-page__change-name"
                onClick={handleChangeName}
              >
                更换姓名
              </button>
            </p>
            <label className="review-page__month-select">
              月份
              <select
                value={selectedMonthKey}
                onChange={handleMonthSelect}
                disabled={loading}
              >
                {allowedMonths.map((ym) => (
                  <option key={`${ym.year}-${ym.month}`} value={`${ym.year}-${ym.month}`}>
                    {monthLabel(ym)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="review-page__banner">{error}</p> : null}
          {loading && !monthData ? (
            <p className="review-page__status">加载中…</p>
          ) : null}

          {monthData &&
          monthData.year === viewYear &&
          monthData.month === viewMonth &&
          monthData.name === enteredName ? (
            <>
              {(() => {
                const assigned = monthData.days.filter((d) => d.status !== 'unassigned').length
                if (assigned > 0) {
                  return (
                    <p className="review-page__hint" role="status">
                      已找到 {monthData.name} · {monthLabel({ year: monthData.year, month: monthData.month })} ·
                      有排班 {assigned} 天
                    </p>
                  )
                }
                return (
                  <p className="review-page__hint review-page__hint--warn" role="status">
                    已找到人员「{monthData.name}」，但 {monthLabel({ year: monthData.year, month: monthData.month })}{' '}
                    暂无排班记录（整月未安排）。可切换月份，或对未安排日提出异议补登时段。
                  </p>
                )
              })()}
              <div className="review-page__days">
                {monthData.days.map((day) => {
                  const dispute = disputesByDate.get(day.date)
                  const isExpanded = expandedDays.has(day.date)
                  const draft = draftDisputes.get(day.date)
                  const otText = formatOtRange(day.ot_start_time, day.ot_end_time)

                  return (
                    <article key={day.date} className="review-day">
                      <div className="review-day__head">
                        <h2 className="review-day__date">{formatDisplayDate(day.date)}</h2>
                        <span className={`badge badge--${day.status === 'rest' ? 'rest-status' : day.status === 'leave' ? 'leave' : day.status === 'support' ? 'support' : day.status === 'unassigned' ? 'external' : 'on-duty'}`}>
                          {STATUS_LABEL[day.status] || day.status}
                        </span>
                      </div>

                      <div className="review-day__original">
                        <span className="review-day__times">
                          {formatTimeRange(day.start_time, day.end_time)}
                        </span>
                        {otText ? <span className="review-day__ot">{otText}</span> : null}
                      </div>

                      {monthData.reviewed && dispute ? (
                        <div className="dispute-card dispute-card--readonly">
                          <div className="dispute-card__head">
                            <span className="dispute-card__title">已提交异议</span>
                            <span className={`dispute-card__status dispute-card__status--${dispute.status}`}>
                              {DISPUTE_STATUS_LABEL[dispute.status] || dispute.status}
                            </span>
                          </div>
                          <p className="dispute-card__proposed">
                            建议 {formatTimeRange(dispute.proposed_start_time, dispute.proposed_end_time)}
                            {dispute.proposed_ot_start_time && dispute.proposed_ot_end_time
                              ? ` · 加班 ${dispute.proposed_ot_start_time}–${dispute.proposed_ot_end_time}`
                              : dispute.proposed_ot_start_time || dispute.proposed_ot_end_time
                                ? ''
                                : ' · 无加班'}
                          </p>
                          {dispute.note ? (
                            <p className="dispute-card__note">备注：{dispute.note}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {!monthData.reviewed ? (
                        <>
                          {!isExpanded ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm review-day__dispute-btn"
                              onClick={() => toggleDisputeForm(day.date)}
                            >
                              提出异议
                            </button>
                          ) : (
                            <div className="dispute-card">
                              <div className="dispute-card__head">
                                <span className="dispute-card__title">建议时段</span>
                                <button
                                  type="button"
                                  className="day-panel__link"
                                  onClick={() => removeDraft(day.date)}
                                >
                                  取消
                                </button>
                              </div>
                              <div className="dispute-card__times">
                                <label className="dispute-card__field">
                                  开始
                                  <TimeField
                                    value={draft?.proposed_start_time}
                                    onChange={(value) =>
                                      updateDraft(day.date, { proposed_start_time: value })
                                    }
                                    aria-label="建议开始时间"
                                    required
                                  />
                                </label>
                                <label className="dispute-card__field">
                                  结束
                                  <TimeField
                                    value={draft?.proposed_end_time}
                                    onChange={(value) =>
                                      updateDraft(day.date, { proposed_end_time: value })
                                    }
                                    aria-label="建议结束时间"
                                    required
                                  />
                                </label>
                              </div>
                              <div className="dispute-card__times">
                                <label className="dispute-card__field">
                                  加班开始
                                  <TimeField
                                    value={draft?.proposed_ot_start_time}
                                    onChange={(value) =>
                                      updateDraft(day.date, { proposed_ot_start_time: value })
                                    }
                                    aria-label="建议加班开始"
                                  />
                                </label>
                                <label className="dispute-card__field">
                                  加班结束
                                  <TimeField
                                    value={draft?.proposed_ot_end_time}
                                    onChange={(value) =>
                                      updateDraft(day.date, { proposed_ot_end_time: value })
                                    }
                                    aria-label="建议加班结束"
                                  />
                                </label>
                              </div>
                              <label className="dispute-card__field dispute-card__field--note">
                                备注（可选）
                                <textarea
                                  rows={2}
                                  value={draft?.note || ''}
                                  onChange={(event) =>
                                    updateDraft(day.date, { note: event.target.value })
                                  }
                                  placeholder="说明异议原因"
                                />
                              </label>
                            </div>
                          )}
                        </>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              {!monthData.reviewed ? (
                <footer className="review-page__footer">
                  {submitError ? <p className="review-page__error">{submitError}</p> : null}
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleSubmit}
                    disabled={submitting || loading}
                  >
                    {submitting ? '提交中…' : '确认本月核审'}
                  </button>
                </footer>
              ) : (
                <p className="review-page__locked">本月已核审，无法再修改。</p>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
