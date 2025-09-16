/**
 * Main application entry point
 * Sets up React with routing, context providers, and error handling
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DonationProvider } from './contexts/DonationContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

import './index.css'

// Create root and render app with providers
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <DonationProvider>
            <App />
            {/* Toast notifications for user feedback */}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                  borderRadius: '8px'
                },
                success: {
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#fff'
                  }
                },
                error: {
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff'
                  }
                }
              }}
            />
          </DonationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)