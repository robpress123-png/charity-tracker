/**
 * Feature Flags System for Safe Deployments
 * Allows enabling/disabling features without code changes
 * Supports gradual rollouts and instant rollbacks
 */

/**
 * Feature flag configuration interface
 */
export interface IFeatureFlags {
  // Core features (always enabled - system requirements)
  readonly BASIC_AUTH: true;
  readonly DONATION_TRACKING: true;
  readonly CHARITY_SEARCH: true;

  // Standard features (can be toggled for maintenance/issues)
  MONEY_DONATIONS: boolean;
  ITEMS_DONATIONS: boolean;
  MILEAGE_DONATIONS: boolean;
  STOCK_DONATIONS: boolean;
  CRYPTO_DONATIONS: boolean;

  // External API integrations (can be disabled if APIs fail)
  STOCK_PRICING_API: boolean;
  CRYPTO_PRICING_API: boolean;
  CHARITY_AUTOCOMPLETE: boolean;

  // Premium features (freemium model)
  ADVANCED_REPORTS: boolean;
  FILE_UPLOADS: boolean;
  DATA_EXPORT: boolean;
  TAX_OPTIMIZATION_TOOLS: boolean;

  // Admin features (role-based)
  ADMIN_PANEL: boolean;
  USER_MANAGEMENT: boolean;
  CHARITY_VERIFICATION: boolean;
  SYSTEM_MONITORING: boolean;

  // Payment features
  PAYMENT_ENFORCEMENT: boolean;  // Controls donation limits enforcement
  STRIPE_PAYMENTS: boolean;
  LICENSE_UPGRADES: boolean;

  // Experimental features (gradual rollout)
  NEW_DASHBOARD_UI: boolean;
  AI_TAX_SUGGESTIONS: boolean;
  BULK_IMPORT: boolean;
  MOBILE_APP_INTEGRATION: boolean;

  // Development/debugging features
  DEVELOPER_TOOLS: boolean;
  PERFORMANCE_MONITORING: boolean;
  ERROR_REPORTING: boolean;
}

/**
 * Feature flag with rollout configuration
 */
interface FeatureFlagConfig {
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  userSegments?: string[]; // Target specific user groups
  startDate?: Date; // When feature becomes available
  endDate?: Date; // When feature expires
  dependencies?: string[]; // Other flags this depends on
  rollbackOnError?: boolean; // Auto-disable if errors spike
  description?: string; // What this flag controls
}

/**
 * Feature flags manager
 */
export class FeatureFlagsManager {
  private flags: Map<string, FeatureFlagConfig> = new Map();
  private userContext?: UserContext;
  private errorCounts: Map<string, number> = new Map();
  private listeners: Map<string, ((enabled: boolean) => void)[]> = new Map();

  constructor(initialFlags?: Partial<IFeatureFlags>) {
    this.initializeDefaultFlags();

    if (initialFlags) {
      this.updateFlags(initialFlags);
    }
  }

