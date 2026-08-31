import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client.js'
import Metric from '../components/Metric.jsx'

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

const FILTER_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'confirmed', label: '已确认' },
  { value: 'rejected', label: '无效' },
]

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

function statusBadgeClass(status) {
  if (status === 'rest') return 'rest-status'
  if (status === 'leave') return 'leave'
  if (status === 'support') return 'support'
  if (status === 'unassigned') return 'external'
  return 'on-duty'
}

function describeTimes(start, end, otStart, otEnd) {
  const main = formatTimeRange(start, end)
  const ot = formatOtRange(otStart, otEnd)
  if (ot) return `${main} · ${ot}`
  if (otStart || otEnd) return main
  return `${main} · 无加班`
}

export default function AdminDisputesPage() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionErrors, setActionErrors] = useState(() => new Map())
  const [actingId, setActingId] = useState(null)
  const fetchSeqRef = useRef(0)

  const fetchDisputes = useCallback(async (status) => {
    const seq = ++fetchSeqRef.current
    try {
      setLoading(true)
      setError(null)
      const data = await api.get(`/api/reviews/disputes?status=${encodeURIComponent(status)}`)
      if (seq !== fetchSeqRef.current) return
      setDisputes(Array.isArray(data) ? data : [])
      setActionErrors(new Map())
    } catch (err) {
      if (seq !== fetchSeqRef.current) return
      setDisputes([])
      setError(err.message || '加载异议列表失败')
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchDisputes(statusFilter)
  }, [statusFilter, fetchDisputes])

  async function handleConfirm(dispute) {
    if (actingId) return
    setActingId(dispute.id)
    setActionErrors((prev) => {
      const next = new Map(prev)
      next.delete(dispute.id)
      return next
    })
    try {
      const updated = await api.post(`/api/reviews/disputes/${dispute.id}/confirm`)
      if (statusFilter === 'pending') {
        setDisputes((prev) => prev.filter((d) => d.id !== dispute.id))
      } else {
        setDisputes((prev) => prev.map((d) => (d.id === dispute.id ? updated : d)))
      }
    } catch (err) {
      setActionErrors((prev) => {
        const next = new Map(prev)
        next.set(dispute.id, err.message || '确认失败')
        return next
      })
    } finally {
      setActingId(null)
    }
  }

  async function handleReject(dispute) {
    if (actingId) return
    setActingId(dispute.id)
    setActionErrors((prev) => {
      const next = new Map(prev)
      next.delete(dispute.id)
      return next
    })
    try {
      const updated = await api.post(`/api/reviews/disputes/${dispute.id}/reject`)
      if (statusFilter === 'pending') {
        setDisputes((prev) => prev.filter((d) => d.id !== dispute.id))
      } else {
        setDisputes((prev) => prev.map((d) => (d.id === dispute.id ? updated : d)))
      }
    } catch (err) {
      setActionErrors((prev) => {
        const next = new Map(prev)
        next.set(dispute.id, err.message || '操作失败')
        return next
      })
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="review-page review-page--admin">
      <header className="review-page__header">
        <div>
          <h1 className="review-page__title">异议审核</h1>
          <p className="review-page__subtitle">逐条确认或驳回员工提交的工时异议</p>
        </div>
      </header>

      <div className="review-page__toolbar review-page__toolbar--admin">
        <div className="review-page__filter" role="tablist" aria-label="异议状态筛选">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === option.value}
              className={`review-page__filter-btn${statusFilter === option.value ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(option.value)}
              disabled={loading && statusFilter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!loading ? (
          <p className="review-page__count">
            共 <Metric value={disputes.length} unit="条" chip />
          </p>
        ) : null}
      </div>

      {error ? <p className="review-page__banner">{error}</p> : null}

      {loading ? (
        <p className="review-page__status">加载中…</p>
      ) : disputes.length === 0 && !error ? (
        <p className="review-page__empty">
          {statusFilter === 'pending' ? '暂无待审核异议' : '该状态下暂无记录'}
        </p>
      ) : (
        <div className="review-page__days">
          {disputes.map((dispute) => {
            const actionError = actionErrors.get(dispute.id)
            const isPending = dispute.status === 'pending'
            const isActing = actingId === dispute.id

            return (
              <article key={dispute.id} className="review-day dispute-card dispute-card--admin">
                <div className="review-day__head">
                  <div className="dispute-card__meta">
                    <h2 className="review-day__date">{dispute.employee_name}</h2>
                    <span className="dispute-card__date">{formatDisplayDate(dispute.work_date)}</span>
                  </div>
                  <span
                    className={`dispute-card__status dispute-card__status--${dispute.status}`}
                  >
                    {DISPUTE_STATUS_LABEL[dispute.status] || dispute.status}
                  </span>
                </div>

                <div className="dispute-card__compare">
                  <div className="dispute-card__block">
                    <span className="dispute-card__block-label">原安排</span>
                    <span
                      className={`badge badge--${statusBadgeClass(dispute.original_status)}`}
                    >
                      {STATUS_LABEL[dispute.original_status] || dispute.original_status}
                    </span>
                    <p className="dispute-card__block-times">
                      {describeTimes(
                        dispute.original_start_time,
                        dispute.original_end_time,
                        dispute.original_ot_start_time,
                        dispute.original_ot_end_time,
                      )}
                    </p>
                  </div>
                  <div className="dispute-card__block dispute-card__block--proposed">
                    <span className="dispute-card__block-label">建议</span>
                    <p className="dispute-card__block-times">
                      {describeTimes(
                        dispute.proposed_start_time,
                        dispute.proposed_end_time,
                        dispute.proposed_ot_start_time,
                        dispute.proposed_ot_end_time,
                      )}
                    </p>
                  </div>
                </div>

                {dispute.note ? (
                  <p className="dispute-card__note">备注：{dispute.note}</p>
                ) : null}

                {actionError ? (
                  <p className="review-page__error dispute-card__action-error">{actionError}</p>
                ) : null}

                {isPending ? (
                  <div className="dispute-card__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => handleConfirm(dispute)}
                      disabled={!!actingId}
                    >
                      {isActing ? '处理中…' : '确认'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--danger"
                      onClick={() => handleReject(dispute)}
                      disabled={!!actingId}
                    >
                      无效
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
