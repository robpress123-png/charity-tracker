/**
 * Cloudflare-based Authentication Service Implementation
 * Isolated, testable service that implements IAuthService interface
 * Can be swapped with different implementations without breaking the system
 */

import {
  IAuthService,
  LoginCredentials,
  RegisterData,
  AuthResult,
  User,
  PasswordChangeResult,
  UserPermissions,
  AuthError
} from '../../core/interfaces/IAuthService';
import { ServiceHealthStatus } from '../../core/interfaces/IService';
import { ServiceError, ERROR_CODES, createError } from '../../core/errors/ServiceError';

/**
 * HTTP client interface for making API requests
 * This abstraction allows us to mock the HTTP client for testing
 */
interface IHttpClient {
  get<T>(url: string, options?: RequestInit): Promise<T>;
  post<T>(url: string, data?: any, options?: RequestInit): Promise<T>;
  put<T>(url: string, data?: any, options?: RequestInit): Promise<T>;
  delete<T>(url: string, options?: RequestInit): Promise<T>;
}

/**
 * Configuration for the authentication service
 */
interface AuthServiceConfig {
  apiBaseUrl: string;
  endpoints: {
    login: string;
    register: string;
    logout: string;
    currentUser: string;
    changePassword: string;
  };
  timeout: number;
  retryConfig: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Cloudflare Workers-based authentication service
 * Implements IAuthService with complete isolation and error handling
 */
export class CloudflareAuthService implements IAuthService {
  // Service metadata
  readonly name = 'CloudflareAuthService';
  readonly version = '1.0.0';
  readonly isInitialized: boolean = false;

  // Internal state
  private httpClient?: IHttpClient;
  private config?: AuthServiceConfig;
  private currentUser: User | null = null;
  private initializationTime?: Date;
  private lastHealthCheck?: Date;
  private errorCount = 0;

  /**
   * Initialize the service with dependencies
   */
  async initialize(dependencies?: Record<string, any>): Promise<void> {
    try {
      // Validate required dependencies
      if (!dependencies?.httpClient) {
        throw new ServiceError(
          'HTTP client is required for CloudflareAuthService',
          'MISSING_DEPENDENCY',
          'critical',
          false,
          this.name
        );
      }

      if (!dependencies?.config) {
        throw new ServiceError(
          'Configuration is required for CloudflareAuthService',
          'MISSING_CONFIG',
          'critical',
          false,
          this.name
        );
      }

      // Set dependencies
      this.httpClient = dependencies.httpClient;
      this.config = dependencies.config;
      this.initializationTime = new Date();

      // Validate configuration
      await this.validateConfig();

      // Attempt to restore session
      await this.restoreSession();

      // Mark as initialized
      (this as any).isInitialized = true;

      console.log(`✅ ${this.name} initialized successfully`);

    } catch (error) {
      const serviceError = error instanceof ServiceError ? error : createError.critical(
        `Failed to initialize ${this.name}: ${error.message}`,
        this.name,
        error
      );

      throw serviceError;
    }
  }

  /**
   * Check if service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const healthStatus = await this.getHealthStatus();
      return healthStatus.isHealthy;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed health status
   */
  async getHealthStatus(): Promise<ServiceHealthStatus> {
    const now = new Date();
    const checkStart = performance.now();

    try {
      // Basic health checks
      const isConfigured = !!this.config && !!this.httpClient;
      const isInitialized = this.isInitialized;

      // Try a lightweight API call to verify connectivity
      let apiHealthy = false;
      try {
        if (this.httpClient && this.config) {
          const response = await Promise.race([
            this.httpClient.get(`${this.config.apiBaseUrl}/health`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
          apiHealthy = true;
        }
      } catch {
        apiHealthy = false;
      }

      const checkDuration = performance.now() - checkStart;
      const uptime = this.initializationTime ? now.getTime() - this.initializationTime.getTime() : 0;

      const isHealthy = isConfigured && isInitialized && this.errorCount < 10;

      this.lastHealthCheck = now;

      return {
        isHealthy,
        lastChecked: now,
        checkDuration,
        uptime,
        status: isHealthy ? 'healthy' : 'degraded',
        details: {
          dependencies: {
            httpClient: !!this.httpClient,
            config: !!this.config,
            apiConnectivity: apiHealthy
          },
          metrics: {
            errorCount: this.errorCount,
            hasCurrentUser: !!this.currentUser
          },
          errors: this.errorCount > 0 ? [`${this.errorCount} errors recorded`] : []
        }
      };

    } catch (error) {
      return {
        isHealthy: false,
        lastChecked: now,
        checkDuration: performance.now() - checkStart,
        uptime: this.initializationTime ? now.getTime() - this.initializationTime.getTime() : 0,
        status: 'unhealthy',
        details: {
          errors: [`Health check failed: ${error.message}`]
        }
      };
    }
  }

  /**
   * Gracefully shutdown the service
   */
  async shutdown(): Promise<void> {
    try {
      // Clear any cached data
      this.currentUser = null;

      // Cancel any pending requests if needed
      // (In a more complex implementation, we'd track and cancel active requests)

      console.log(`✅ ${this.name} shut down gracefully`);

    } catch (error) {
      console.error(`❌ Error during ${this.name} shutdown:`, error);
    }
  }

  /**
   * Handle service errors gracefully
   */
  async handleError(error: Error, context?: Record<string, any>): Promise<any> {
    this.errorCount++;

    // Convert to ServiceError if needed
    const serviceError = error instanceof ServiceError ? error : new ServiceError(
      error.message,
      'AUTH_OPERATION_FAILED',
      'medium',
      true,
      this.name,
      error
    );

    // Add context
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        serviceError.addContext(key, value);
      });
    }

    // Determine recovery strategy
    const recovery = this.determineRecoveryStrategy(serviceError);

    return {
      handled: true,
      retry: recovery === 'retry',
      severity: serviceError.severity,
      fallbackAction: recovery,
      message: serviceError.toUserMessage()
    };
  }