  /**
   * Initialize default flag configuration
   */
  private initializeDefaultFlags(): void {
    const defaultFlags: Record<keyof IFeatureFlags, FeatureFlagConfig> = {
      // Core features - always enabled
      BASIC_AUTH: { enabled: true, description: 'User authentication system' },
      DONATION_TRACKING: { enabled: true, description: 'Core donation tracking functionality' },
      CHARITY_SEARCH: { enabled: true, description: 'Charity search and selection' },

      // Standard features - stable and enabled by default
      MONEY_DONATIONS: { enabled: true, rollbackOnError: true, description: 'Cash/check donations' },
      ITEMS_DONATIONS: { enabled: true, rollbackOnError: true, description: 'Item donations with valuation' },
      MILEAGE_DONATIONS: { enabled: true, rollbackOnError: true, description: 'Mileage-based donations' },
      STOCK_DONATIONS: { enabled: true, rollbackOnError: true, description: 'Stock and securities donations' },
      CRYPTO_DONATIONS: { enabled: true, rollbackOnError: true, description: 'Cryptocurrency donations' },

      // External APIs - can be disabled if third-party services fail
      STOCK_PRICING_API: {
        enabled: true,
        rollbackOnError: true,
        dependencies: ['STOCK_DONATIONS'],
        description: 'Real-time stock price lookup'
      },
      CRYPTO_PRICING_API: {
        enabled: true,
        rollbackOnError: true,
        dependencies: ['CRYPTO_DONATIONS'],
        description: 'Real-time crypto price lookup'
      },
      CHARITY_AUTOCOMPLETE: {
        enabled: true,
        rollbackOnError: true,
        dependencies: ['CHARITY_SEARCH'],
        description: 'Type-ahead charity search'
      },

      // Premium features - enabled based on user license
      ADVANCED_REPORTS: { enabled: true, userSegments: ['paid', 'admin'], description: 'Detailed tax reports' },
      FILE_UPLOADS: { enabled: true, userSegments: ['paid', 'admin'], description: 'Receipt file uploads' },
      DATA_EXPORT: { enabled: true, userSegments: ['paid', 'admin'], description: 'CSV/PDF export' },
      TAX_OPTIMIZATION_TOOLS: { enabled: true, userSegments: ['paid', 'admin'], description: 'Tax planning tools' },

      // Admin features - admin role only
      ADMIN_PANEL: { enabled: true, userSegments: ['admin'], description: 'Administrative interface' },
      USER_MANAGEMENT: { enabled: true, userSegments: ['admin'], description: 'User account management' },
      CHARITY_VERIFICATION: { enabled: true, userSegments: ['admin'], description: 'Charity verification system' },
      SYSTEM_MONITORING: { enabled: true, userSegments: ['admin'], description: 'System health monitoring' },

      // Payment features
      PAYMENT_ENFORCEMENT: { enabled: false, description: 'Enforce donation limits for free users' },
      STRIPE_PAYMENTS: { enabled: true, rollbackOnError: true, description: 'Stripe payment processing' },
      LICENSE_UPGRADES: {
        enabled: true,
        dependencies: ['STRIPE_PAYMENTS', 'PAYMENT_ENFORCEMENT'],
        rollbackOnError: true,
        description: 'License upgrade flow'
      },

      // Experimental features - gradual rollout
      NEW_DASHBOARD_UI: {
        enabled: false,
        rolloutPercentage: 10,
        rollbackOnError: true,
        description: 'Redesigned dashboard interface'
      },
      AI_TAX_SUGGESTIONS: {
        enabled: false,
        rolloutPercentage: 5,
        rollbackOnError: true,
        description: 'AI-powered tax optimization suggestions'
      },
      BULK_IMPORT: {
        enabled: false,
        rolloutPercentage: 25,
        userSegments: ['paid', 'admin'],
        description: 'Bulk donation import from CSV'
      },
      MOBILE_APP_INTEGRATION: {
        enabled: false,
        rolloutPercentage: 0,
        description: 'Mobile app connectivity'
      },

      // Development features - disabled in production
      DEVELOPER_TOOLS: { enabled: false, userSegments: ['developer'], description: 'Development debugging tools' },
      PERFORMANCE_MONITORING: { enabled: true, description: 'Performance monitoring and metrics' },
      ERROR_REPORTING: { enabled: true, description: 'Error reporting and logging' }
    };

    // Initialize all flags
    Object.entries(defaultFlags).forEach(([key, config]) => {
      this.flags.set(key, config);
    });
  }

