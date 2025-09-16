/**
 * Donations routes for Cloudflare Workers
 */

import { validateSession, getSessionFromRequest } from '../utils/auth.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse
} from '../utils/response.js';
import {
  isValidAmount,
  isValidDate,
  isValidDonationType,
  validateDonationMetadata,
  sanitizeInput
} from '../utils/validation.js';
import { canUserCreateDonation, isPaymentEnforcementEnabled } from '../utils/config.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle donations routes
 */
export async function handleDonations(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/donations', '');
  const method = request.method;

  // All donation routes require authentication
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);

  if (!session) {
    return unauthorizedResponse();
  }

  switch (true) {
    case path === '' && method === 'GET':
      return handleGetDonations(request, env, session);

    case path === '' && method === 'POST':
      return handleCreateDonation(request, env, session);

    case path.match(/^\/[a-f0-9-]+$/) && method === 'GET':
      return handleGetDonation(request, env, session, path.substring(1));

    case path.match(/^\/[a-f0-9-]+$/) && method === 'PUT':
      return handleUpdateDonation(request, env, session, path.substring(1));

    case path.match(/^\/[a-f0-9-]+$/) && method === 'DELETE':
      return handleDeleteDonation(request, env, session, path.substring(1));

    case path === '/summary' && method === 'GET':
      return handleGetDonationSummary(request, env, session);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Get user's donations with filtering and pagination
 */
async function handleGetDonations(request, env, session) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const type = url.searchParams.get('type');
    const year = url.searchParams.get('year');

    let whereClause = 'WHERE user_id = ?';
    const params = [session.user_id];

    if (type && isValidDonationType(type)) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    if (year) {
      whereClause += ' AND strftime("%Y", date) = ?';
      params.push(year);
    }

    const donations = await env.DB.prepare(`
      SELECT
        d.*,
        c.name as charity_name,
        c.ein as charity_ein
      FROM donations d
      LEFT JOIN charities c ON d.charity_id = c.id
      ${whereClause}
      ORDER BY d.date DESC, d.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM donations d ${whereClause}
    `).bind(...params).first();

    return successResponse({
      donations: donations.results || [],
      pagination: {
        total: countResult.total,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Get donations error:', error);
    return errorResponse('Failed to retrieve donations');
  }
}

/**
 * Create a new donation
 */
async function handleCreateDonation(request, env, session) {
  try {
    const body = await request.json();
    const {
      charity_id,
      type,
      date,
      tax_deductible_amount,
      fair_market_value,
      cost_basis,
      description,
      metadata
    } = body;

    // Validation
    const errors = [];
    if (!charity_id) errors.push('Charity is required');
    if (!type || !isValidDonationType(type)) errors.push('Valid donation type is required');
    if (!date || !isValidDate(date)) errors.push('Valid date is required');
    if (!tax_deductible_amount || !isValidAmount(tax_deductible_amount)) {
      errors.push('Valid tax deductible amount is required');
    }
    if (metadata && !validateDonationMetadata(type, metadata)) {
      errors.push('Invalid metadata for donation type');
    }

    if (errors.length > 0) {
      return validationErrorResponse(errors);
    }

    // Check donation limit (respects payment enforcement feature flag)
    if (isPaymentEnforcementEnabled(env)) {
      const donationCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM donations WHERE user_id = ?
      `).bind(session.user_id).first();

      if (!canUserCreateDonation(session, donationCount.count, env)) {
        return errorResponse('Donation limit reached. Upgrade to Pro for unlimited donations.', 402);
      }
    }
    // Note: If payment enforcement is disabled, unlimited donations are allowed

    // Verify charity exists
    const charity = await env.DB.prepare(`
      SELECT id, name FROM charities WHERE id = ?
    `).bind(charity_id).first();

    if (!charity) {
      return errorResponse('Charity not found', 404);
    }

    // Calculate capital gains avoided for investments
    let capitalGainsAvoided = 0;
    if ((type === 'stock' || type === 'crypto') && fair_market_value && cost_basis) {
      capitalGainsAvoided = Math.max(0, fair_market_value - cost_basis);
    }

    // Create donation
    const donationId = uuidv4();
    await env.DB.prepare(`
      INSERT INTO donations (
        id, user_id, charity_id, type, date, tax_deductible_amount,
        fair_market_value, cost_basis, capital_gains_avoided,
        description, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      donationId,
      session.user_id,
      charity_id,
      type,
      date,
      tax_deductible_amount,
      fair_market_value || null,
      cost_basis || null,
      capitalGainsAvoided,
      sanitizeInput(description) || null,
      metadata ? JSON.stringify(metadata) : null
    ).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'create_donation', 'donation', ?, ?)
    `).bind(
      session.user_id,
      donationId,
      JSON.stringify({ type, amount: tax_deductible_amount, charity: charity.name })
    ).run();

    // Retrieve created donation with charity info
    const createdDonation = await env.DB.prepare(`
      SELECT
        d.*,
        c.name as charity_name,
        c.ein as charity_ein
      FROM donations d
      LEFT JOIN charities c ON d.charity_id = c.id
      WHERE d.id = ?
    `).bind(donationId).first();

    return successResponse(createdDonation, 'Donation created successfully', 201);

  } catch (error) {
    console.error('Create donation error:', error);
    return errorResponse('Failed to create donation');
  }
}

/**
 * Get a specific donation
 */
async function handleGetDonation(request, env, session, donationId) {
  try {
    const donation = await env.DB.prepare(`
      SELECT
        d.*,
        c.name as charity_name,
        c.ein as charity_ein
      FROM donations d
      LEFT JOIN charities c ON d.charity_id = c.id
      WHERE d.id = ? AND d.user_id = ?
    `).bind(donationId, session.user_id).first();

    if (!donation) {
      return errorResponse('Donation not found', 404);
    }

    return successResponse(donation);

  } catch (error) {
    console.error('Get donation error:', error);
    return errorResponse('Failed to retrieve donation');
  }
}

/**
 * Update a donation
 */
async function handleUpdateDonation(request, env, session, donationId) {
  try {
    // Check if donation exists and belongs to user
    const existingDonation = await env.DB.prepare(`
      SELECT * FROM donations WHERE id = ? AND user_id = ?
    `).bind(donationId, session.user_id).first();

    if (!existingDonation) {
      return errorResponse('Donation not found', 404);
    }

    const body = await request.json();
    const {
      charity_id,
      type,
      date,
      tax_deductible_amount,
      fair_market_value,
      cost_basis,
      description,
      metadata
    } = body;

    // Validation
    const errors = [];
    if (charity_id && !(await env.DB.prepare('SELECT id FROM charities WHERE id = ?').bind(charity_id).first())) {
      errors.push('Charity not found');
    }
    if (type && !isValidDonationType(type)) errors.push('Invalid donation type');
    if (date && !isValidDate(date)) errors.push('Invalid date');
    if (tax_deductible_amount && !isValidAmount(tax_deductible_amount)) {
      errors.push('Invalid tax deductible amount');
    }

    if (errors.length > 0) {
      return validationErrorResponse(errors);
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (charity_id !== undefined) {
      updates.push('charity_id = ?');
      params.push(charity_id);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      params.push(date);
    }
    if (tax_deductible_amount !== undefined) {
      updates.push('tax_deductible_amount = ?');
      params.push(tax_deductible_amount);
    }
    if (fair_market_value !== undefined) {
      updates.push('fair_market_value = ?');
      params.push(fair_market_value);
    }
    if (cost_basis !== undefined) {
      updates.push('cost_basis = ?');
      params.push(cost_basis);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(sanitizeInput(description));
    }
    if (metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(donationId);

    await env.DB.prepare(`
      UPDATE donations SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
      VALUES (?, 'update_donation', 'donation', ?, ?, ?)
    `).bind(
      session.user_id,
      donationId,
      JSON.stringify(existingDonation),
      JSON.stringify(body)
    ).run();

    // Return updated donation
    const updatedDonation = await env.DB.prepare(`
      SELECT
        d.*,
        c.name as charity_name,
        c.ein as charity_ein
      FROM donations d
      LEFT JOIN charities c ON d.charity_id = c.id
      WHERE d.id = ?
    `).bind(donationId).first();

    return successResponse(updatedDonation, 'Donation updated successfully');

  } catch (error) {
    console.error('Update donation error:', error);
    return errorResponse('Failed to update donation');
  }
}

/**
 * Delete a donation
 */
async function handleDeleteDonation(request, env, session, donationId) {
  try {
    // Check if donation exists and belongs to user
    const donation = await env.DB.prepare(`
      SELECT * FROM donations WHERE id = ? AND user_id = ?
    `).bind(donationId, session.user_id).first();

    if (!donation) {
      return errorResponse('Donation not found', 404);
    }

    // Delete donation
    await env.DB.prepare(`
      DELETE FROM donations WHERE id = ?
    `).bind(donationId).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values)
      VALUES (?, 'delete_donation', 'donation', ?, ?)
    `).bind(
      session.user_id,
      donationId,
      JSON.stringify(donation)
    ).run();

    return successResponse(null, 'Donation deleted successfully');

  } catch (error) {
    console.error('Delete donation error:', error);
    return errorResponse('Failed to delete donation');
  }
}

/**
 * Get donation summary for tax purposes
 */
async function handleGetDonationSummary(request, env, session) {
  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year') || new Date().getFullYear().toString();

    const summary = await env.DB.prepare(`
      SELECT
        type,
        COUNT(*) as count,
        SUM(tax_deductible_amount) as total_deductible,
        SUM(COALESCE(capital_gains_avoided, 0)) as total_capital_gains_avoided
      FROM donations
      WHERE user_id = ? AND strftime('%Y', date) = ?
      GROUP BY type
      ORDER BY total_deductible DESC
    `).bind(session.user_id, year).all();

    const yearTotal = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_donations,
        SUM(tax_deductible_amount) as total_deductible,
        SUM(COALESCE(capital_gains_avoided, 0)) as total_capital_gains_avoided
      FROM donations
      WHERE user_id = ? AND strftime('%Y', date) = ?
    `).bind(session.user_id, year).first();

    return successResponse({
      year: parseInt(year),
      summary: summary.results || [],
      totals: yearTotal
    });

  } catch (error) {
    console.error('Get donation summary error:', error);
    return errorResponse('Failed to retrieve donation summary');
  }
}