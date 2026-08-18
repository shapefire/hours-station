import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/client.js'
import { notifyNotePresetsChanged, subscribeNotePresets } from '../settings/events.js'

export function splitPresetText(text) {
  const items = []
  const seen = new Set()
  for (const part of String(text || '').split(/[\s、,，；;]+/)) {
    const value = part.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    items.push(value)
  }
  return items
}

export default function NotePresetsPanel() {
  const titleId = useId()
  const closeRef = useRef(null)
  const [presets, setPresets] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [editorError, setEditorError] = useState(null)

  function loadPresets() {
    setLoading(true)
    setError(null)
    return api
      .get('/api/settings/note-presets')
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        setPresets(list)
        const ids = new Set(list.map((row) => row.id))
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))))
      })
      .catch(() => {
        setPresets([])
        setError('加载失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadPresets()
    return subscribeNotePresets(() => {
      loadPresets()
    })
  }, [])

  function closeEditor() {
    if (busy) return
    setEditorOpen(false)
    setImportText('')
    setEditorError(null)
  }

  function openEditor() {
    setEditorOpen(true)
    setImportText('')
    setEditorError(null)
  }

  useEffect(() => {
    if (!editorOpen) return undefined
    closeRef.current?.focus()
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (!busy) {
        setEditorOpen(false)
        setImportText('')
        setEditorError(null)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [editorOpen, busy])

  async function handleSubmit(event) {
    event.preventDefault()
    const items = splitPresetText(importText)
    if (items.length === 0 || busy) return
    setBusy(true)
    setEditorError(null)
    setError(null)
    setStatus(null)
    try {
      const existing = new Set(presets.map((row) => row.text))
      let created = 0
      let skippedExisting = 0
      let skippedInvalid = 0
      for (const text of items) {
        if (text.length > 200) {
          skippedInvalid += 1
          continue
        }
        if (existing.has(text)) {
          skippedExisting += 1
          continue
        }
        await api.post('/api/settings/note-presets', { text })
        existing.add(text)
        created += 1
      }
      notifyNotePresetsChanged()
      await loadPresets()
      const parts = []
      if (created) parts.push(`新增 ${created}`)
      if (skippedExisting) parts.push(`已存在跳过 ${skippedExisting}`)
      if (skippedInvalid) parts.push(`无效 ${skippedInvalid}`)
      setStatus(
        items.length === 1 && skippedExisting === 1 ? '已存在' : parts.join('、') || '已添加',
      )
      setEditorOpen(false)
      setImportText('')
    } catch (err) {
      setEditorError(err?.message || '添加失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function removePresets(rows) {
    if (rows.length === 0 || busy) return
    const ok = window.confirm(
      rows.length === 1
        ? `删除备注预设「${rows[0].text}」？`
        : `删除选中的 ${rows.length} 条备注预设？`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      for (const row of rows) {
        await api.delete(`/api/settings/note-presets/${row.id}`)
      }
      notifyNotePresetsChanged()
      await loadPresets()
      setStatus(rows.length === 1 ? `已删除「${rows[0].text}」` : `已删除 ${rows.length} 条`)
    } catch (err) {
      setError(err?.message || '删除失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === presets.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(presets.map((row) => row.id)))
  }

  const previewItems = splitPresetText(importText)
  const importable = previewItems.length > 0
  const allSelected = presets.length > 0 && selected.size === presets.length
  const selectedRows = presets.filter((row) => selected.has(row.id))

  return (
    <section className="settings-modal__section settings-modal__section--roster" aria-label="备注预设">
      <div className="settings-modal__section-head">
        <h3 className="settings-modal__section-title">备注预设</h3>
        <div className="settings-modal__section-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy || selectedRows.length === 0}
            onClick={() => removePresets(selectedRows)}
          >
            删除{selectedRows.length ? `（${selectedRows.length}）` : ''}
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={openEditor}>
            添加 / 导入
          </button>
        </div>
      </div>

      {loading ? <p className="settings-modal__status">加载中…</p> : null}
      {error ? <p className="settings-modal__error">{error}</p> : null}
      {status ? <p className="settings-modal__status">{status}</p> : null}

      {!loading && presets.length === 0 ? (
        <p className="settings-modal__status">暂无预设，点击「添加 / 导入」加入</p>
      ) : null}

      {presets.length > 0 ? (
        <label className="settings-modal__select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy} />
          全选
        </label>
      ) : null}

      <ul className="settings-modal__list settings-modal__list--roster">
        {presets.map((preset) => (
          <li key={preset.id} className="settings-modal__item">
            <label className="settings-modal__item-check">
              <input
                type="checkbox"
                checked={selected.has(preset.id)}
                disabled={busy}
                onChange={() => toggleSelected(preset.id)}
                aria-label={`选择 ${preset.text}`}
              />
              <span className="settings-modal__item-text">{preset.text}</span>
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => removePresets([preset])}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      {editorOpen
        ? createPortal(
            <div
              className="modal-backdrop roster-editor-backdrop"
              role="presentation"
              onClick={closeEditor}
            >
              <div
                className="modal roster-editor-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="modal__header">
                  <h2 id={titleId} className="modal__title">
                    添加 / 导入预设
                  </h2>
                  <div className="modal__header-actions">
                    <button
                      ref={closeRef}
                      type="button"
                      className="btn btn--ghost btn--icon"
                      onClick={closeEditor}
                      aria-label="关闭"
                      disabled={busy}
                    >
                      ×
                    </button>
                  </div>
                </header>
                <form className="roster-editor-modal__body" onSubmit={handleSubmit}>
                  <p className="settings-modal__hint">
                    可输入一条预设，或粘贴多条（空格、换行、顿号、中英文逗号、分号均可）。
                  </p>
                  {editorError ? <p className="settings-modal__error">{editorError}</p> : null}
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    disabled={busy}
                    rows={6}
                    autoFocus
                    placeholder="用空格、换行、顿号或逗号分隔预设"
                    aria-label="备注预设"
                  />
                  {previewItems.length > 0 ? (
                    <p className="roster-editor-modal__preview">
                      识别到 {previewItems.length} 条：{previewItems.join('、')}
                    </p>
                  ) : null}
                  <footer className="roster-editor-modal__footer">
                    <button type="button" className="btn btn--ghost" onClick={closeEditor} disabled={busy}>
                      取消
                    </button>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={busy || !importable}
                    >
                      确定
                    </button>
                  </footer>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}
