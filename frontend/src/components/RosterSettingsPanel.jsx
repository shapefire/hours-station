import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../api/client.js'
import { notifyRosterChanged } from '../settings/events.js'

export function splitRosterText(text) {
  const names = []
  const seen = new Set()
  for (const part of String(text || '').split(/[\s、,，；;]+/)) {
    const name = part.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

const REMOVE_CONFIRM_HINT = '下拉列表中不再显示；已登记的历史工时会保留。'

export default function RosterSettingsPanel() {
  const titleId = useId()
  const closeRef = useRef(null)
  const [roster, setRoster] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [editorError, setEditorError] = useState(null)

  function loadRoster() {
    setLoading(true)
    setError(null)
    return api
      .get('/api/employees')
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        setRoster(list)
        const ids = new Set(list.map((emp) => emp.id))
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))))
      })
      .catch(() => {
        setRoster([])
        setError('加载失败，请稍后重试')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadRoster()
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
    const names = splitRosterText(importText)
    if (names.length === 0 || busy) return
    setBusy(true)
    setEditorError(null)
    setError(null)
    setStatus(null)
    try {
      const body = await api.post('/api/employees/import', { text: names.join('\n') })
      notifyRosterChanged()
      await loadRoster()
      const parts = []
      if (body.created) parts.push(`新增 ${body.created}`)
      if (body.reactivated) parts.push(`复活 ${body.reactivated}`)
      if (body.skipped_existing) parts.push(`已在册跳过 ${body.skipped_existing}`)
      if (body.skipped_invalid) parts.push(`无效 ${body.skipped_invalid}`)
      setStatus(
        names.length === 1 && body.skipped_existing === 1
          ? '已在册'
          : parts.join('、') || '已导入',
      )
      setEditorOpen(false)
      setImportText('')
    } catch (err) {
      setEditorError(err?.message || '导入失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function removeEmployees(emps) {
    if (emps.length === 0 || busy) return
    const ok = window.confirm(
      emps.length === 1
        ? `将「${emps[0].name}」从花名册删除？\n${REMOVE_CONFIRM_HINT}`
        : `将选中的 ${emps.length} 人从花名册删除？\n${REMOVE_CONFIRM_HINT}`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      for (const emp of emps) {
        await api.delete(`/api/employees/${emp.id}`)
      }
      notifyRosterChanged()
      await loadRoster()
      setStatus(emps.length === 1 ? `已删除「${emps[0].name}」` : `已删除 ${emps.length} 人`)
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
    if (selected.size === roster.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(roster.map((emp) => emp.id)))
  }

  const previewNames = splitRosterText(importText)
  const importable = previewNames.length > 0
  const allSelected = roster.length > 0 && selected.size === roster.length
  const selectedEmps = roster.filter((emp) => selected.has(emp.id))

  return (
    <section className="settings-modal__section settings-modal__section--roster" aria-label="花名册">
      <div className="settings-modal__section-head">
        <h3 className="settings-modal__section-title">花名册</h3>
        <div className="settings-modal__section-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy || selectedEmps.length === 0}
            onClick={() => removeEmployees(selectedEmps)}
          >
            删除{selectedEmps.length ? `（${selectedEmps.length}）` : ''}
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={openEditor}>
            添加 / 导入
          </button>
        </div>
      </div>
      <p className="settings-modal__hint">删除后下拉不再显示，已登记的历史工时会保留。</p>

      {loading ? <p className="settings-modal__status">加载中…</p> : null}
      {error ? <p className="settings-modal__error">{error}</p> : null}
      {status ? <p className="settings-modal__status">{status}</p> : null}

      {!loading && roster.length === 0 ? (
        <p className="settings-modal__status">暂无人员，点击「添加 / 导入」加入</p>
      ) : null}

      {roster.length > 0 ? (
        <label className="settings-modal__select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy} />
          全选
        </label>
      ) : null}

      <ul className="settings-modal__list settings-modal__list--roster">
        {roster.map((emp) => (
          <li key={emp.id} className="settings-modal__item">
            <label className="settings-modal__item-check">
              <input
                type="checkbox"
                checked={selected.has(emp.id)}
                disabled={busy}
                onChange={() => toggleSelected(emp.id)}
                aria-label={`选择 ${emp.name}`}
              />
              <span className="settings-modal__item-text">{emp.name}</span>
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => removeEmployees([emp])}
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
                    添加 / 导入人员
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
                    可输入一个姓名，或粘贴多名（空格、换行、顿号、中英文逗号、分号均可）。
                  </p>
                  {editorError ? <p className="settings-modal__error">{editorError}</p> : null}
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    disabled={busy}
                    rows={6}
                    autoFocus
                    placeholder="用空格、换行、顿号或逗号分隔姓名"
                    aria-label="员工姓名"
                  />
                  {previewNames.length > 0 ? (
                    <p className="roster-editor-modal__preview">
                      识别到 {previewNames.length} 人：{previewNames.join('、')}
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
