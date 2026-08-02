import EntryForm from './EntryForm.jsx'

function formatDisplayDate(dateKey) {
  if (!dateKey) return '—'
  const [y, m, d] = dateKey.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function sumHours(entries) {
  return entries
    .reduce((acc, e) => acc + Number(e.effective_hours || 0), 0)
    .toFixed(1)
}

export default function DayPanel({
  selectedDate,
  entries = [],
  loading = false,
  formMode = null,
  editingEntry = null,
  formError = null,
  formBusy = false,
  onAdd,
  onEdit,
  onDelete,
  onFormSubmit,
  onFormCancel,
}) {
  const totalHours = sumHours(entries)
  const peopleCount = entries.length

  return (
    <section className="day-panel" aria-label="日明细">
      <header className="day-panel__header">
        <div>
          <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
          <p className="day-panel__stats">
            {peopleCount} 人 · 合计 {totalHours}h
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onAdd}
          disabled={!selectedDate || formMode === 'create'}
        >
          新增
        </button>
      </header>

      <div className="day-panel__body">
        {loading ? <p className="day-panel__status">加载中…</p> : null}

        {!loading && entries.length === 0 && formMode !== 'create' ? (
          <p className="day-panel__status">当日暂无登记，点击「新增」开始录入。</p>
        ) : null}

        <ul className="day-panel__list">
          {entries.map((entry) => {
            const isEditing = formMode === 'edit' && editingEntry?.id === entry.id
            return (
              <li key={entry.id} className="day-panel__item">
                {isEditing ? (
                  <EntryForm
                    mode="edit"
                    initialEntry={editingEntry}
                    onSubmit={onFormSubmit}
                    onCancel={onFormCancel}
                    busy={formBusy}
                    error={formError}
                  />
                ) : (
                  <>
                    <div className="day-panel__row">
                      <span className="day-panel__name">{entry.employee_name}</span>
                      <span className="day-panel__time">
                        {entry.start_time}–{entry.end_time}
                      </span>
                      <span className="day-panel__hours">{entry.effective_hours}h</span>
                    </div>
                    {entry.note ? (
                      <p className="day-panel__note">{entry.note}</p>
                    ) : null}
                    <div className="day-panel__item-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onEdit(entry)}
                        disabled={Boolean(formMode)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onDelete(entry)}
                        disabled={Boolean(formMode)}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>

        {formMode === 'create' ? (
          <div className="day-panel__create">
            <h3 className="day-panel__create-title">新增登记</h3>
            <EntryForm
              mode="create"
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              busy={formBusy}
              error={formError}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
