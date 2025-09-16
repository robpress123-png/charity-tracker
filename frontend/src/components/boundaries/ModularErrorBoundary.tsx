/**
 * Modular Error Boundary System
 * Provides isolated error handling for different modules
 * Prevents cascading failures and enables graceful degradation
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { ServiceError, ErrorSeverity, createError } from '../../core/errors/ServiceError';
import { featureFlags } from '../../core/config/FeatureFlags';

/**
 * Error boundary props
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  moduleId: string;
  fallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: ServiceError, errorInfo: ErrorInfo) => void;
  enableRecovery?: boolean;
  maxRetries?: number;
  isolateErrors?: boolean; // Whether to prevent error propagation
}

/**
 * Error boundary state
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: ServiceError;
  errorId?: string;
  retryCount: number;
  isRecovering: boolean;
  fallbackMode: boolean;
  lastErrorTime: number;
}

/**
 * Fallback component props
 */
interface ErrorFallbackProps {
  error: ServiceError;
  resetError: () => void;
  retryCount: number;
  moduleId: string;
  canRetry: boolean;
}

/**
 * Modular error boundary that isolates failures and provides recovery
 */
export class ModularErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private errorRecoveryTimer?: NodeJS.Timeout;
  private errorCooldownTimer?: NodeJS.Timeout;

  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      retryCount: 0,
      isRecovering: false,
      fallbackMode: false,
      lastErrorTime: 0
    };
  }

  /**
   * Catch errors in child components
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      lastErrorTime: Date.now()
    };
  }

  /**
   * Handle caught errors
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const serviceError = this.convertToServiceError(error, errorInfo);

    this.setState(prevState => ({
      error: serviceError,
      errorId: serviceError.errorId,
      hasError: true,
      lastErrorTime: Date.now()
    }));

    // Report error
    this.reportError(serviceError, errorInfo);

    // Attempt automatic recovery
    if (this.props.enableRecovery && serviceError.recoverable) {
      this.attemptRecovery(serviceError);
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(serviceError, errorInfo);
    }
  }

  /**
   * Clean up timers
   */
  componentWillUnmount(): void {
    if (this.errorRecoveryTimer) {
      clearTimeout(this.errorRecoveryTimer);
    }
    if (this.errorCooldownTimer) {
      clearTimeout(this.errorCooldownTimer);
    }
  }

  /**
   * Convert generic error to ServiceError
   */
  private convertToServiceError(error: Error, errorInfo: ErrorInfo): ServiceError {
    if (error instanceof ServiceError) {
      return error;
    }

    // Determine error severity based on error type and module
    let severity: ErrorSeverity = 'medium';
    let recoverable = true;

    // Critical modules should have higher severity
    if (['AUTH_MODULE', 'PAYMENT_MODULE'].includes(this.props.moduleId)) {
      severity = 'high';
    }

    // React errors are usually recoverable
    if (errorInfo.componentStack) {
      recoverable = true;
    }

    const serviceError = new ServiceError(
      error.message,
      'COMPONENT_ERROR',
      severity,
      recoverable,
      this.props.moduleId,
      error
    );

    // Add React-specific context
    serviceError.addContext('componentStack', errorInfo.componentStack);
    serviceError.addContext('errorBoundary', this.constructor.name);

    return serviceError;
  }

  /**
   * Report error to monitoring systems
   */
  private reportError(error: ServiceError, errorInfo: ErrorInfo): void {
    try {
      // Log to console with full context
      console.error(`🚨 Error in ${this.props.moduleId}:`, {
        error: error.toLogEntry(),
        errorInfo,
        state: this.state,
        props: {
          moduleId: this.props.moduleId,
          enableRecovery: this.props.enableRecovery
        }
      });

      // Report to feature flags for auto-rollback
      featureFlags.reportError(this.props.moduleId, error);

      // In a real implementation, also send to error reporting service
      // e.g., Sentry, LogRocket, etc.
      if (featureFlags.isEnabled('ERROR_REPORTING')) {
        // window.errorReportingService?.captureError(error);
      }

    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }

  /**
   * Attempt automatic error recovery
   */
  private attemptRecovery(error: ServiceError): void {
    if (this.state.retryCount >= (this.props.maxRetries || 3)) {
      console.warn(`Max retries exceeded for ${this.props.moduleId}, entering fallback mode`);
      this.setState({ fallbackMode: true, isRecovering: false });
      return;
    }

    this.setState({ isRecovering: true });

    // Exponential backoff for recovery attempts
    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000);

    this.errorRecoveryTimer = setTimeout(() => {
      console.log(`Attempting recovery for ${this.props.moduleId} (attempt ${this.state.retryCount + 1})`);

      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        errorId: undefined,
        retryCount: prevState.retryCount + 1,
        isRecovering: false
      }));

      // Start cooldown period to prevent rapid re-failures
      this.startErrorCooldown();

    }, delay);
  }

  /**
   * Start cooldown period after recovery
   */
  private startErrorCooldown(): void {
    this.errorCooldownTimer = setTimeout(() => {
      // Reset retry count after successful operation period
      this.setState({ retryCount: 0 });
    }, 30000); // 30 second cooldown
  }

  /**
   * Manual error reset (for user-triggered retries)
   */
  private resetError = (): void => {
    this.setState({
      hasError: false,
      error: undefined,
      errorId: undefined,
      isRecovering: false,
      fallbackMode: false
    });

    this.startErrorCooldown();
  };

  /**
   * Check if component can be retried
   */
  private canRetry(): boolean {
    const { error, retryCount } = this.state;
    const maxRetries = this.props.maxRetries || 3;

    return (
      !!error &&
      error.recoverable &&
      retryCount < maxRetries &&
      !this.state.fallbackMode
    );
  }

  /**
   * Render error UI or children
   */
  render(): ReactNode {
    const { children, moduleId, fallbackComponent: FallbackComponent } = this.props;
    const { hasError, error, isRecovering, fallbackMode } = this.state;

    // Show loading during recovery
    if (isRecovering) {
      return <ModuleRecoveryIndicator moduleId={moduleId} />;
    }

    // Show error UI if there's an error
    if (hasError && error) {
      // Use custom fallback component if provided
      if (FallbackComponent) {
        return (
          <FallbackComponent
            error={error}
            resetError={this.resetError}
            retryCount={this.state.retryCount}
            moduleId={moduleId}
            canRetry={this.canRetry()}
          />
        );
      }

      // Use appropriate default fallback based on severity
      if (error.severity === 'critical' || fallbackMode) {
        return <CriticalErrorFallback error={error} moduleId={moduleId} resetError={this.resetError} />;
      } else {
        return <RecoverableErrorFallback
          error={error}
          moduleId={moduleId}
          resetError={this.resetError}
          canRetry={this.canRetry()}
        />;
      }
    }

    // Render children normally
    return children;
  }
}