  /**
   * Set user context for personalized flag evaluation
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
  }

  /**
   * Check if a feature is enabled for the current user
   */
  isEnabled(flagName: keyof IFeatureFlags): boolean {
    const config = this.flags.get(flagName as string);

    if (!config) {
      console.warn(`Feature flag ${flagName} not found, defaulting to false`);
      return false;
    }

    // Core features are always enabled
    if (flagName === 'BASIC_AUTH' || flagName === 'DONATION_TRACKING' || flagName === 'CHARITY_SEARCH') {
      return true;
    }

    // Check if feature is globally disabled
    if (!config.enabled) {
      return false;
    }

    // Check date-based availability
    if (config.startDate && new Date() < config.startDate) {
      return false;
    }
    if (config.endDate && new Date() > config.endDate) {
      return false;
    }

    // Check dependencies
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        if (!this.isEnabled(dep as keyof IFeatureFlags)) {
          return false;
        }
      }
    }

    // Check user segment eligibility
    if (config.userSegments && this.userContext) {
      const hasRequiredSegment = config.userSegments.some(segment => {
        switch (segment) {
          case 'paid':
            return this.userContext!.isPaidUser;
          case 'admin':
            return this.userContext!.isAdmin;
          case 'developer':
            return this.userContext!.isDeveloper;
          default:
            return false;
        }
      });

      if (!hasRequiredSegment) {
        return false;
      }
    }

    // Check rollout percentage
    if (config.rolloutPercentage !== undefined && config.rolloutPercentage < 100) {
      if (!this.userContext?.userId) {
        return false; // Can't do percentage rollout without user ID
      }

      // Consistent hash-based rollout
      const hash = this.hashUserId(this.userContext.userId, flagName as string);
      const userPercentile = hash % 100;
      return userPercentile < config.rolloutPercentage;
    }

    return true;
  }

  /**
   * Get all enabled flags as a typed object
   */
  getEnabledFlags(): IFeatureFlags {
    const enabledFlags = {} as any;

    // Check each flag
    const flagNames: (keyof IFeatureFlags)[] = [
      'BASIC_AUTH', 'DONATION_TRACKING', 'CHARITY_SEARCH',
      'MONEY_DONATIONS', 'ITEMS_DONATIONS', 'MILEAGE_DONATIONS', 'STOCK_DONATIONS', 'CRYPTO_DONATIONS',
      'STOCK_PRICING_API', 'CRYPTO_PRICING_API', 'CHARITY_AUTOCOMPLETE',
      'ADVANCED_REPORTS', 'FILE_UPLOADS', 'DATA_EXPORT', 'TAX_OPTIMIZATION_TOOLS',
      'ADMIN_PANEL', 'USER_MANAGEMENT', 'CHARITY_VERIFICATION', 'SYSTEM_MONITORING',
      'PAYMENT_ENFORCEMENT', 'STRIPE_PAYMENTS', 'LICENSE_UPGRADES',
      'NEW_DASHBOARD_UI', 'AI_TAX_SUGGESTIONS', 'BULK_IMPORT', 'MOBILE_APP_INTEGRATION',
      'DEVELOPER_TOOLS', 'PERFORMANCE_MONITORING', 'ERROR_REPORTING'
    ];

    flagNames.forEach(flagName => {
      if (flagName === 'BASIC_AUTH' || flagName === 'DONATION_TRACKING' || flagName === 'CHARITY_SEARCH') {
        enabledFlags[flagName] = true; // Core features always true
      } else {
        enabledFlags[flagName] = this.isEnabled(flagName);
      }
    });

    return enabledFlags;
  }

  /**
   * Update flag configuration
   */
  updateFlag(flagName: string, config: Partial<FeatureFlagConfig>): void {
    const currentConfig = this.flags.get(flagName) || { enabled: false };
    const updatedConfig = { ...currentConfig, ...config };

    this.flags.set(flagName, updatedConfig);

    // Notify listeners
    const listeners = this.listeners.get(flagName) || [];
    listeners.forEach(listener => listener(updatedConfig.enabled));

    console.log(`🚩 Feature flag updated: ${flagName} = ${updatedConfig.enabled}`);
  }

  /**
   * Update multiple flags at once
   */
  updateFlags(flags: Partial<IFeatureFlags>): void {
    Object.entries(flags).forEach(([flagName, enabled]) => {
      this.updateFlag(flagName, { enabled });
    });
  }

  /**
   * Report error for a feature (may trigger auto-rollback)
   */
  reportError(flagName: string, error: Error): void {
    const config = this.flags.get(flagName);
    if (!config || !config.rollbackOnError) return;

    // Increment error count
    const currentCount = this.errorCounts.get(flagName) || 0;
    this.errorCounts.set(flagName, currentCount + 1);

    // Auto-rollback if error threshold exceeded (10 errors in short period)
    if (currentCount >= 10) {
      console.warn(`🚨 Auto-rolling back feature ${flagName} due to errors`);
      this.updateFlag(flagName, { enabled: false });

      // Reset error count after rollback
      this.errorCounts.delete(flagName);
    }
  }

  /**
   * Listen for flag changes
   */
  onFlagChange(flagName: string, callback: (enabled: boolean) => void): () => void {
    if (!this.listeners.has(flagName)) {
      this.listeners.set(flagName, []);
    }

    this.listeners.get(flagName)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(flagName) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get flag configuration details (for admin interface)
   */
  getFlagConfig(flagName: string): FeatureFlagConfig | null {
    return this.flags.get(flagName) || null;
  }

  /**
   * Export current flag state (for debugging/support)
   */
  exportState(): Record<string, any> {
    const state: Record<string, any> = {};

    this.flags.forEach((config, flagName) => {
      state[flagName] = {
        config,
        enabled: this.isEnabled(flagName as keyof IFeatureFlags),
        errorCount: this.errorCounts.get(flagName) || 0
      };
    });

    return {
      flags: state,
      userContext: this.userContext,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Hash user ID for consistent rollout percentages
   */
  private hashUserId(userId: string, flagName: string): number {
    const str = `${userId}_${flagName}`;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }
}

/**
 * User context for feature flag evaluation
 */
interface UserContext {
  userId: string;
  isPaidUser: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  createdAt: Date;
  lastLogin: Date;
}

/**
 * Global feature flags instance
 */
export const featureFlags = new FeatureFlagsManager();

/**
 * React hook for accessing feature flags
 */
export function useFeatureFlags(): IFeatureFlags {
  return featureFlags.getEnabledFlags();
}

/**
 * React hook for individual feature flag
 */
export function useFeatureFlag(flagName: keyof IFeatureFlags): boolean {
  return featureFlags.isEnabled(flagName);
}