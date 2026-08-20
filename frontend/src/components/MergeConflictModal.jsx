import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/client.js'

const STATUS_LABEL = {
  on_duty: '在岗',
  rest: '休息',
  leave: '请假',
  support: '支援',
}

function entrySummary(entry) {
  if (!entry) return '—'
  const parts = [STATUS_LABEL[entry.status] || entry.status]
  if (entry.start_time && entry.end_time) {
    parts.push(`${entry.start_time}–${entry.end_time}`)
  }
  if (entry.ot_start_time && entry.ot_end_time) {
    parts.push(`加班 ${entry.ot_start_time}–${entry.ot_end_time}`)
  }
  const flags = []
  if (entry.is_external) flags.push('外店')
  if (entry.is_trial) flags.push('试工')
  if (entry.skip_deduction) flags.push('免扣')
  if (flags.length) parts.push(flags.join('/'))
  if (entry.note) parts.push(entry.note)
  return parts.join(' · ')
}

function formatDateLabel(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
}

function defaultFieldKeep(sourceValue, targetValue) {
  const s = (sourceValue || '').trim()
  const t = (targetValue || '').trim()
  if (s && !t) return 'source'
  if (t && !s) return 'target'
  if (s === t) return 'target'
  return 'target'
}

function FieldChoice({ label, sourceValue, targetValue, value, onChange, disabled }) {
  const s = (sourceValue || '').trim()
  const t = (targetValue || '').trim()
  if (s === t) return null
  return (
    <fieldset className="merge-field-choice" disabled={disabled}>
      <legend>{label}</legend>
      <label>
        <input type="radio" name={label} checked={value === 'source'} onChange={() => onChange('source')} />
        {s || '（空）'}
      </label>
      <label>
        <input type="radio" name={label} checked={value === 'target'} onChange={() => onChange('target')} />
        {t || '（空）'}
      </label>
      <label>
        <input type="radio" name={label} checked={value === 'empty'} onChange={() => onChange('empty')} />
        留空
      </label>
    </fieldset>
  )
}

export default function MergeConflictModal({
  sourceId,
  sourceName,
  targetId,
  targetName,
  busy,
  onCancel,
  onComplete,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [resolutions, setResolutions] = useState({})
  const [exportNameKeep, setExportNameKeep] = useState('target')
  const [positionKeep, setPositionKeep] = useState('target')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get(`/api/employees/merge-preview?source_id=${sourceId}&target_id=${targetId}`)
      .then((body) => {
        if (cancelled) return
        setPreview(body)
        setExportNameKeep(defaultFieldKeep(body.source_export_name, body.target_export_name))
        setPositionKeep(defaultFieldKeep(body.source_position, body.target_position))
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || '加载合并预览失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sourceId, targetId])

  const exportFieldVisible = useMemo(() => {
    if (!preview) return false
    return (preview.source_export_name || '').trim() !== (preview.target_export_name || '').trim()
  }, [preview])

  const positionFieldVisible = useMemo(() => {
    if (!preview) return false
    return (preview.source_position || '').trim() !== (preview.target_position || '').trim()
  }, [preview])

  const allConflictsResolved =
    !preview ||
    preview.conflicts.every((row) => resolutions[row.work_date] === 'source' || resolutions[row.work_date] === 'target')

  const canSubmit = !loading && !error && preview && allConflictsResolved && !submitting && !busy

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/api/employees/merge', {
        source_id: sourceId,
        target_id: targetId,
        resolutions: preview.conflicts.map((row) => ({
          work_date: row.work_date,
          keep: resolutions[row.work_date],
        })),
        export_name_keep: exportNameKeep,
        position_keep: positionKeep,
      })
      onComplete()
    } catch (err) {
      setError(err?.message || '合并失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop roster-editor-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal roster-editor-modal roster-merge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-conflict-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="merge-conflict-title" className="modal__title">
            合并「{sourceName}」→「{targetName}」
          </h2>
        </header>
        <div className="roster-editor-modal__body">
          {loading ? <p className="settings-modal__status">加载预览…</p> : null}
          {error ? <p className="settings-modal__error">{error}</p> : null}
          {preview ? (
            <>
              <p className="settings-modal__hint">
                将迁移 {preview.movable_count} 条无冲突排班
                {preview.conflicts.length
                  ? `；${preview.conflicts.length} 个日期需选择保留哪条记录`
                  : ''}
                。
              </p>
              {exportFieldVisible ? (
                <FieldChoice
                  label="导出姓名"
                  sourceValue={preview.source_export_name}
                  targetValue={preview.target_export_name}
                  value={exportNameKeep}
                  onChange={setExportNameKeep}
                  disabled={submitting || busy}
                />
              ) : null}
              {positionFieldVisible ? (
                <FieldChoice
                  label="岗位"
                  sourceValue={preview.source_position}
                  targetValue={preview.target_position}
                  value={positionKeep}
                  onChange={setPositionKeep}
                  disabled={submitting || busy}
                />
              ) : null}
              {preview.conflicts.length > 0 ? (
                <table className="merge-conflict-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>{sourceName}</th>
                      <th>{targetName}</th>
                      <th>保留</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.conflicts.map((row) => (
                      <tr key={row.work_date}>
                        <td>{formatDateLabel(row.work_date)}</td>
                        <td>{entrySummary(row.source_entry)}</td>
                        <td>{entrySummary(row.target_entry)}</td>
                        <td>
                          <label>
                            <input
                              type="radio"
                              name={`keep-${row.work_date}`}
                              checked={resolutions[row.work_date] === 'source'}
                              onChange={() =>
                                setResolutions((prev) => ({ ...prev, [row.work_date]: 'source' }))
                              }
                            />
                            {sourceName}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`keep-${row.work_date}`}
                              checked={resolutions[row.work_date] === 'target'}
                              onChange={() =>
                                setResolutions((prev) => ({ ...prev, [row.work_date]: 'target' }))
                              }
                            />
                            {targetName}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className="roster-editor-modal__footer">
          <button type="button" className="btn btn--ghost" disabled={submitting || busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--primary" disabled={!canSubmit} onClick={handleSubmit}>
            确认合并
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
