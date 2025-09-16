/**
 * Admin routes for Cloudflare Workers
 */

import { validateSession, getSessionFromRequest } from '../utils/auth.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse
} from '../utils/response.js';
import { sanitizeInput } from '../utils/validation.js';

/**
 * Handle admin routes
 */
export async function handleAdmin(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/admin', '');
  const method = request.method;

  // All admin routes require admin authentication
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  switch (true) {
    case path === '/dashboard' && method === 'GET':
      return handleGetDashboard(request, env, session);

    case path === '/users' && method === 'GET':
      return handleGetUsers(request, env, session);

    case path.match(/^\/users\/[a-f0-9-]+$/) && method === 'PUT':
      return handleUpdateUser(request, env, session, path.split('/')[2]);

    case path === '/charities/unverified' && method === 'GET':
      return handleGetUnverifiedCharities(request, env, session);

    case path.match(/^\/charities\/[a-f0-9-]+\/verify$/) && method === 'POST':
      return handleVerifyCharity(request, env, session, path.split('/')[2]);

    case path === '/content' && method === 'GET':
      return handleGetAdminContent(request, env, session);

    case path === '/content' && method === 'POST':
      return handleCreateAdminContent(request, env, session);

    case path.match(/^\/content\/[^\/]+$/) && method === 'PUT':
      return handleUpdateAdminContent(request, env, session, path.split('/')[2]);

    case path === '/audit-logs' && method === 'GET':
      return handleGetAuditLogs(request, env, session);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Get admin dashboard statistics
 */
async function handleGetDashboard(request, env, session) {
  try {
    // Basic stats query
    const stats = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
        (SELECT COUNT(*) FROM users WHERE license_type = 'paid' AND (license_expires_at IS NULL OR license_expires_at > datetime('now'))) as paid_users,
        (SELECT COUNT(*) FROM donations) as total_donations,
        (SELECT COALESCE(SUM(tax_deductible_amount), 0) FROM donations) as total_donated,
        (SELECT COUNT(*) FROM charities WHERE is_verified = 1) as verified_charities,
        (SELECT COUNT(*) FROM charities WHERE is_verified = 0) as unverified_charities,
        (SELECT COUNT(*) FROM user_sessions WHERE expires_at > datetime('now')) as active_sessions
    `).first();

    // Recent activity
    const recentActivity = await env.DB.prepare(`
      SELECT
        al.action,
        al.resource_type,
        al.created_at,
        u.name as user_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `).all();

    // User registration trends (last 30 days)
    const userTrends = await env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as registrations
      FROM users
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
      LIMIT 30
    `).all();

    // Donation trends by type (last 30 days)
    const donationTrends = await env.DB.prepare(`
      SELECT
        type,
        COUNT(*) as count,
        COALESCE(SUM(tax_deductible_amount), 0) as total_amount
      FROM donations
      WHERE date >= date('now', '-30 days')
      GROUP BY type
      ORDER BY total_amount DESC
    `).all();

    // Revenue data
    const revenueData = await env.DB.prepare(`
      SELECT
        COUNT(*) as completed_payments,
        COALESCE(SUM(amount), 0) as total_revenue,
        AVG(amount) as avg_payment
      FROM payment_transactions
      WHERE status = 'completed'
        AND created_at >= datetime('now', '-30 days')
    `).first();

    return successResponse({
      stats,
      recent_activity: recentActivity.results || [],
      user_trends: userTrends.results || [],
      donation_trends: donationTrends.results || [],
      revenue_data: revenueData
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    return errorResponse('Failed to retrieve dashboard data');
  }
}

/**
 * Get users with filtering and pagination
 */
async function handleGetUsers(request, env, session) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = url.searchParams.get('search');
    const role = url.searchParams.get('role');
    const licenseType = url.searchParams.get('license_type');

    let whereConditions = ['u.is_active = 1'];
    const params = [];

    if (search) {
      whereConditions.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (role) {
      whereConditions.push('u.role = ?');
      params.push(role);
    }

    if (licenseType) {
      whereConditions.push('u.license_type = ?');
      params.push(licenseType);
    }

    const whereClause = whereConditions.join(' AND ');

    const users = await env.DB.prepare(`
      SELECT
        u.id, u.email, u.name, u.role, u.license_type, u.license_expires_at,
        u.donation_limit, u.created_at, u.last_login,
        COUNT(d.id) as donation_count,
        COALESCE(SUM(d.tax_deductible_amount), 0) as total_donated
      FROM users u
      LEFT JOIN donations d ON u.id = d.user_id
      WHERE ${whereClause}
      GROUP BY u.id, u.email, u.name, u.role, u.license_type, u.license_expires_at,
               u.donation_limit, u.created_at, u.last_login
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM users u WHERE ${whereClause}
    `).bind(...params).first();

    return successResponse({
      users: users.results || [],
      pagination: {
        total: countResult.total,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return errorResponse('Failed to retrieve users');
  }
}

/**
 * Update user (role, license, etc.)
 */
async function handleUpdateUser(request, env, session, userId) {
  try {
    const body = await request.json();
    const { role, license_type, license_expires_at, is_active } = body;

    // Validate user exists
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first();

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Build update query
    const updates = [];
    const params = [];

    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) {
        return validationErrorResponse(['Invalid role']);
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (license_type !== undefined) {
      if (!['free', 'paid'].includes(license_type)) {
        return validationErrorResponse(['Invalid license type']);
      }
      updates.push('license_type = ?');
      params.push(license_type);

      // Set donation limit based on license type
      updates.push('donation_limit = ?');
      params.push(license_type === 'paid' ? -1 : 2);
    }

    if (license_expires_at !== undefined) {
      updates.push('license_expires_at = ?');
      params.push(license_expires_at);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(userId);

    // Update user
    await env.DB.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
      VALUES (?, 'admin_update_user', 'user', ?, ?, ?)
    `).bind(
      session.user_id,
      userId,
      JSON.stringify(user),
      JSON.stringify(body)
    ).run();

    // Return updated user
    const updatedUser = await env.DB.prepare(`
      SELECT id, email, name, role, license_type, license_expires_at, donation_limit, is_active, updated_at
      FROM users WHERE id = ?
    `).bind(userId).first();

    return successResponse(updatedUser, 'User updated successfully');

  } catch (error) {
    console.error('Update user error:', error);
    return errorResponse('Failed to update user');
  }
}

/**
 * Get unverified charities
 */
async function handleGetUnverifiedCharities(request, env, session) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const charities = await env.DB.prepare(`
      SELECT
        c.*,
        COUNT(d.id) as donation_count,
        COALESCE(SUM(d.tax_deductible_amount), 0) as total_donated,
        COUNT(DISTINCT d.user_id) as donor_count
      FROM charities c
      LEFT JOIN donations d ON c.id = d.charity_id
      WHERE c.is_verified = 0
      GROUP BY c.id
      ORDER BY donation_count DESC, c.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return successResponse({
      charities: charities.results || []
    });

  } catch (error) {
    console.error('Get unverified charities error:', error);
    return errorResponse('Failed to retrieve unverified charities');
  }
}

/**
 * Verify a charity
 */
async function handleVerifyCharity(request, env, session, charityId) {
  try {
    // Check if charity exists
    const charity = await env.DB.prepare(`
      SELECT * FROM charities WHERE id = ?
    `).bind(charityId).first();

    if (!charity) {
      return errorResponse('Charity not found', 404);
    }

    if (charity.is_verified) {
      return errorResponse('Charity is already verified', 400);
    }

    // Verify the charity
    await env.DB.prepare(`
      UPDATE charities
      SET is_verified = 1, verification_date = datetime('now'), verified_by = ?
      WHERE id = ?
    `).bind(session.user_id, charityId).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'verify_charity', 'charity', ?, ?)
    `).bind(
      session.user_id,
      charityId,
      JSON.stringify({
        charity_name: charity.name,
        charity_ein: charity.ein
      })
    ).run();

    return successResponse({
      id: charity.id,
      name: charity.name,
      ein: charity.ein,
      is_verified: true,
      verification_date: new Date().toISOString(),
      verified_by: session.user_id
    }, 'Charity verified successfully');

  } catch (error) {
    console.error('Verify charity error:', error);
    return errorResponse('Failed to verify charity');
  }
}

/**
 * Get admin-editable content
 */
async function handleGetAdminContent(request, env, session) {
  try {
    const content = await env.DB.prepare(`
      SELECT
        ac.*,
        u.name as created_by_name
      FROM admin_content ac
      LEFT JOIN users u ON ac.created_by = u.id
      ORDER BY ac.content_type, ac.content_key
    `).all();

    return successResponse({
      content: content.results || []
    });

  } catch (error) {
    console.error('Get admin content error:', error);
    return errorResponse('Failed to retrieve admin content');
  }
}

/**
 * Create admin content
 */
async function handleCreateAdminContent(request, env, session) {
  try {
    const body = await request.json();
    const { content_key, title, content, content_type, is_active = true } = body;

    // Validation
    const errors = [];
    if (!content_key || !/^[a-z_]+$/.test(content_key)) {
      errors.push('Content key is required and must contain only lowercase letters and underscores');
    }
    if (!title || title.trim().length < 1) {
      errors.push('Title is required');
    }
    if (!content || content.trim().length < 1) {
      errors.push('Content is required');
    }
    if (!content_type || !['tooltip', 'help', 'guide'].includes(content_type)) {
      errors.push('Content type must be tooltip, help, or guide');
    }

    if (errors.length > 0) {
      return validationErrorResponse(errors);
    }

    // Check if content key already exists
    const existing = await env.DB.prepare(`
      SELECT id FROM admin_content WHERE content_key = ?
    `).bind(content_key).first();

    if (existing) {
      return errorResponse('Content key already exists', 409);
    }

    // Create content
    const contentId = require('uuid').v4();
    await env.DB.prepare(`
      INSERT INTO admin_content (id, content_key, title, content, content_type, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      contentId,
      content_key,
      sanitizeInput(title),
      sanitizeInput(content),
      content_type,
      is_active,
      session.user_id
    ).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'create_admin_content', 'admin_content', ?, ?)
    `).bind(
      session.user_id,
      content_key,
      JSON.stringify({ title, content_key, content_type })
    ).run();

    return successResponse({
      id: contentId,
      content_key,
      title,
      content,
      content_type,
      is_active
    }, 'Content created successfully', 201);

  } catch (error) {
    console.error('Create admin content error:', error);
    return errorResponse('Failed to create admin content');
  }
}

/**
 * Update admin content
 */
async function handleUpdateAdminContent(request, env, session, contentKey) {
  try {
    const body = await request.json();
    const { title, content, is_active } = body;

    // Check if content exists
    const existing = await env.DB.prepare(`
      SELECT * FROM admin_content WHERE content_key = ?
    `).bind(contentKey).first();

    if (!existing) {
      return errorResponse('Content not found', 404);
    }

    // Build update query
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(sanitizeInput(title));
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(sanitizeInput(content));
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(contentKey);

    // Update content
    await env.DB.prepare(`
      UPDATE admin_content SET ${updates.join(', ')} WHERE content_key = ?
    `).bind(...params).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
      VALUES (?, 'update_admin_content', 'admin_content', ?, ?, ?)
    `).bind(
      session.user_id,
      contentKey,
      JSON.stringify(existing),
      JSON.stringify(body)
    ).run();

    // Return updated content
    const updatedContent = await env.DB.prepare(`
      SELECT * FROM admin_content WHERE content_key = ?
    `).bind(contentKey).first();

    return successResponse(updatedContent, 'Content updated successfully');

  } catch (error) {
    console.error('Update admin content error:', error);
    return errorResponse('Failed to update admin content');
  }
}

/**
 * Get audit logs with filtering
 */
async function handleGetAuditLogs(request, env, session) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const userId = url.searchParams.get('user_id');
    const action = url.searchParams.get('action');
    const resourceType = url.searchParams.get('resource_type');

    let whereConditions = [];
    const params = [];

    if (userId) {
      whereConditions.push('al.user_id = ?');
      params.push(userId);
    }

    if (action) {
      whereConditions.push('al.action LIKE ?');
      params.push(`%${action}%`);
    }

    if (resourceType) {
      whereConditions.push('al.resource_type = ?');
      params.push(resourceType);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const logs = await env.DB.prepare(`
      SELECT
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return successResponse({
      audit_logs: logs.results || []
    });

  } catch (error) {
    console.error('Get audit logs error:', error);
    return errorResponse('Failed to retrieve audit logs');
  }
}