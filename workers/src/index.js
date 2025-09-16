/**
 * Charity Tracker - Cloudflare Workers API
 * Main entry point for all API routes
 */

import { handleAuth } from './routes/auth.js';
import { handleDonations } from './routes/donations.js';
import { handleCharities } from './routes/charities.js';
import { handleFiles } from './routes/files.js';
import { handlePayments } from './routes/payments.js';
import { handleAdmin } from './routes/admin.js';
import { handleImport } from './routes/import.js';
import { handlePricing } from './routes/pricing.js';
import { corsHeaders, handleCORS } from './utils/cors.js';
import { errorResponse } from './utils/response.js';

export default {
  /**
   * Main request handler
   */
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return handleCORS(request);
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      // Health check endpoint
      if (pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Route API requests
      if (pathname.startsWith('/api/')) {
        const apiPath = pathname.replace('/api', '');

        if (apiPath.startsWith('/auth')) {
          return await handleAuth(request, env, ctx);
        }

        if (apiPath.startsWith('/donations')) {
          return await handleDonations(request, env, ctx);
        }

        if (apiPath.startsWith('/charities')) {
          return await handleCharities(request, env, ctx);
        }

        if (apiPath.startsWith('/files')) {
          return await handleFiles(request, env, ctx);
        }

        if (apiPath.startsWith('/payments')) {
          return await handlePayments(request, env, ctx);
        }

        if (apiPath.startsWith('/admin')) {
          return await handleAdmin(request, env, ctx);
        }

        if (apiPath.startsWith('/import')) {
          return await handleImport(request, env, ctx);
        }

        if (apiPath.startsWith('/pricing')) {
          return await handlePricing(request, env, ctx);
        }

        // Unknown API route
        return errorResponse('Not Found', 404);
      }

      // Default response for non-API routes
      return new Response('Charity Tracker API - Use /api/* endpoints', {
        status: 200,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Unhandled error:', error);
      return errorResponse('Internal Server Error', 500);
    }
  },

  /**
   * Scheduled event handler for maintenance tasks
   */
  async scheduled(event, env, ctx) {
    try {
      console.log('Running scheduled maintenance tasks');

      // Clean up expired sessions
      await env.DB.prepare(`
        DELETE FROM user_sessions
        WHERE expires_at < datetime('now')
      `).run();

      // Clean up old audit logs (keep last 90 days)
      await env.DB.prepare(`
        DELETE FROM audit_logs
        WHERE created_at < datetime('now', '-90 days')
      `).run();

      console.log('Maintenance tasks completed successfully');
    } catch (error) {
      console.error('Scheduled task error:', error);
    }
  }
};