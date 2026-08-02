import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '工作日历', end: true },
  { to: '/stats', label: '统计看板', end: false },
]

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <h1 className="app-shell__brand-name">工时工作站</h1>
          <p className="app-shell__brand-sub">Hours Station</p>
        </div>
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
      </header>
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  )
}
