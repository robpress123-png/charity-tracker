/**
 * Core service interface that all services must implement
 * Provides health checking, graceful shutdown, and error handling
 */

export interface IService {
  /** Unique service identifier */
  readonly name: string;

  /** Service version for compatibility checking */
  readonly version: string;

  /** Service initialization state */
  readonly isInitialized: boolean;

  /**
   * Initialize the service with dependencies
   * @param dependencies - Injected dependencies
   */
  initialize(dependencies?: Record<string, any>): Promise<void>;

  /**
   * Check if service is healthy and operational
   * @returns Promise resolving to health status
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get detailed health information
   * @returns Health status with details
   */
  getHealthStatus(): Promise<ServiceHealthStatus>;

  /**
   * Gracefully shutdown the service
   * Clean up resources, close connections, etc.
   */
  shutdown(): Promise<void>;

  /**
   * Handle service errors gracefully
   * @param error - The error that occurred
   * @param context - Additional context about the error
   */
  handleError(error: Error, context?: Record<string, any>): Promise<ServiceErrorResult>;
}

/**
 * Service health status
 */
export interface ServiceHealthStatus {
  /** Is the service healthy? */
  isHealthy: boolean;

  /** Last health check timestamp */
  lastChecked: Date;

  /** Health check duration in milliseconds */
  checkDuration: number;

  /** Service uptime in milliseconds */
  uptime: number;

  /** Current service status */
  status: 'starting' | 'healthy' | 'degraded' | 'unhealthy' | 'shutting_down';

  /** Optional health details */
  details?: {
    dependencies?: Record<string, boolean>;
    metrics?: Record<string, number>;
    errors?: string[];
  };
}

/**
 * Service error result
 */
export interface ServiceErrorResult {
  /** Was the error handled successfully? */
  handled: boolean;

  /** Should the operation be retried? */
  retry: boolean;

  /** Error severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Fallback action taken */
  fallbackAction?: string;

  /** Error message for logging/debugging */
  message?: string;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  /** Service-specific configuration */
  [key: string]: any;

  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    exponentialBackoff: boolean;
  };

  /** Timeout configuration */
  timeout?: {
    operationTimeoutMs: number;
    healthCheckTimeoutMs: number;
  };

  /** Circuit breaker configuration */
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
    monitoringPeriodMs: number;
  };
}