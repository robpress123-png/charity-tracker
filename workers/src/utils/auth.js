/**
 * Authentication utilities for Cloudflare Workers
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a secure session ID
 */
export function generateSessionId() {
  return uuidv4();
}

/**
 * Generate a CSRF token
 */
export function generateCSRFToken() {
  return uuidv4();
}

/**
 * Extract session from request cookies
 */
export function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});

  return cookies.session_id || null;
}

/**
 * Validate user session
 */
export async function validateSession(sessionId, env) {
  if (!sessionId) return null;

  try {
    const session = await env.DB.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.name, u.role, u.license_type, u.donation_limit
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = TRUE
    `).bind(sessionId).first();

    return session;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

/**
 * Create a new user session
 */
export async function createSession(userId, env, ipAddress = null, userAgent = null) {
  const sessionId = generateSessionId();
  const csrfToken = generateCSRFToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  try {
    await env.DB.prepare(`
      INSERT INTO user_sessions (id, user_id, expires_at, csrf_token, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sessionId, userId, expiresAt.toISOString(), csrfToken, ipAddress, userAgent).run();

    return {
      sessionId,
      csrfToken,
      expiresAt
    };
  } catch (error) {
    console.error('Session creation error:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId, env) {
  if (!sessionId) return;

  try {
    await env.DB.prepare(`
      DELETE FROM user_sessions WHERE id = ?
    `).bind(sessionId).run();
  } catch (error) {
    console.error('Session deletion error:', error);
  }
}

/**
 * Set session cookie
 */
export function setSessionCookie(sessionId, expiresAt) {
  return `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expiresAt.toUTCString()}`;
}

/**
 * Clear session cookie
 */
export function clearSessionCookie() {
  return 'session_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}