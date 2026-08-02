import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import SettingsModal from './SettingsModal.jsx'

const navItems = [
  { to: '/', label: '工作日历', end: true },
  { to: '/stats', label: '统计看板', end: false },
]

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d="M7.2 2.4h3.6l.35 1.55a5.2 5.2 0 0 1 1.35.78l1.55-.5 1.8 3.12-1.2 1.1c.08.34.12.69.12 1.05s-.04.71-.12 1.05l1.2 1.1-1.8 3.12-1.55-.5a5.2 5.2 0 0 1-1.35.78L10.8 15.6H7.2l-.35-1.55a5.2 5.2 0 0 1-1.35-.78l-1.55.5L2.15 10.65l1.2-1.1A5.3 5.3 0 0 1 3.23 8.5c0-.36.04-.71.12-1.05l-1.2-1.1L3.95 3.23l1.55.5c.4-.32.85-.58 1.35-.78L7.2 2.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <h1 className="app-shell__brand-name">工时工作站</h1>
          <p className="app-shell__brand-sub">Hours Station</p>
        </div>
        <div className="app-shell__header-right">
          <nav className="app-shell__nav" aria-label="主导航">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `app-shell__nav-link${isActive ? ' is-active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="btn btn--ghost btn--icon app-shell__settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="设置"
            aria-label="打开设置"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>
      <main className="app-shell__main">
        <Outlet />
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
