/**
 * Authentication Context Provider
 * Manages user authentication state and provides auth methods
 * Handles session management and freemium model state
 */

import React, { createContext, useContext, useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { authAPI } from '../utils/api'

/**
 * Authentication context
 */
const AuthContext = createContext({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  updateUser: () => {},
  refreshUser: async () => {},
  checkDonationLimit: () => false
})

/**
 * Custom hook to use auth context
 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Authentication provider component
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Initialize auth state on app load
   */
  useEffect(() => {
    checkAuthState()
  }, [])

  /**
   * Check if user is authenticated
   */
  const checkAuthState = async () => {
    try {
      setIsLoading(true)

      // Try to get current user from server
      const response = await authAPI.getCurrentUser()

      if (response.success && response.data.user) {
        setUser(response.data.user)
      } else {
        setUser(null)
      }
    } catch (error) {
      console.log('Not authenticated:', error.message)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Login user with email and password
   */
  const login = async (email, password) => {
    try {
      setIsLoading(true)

      const response = await authAPI.login(email, password)

      if (response.success && response.data.user) {
        setUser(response.data.user)
        toast.success(response.message || 'Login successful!')
        return { success: true }
      } else {
        throw new Error(response.message || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      const message = error.response?.data?.message || error.message || 'Login failed'
      toast.error(message)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Register new user
   */
  const register = async (userData) => {
    try {
      setIsLoading(true)

      const response = await authAPI.register(userData)

      if (response.success && response.data.user) {
        setUser(response.data.user)
        toast.success(response.message || 'Registration successful!')
        return { success: true }
      } else {
        throw new Error(response.message || 'Registration failed')
      }
    } catch (error) {
      console.error('Registration error:', error)
      const message = error.response?.data?.message || error.message || 'Registration failed'
      toast.error(message)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      toast.success('Logged out successfully')
    }
  }

  /**
   * Update user state locally
   */
  const updateUser = (updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
  }

  /**
   * Refresh user data from server
   */
  const refreshUser = async () => {
    try {
      const response = await authAPI.getCurrentUser()

      if (response.success && response.data.user) {
        setUser(response.data.user)
        return response.data.user
      }
    } catch (error) {
      console.error('Refresh user error:', error)
    }
  }

  /**
   * Check if user has reached donation limit (freemium model)
   */
  const checkDonationLimit = (currentCount = 0) => {
    if (!user) return false

    // Paid users have unlimited donations (-1 means unlimited)
    if (user.license_type === 'paid' || user.donation_limit === -1) {
      return false
    }

    // Free users are limited to their donation_limit (default: 2)
    return currentCount >= user.donation_limit
  }

  /**
   * Check if user license has expired
   */
  const isLicenseExpired = () => {
    if (!user || user.license_type !== 'paid' || !user.license_expires_at) {
      return false
    }

    return new Date(user.license_expires_at) < new Date()
  }

  /**
   * Get days remaining on license
   */
  const getDaysRemaining = () => {
    if (!user || user.license_type !== 'paid' || !user.license_expires_at) {
      return null
    }

    const expiration = new Date(user.license_expires_at)
    const now = new Date()
    const timeDiff = expiration.getTime() - now.getTime()
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

    return Math.max(0, daysDiff)
  }

  /**
   * Context value
   */
  const value = {
    user,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    refreshUser,
    checkDonationLimit,
    isLicenseExpired: isLicenseExpired(),
    daysRemaining: getDaysRemaining(),
    isPaidUser: user?.license_type === 'paid' && !isLicenseExpired(),
    isFreeUser: user?.license_type === 'free' || isLicenseExpired(),
    isAdmin: user?.role === 'admin'
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}