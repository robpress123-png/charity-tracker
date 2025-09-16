/**
 * Response utilities for consistent API responses
 */

import { corsHeaders } from './cors.js';

export function successResponse(data, message = 'Success', status = 200) {
  return new Response(JSON.stringify({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export function errorResponse(message = 'Internal Server Error', status = 500, errors = null) {
  return new Response(JSON.stringify({
    success: false,
    message,
    errors,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export function validationErrorResponse(errors) {
  return errorResponse('Validation failed', 400, errors);
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message = 'Forbidden') {
  return errorResponse(message, 403);
}

export function notFoundResponse(message = 'Not Found') {
  return errorResponse(message, 404);
}