  // === IAuthService Implementation ===

  /**
   * Authenticate user with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      this.validateInitialization();

      const response = await this.httpClient!.post<{
        success: boolean;
        data?: { user: User; session: any };
        message?: string;
      }>(`${this.config!.apiBaseUrl}${this.config!.endpoints.login}`, credentials);

      if (response.success && response.data?.user) {
        this.currentUser = response.data.user;
        return {
          success: true,
          user: response.data.user,
          session: response.data.session,
          message: response.message
        };
      } else {
        const error = createError.auth(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid credentials');
        await this.handleError(error, { email: credentials.email });
        return {
          success: false,
          error: 'INVALID_CREDENTIALS' as AuthError,
          message: error.toUserMessage()
        };
      }

    } catch (error) {
      const authError = await this.handleServiceError(error, 'login', { email: credentials.email });
      return {
        success: false,
        error: this.mapToAuthError(error),
        message: authError.toUserMessage()
      };
    }
  }

  /**
   * Register a new user account
   */
  async register(userData: RegisterData): Promise<AuthResult> {
    try {
      this.validateInitialization();

      const response = await this.httpClient!.post<{
        success: boolean;
        data?: { user: User; session: any };
        message?: string;
      }>(`${this.config!.apiBaseUrl}${this.config!.endpoints.register}`, userData);

      if (response.success && response.data?.user) {
        this.currentUser = response.data.user;
        return {
          success: true,
          user: response.data.user,
          session: response.data.session,
          message: response.message
        };
      } else {
        const error = createError.auth(ERROR_CODES.AUTH_EMAIL_EXISTS, 'Registration failed');
        await this.handleError(error, { email: userData.email });
        return {
          success: false,
          error: 'EMAIL_ALREADY_EXISTS' as AuthError,
          message: error.toUserMessage()
        };
      }

    } catch (error) {
      const authError = await this.handleServiceError(error, 'register', { email: userData.email });
      return {
        success: false,
        error: this.mapToAuthError(error),
        message: authError.toUserMessage()
      };
    }
  }

  /**
   * Get currently authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      this.validateInitialization();

      // Return cached user if available
      if (this.currentUser) {
        return this.currentUser;
      }

      const response = await this.httpClient!.get<{
        success: boolean;
        data?: { user: User };
      }>(`${this.config!.apiBaseUrl}${this.config!.endpoints.currentUser}`);

      if (response.success && response.data?.user) {
        this.currentUser = response.data.user;
        return this.currentUser;
      }

      return null;

    } catch (error) {
      await this.handleServiceError(error, 'getCurrentUser');
      return null;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      this.validateInitialization();

      await this.httpClient!.post(`${this.config!.apiBaseUrl}${this.config!.endpoints.logout}`);
      this.currentUser = null;

    } catch (error) {
      // Always clear local state even if logout API fails
      this.currentUser = null;
      await this.handleServiceError(error, 'logout');
    }
  }

  /**
   * Change user password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<PasswordChangeResult> {
    try {
      this.validateInitialization();

      const response = await this.httpClient!.post<{
        success: boolean;
        message?: string;
      }>(`${this.config!.apiBaseUrl}${this.config!.endpoints.changePassword}`, {
        currentPassword: oldPassword,
        newPassword
      });

      return {
        success: response.success,
        message: response.message
      };

    } catch (error) {
      const authError = await this.handleServiceError(error, 'changePassword');
      return {
        success: false,
        error: authError.toUserMessage()
      };
    }
  }

  /**
   * Check if current session is valid
   */
  async isSessionValid(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return !!user;
    } catch {
      return false;
    }
  }

