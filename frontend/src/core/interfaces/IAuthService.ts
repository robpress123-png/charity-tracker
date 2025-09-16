/**
 * Authentication service interface
 * Defines the contract for all authentication implementations
 */

import { IService } from './IService';

export interface IAuthService extends IService {
  /**
   * Authenticate user with credentials
   * @param credentials - User login credentials
   * @returns Authentication result
   */
  login(credentials: LoginCredentials): Promise<AuthResult>;

  /**
   * Register a new user account
   * @param userData - New user registration data
   * @returns Registration result
   */
  register(userData: RegisterData): Promise<AuthResult>;

  /**
   * Get currently authenticated user
   * @returns Current user data or null if not authenticated
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Logout current user
   * @returns Logout success status
   */
  logout(): Promise<void>;

  /**
   * Change user password
   * @param oldPassword - Current password
   * @param newPassword - New password
   * @returns Password change result
   */
  changePassword(oldPassword: string, newPassword: string): Promise<PasswordChangeResult>;

  /**
   * Check if current session is valid
   * @returns Session validity status
   */
  isSessionValid(): Promise<boolean>;

  /**
   * Refresh authentication session
   * @returns Refreshed session data
   */
  refreshSession(): Promise<AuthResult>;

  /**
   * Get user permissions and roles
   * @returns User permissions object
   */
  getUserPermissions(): Promise<UserPermissions>;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * User registration data
 */
export interface RegisterData {
  name: string;
  email: string;
  password: string;
  acceptTerms: boolean;
  marketingOptIn?: boolean;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: User;
  session?: SessionData;
  message?: string;
  error?: AuthError;
}

/**
 * User data structure
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  license_type: 'free' | 'paid';
  license_expires_at?: string;
  donation_limit: number;
  created_at: string;
  last_login?: string;
  is_active: boolean;
}

/**
 * Session data
 */
export interface SessionData {
  id: string;
  expires_at: string;
  csrf_token?: string;
}

/**
 * Password change result
 */
export interface PasswordChangeResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * User permissions
 */
export interface UserPermissions {
  canCreateDonations: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canUploadFiles: boolean;
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageCharities: boolean;
  maxDonations: number; // -1 for unlimited
}

/**
 * Authentication errors
 */
export type AuthError =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'EMAIL_ALREADY_EXISTS'
  | 'WEAK_PASSWORD'
  | 'SESSION_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE';

/**
 * Authentication events
 */
export interface AuthEvents {
  onLogin: (user: User) => void;
  onLogout: () => void;
  onSessionExpired: () => void;
  onUserUpdated: (user: User) => void;
  onError: (error: AuthError, context?: any) => void;
}