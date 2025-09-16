/**
 * CORS utilities for Cloudflare Workers
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, set to specific domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
  'Access-Control-Max-Age': '86400',
};

export function handleCORS(request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}