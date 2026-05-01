import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './contexts/DataContext'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { Layout } from './components/Layout'
import { ScoringPage } from './components/ScoringPage'
import { Rules } from './components/Rules'
import { AdminPanel } from './components/AdminPanel'
import { AdminCourse } from './components/AdminCourse'
import { AdminScores } from './components/AdminScores'
import { Toasts } from './components/Toasts'

export default function App() {
  return (
    <HashRouter>
      <DataProvider>
        <AuthProvider>
          <ToastProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<ScoringPage />} />
                <Route path="/rules" element={<Rules />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/course" element={<AdminCourse />} />
                <Route path="/admin/scores" element={<AdminScores />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
            <Toasts />
          </ToastProvider>
        </AuthProvider>
      </DataProvider>
    </HashRouter>
  )
}
