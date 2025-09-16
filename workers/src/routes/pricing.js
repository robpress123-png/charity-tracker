/**
 * External pricing APIs for stock and cryptocurrency data
 * Replicates the demo's pricing functionality with error handling
 */

import { validateSession, getSessionFromRequest } from '../utils/auth.js';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response.js';

/**
 * Handle pricing API routes
 */
export async function handlePricing(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/pricing', '');
  const method = request.method;

  switch (true) {
    case path === '/stock' && method === 'GET':
      return handleGetStockPrice(request, env);

    case path === '/crypto' && method === 'GET':
      return handleGetCryptoPrice(request, env);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Get stock price using multiple fallback APIs
 * Replicates demo functionality: AAPL works, MSFT has limitations
 */
async function handleGetStockPrice(request, env) {
  try {
    // Require authentication for pricing data
    const sessionId = getSessionFromRequest(request);
    const session = await validateSession(sessionId, env);

    if (!session) {
      return errorResponse('Authentication required', 401);
    }

    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    const date = url.searchParams.get('date');

    // Validation
    if (!symbol) {
      return validationErrorResponse(['Stock symbol is required (e.g., AAPL)']);
    }

    // Check if historical price is requested
    const requestDate = new Date(date);
    const today = new Date();
    const isHistorical = date && requestDate.toDateString() !== today.toDateString();

    if (isHistorical) {
      return errorResponse('Historical stock prices require manual entry for this demo. Please enter the price from your broker or financial website.', 400);
    }

    // Try to fetch current price using multiple APIs (matching demo logic)
    const price = await fetchStockPriceWithFallbacks(symbol, env);

    if (price === null) {
      // Specific error message for symbols that don't work (like MSFT in demo)
      const limitedSymbols = ['MSFT', 'GOOGL', 'AMZN']; // Demo showed these had API limits
      if (limitedSymbols.includes(symbol)) {
        return errorResponse(`Unable to fetch price for ${symbol}. Free APIs have daily limits. Please enter manually or try again later.`, 400);
      }

      return errorResponse('Unable to fetch current stock price. All APIs unavailable. Please enter manually.', 400);
    }

    return successResponse({
      symbol,
      price: parseFloat(price.toFixed(2)),
      date: new Date().toISOString(),
      source: 'yahoo_finance',
      note: 'Current market price'
    }, `Price updated: $${price.toFixed(2)} for ${symbol}`);

  } catch (error) {
    console.error('Stock price error:', error);
    return errorResponse('Unable to fetch stock price. Please enter manually. (Free APIs have daily limits)', 400);
  }
}

/**
 * Get cryptocurrency price using CoinGecko API
 * Replicates demo's crypto pricing functionality
 */
async function handleGetCryptoPrice(request, env) {
  try {
    // Require authentication for pricing data
    const sessionId = getSessionFromRequest(request);
    const session = await validateSession(sessionId, env);

    if (!session) {
      return errorResponse('Authentication required', 401);
    }

    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol')?.toUpperCase();
    const date = url.searchParams.get('date');

    // Validation
    if (!symbol) {
      return validationErrorResponse(['Cryptocurrency symbol is required (e.g., BTC)']);
    }

    // Map symbols to CoinGecko IDs (matching demo)
    const cryptoMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'ADA': 'cardano',
      'SOL': 'solana',
      'XRP': 'ripple',
      'DOT': 'polkadot',
      'AVAX': 'avalanche-2',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
      'OTHER': null
    };

    const cryptoId = cryptoMap[symbol];
    if (!cryptoId) {
      if (symbol === 'OTHER') {
        return errorResponse('Please select a specific cryptocurrency type for automatic pricing', 400);
      }
      return errorResponse(`Cryptocurrency ${symbol} not supported for automatic pricing. Please enter manually.`, 400);
    }

    // Try to fetch price with caching (5-minute cache like demo)
    const cacheKey = `crypto_price_${cryptoId}_${date || 'current'}`;
    let cachedPrice = null;

    try {
      // Check cache first (using KV for 5-minute cache)
      const cached = await env.SESSIONS.get(cacheKey);
      if (cached) {
        const { price, timestamp } = JSON.parse(cached);
        const now = Date.now();
        if (now - timestamp < 5 * 60 * 1000) { // 5 minutes
          cachedPrice = price;
        }
      }
    } catch (cacheError) {
      console.warn('Cache read error:', cacheError);
    }

    let price = cachedPrice;
    let isHistorical = false;

    if (!price) {
      // Determine if historical or current price
      if (date) {
        const requestDate = new Date(date);
        const today = new Date();
        isHistorical = requestDate.toDateString() !== today.toDateString();
      }

      if (isHistorical) {
        // Historical price from CoinGecko
        price = await fetchHistoricalCryptoPrice(cryptoId, date);
      } else {
        // Current price from CoinGecko
        price = await fetchCurrentCryptoPrice(cryptoId);
      }

      // Cache the result for 5 minutes
      if (price) {
        try {
          await env.SESSIONS.put(cacheKey, JSON.stringify({
            price,
            timestamp: Date.now()
          }), { expirationTtl: 300 }); // 5 minutes
        } catch (cacheError) {
          console.warn('Cache write error:', cacheError);
        }
      }
    }

    if (price === null) {
      return errorResponse(`Unable to fetch ${symbol} price. CoinGecko API may be unavailable. Please enter manually.`, 400);
    }

    return successResponse({
      symbol,
      price: parseFloat(price.toFixed(2)),
      date: date || new Date().toISOString(),
      source: 'coingecko',
      isHistorical,
      note: isHistorical ? 'Historical price' : 'Current market price'
    }, `${symbol} price: $${price.toFixed(2)}`);

  } catch (error) {
    console.error('Crypto price error:', error);
    return errorResponse('Unable to fetch cryptocurrency price. Please enter manually.', 400);
  }
}

/**
 * Fetch stock price with multiple fallback APIs (matching demo behavior)
 */
async function fetchStockPriceWithFallbacks(symbol, env) {
  // API configurations (matching demo)
  const apis = [
    {
      name: 'Yahoo Finance Proxy',
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      parseResponse: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice;
        return price && !isNaN(price) ? parseFloat(price) : null;
      }
    }
  ];

  // Try each API in sequence
  for (const api of apis) {
    try {
      console.log(`Attempting ${api.name} for ${symbol}`);

      const response = await fetch(api.url, {
        headers: {
          'User-Agent': 'Charity-Tracker/1.0',
          'Accept': 'application/json'
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        console.warn(`${api.name} failed with status:`, response.status);
        continue;
      }

      const data = await response.json();
      const price = api.parseResponse(data);

      if (price && price > 0) {
        console.log(`${api.name} success: $${price} for ${symbol}`);
        return price;
      } else {
        console.warn(`${api.name} returned invalid price for ${symbol}:`, price);
      }
    } catch (error) {
      console.warn(`${api.name} error for ${symbol}:`, error.message);
      continue;
    }
  }

  // All APIs failed
  console.error(`All stock price APIs failed for ${symbol}`);
  return null;
}

/**
 * Fetch current crypto price from CoinGecko
 */
async function fetchCurrentCryptoPrice(cryptoId) {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data[cryptoId]?.usd;

    return price && price > 0 ? price : null;
  } catch (error) {
    console.error(`CoinGecko current price error for ${cryptoId}:`, error);
    return null;
  }
}

/**
 * Fetch historical crypto price from CoinGecko
 */
async function fetchHistoricalCryptoPrice(cryptoId, date) {
  try {
    // Format date for CoinGecko API (DD-MM-YYYY)
    const dateObj = new Date(date);
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId}/history?date=${formattedDate}`,
      {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko historical API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data?.market_data?.current_price?.usd;

    return price && price > 0 ? price : null;
  } catch (error) {
    console.error(`CoinGecko historical price error for ${cryptoId} on ${date}:`, error);
    return null;
  }
}