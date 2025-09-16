/**
 * Main App component - Routes and layout structure
 * Replicates the demo's navigation and page structure exactly
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoadingSpinner from './components/LoadingSpinner'

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import DonationsPage from './pages/DonationsPage'
import ReportsPage from './pages/ReportsPage'
import ProfilePage from './pages/ProfilePage'
import ToolsPage from './pages/ToolsPage'
import AdminPage from './pages/AdminPage'
import NotFoundPage from './pages/NotFoundPage'

/**
 * Protected route wrapper - requires authentication
 */
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * Admin route wrapper - requires admin role
 */
const AdminRoute = ({ children }) => {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Admin access only through backend role assignment (no checkbox)
  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

/**
 * Public route wrapper - redirects authenticated users
 */
const PublicRoute = ({ children }) => {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

/**
 * Main App component with routing
 */
function App() {
  return (
    <div className="min-h-screen bg-gradient-charity">
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />

        {/* Protected routes with layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  {/* Dashboard - Default landing page */}
                  <Route path="/dashboard" element={<DashboardPage />} />

                  {/* Donations management */}
                  <Route path="/donations" element={<DonationsPage />} />

                  {/* Reports and tax summaries */}
                  <Route path="/reports" element={<ReportsPage />} />

                  {/* User profile and settings */}
                  <Route path="/profile" element={<ProfilePage />} />

                  {/* Tax tools and calculators */}
                  <Route path="/tools" element={<ToolsPage />} />

                  {/* Admin panel - role-based access only */}
                  <Route
                    path="/admin/*"
                    element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    }
                  />

                  {/* Default redirect to dashboard */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />

                  {/* 404 page */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}

export default App