  /**
   * Refresh authentication session
   */
  async refreshSession(): Promise<AuthResult> {
    try {
      const user = await this.getCurrentUser();

      if (user) {
        return {
          success: true,
          user,
          message: 'Session refreshed'
        };
      } else {
        return {
          success: false,
          error: 'SESSION_EXPIRED' as AuthError,
          message: 'Session has expired'
        };
      }
    } catch (error) {
      const authError = await this.handleServiceError(error, 'refreshSession');
      return {
        success: false,
        error: this.mapToAuthError(error),
        message: authError.toUserMessage()
      };
    }
  }

  /**
   * Get user permissions and roles
   */
  async getUserPermissions(): Promise<UserPermissions> {
    try {
      const user = this.currentUser || await this.getCurrentUser();

      if (!user) {
        throw createError.auth(ERROR_CODES.AUTH_SESSION_EXPIRED, 'No authenticated user');
      }

      // Calculate permissions based on user role and license
      const isAdmin = user.role === 'admin';
      const isPaid = user.license_type === 'paid' && (!user.license_expires_at || new Date(user.license_expires_at) > new Date());
      const maxDonations = user.donation_limit === -1 ? -1 : user.donation_limit;

      return {
        canCreateDonations: true,
        canViewReports: true,
        canExportData: isPaid || isAdmin,
        canUploadFiles: isPaid || isAdmin,
        canAccessAdmin: isAdmin,
        canManageUsers: isAdmin,
        canManageCharities: isAdmin,
        maxDonations
      };

    } catch (error) {
      await this.handleServiceError(error, 'getUserPermissions');

      // Return minimal permissions on error
      return {
        canCreateDonations: false,
        canViewReports: false,
        canExportData: false,
        canUploadFiles: false,
        canAccessAdmin: false,
        canManageUsers: false,
        canManageCharities: false,
        maxDonations: 0
      };
    }
  }

  // === Private Helper Methods ===

  private validateInitialization(): void {
    if (!this.isInitialized) {
      throw new ServiceError(
        'AuthService not initialized',
        'SERVICE_NOT_INITIALIZED',
        'critical',
        false,
        this.name
      );
    }
  }

  private async validateConfig(): Promise<void> {
    if (!this.config?.apiBaseUrl) {
      throw new ServiceError('API base URL is required', 'INVALID_CONFIG', 'critical', false, this.name);
    }

    if (!this.config?.endpoints) {
      throw new ServiceError('API endpoints configuration is required', 'INVALID_CONFIG', 'critical', false, this.name);
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      // Attempt to get current user to restore session
      await this.getCurrentUser();
    } catch {
      // Session restoration failed, but that's OK
      this.currentUser = null;
    }
  }

  private async handleServiceError(error: Error, operation: string, context?: Record<string, any>): Promise<ServiceError> {
    const serviceError = error instanceof ServiceError ? error : createError.auth(
      'AUTH_OPERATION_FAILED',
      `${operation} failed: ${error.message}`
    );

    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        serviceError.addContext(key, value);
      });
    }

    serviceError.addContext('operation', operation);
    await this.handleError(serviceError, context);

    return serviceError;
  }

  private mapToAuthError(error: Error): AuthError {
    if (error instanceof ServiceError) {
      switch (error.code) {
        case ERROR_CODES.AUTH_INVALID_CREDENTIALS:
          return 'INVALID_CREDENTIALS';
        case ERROR_CODES.AUTH_USER_NOT_FOUND:
          return 'USER_NOT_FOUND';
        case ERROR_CODES.AUTH_EMAIL_EXISTS:
          return 'EMAIL_ALREADY_EXISTS';
        case ERROR_CODES.AUTH_SESSION_EXPIRED:
          return 'SESSION_EXPIRED';
        case ERROR_CODES.AUTH_PERMISSION_DENIED:
          return 'PERMISSION_DENIED';
        case ERROR_CODES.API_RATE_LIMITED:
          return 'RATE_LIMIT_EXCEEDED';
        default:
          return 'SERVICE_UNAVAILABLE';
      }
    }

    return 'SERVICE_UNAVAILABLE';
  }

  private determineRecoveryStrategy(error: ServiceError): string {
    switch (error.severity) {
      case 'low':
        return 'ignore';
      case 'medium':
        return error.recoverable ? 'retry' : 'fallback';
      case 'high':
        return 'fallback';
      case 'critical':
        return 'escalate';
      default:
        return 'fallback';
    }
  }
}