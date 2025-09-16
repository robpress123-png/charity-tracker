/**
 * Authentication routes for Cloudflare Workers
 */

import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  validateSession,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie
} from '../utils/auth.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse
} from '../utils/response.js';
import {
  isValidEmail,
  isValidPassword,
  sanitizeInput
} from '../utils/validation.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle authentication routes
 */
export async function handleAuth(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/auth', '');
  const method = request.method;

  switch (path) {
    case '/register':
      return method === 'POST' ? handleRegister(request, env) : errorResponse('Method not allowed', 405);

    case '/login':
      return method === 'POST' ? handleLogin(request, env) : errorResponse('Method not allowed', 405);

    case '/logout':
      return method === 'POST' ? handleLogout(request, env) : errorResponse('Method not allowed', 405);

    case '/me':
      return method === 'GET' ? handleGetCurrentUser(request, env) : errorResponse('Method not allowed', 405);

    case '/change-password':
      return method === 'POST' ? handleChangePassword(request, env) : errorResponse('Method not allowed', 405);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Register a new user
 */
async function handleRegister(request, env) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validation
    const errors = [];
    if (!email || !isValidEmail(email)) {
      errors.push('Valid email is required');
    }
    if (!password || !isValidPassword(password)) {
      errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
    }
    if (!name || name.trim().length < 2) {
      errors.push('Name must be at least 2 characters');
    }

    if (errors.length > 0) {
      return validationErrorResponse(errors);
    }

    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    const sanitizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await env.DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(sanitizedEmail).first();

    if (existingUser) {
      return errorResponse('User already exists', 409);
    }

    // Create user
    const userId = uuidv4();
    const passwordHash = await hashPassword(password);

    await env.DB.prepare(`
      INSERT INTO users (id, email, name, password_hash, license_type, donation_limit)
      VALUES (?, ?, ?, ?, 'free', 2)
    `).bind(userId, sanitizedEmail, sanitizedName, passwordHash).run();

    // Create session
    const { sessionId, expiresAt } = await createSession(userId, env);

    // Get user data for response
    const user = await env.DB.prepare(`
      SELECT id, email, name, role, license_type, donation_limit, created_at
      FROM users WHERE id = ?
    `).bind(userId).first();

    const response = successResponse({
      user,
      session: { id: sessionId, expires_at: expiresAt }
    }, 'Registration successful');

    response.headers.set('Set-Cookie', setSessionCookie(sessionId, expiresAt));

    return response;

  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse('Registration failed');
  }
}

/**
 * Login user
 */
async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return validationErrorResponse(['Email and password are required']);
    }

    // Find user
    const user = await env.DB.prepare(`
      SELECT id, email, name, password_hash, role, license_type, donation_limit, is_active
      FROM users WHERE email = ? AND is_active = TRUE
    `).bind(email.toLowerCase().trim()).first();

    if (!user) {
      return errorResponse('Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return errorResponse('Invalid credentials', 401);
    }

    // Update last login
    await env.DB.prepare(`
      UPDATE users SET last_login = datetime('now') WHERE id = ?
    `).bind(user.id).run();

    // Create session
    const { sessionId, expiresAt } = await createSession(user.id, env);

    // Remove password hash from response
    const { password_hash, ...userResponse } = user;

    const response = successResponse({
      user: userResponse,
      session: { id: sessionId, expires_at: expiresAt }
    }, 'Login successful');

    response.headers.set('Set-Cookie', setSessionCookie(sessionId, expiresAt));

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Login failed');
  }
}

/**
 * Logout user
 */
async function handleLogout(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);

    if (sessionId) {
      await deleteSession(sessionId, env);
    }

    const response = successResponse(null, 'Logged out successfully');
    response.headers.set('Set-Cookie', clearSessionCookie());

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse('Logout failed');
  }
}

/**
 * Get current user
 */
async function handleGetCurrentUser(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);
    const session = await validateSession(sessionId, env);

    if (!session) {
      return errorResponse('Not authenticated', 401);
    }

    return successResponse({
      user: {
        id: session.user_id,
        email: session.email,
        name: session.name,
        role: session.role,
        license_type: session.license_type,
        donation_limit: session.donation_limit
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return errorResponse('Failed to get user data');
  }
}

/**
 * Change password
 */
async function handleChangePassword(request, env) {
  try {
    const sessionId = getSessionFromRequest(request);
    const session = await validateSession(sessionId, env);

    if (!session) {
      return errorResponse('Not authenticated', 401);
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return validationErrorResponse(['Current password and new password are required']);
    }

    if (!isValidPassword(newPassword)) {
      return validationErrorResponse(['New password must be at least 8 characters with uppercase, lowercase, and number']);
    }

    // Get current password hash
    const user = await env.DB.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).bind(session.user_id).first();

    // Verify current password
    const isValidCurrent = await verifyPassword(currentPassword, user.password_hash);
    if (!isValidCurrent) {
      return errorResponse('Current password is incorrect', 400);
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);
    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(newPasswordHash, session.user_id).run();

    return successResponse(null, 'Password changed successfully');

  } catch (error) {
    console.error('Change password error:', error);
    return errorResponse('Failed to change password');
  }
}