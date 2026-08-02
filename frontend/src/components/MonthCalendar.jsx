const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function toDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y, month: m, day: d }
}

/** Build a fixed 6×7 grid (Mon-first) for the given month. */
export function buildMonthCells(year, month) {
  const first = new Date(year, month - 1, 1)
  // JS: 0=Sun … 6=Sat → Mon-first offset
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month - 1, 1 - mondayOffset)
  const cells = []

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    cells.push({
      key: toDateKey(y, m, day),
      year: y,
      month: m,
      day,
      inMonth: m === month,
    })
  }

  return cells
}

export default function MonthCalendar({
  viewYear,
  viewMonth,
  selectedDate,
  daySummaryByDate = {},
  registeredDays = 0,
  monthTotalHours = '0.0',
  pasteMode = null,
  pasteSourceDate = null,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}) {
  const cells = buildMonthCells(viewYear, viewMonth)
  const inPasteMode = Boolean(pasteMode)

  return (
    <section
      className={`month-calendar${inPasteMode ? ' is-paste-mode' : ''}`}
      aria-label="工作月历"
    >
      <header className="month-calendar__header">
        <div className="month-calendar__nav">
          <button
            type="button"
            className="month-calendar__nav-btn"
            onClick={onPrevMonth}
            aria-label="上一月"
          >
            ‹
          </button>
          <h2 className="month-calendar__title">
            {viewYear}年{viewMonth}月
          </h2>
          <button
            type="button"
            className="month-calendar__nav-btn"
            onClick={onNextMonth}
            aria-label="下一月"
          >
            ›
          </button>
        </div>
        <p className="month-calendar__summary">
          已登记 {registeredDays} 天 · 合计 {monthTotalHours}h
        </p>
      </header>

      <div className="month-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <div key={label} className="month-calendar__weekday">
            {label}
          </div>
        ))}
      </div>

      <div className="month-calendar__grid">
        {cells.map((cell) => {
          const summary = daySummaryByDate[cell.key]
          const hasData = Boolean(summary && summary.entry_count > 0)
          const isSelected = cell.key === selectedDate
          const isPasteSource = inPasteMode && cell.key === pasteSourceDate
          const classNames = [
            'month-calendar__cell',
            cell.inMonth ? '' : 'is-outside',
            hasData ? 'has-data' : '',
            isSelected ? 'is-selected' : '',
            isPasteSource ? 'is-paste-source' : '',
            inPasteMode && !isPasteSource ? 'is-paste-target' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={cell.key}
              type="button"
              className={classNames}
              onClick={() => onSelectDate(cell.key)}
              aria-pressed={isSelected}
              aria-label={`${cell.key}${hasData ? `，${summary.entry_count}人，${summary.total_effective_hours}小时` : ''}${inPasteMode ? '，粘贴目标' : ''}`}
            >
              <span className="month-calendar__day-num">{cell.day}</span>
              {isSelected && hasData ? (
                <span className="month-calendar__meta">
                  {summary.entry_count}人 · {summary.total_effective_hours}h
                </span>
              ) : null}
              {!isSelected && hasData ? (
                <span className="month-calendar__meta month-calendar__meta--dot">
                  <span className="month-calendar__dot" aria-hidden="true" />
                  {summary.total_effective_hours}h
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