/**
 * Recovery indicator component
 */
const ModuleRecoveryIndicator: React.FC<{ moduleId: string }> = ({ moduleId }) => (
  <div className="flex items-center justify-center p-8 bg-yellow-50 border border-yellow-200 rounded-lg">
    <div className="text-center">
      <div className="loading-spinner mb-3"></div>
      <h3 className="text-lg font-medium text-yellow-800 mb-2">Recovering Module</h3>
      <p className="text-yellow-600">
        {moduleId.replace('_', ' ')} is recovering from an error...
      </p>
    </div>
  </div>
);

/**
 * Critical error fallback (system-breaking errors)
 */
const CriticalErrorFallback: React.FC<{
  error: ServiceError;
  moduleId: string;
  resetError: () => void;
}> = ({ error, moduleId, resetError }) => (
  <div className="min-h-[400px] flex items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
    <div className="text-center max-w-md">
      <div className="text-red-500 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-red-800 mb-2">System Error</h3>
      <p className="text-red-600 mb-4">
        A critical error occurred in {moduleId.replace('_', ' ')}. Please refresh the page.
      </p>
      <p className="text-sm text-red-500 mb-6 font-mono bg-red-100 p-2 rounded">
        Error ID: {error.errorId}
      </p>
      <div className="space-x-3">
        <button
          onClick={resetError}
          className="btn-secondary"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Refresh Page
        </button>
      </div>
    </div>
  </div>
);

