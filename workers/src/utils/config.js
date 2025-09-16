/**
 * Configuration and feature flags for Cloudflare Workers
 */

/**
 * Get environment variable with fallback
 */
function getEnvVar(env, key, defaultValue = null) {
  return env[key] || defaultValue;
}

/**
 * Parse boolean environment variable
 */
function getBooleanEnvVar(env, key, defaultValue = false) {
  const value = getEnvVar(env, key);
  if (value === null) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Get configuration object
 */
export function getConfig(env) {
  return {
    // Environment
    environment: getEnvVar(env, 'ENVIRONMENT', 'development'),

    // Feature flags
    features: {
      enablePaymentEnforcement: getBooleanEnvVar(env, 'ENABLE_PAYMENT_ENFORCEMENT', false),
      enableStockPricing: getBooleanEnvVar(env, 'ENABLE_STOCK_PRICING', true),
      enableCryptoPricing: getBooleanEnvVar(env, 'ENABLE_CRYPTO_PRICING', true),
      enableAdminPanel: getBooleanEnvVar(env, 'ENABLE_ADMIN_PANEL', true),
      enableFileUploads: getBooleanEnvVar(env, 'ENABLE_FILE_UPLOADS', true),
      enableAuditLogs: getBooleanEnvVar(env, 'ENABLE_AUDIT_LOGS', true)
    },

    // Payment configuration
    payment: {
      stripePublishableKey: getEnvVar(env, 'STRIPE_PUBLISHABLE_KEY'),
      stripeSecretKey: getEnvVar(env, 'STRIPE_SECRET_KEY'),
      stripeWebhookSecret: getEnvVar(env, 'STRIPE_WEBHOOK_SECRET')
    },

    // External APIs
    apis: {
      coinGeckoApiKey: getEnvVar(env, 'COINGECKO_API_KEY'),
      yahooFinanceEnabled: getBooleanEnvVar(env, 'ENABLE_YAHOO_FINANCE', true)
    },

    // Limits and defaults
    limits: {
      freeDonationLimit: parseInt(getEnvVar(env, 'FREE_DONATION_LIMIT', '2')),
      maxFileSize: parseInt(getEnvVar(env, 'MAX_FILE_SIZE', '10485760')), // 10MB
      sessionExpiryDays: parseInt(getEnvVar(env, 'SESSION_EXPIRY_DAYS', '7'))
    }
  };
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(env, featureName) {
  const config = getConfig(env);
  return config.features[featureName] || false;
}

/**
 * Check if payment enforcement is enabled
 */
export function isPaymentEnforcementEnabled(env) {
  return isFeatureEnabled(env, 'enablePaymentEnforcement');
}

/**
 * Get donation limit for user
 */
export function getDonationLimit(user, env) {
  const config = getConfig(env);

  // If payment enforcement is disabled, return unlimited
  if (!isPaymentEnforcementEnabled(env)) {
    return Infinity;
  }

  // If user has paid license, return unlimited
  if (user.license_type === 'paid') {
    return Infinity;
  }

  // Return configured free limit
  return user.donation_limit || config.limits.freeDonationLimit;
}

/**
 * Check if user can create donation
 */
export function canUserCreateDonation(user, currentDonationCount, env) {
  const limit = getDonationLimit(user, env);
  return currentDonationCount < limit;
}