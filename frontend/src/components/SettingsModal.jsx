import { useEffect, useId, useRef, useState } from 'react'
import api from '../api/client.js'
import { notifyNotePresetsChanged, subscribeNotePresets } from '../settings/events.js'

const SECTIONS = [{ id: 'note-presets', label: '备注预设' }]

export default function SettingsModal({ open, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [section, setSection] = useState('note-presets')
  const [presets, setPresets] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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
          </div>
        </div>
      </div>
    </div>
  )
}