/**
 * Recoverable error fallback (can retry)
 */
const RecoverableErrorFallback: React.FC<{
  error: ServiceError;
  moduleId: string;
  resetError: () => void;
  canRetry: boolean;
}> = ({ error, moduleId, resetError, canRetry }) => (
  <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
    <div className="flex items-start">
      <div className="flex-shrink-0">
        <svg className="h-6 w-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="ml-3 flex-1">
        <h3 className="text-sm font-medium text-yellow-800">
          {moduleId.replace('_', ' ')} Temporarily Unavailable
        </h3>
        <p className="mt-2 text-sm text-yellow-700">
          {error.toUserMessage()}
        </p>
        {canRetry && (
          <div className="mt-4">
            <button
              onClick={resetError}
              className="text-sm bg-yellow-100 text-yellow-800 px-3 py-2 rounded hover:bg-yellow-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
        {featureFlags.isEnabled('DEVELOPER_TOOLS') && (
          <details className="mt-4 text-xs text-yellow-600">
            <summary className="cursor-pointer">Technical Details</summary>
            <pre className="mt-2 p-2 bg-yellow-100 rounded text-xs overflow-auto">
              {JSON.stringify(error.toLogEntry(), null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  </div>
);

/**
 * Specialized error boundaries for specific modules
 */

/**
 * Donation module error boundary
 */
export const DonationErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ModularErrorBoundary
    moduleId="DONATION_MODULE"
    enableRecovery={true}
    maxRetries={3}
    fallbackComponent={({ error, resetError, canRetry }) => (
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-lg font-medium text-blue-800 mb-2">Donation System Temporarily Unavailable</h3>
        <p className="text-blue-600 mb-4">
          There's a temporary issue with the donation tracking system. You can still view your existing donations.
        </p>
        {canRetry && (
          <button onClick={resetError} className="btn-primary">
            Try Again
          </button>
        )}
      </div>
    )}
  >
    {children}
  </ModularErrorBoundary>
);

/**
 * Payment module error boundary
 */
export const PaymentErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ModularErrorBoundary
    moduleId="PAYMENT_MODULE"
    enableRecovery={false} // Payment errors should not auto-retry
    isolateErrors={true}
    fallbackComponent={({ error, resetError }) => (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-lg font-medium text-red-800 mb-2">Payment System Error</h3>
        <p className="text-red-600 mb-4">
          There was an issue with the payment system. No charges have been processed.
        </p>
        <button onClick={resetError} className="btn-secondary">
          Return to Previous Page
        </button>
      </div>
    )}
  >
    {children}
  </ModularErrorBoundary>
);

/**
 * External API error boundary
 */
export const ExternalAPIErrorBoundary: React.FC<{
  children: ReactNode;
  apiName: string;
}> = ({ children, apiName }) => (
  <ModularErrorBoundary
    moduleId={`${apiName.toUpperCase()}_API`}
    enableRecovery={true}
    maxRetries={2}
    fallbackComponent={({ error, resetError, canRetry }) => (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">
          {apiName} service is temporarily unavailable. You can still enter values manually.
        </p>
        {canRetry && (
          <button onClick={resetError} className="text-xs btn-secondary">
            Retry Connection
          </button>
        )}
      </div>
    )}
  >
    {children}
  </ModularErrorBoundary>
);

export default ModularErrorBoundary;