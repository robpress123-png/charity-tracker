/**
 * Structured error handling system for services
 * Provides error classification, recovery strategies, and logging
 */

/**
 * Service error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error recovery strategies
 */
export type RecoveryStrategy =
  | 'retry'           // Retry the operation
  | 'fallback'        // Use fallback mechanism
  | 'degrade'         // Gracefully degrade functionality
  | 'circuit_break'   // Open circuit breaker
  | 'escalate'        // Escalate to higher level
  | 'ignore'          // Log and continue
  | 'shutdown';       // Shutdown service/module

/**
 * Structured service error class
 */
export class ServiceError extends Error {
  public readonly timestamp: Date;
  public readonly errorId: string;
  public retryCount: number = 0;
  public context: Record<string, any> = {};

  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: ErrorSeverity,
    public readonly recoverable: boolean = true,
    public readonly moduleId: string,
    public readonly originalError?: Error,
    public readonly recovery?: RecoveryStrategy
  ) {
    super(message);
    this.name = 'ServiceError';
    this.timestamp = new Date();
    this.errorId = this.generateErrorId();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceError);
    }
  }

  /**
   * Generate unique error identifier
   */
  private generateErrorId(): string {
    const timestamp = this.timestamp.getTime().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.moduleId}_${timestamp}_${random}`;
  }

  /**
   * Add contextual information to the error
   */
  addContext(key: string, value: any): this {
    this.context[key] = value;
    return this;
  }

  /**
   * Increment retry counter
   */
  incrementRetry(): this {
    this.retryCount++;
    return this;
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(maxRetries: number = 3): boolean {
    return this.recoverable && this.retryCount < maxRetries && this.recovery === 'retry';
  }

  /**
   * Get error summary for logging
   */
  toLogEntry(): ErrorLogEntry {
    return {
      errorId: this.errorId,
      code: this.code,
      message: this.message,
      severity: this.severity,
      moduleId: this.moduleId,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      recovery: this.recovery,
      retryCount: this.retryCount,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }

  /**
   * Convert to user-friendly error message
   */
  toUserMessage(): string {
    const userMessages: Record<string, string> = {
      // Authentication errors
      'AUTH_INVALID_CREDENTIALS': 'Invalid email or password. Please try again.',
      'AUTH_SESSION_EXPIRED': 'Your session has expired. Please log in again.',
      'AUTH_PERMISSION_DENIED': 'You don\'t have permission to perform this action.',

      // Donation errors
      'DONATION_LIMIT_EXCEEDED': 'You\'ve reached your donation limit. Upgrade to Pro for unlimited donations.',
      'DONATION_INVALID_DATA': 'Please check your donation information and try again.',
      'DONATION_NOT_FOUND': 'The requested donation could not be found.',

      // Network errors
      'NETWORK_UNAVAILABLE': 'Unable to connect to our servers. Please check your internet connection.',
      'API_RATE_LIMITED': 'Too many requests. Please wait a moment and try again.',
      'API_MAINTENANCE': 'Our system is temporarily under maintenance. Please try again later.',

      // Payment errors
      'PAYMENT_DECLINED': 'Your payment was declined. Please check your payment details.',
      'PAYMENT_PROCESSING_ERROR': 'There was an issue processing your payment. Please try again.',

      // File upload errors
      'FILE_TOO_LARGE': 'The file is too large. Please choose a smaller file.',
      'FILE_INVALID_TYPE': 'This file type is not supported. Please use a different file.',

      // Generic fallbacks
      'SERVICE_UNAVAILABLE': 'This feature is temporarily unavailable. Please try again later.',
      'UNKNOWN_ERROR': 'Something went wrong. Please try again.'
    };

    return userMessages[this.code] || userMessages['UNKNOWN_ERROR'];
  }
}

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  errorId: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  moduleId: string;
  timestamp: Date;
  recoverable: boolean;
  recovery?: RecoveryStrategy;
  retryCount: number;
  context: Record<string, any>;
  stack?: string;
  originalError?: string;
}

/**
 * Error boundary interface for React components
 */
export interface IErrorBoundary {
  /**
   * Capture and handle an error
   */
  captureError(error: ServiceError): Promise<ErrorRecoveryResult>;

  /**
   * Attempt to recover from an error
   */
  recoverFromError(moduleId: string, strategy: RecoveryStrategy): Promise<boolean>;

  /**
   * Get error summary for monitoring
   */
  getErrorSummary(): ErrorSummary;

  /**
   * Clear error state
   */
  clearErrors(moduleId?: string): void;
}

/**
 * Error recovery result
 */
export interface ErrorRecoveryResult {
  recovered: boolean;
  strategy: RecoveryStrategy;
  message?: string;
  fallbackActivated?: boolean;
}

/**
 * Error summary for monitoring
 */
export interface ErrorSummary {
  totalErrors: number;
  errorsByModule: Record<string, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ErrorLogEntry[];
  recoveredErrors: number;
  unrecoverableErrors: number;
}

/**
 * Predefined error codes
 */
export const ERROR_CODES = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',

  // Donations
  DONATION_LIMIT_EXCEEDED: 'DONATION_LIMIT_EXCEEDED',
  DONATION_INVALID_DATA: 'DONATION_INVALID_DATA',
  DONATION_NOT_FOUND: 'DONATION_NOT_FOUND',
  DONATION_VALIDATION_FAILED: 'DONATION_VALIDATION_FAILED',

  // External APIs
  STOCK_API_UNAVAILABLE: 'STOCK_API_UNAVAILABLE',
  CRYPTO_API_UNAVAILABLE: 'CRYPTO_API_UNAVAILABLE',
  STOCK_PRICE_NOT_FOUND: 'STOCK_PRICE_NOT_FOUND',
  CRYPTO_PRICE_NOT_FOUND: 'CRYPTO_PRICE_NOT_FOUND',

  // Network
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  API_TIMEOUT: 'API_TIMEOUT',
  API_RATE_LIMITED: 'API_RATE_LIMITED',
  API_MAINTENANCE: 'API_MAINTENANCE',

  // Payments
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  PAYMENT_PROCESSING_ERROR: 'PAYMENT_PROCESSING_ERROR',
  STRIPE_API_ERROR: 'STRIPE_API_ERROR',

  // Files
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_INVALID_TYPE: 'FILE_INVALID_TYPE',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',

  // System
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_INITIALIZATION_FAILED: 'SERVICE_INITIALIZATION_FAILED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Error factory functions for common errors
 */
export const createError = {
  /**
   * Authentication error
   */
  auth: (code: string, message: string, recoverable = true) =>
    new ServiceError(message, code, 'medium', recoverable, 'AUTH_SERVICE'),

  /**
   * Network/API error
   */
  network: (message: string, originalError?: Error) =>
    new ServiceError(message, ERROR_CODES.NETWORK_UNAVAILABLE, 'medium', true, 'NETWORK', originalError, 'retry'),

  /**
   * Validation error
   */
  validation: (message: string, field?: string) => {
    const error = new ServiceError(message, 'VALIDATION_ERROR', 'low', false, 'VALIDATION');
    if (field) error.addContext('field', field);
    return error;
  },

  /**
   * Critical system error
   */
  critical: (message: string, moduleId: string, originalError?: Error) =>
    new ServiceError(message, 'CRITICAL_ERROR', 'critical', false, moduleId, originalError, 'escalate'),

  /**
   * External API error with circuit breaker
   */
  externalApi: (apiName: string, message: string, originalError?: Error) =>
    new ServiceError(
      message,
      `${apiName.toUpperCase()}_API_ERROR`,
      'medium',
      true,
      'EXTERNAL_API',
      originalError,
      'circuit_break'
    )
};

/**
 * Error helper utilities
 */
export const errorUtils = {
  /**
   * Check if error is recoverable
   */
  isRecoverable: (error: Error | ServiceError): boolean => {
    return error instanceof ServiceError ? error.recoverable : false;
  },

  /**
   * Get error severity
   */
  getSeverity: (error: Error | ServiceError): ErrorSeverity => {
    return error instanceof ServiceError ? error.severity : 'medium';
  },

  /**
   * Should error be retried?
   */
  shouldRetry: (error: Error | ServiceError, maxRetries = 3): boolean => {
    if (error instanceof ServiceError) {
      return error.shouldRetry(maxRetries);
    }
    return false;
  },

  /**
   * Convert any error to ServiceError
   */
  toServiceError: (error: Error, moduleId: string, code = ERROR_CODES.UNKNOWN_ERROR): ServiceError => {
    if (error instanceof ServiceError) {
      return error;
    }

    return new ServiceError(
      error.message,
      code,
      'medium',
      true,
      moduleId,
      error
    );
  }
};