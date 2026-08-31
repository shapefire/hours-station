import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import EmployeeReviewPage from './pages/EmployeeReviewPage.jsx'
import StatsPage from './pages/StatsPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CalendarPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="review" element={<EmployeeReviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
