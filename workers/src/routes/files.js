/**
 * File upload routes for Cloudflare Workers with R2 storage
 */

import { validateSession, getSessionFromRequest } from '../utils/auth.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse
} from '../utils/response.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle file routes
 */
export async function handleFiles(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/files', '');
  const method = request.method;

  // All file routes require authentication
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);

  if (!session) {
    return unauthorizedResponse();
  }

  switch (true) {
    case path === '/upload' && method === 'POST':
      return handleFileUpload(request, env, session);

    case path.match(/^\/[a-f0-9-]+$/) && method === 'GET':
      return handleGetFile(request, env, session, path.substring(1));

    case path.match(/^\/[a-f0-9-]+$/) && method === 'DELETE':
      return handleDeleteFile(request, env, session, path.substring(1));

    case path === '/signed-url' && method === 'POST':
      return handleGetSignedUrl(request, env, session);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Handle file upload to R2 storage
 */
async function handleFileUpload(request, env, session) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const donationId = formData.get('donation_id');

    if (!file) {
      return validationErrorResponse(['File is required']);
    }

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

    if (file.size > maxSize) {
      return validationErrorResponse(['File size must be less than 10MB']);
    }

    if (!allowedTypes.includes(file.type)) {
      return validationErrorResponse(['File type must be JPEG, PNG, or PDF']);
    }

    // Verify donation belongs to user if provided
    if (donationId) {
      const donation = await env.DB.prepare(`
        SELECT id FROM donations WHERE id = ? AND user_id = ?
      `).bind(donationId, session.user_id).first();

      if (!donation) {
        return errorResponse('Donation not found or access denied', 404);
      }
    }

    // Generate file ID and R2 key
    const fileId = uuidv4();
    const fileExtension = file.name.split('.').pop();
    const r2Key = `uploads/${session.user_id}/${fileId}.${fileExtension}`;

    // Upload to R2
    await env.BUCKET.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });

    // Save file metadata to database
    await env.DB.prepare(`
      INSERT INTO file_uploads (
        id, user_id, donation_id, filename, original_filename,
        file_size, content_type, r2_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      fileId,
      session.user_id,
      donationId || null,
      `${fileId}.${fileExtension}`,
      file.name,
      file.size,
      file.type,
      r2Key
    ).run();

    // Update donation with receipt file if provided
    if (donationId) {
      await env.DB.prepare(`
        UPDATE donations SET receipt_file_id = ? WHERE id = ? AND user_id = ?
      `).bind(fileId, donationId, session.user_id).run();
    }

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'upload_file', 'file', ?, ?)
    `).bind(
      session.user_id,
      fileId,
      JSON.stringify({
        filename: file.name,
        size: file.size,
        type: file.type,
        donation_id: donationId
      })
    ).run();

    return successResponse({
      file_id: fileId,
      filename: file.name,
      file_size: file.size,
      content_type: file.type,
      donation_id: donationId
    }, 'File uploaded successfully', 201);

  } catch (error) {
    console.error('File upload error:', error);
    return errorResponse('Failed to upload file');
  }
}

/**
 * Get file metadata and generate signed download URL
 */
async function handleGetFile(request, env, session, fileId) {
  try {
    // Get file metadata
    const file = await env.DB.prepare(`
      SELECT * FROM file_uploads WHERE id = ? AND user_id = ?
    `).bind(fileId, session.user_id).first();

    if (!file) {
      return errorResponse('File not found', 404);
    }

    // Generate signed URL for download (valid for 1 hour)
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    // In a real implementation, you would generate a proper signed URL
    // For now, we'll create a simple download URL
    const downloadUrl = `/api/files/download/${fileId}?expires=${expirationTime}`;

    return successResponse({
      file_id: file.id,
      filename: file.original_filename,
      file_size: file.file_size,
      content_type: file.content_type,
      created_at: file.created_at,
      download_url: downloadUrl,
      expires_at: new Date(expirationTime * 1000).toISOString()
    });

  } catch (error) {
    console.error('Get file error:', error);
    return errorResponse('Failed to retrieve file');
  }
}

/**
 * Delete file from R2 and database
 */
async function handleDeleteFile(request, env, session, fileId) {
  try {
    // Get file metadata
    const file = await env.DB.prepare(`
      SELECT * FROM file_uploads WHERE id = ? AND user_id = ?
    `).bind(fileId, session.user_id).first();

    if (!file) {
      return errorResponse('File not found', 404);
    }

    // Delete from R2
    await env.BUCKET.delete(file.r2_key);

    // Remove file reference from donations
    await env.DB.prepare(`
      UPDATE donations SET receipt_file_id = NULL WHERE receipt_file_id = ?
    `).bind(fileId).run();

    // Delete from database
    await env.DB.prepare(`
      DELETE FROM file_uploads WHERE id = ?
    `).bind(fileId).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values)
      VALUES (?, 'delete_file', 'file', ?, ?)
    `).bind(
      session.user_id,
      fileId,
      JSON.stringify({
        filename: file.original_filename,
        r2_key: file.r2_key
      })
    ).run();

    return successResponse(null, 'File deleted successfully');

  } catch (error) {
    console.error('Delete file error:', error);
    return errorResponse('Failed to delete file');
  }
}

/**
 * Generate signed URL for direct upload to R2
 */
async function handleGetSignedUrl(request, env, session) {
  try {
    const body = await request.json();
    const { filename, content_type, donation_id } = body;

    if (!filename || !content_type) {
      return validationErrorResponse(['Filename and content type are required']);
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(content_type)) {
      return validationErrorResponse(['File type must be JPEG, PNG, or PDF']);
    }

    // Verify donation if provided
    if (donation_id) {
      const donation = await env.DB.prepare(`
        SELECT id FROM donations WHERE id = ? AND user_id = ?
      `).bind(donation_id, session.user_id).first();

      if (!donation) {
        return errorResponse('Donation not found', 404);
      }
    }

    // Generate file ID and R2 key
    const fileId = uuidv4();
    const fileExtension = filename.split('.').pop();
    const r2Key = `uploads/${session.user_id}/${fileId}.${fileExtension}`;

    // In production, generate a proper presigned URL for R2
    // For now, return upload instructions
    const uploadUrl = `/api/files/direct-upload/${fileId}`;
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 1);

    // Pre-register the file upload
    await env.DB.prepare(`
      INSERT INTO file_uploads (
        id, user_id, donation_id, filename, original_filename,
        file_size, content_type, r2_key
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      fileId,
      session.user_id,
      donation_id || null,
      `${fileId}.${fileExtension}`,
      filename,
      content_type,
      r2Key
    ).run();

    return successResponse({
      file_id: fileId,
      upload_url: uploadUrl,
      expires_at: expirationTime.toISOString(),
      method: 'PUT',
      headers: {
        'Content-Type': content_type
      }
    }, 'Signed URL generated successfully');

  } catch (error) {
    console.error('Get signed URL error:', error);
    return errorResponse('Failed to generate signed URL');
  }
}