import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/client.js'
import { notifyHoursRuleChanged } from '../settings/events.js'
import { setHoursRuleLocal } from '../settings/hoursRule.js'
import RosterSettingsPanel from './RosterSettingsPanel.jsx'
import NotePresetsPanel from './NotePresetsPanel.jsx'

const SECTIONS = [
  { id: 'note-presets', label: '备注预设' },
  { id: 'roster', label: '花名册' },
  { id: 'hours-rule', label: '工时计算' },
]

export default function SettingsModal({ open, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [section, setSection] = useState('note-presets')
  const [minHours, setMinHours] = useState('6.0')
  const [deductHours, setDeductHours] = useState('0.5')
  const [hoursLoading, setHoursLoading] = useState(false)
  const [hoursBusy, setHoursBusy] = useState(false)
  const [hoursError, setHoursError] = useState(null)
  const [hoursSaved, setHoursSaved] = useState(false)

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
    if (!open || section !== 'hours-rule') return undefined
    loadHoursRuleForm()
  }, [open, section])

  if (!open) return null

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

  return createPortal(
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
          <nav
            className="settings-modal__nav settings-modal__tabs"
            aria-label="设置分区"
          >
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
            {section === 'note-presets' ? <NotePresetsPanel /> : null}

            {section === 'roster' ? <RosterSettingsPanel /> : null}

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
    </div>,
    document.body,
  )
}
