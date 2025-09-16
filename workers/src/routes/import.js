/**
 * CSV Import routes for Cloudflare Workers
 * Handles annual item valuation updates from charity organizations
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
 * Handle import routes
 */
export async function handleImport(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/import', '');
  const method = request.method;

  // All import routes require admin authentication
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);

  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  switch (true) {
    case path === '/item-valuations' && method === 'POST':
      return handleImportItemValuations(request, env, session);

    case path === '/preview' && method === 'POST':
      return handlePreviewImport(request, env, session);

    case path === '/sources' && method === 'GET':
      return handleGetImportSources(request, env, session);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Import item valuations from CSV data
 */
async function handleImportItemValuations(request, env, session) {
  try {
    const body = await request.json();
    const { csv_data, source, replace_existing = false } = body;

    if (!csv_data || !source) {
      return validationErrorResponse(['CSV data and source are required']);
    }

    // Validate source
    const validSources = ['goodwill', 'salvation_army', 'manual'];
    if (!validSources.includes(source)) {
      return validationErrorResponse(['Invalid source. Must be: goodwill, salvation_army, or manual']);
    }

    // Parse CSV data
    const lines = csv_data.trim().split('\n');
    if (lines.length < 2) {
      return validationErrorResponse(['CSV must contain header row and at least one data row']);
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Validate required headers
    const requiredHeaders = ['category', 'item_name'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return validationErrorResponse([`Missing required headers: ${missingHeaders.join(', ')}`]);
    }

    // Parse data rows
    const items = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());

      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch`);
        continue;
      }

      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index];
      });

      // Validate required fields
      if (!item.category || !item.item_name) {
        errors.push(`Row ${i + 1}: Missing required fields (category, item_name)`);
        continue;
      }

      // Parse monetary values
      const conditionGood = parseFloat(item.condition_good) || null;
      const conditionFair = parseFloat(item.condition_fair) || null;
      const conditionPoor = parseFloat(item.condition_poor) || null;

      items.push({
        category: sanitizeInput(item.category),
        item_name: sanitizeInput(item.item_name),
        condition_good: conditionGood,
        condition_fair: conditionFair,
        condition_poor: conditionPoor
      });
    }

    if (errors.length > 0) {
      return errorResponse('CSV parsing errors', 400, errors);
    }

    if (items.length === 0) {
      return validationErrorResponse(['No valid items found in CSV']);
    }

    // Begin transaction for database updates
    let importedCount = 0;
    let updatedCount = 0;
    const currentDate = new Date().toISOString().split('T')[0];

    try {
      for (const item of items) {
        if (replace_existing) {
          // Replace existing item
          const result = await env.DB.prepare(`
            INSERT OR REPLACE INTO item_valuations (
              category, item_name, condition_good, condition_fair, condition_poor,
              source, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            item.category,
            item.item_name,
            item.condition_good,
            item.condition_fair,
            item.condition_poor,
            source,
            currentDate
          ).run();

          importedCount++;
        } else {
          // Check if item exists
          const existing = await env.DB.prepare(`
            SELECT id FROM item_valuations
            WHERE category = ? AND item_name = ? AND source = ?
          `).bind(item.category, item.item_name, source).first();

          if (existing) {
            // Update existing item
            await env.DB.prepare(`
              UPDATE item_valuations
              SET condition_good = ?, condition_fair = ?, condition_poor = ?, last_updated = ?
              WHERE id = ?
            `).bind(
              item.condition_good,
              item.condition_fair,
              item.condition_poor,
              currentDate,
              existing.id
            ).run();

            updatedCount++;
          } else {
            // Insert new item
            await env.DB.prepare(`
              INSERT INTO item_valuations (
                category, item_name, condition_good, condition_fair, condition_poor,
                source, last_updated
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
              item.category,
              item.item_name,
              item.condition_good,
              item.condition_fair,
              item.condition_poor,
              source,
              currentDate
            ).run();

            importedCount++;
          }
        }
      }

      // Audit log
      await env.DB.prepare(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
        VALUES (?, 'import_item_valuations', 'item_valuations', ?, ?)
      `).bind(
        session.user_id,
        source,
        JSON.stringify({
          source,
          imported_count: importedCount,
          updated_count: updatedCount,
          total_items: items.length,
          replace_existing
        })
      ).run();

      return successResponse({
        source,
        imported_count: importedCount,
        updated_count: updatedCount,
        total_processed: items.length,
        last_updated: currentDate
      }, 'Item valuations imported successfully');

    } catch (dbError) {
      console.error('Database import error:', dbError);
      return errorResponse('Failed to import data to database');
    }

  } catch (error) {
    console.error('Import error:', error);
    return errorResponse('Failed to import item valuations');
  }
}

/**
 * Preview CSV import without saving to database
 */
async function handlePreviewImport(request, env, session) {
  try {
    const body = await request.json();
    const { csv_data, source } = body;

    if (!csv_data || !source) {
      return validationErrorResponse(['CSV data and source are required']);
    }

    // Parse CSV data
    const lines = csv_data.trim().split('\n');
    if (lines.length < 2) {
      return validationErrorResponse(['CSV must contain header row and at least one data row']);
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Parse first 10 rows for preview
    const previewItems = [];
    const errors = [];
    const maxPreview = Math.min(11, lines.length); // Header + 10 data rows

    for (let i = 1; i < maxPreview; i++) {
      const values = lines[i].split(',').map(v => v.trim());

      if (values.length !== headers.length) {
        errors.push(`Row ${i + 1}: Column count mismatch`);
        continue;
      }

      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index];
      });

      previewItems.push(item);
    }

    // Check for existing items in database
    const existingChecks = await Promise.all(
      previewItems.slice(0, 5).map(async (item) => {
        if (item.category && item.item_name) {
          const existing = await env.DB.prepare(`
            SELECT id FROM item_valuations
            WHERE category = ? AND item_name = ? AND source = ?
          `).bind(item.category, item.item_name, source).first();

          return {
            category: item.category,
            item_name: item.item_name,
            exists: !!existing
          };
        }
        return null;
      })
    );

    return successResponse({
      headers,
      preview_items: previewItems,
      total_rows: lines.length - 1,
      preview_count: previewItems.length,
      errors: errors.slice(0, 10), // Limit error count
      existing_items: existingChecks.filter(Boolean)
    }, 'CSV preview generated successfully');

  } catch (error) {
    console.error('Preview import error:', error);
    return errorResponse('Failed to preview CSV import');
  }
}

/**
 * Get available import sources and their last update dates
 */
async function handleGetImportSources(request, env, session) {
  try {
    const sources = await env.DB.prepare(`
      SELECT
        source,
        COUNT(*) as item_count,
        MAX(last_updated) as last_updated,
        COUNT(DISTINCT category) as category_count
      FROM item_valuations
      GROUP BY source
      ORDER BY last_updated DESC
    `).all();

    const totalItems = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM item_valuations
    `).first();

    return successResponse({
      sources: sources.results || [],
      total_items: totalItems.total,
      available_sources: [
        {
          key: 'goodwill',
          name: 'Goodwill Industries',
          description: 'Official valuation guide from Goodwill'
        },
        {
          key: 'salvation_army',
          name: 'Salvation Army',
          description: 'Valuation guide from Salvation Army stores'
        },
        {
          key: 'manual',
          name: 'Manual Entry',
          description: 'Manually entered or custom valuations'
        }
      ]
    });

  } catch (error) {
    console.error('Get import sources error:', error);
    return errorResponse('Failed to retrieve import sources');
  }
}