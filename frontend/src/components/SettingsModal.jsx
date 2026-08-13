import { useEffect, useId, useRef, useState } from 'react'
import api from '../api/client.js'
import { notifyHoursRuleChanged, notifyNotePresetsChanged, subscribeNotePresets } from '../settings/events.js'
import { setHoursRuleLocal } from '../settings/hoursRule.js'

const SECTIONS = [
  { id: 'note-presets', label: '备注预设' },
  { id: 'hours-rule', label: '工时计算' },
]

export default function SettingsModal({ open, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [section, setSection] = useState('note-presets')
  const [presets, setPresets] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [minHours, setMinHours] = useState('6.0')
  const [deductHours, setDeductHours] = useState('0.5')
  const [hoursLoading, setHoursLoading] = useState(false)
  const [hoursBusy, setHoursBusy] = useState(false)
  const [hoursError, setHoursError] = useState(null)
  const [hoursSaved, setHoursSaved] = useState(false)

  function loadPresets() {
    setLoading(true)
    setError(null)
    return api
      .get('/api/settings/note-presets')
      .then((rows) => {
        setPresets(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        setPresets([])
        setError('加载失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }

  function loadHoursRuleForm() {
    setHoursLoading(true)
    setHoursError(null)
    return api
      .get('/api/settings/hours-rule')
      .then((body) => {
        const tier = body?.tiers?.[0] || { min_hours: '6.0', deduct_hours: '0.5' }
        setMinHours(String(tier.min_hours))
        setDeductHours(String(tier.deduct_hours))
        setHoursRuleLocal(body)
      })
      .catch(() => setHoursError('加载失败，请稍后重试'))
      .finally(() => setHoursLoading(false))
  }

  useEffect(() => {
    if (!open) return undefined
    closeRef.current?.focus()
    loadPresets()
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    return subscribeNotePresets(() => {
      loadPresets()
    })
  }, [open])

  useEffect(() => {
    if (!open || section !== 'hours-rule') return undefined
    loadHoursRuleForm()
  }, [open, section])

  if (!open) return null

  async function handleAdd(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/settings/note-presets', { text })
      setDraft('')
      notifyNotePresetsChanged()
      await loadPresets()
    } catch {
      setError('添加失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(preset) {
    const ok = window.confirm(`删除备注预设「${preset.text}」？`)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/api/settings/note-presets/${preset.id}`)
      notifyNotePresetsChanged()
      await loadPresets()
    } catch {
      setError('删除失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveHoursRule(event) {
    event.preventDefault()
    if (hoursBusy) return
    setHoursBusy(true)
    setHoursError(null)
    setHoursSaved(false)
    try {
      const body = await api.put('/api/settings/hours-rule', {
        tiers: [{ min_hours: minHours.trim(), deduct_hours: deductHours.trim() }],
      })
      setHoursRuleLocal(body)
      const tier = body.tiers[0]
      setMinHours(String(tier.min_hours))
      setDeductHours(String(tier.deduct_hours))
      setHoursSaved(true)
    } catch (err) {
      const detail = err?.message
      setHoursError(typeof detail === 'string' ? detail : '保存失败，请稍后重试')
    } finally {
      setHoursBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header settings-modal__header">
          <h2 id={titleId} className="modal__title">
            设置
          </h2>
          <div className="modal__header-actions">
            <button
              ref={closeRef}
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={onClose}
              aria-label="关闭设置"
            >
              ×
            </button>
          </div>
        </header>

        <div className="settings-modal__layout">
          <nav className="settings-modal__nav" aria-label="设置分区">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  section === item.id
                    ? 'settings-modal__nav-btn is-active'
                    : 'settings-modal__nav-btn'
                }
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-modal__content">
            {section === 'note-presets' ? (
              <section className="settings-modal__section" aria-label="备注预设">
                <h3 className="settings-modal__section-title">备注预设</h3>

                {loading ? <p className="settings-modal__status">加载中…</p> : null}
                {error ? <p className="settings-modal__error">{error}</p> : null}

                {!loading && !error && presets.length === 0 ? (
                  <p className="settings-modal__status">暂无预设，在下方添加一条</p>
                ) : null}

                <ul className="settings-modal__list">
                  {presets.map((preset) => (
                    <li key={preset.id} className="settings-modal__item">
                      <span className="settings-modal__item-text">{preset.text}</span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => handleRemove(preset)}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>

                <form className="settings-modal__add" onSubmit={handleAdd}>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={200}
                    disabled={busy}
                    placeholder="输入新预设"
                    aria-label="新备注预设"
                  />
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    disabled={busy || !draft.trim()}
                  >
                    添加
                  </button>
                </form>
              </section>
            ) : null}

            {section === 'hours-rule' ? (
              <section className="settings-modal__section" aria-label="工时计算">
                <h3 className="settings-modal__section-title">工时计算</h3>
                <p className="settings-modal__hint">
                  毛工时达到或超过该阈值时扣减；扣减为 0 表示不扣。
                </p>
                {hoursLoading ? <p className="settings-modal__status">加载中…</p> : null}
                {hoursError ? <p className="settings-modal__error">{hoursError}</p> : null}
                {hoursSaved ? <p className="settings-modal__status">已保存</p> : null}
                <form className="settings-modal__hours-form" onSubmit={handleSaveHoursRule}>
                  <label className="settings-modal__field">
                    <span>满多少小时</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0.1"
                      max="24"
                      value={minHours}
                      disabled={hoursBusy || hoursLoading}
                      onChange={(e) => {
                        setHoursSaved(false)
                        setMinHours(e.target.value)
                      }}
                      required
                    />
                  </label>
                  <label className="settings-modal__field">
                    <span>扣减小时</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={deductHours}
                      disabled={hoursBusy || hoursLoading}
                      onChange={(e) => {
                        setHoursSaved(false)
                        setDeductHours(e.target.value)
                      }}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn--primary btn--sm"
                    disabled={hoursBusy || hoursLoading}
                  >
                    保存
                  </button>
                </form>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
