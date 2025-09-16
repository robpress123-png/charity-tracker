/**
 * Input validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password) {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password &&
         password.length >= 8 &&
         /[A-Z]/.test(password) &&
         /[a-z]/.test(password) &&
         /\d/.test(password);
}

/**
 * Validate donation amount
 */
export function isValidAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 1000000;
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function isValidDate(date) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;

  const parsedDate = new Date(date);
  return parsedDate instanceof Date && !isNaN(parsedDate);
}

/**
 * Validate donation type
 */
export function isValidDonationType(type) {
  const validTypes = ['money', 'items', 'mileage', 'stock', 'crypto'];
  return validTypes.includes(type);
}

/**
 * Validate cryptocurrency symbol (matching demo exactly)
 */
export function isValidCryptoSymbol(symbol) {
  // Crypto symbols supported in demo
  const validSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'XRP', 'DOT', 'AVAX', 'MATIC', 'LTC', 'OTHER'];
  return validSymbols.includes(symbol);
}

/**
 * Validate EIN (Employer Identification Number)
 */
export function isValidEIN(ein) {
  const einRegex = /^\d{2}-\d{7}$/;
  return einRegex.test(ein);
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove < and > characters
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Validate donation metadata based on type
 */
export function validateDonationMetadata(type, metadata) {
  try {
    const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

    switch (type) {
      case 'money':
        // Payment methods matching demo
        return data.method && ['Cash', 'Check', 'Credit Card', 'Bank Transfer', 'Other'].includes(data.method);

      case 'items':
        // Items list with category, condition, quantity validation
        return Array.isArray(data.items) &&
               data.items.length > 0 &&
               data.items.every(item =>
                 item.category && item.condition && item.quantity > 0 && item.unitValue > 0
               );

      case 'mileage':
        // Mileage with IRS rate and purpose
        return data.miles && data.miles > 0 &&
               data.rate && data.rate > 0 &&
               data.purpose && data.purpose.trim().length > 0;

      case 'stock':
        // Stock with symbol, shares, and security type
        return data.symbol && data.shares && data.shares > 0 &&
               data.securityType &&
               ['Common Stock', 'Bond', 'Mutual Fund', 'ETF', 'Other Security'].includes(data.securityType);

      case 'crypto':
        // Cryptocurrency with symbol, amount, and optional transaction details
        return data.symbol && isValidCryptoSymbol(data.symbol) &&
               data.amount && data.amount > 0;

      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Rate limiting check
 */
export function checkRateLimit(identifier, env, maxRequests = 100, windowMinutes = 60) {
  // Implementation would use KV storage to track request counts
  // For now, return true (allow request)
  return true;
}