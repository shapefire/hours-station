import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import ReviewShell from './components/ReviewShell.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import AdminDisputesPage from './pages/AdminDisputesPage.jsx'
import EmployeeReviewPage from './pages/EmployeeReviewPage.jsx'
import StatsPage from './pages/StatsPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="review" element={<ReviewShell />}>
          <Route index element={<EmployeeReviewPage />} />
        </Route>
        <Route element={<AppShell />}>
          <Route index element={<CalendarPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="review/admin" element={<AdminDisputesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
