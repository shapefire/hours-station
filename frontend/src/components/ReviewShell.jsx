import { Outlet } from 'react-router-dom'

/** Standalone chrome for employee timesheet self-review (no admin nav). */
export default function ReviewShell() {
  return (
    <div className="review-shell">
      <header className="review-shell__header">
        <div className="review-shell__brand">
          <p className="review-shell__eyebrow">员工自助</p>
          <h1 className="review-shell__brand-name">工时核审</h1>
        </div>
      </header>
      <main className="review-shell__main">
        <Outlet />
      </main>
    </div>
  )
}
