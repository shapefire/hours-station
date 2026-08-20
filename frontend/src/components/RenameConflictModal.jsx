import { createPortal } from 'react-dom'

export default function RenameConflictModal({
  oldName,
  newName,
  busy,
  onCancel,
  onContinue,
}) {
  return createPortal(
    <div className="modal-backdrop roster-editor-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal roster-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-conflict-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="rename-conflict-title" className="modal__title">
            合并人员
          </h2>
        </header>
        <div className="roster-editor-modal__body">
          <p>「{newName}」已在花名册中。</p>
          <p>
            是否将「{oldName}」合并到「{newName}」？
          </p>
          <ul className="settings-modal__hint">
            <li>{oldName} 的历史排班归入 {newName}</li>
            <li>{oldName} 从花名册移除（历史保留）</li>
          </ul>
        </div>
        <footer className="roster-editor-modal__footer">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onContinue}>
            继续合并
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
