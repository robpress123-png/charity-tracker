/**
 * Charities routes for Cloudflare Workers
 */

import { validateSession, getSessionFromRequest } from '../utils/auth.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse
} from '../utils/response.js';
import {
  isValidEIN,
  sanitizeInput
} from '../utils/validation.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle charities routes
 */
export async function handleCharities(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/charities', '');
  const method = request.method;

  switch (true) {
    case path === '' && method === 'GET':
      return handleGetCharities(request, env);

    case path === '' && method === 'POST':
      return handleCreateCharity(request, env);

    case path.match(/^\/[a-f0-9-]+$/) && method === 'GET':
      return handleGetCharity(request, env, path.substring(1));

    case path === '/search' && method === 'GET':
      return handleSearchCharities(request, env);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Get charities with pagination and filtering
 */
async function handleGetCharities(request, env) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const verified = url.searchParams.get('verified');

    let whereClause = '';
    const params = [];

    if (verified !== null) {
      whereClause = 'WHERE is_verified = ?';
      params.push(verified === 'true');
    }

    const charities = await env.DB.prepare(`
      SELECT id, name, ein, is_verified, verification_date
      FROM charities
      ${whereClause}
      ORDER BY is_verified DESC, name ASC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM charities ${whereClause}
    `).bind(...params).first();

    return successResponse({
      charities: charities.results || [],
      pagination: {
        total: countResult.total,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Get charities error:', error);
    return errorResponse('Failed to retrieve charities');
  }
}

/**
 * Create a new charity
 */
async function handleCreateCharity(request, env) {
  try {
    // Require authentication for creating charities
    const sessionId = getSessionFromRequest(request);
    const session = await validateSession(sessionId, env);

    if (!session) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { name, ein, metadata } = body;

    // Validation
    const errors = [];
    if (!name || name.trim().length < 2) {
      errors.push('Charity name is required (minimum 2 characters)');
    }
    if (ein && !isValidEIN(ein)) {
      errors.push('Invalid EIN format (should be XX-XXXXXXX)');
    }

    if (errors.length > 0) {
      return validationErrorResponse(errors);
    }

    // Check if charity already exists
    const existingCharity = ein ? await env.DB.prepare(`
      SELECT id FROM charities WHERE ein = ?
    `).bind(ein).first() : null;

    if (existingCharity) {
      return errorResponse('Charity with this EIN already exists', 409);
    }

    // Create charity
    const charityId = uuidv4();
    const sanitizedName = sanitizeInput(name);

    await env.DB.prepare(`
      INSERT INTO charities (id, name, ein, metadata, is_verified)
      VALUES (?, ?, ?, ?, FALSE)
    `).bind(
      charityId,
      sanitizedName,
      ein || null,
      metadata ? JSON.stringify(metadata) : null
    ).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'create_charity', 'charity', ?, ?)
    `).bind(
      session.user_id,
      charityId,
      JSON.stringify({ name: sanitizedName, ein })
    ).run();

    // Return created charity
    const createdCharity = await env.DB.prepare(`
      SELECT id, name, ein, is_verified, created_at
      FROM charities WHERE id = ?
    `).bind(charityId).first();

    return successResponse(createdCharity, 'Charity created successfully', 201);

  } catch (error) {
    console.error('Create charity error:', error);
    return errorResponse('Failed to create charity');
  }
}

/**
 * Get a specific charity
 */
async function handleGetCharity(request, env, charityId) {
  try {
    const charity = await env.DB.prepare(`
      SELECT *
      FROM charities
      WHERE id = ?
    `).bind(charityId).first();

    if (!charity) {
      return errorResponse('Charity not found', 404);
    }

    // Get donation stats for this charity
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as donation_count,
        SUM(tax_deductible_amount) as total_donated,
        COUNT(DISTINCT user_id) as donor_count
      FROM donations
      WHERE charity_id = ?
    `).bind(charityId).first();

    return successResponse({
      ...charity,
      stats
    });

  } catch (error) {
    console.error('Get charity error:', error);
    return errorResponse('Failed to retrieve charity');
  }
}

/**
 * Search charities by name
 */
async function handleSearchCharities(request, env) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!query || query.trim().length < 2) {
      return validationErrorResponse(['Search query must be at least 2 characters']);
    }

    const searchTerm = `%${sanitizeInput(query)}%`;

    const charities = await env.DB.prepare(`
      SELECT id, name, ein, is_verified
      FROM charities
      WHERE name LIKE ? OR ein LIKE ?
      ORDER BY is_verified DESC, name ASC
      LIMIT ?
    `).bind(searchTerm, searchTerm, limit).all();

    return successResponse({
      charities: charities.results || [],
      query: query.trim()
    });

  } catch (error) {
    console.error('Search charities error:', error);
    return errorResponse('Failed to search charities');
  }
}