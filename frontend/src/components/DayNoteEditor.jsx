import { useEffect, useState } from 'react'

export default function DayNoteEditor({ note = null, onSave, disabled = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const display = typeof note === 'string' ? note : ''

  useEffect(() => {
    setEditing(false)
    setDraft(display)
    setBusy(false)
    setError(null)
  }, [display])

  function startEdit() {
    if (disabled || busy) return
    setDraft(display)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(display)
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      await onSave?.(draft)
      setEditing(false)
    } catch (err) {
      setError(err?.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="day-note-editor day-note-editor--editing">
        <textarea
          className="day-note-editor__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          placeholder="整日备注"
          aria-label="整日备注"
          rows={2}
        />
        {error ? <p className="day-note-editor__error">{error}</p> : null}
        <div className="day-note-editor__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={cancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`day-note-editor${display ? '' : ' day-note-editor--empty'}`}
      onClick={startEdit}
      disabled={disabled}
      title="编辑整日备注"
    >
      {display || '整日备注'}
    </button>
  )
}
