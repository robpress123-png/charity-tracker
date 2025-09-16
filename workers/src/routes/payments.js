/**
 * Payments routes for Cloudflare Workers
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
 * Handle payments routes
 */
export async function handlePayments(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/payments', '');
  const method = request.method;

  // All payment routes require authentication
  const sessionId = getSessionFromRequest(request);
  const session = await validateSession(sessionId, env);

  if (!session) {
    return unauthorizedResponse();
  }

  switch (true) {
    case path === '/create-payment-intent' && method === 'POST':
      return handleCreatePaymentIntent(request, env, session);

    case path === '/confirm-payment' && method === 'POST':
      return handleConfirmPayment(request, env, session);

    case path === '/subscription-status' && method === 'GET':
      return handleGetSubscriptionStatus(request, env, session);

    case path === '/webhook' && method === 'POST':
      return handleStripeWebhook(request, env);

    default:
      return errorResponse('Not Found', 404);
  }
}

/**
 * Create a Stripe payment intent for license upgrade
 */
async function handleCreatePaymentIntent(request, env, session) {
  try {
    const body = await request.json();
    const { license_type, license_duration_months = 12 } = body;

    // Validate license type
    if (license_type !== 'paid') {
      return validationErrorResponse(['Invalid license type']);
    }

    // Calculate amount based on license duration
    const basePrice = 4500; // $45.00 in cents
    const amount = basePrice * (license_duration_months / 12);

    // Check if user already has an active paid license
    const currentDate = new Date().toISOString();
    if (session.license_type === 'paid' && session.license_expires_at > currentDate) {
      return errorResponse('User already has an active paid license', 400);
    }

    // Initialize Stripe (note: in real implementation, use proper Stripe SDK)
    const stripeSecretKey = env.STRIPE_SECRET_KEY;

    // Create payment intent via Stripe API
    const paymentIntentResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'amount': amount.toString(),
        'currency': 'usd',
        'metadata[user_id]': session.user_id,
        'metadata[license_type]': license_type,
        'metadata[license_duration_months]': license_duration_months.toString(),
        'description': `Charity Tracker ${license_type} license (${license_duration_months} months)`
      })
    });

    if (!paymentIntentResponse.ok) {
      console.error('Stripe payment intent creation failed:', await paymentIntentResponse.text());
      return errorResponse('Failed to create payment intent', 500);
    }

    const paymentIntent = await paymentIntentResponse.json();

    // Store payment transaction record
    const transactionId = uuidv4();
    await env.DB.prepare(`
      INSERT INTO payment_transactions (
        id, user_id, stripe_payment_intent_id, amount, currency, status,
        license_type, license_duration_months, metadata
      ) VALUES (?, ?, ?, ?, 'usd', 'pending', ?, ?, ?)
    `).bind(
      transactionId,
      session.user_id,
      paymentIntent.id,
      amount / 100, // Store as dollars
      license_type,
      license_duration_months,
      JSON.stringify({ created_at: new Date().toISOString() })
    ).run();

    return successResponse({
      client_secret: paymentIntent.client_secret,
      transaction_id: transactionId,
      amount: amount / 100,
      license_type,
      license_duration_months
    }, 'Payment intent created successfully');

  } catch (error) {
    console.error('Create payment intent error:', error);
    return errorResponse('Failed to create payment intent');
  }
}

/**
 * Confirm payment and upgrade user license
 */
async function handleConfirmPayment(request, env, session) {
  try {
    const body = await request.json();
    const { payment_intent_id, transaction_id } = body;

    if (!payment_intent_id || !transaction_id) {
      return validationErrorResponse(['Payment intent ID and transaction ID are required']);
    }

    // Get transaction record
    const transaction = await env.DB.prepare(`
      SELECT * FROM payment_transactions
      WHERE id = ? AND user_id = ? AND stripe_payment_intent_id = ?
    `).bind(transaction_id, session.user_id, payment_intent_id).first();

    if (!transaction) {
      return errorResponse('Transaction not found', 404);
    }

    if (transaction.status === 'completed') {
      return errorResponse('Payment already processed', 400);
    }

    // Verify payment with Stripe
    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const paymentIntentResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`
      }
    });

    if (!paymentIntentResponse.ok) {
      return errorResponse('Failed to verify payment with Stripe', 500);
    }

    const paymentIntent = await paymentIntentResponse.json();

    if (paymentIntent.status !== 'succeeded') {
      return errorResponse('Payment not successful', 400);
    }

    // Calculate new license expiration date
    const currentDate = new Date();
    const existingExpiration = session.license_expires_at ? new Date(session.license_expires_at) : currentDate;
    const startDate = existingExpiration > currentDate ? existingExpiration : currentDate;
    const expirationDate = new Date(startDate);
    expirationDate.setMonth(expirationDate.getMonth() + transaction.license_duration_months);

    // Update user license
    await env.DB.prepare(`
      UPDATE users
      SET license_type = ?, license_expires_at = ?, donation_limit = -1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(transaction.license_type, expirationDate.toISOString(), session.user_id).run();

    // Update transaction status
    await env.DB.prepare(`
      UPDATE payment_transactions
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).bind(transaction_id).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
      VALUES (?, 'upgrade_license', 'user', ?, ?)
    `).bind(
      session.user_id,
      session.user_id,
      JSON.stringify({
        license_type: transaction.license_type,
        expires_at: expirationDate.toISOString(),
        duration_months: transaction.license_duration_months
      })
    ).run();

    return successResponse({
      license_type: transaction.license_type,
      license_expires_at: expirationDate.toISOString(),
      donation_limit: -1
    }, 'License upgraded successfully');

  } catch (error) {
    console.error('Confirm payment error:', error);
    return errorResponse('Failed to confirm payment');
  }
}

/**
 * Get user's subscription status
 */
async function handleGetSubscriptionStatus(request, env, session) {
  try {
    // Get user's current license info
    const user = await env.DB.prepare(`
      SELECT license_type, license_expires_at, donation_limit, created_at
      FROM users WHERE id = ?
    `).bind(session.user_id).first();

    // Get payment history
    const payments = await env.DB.prepare(`
      SELECT
        id, amount, currency, status, license_type, license_duration_months,
        created_at, completed_at
      FROM payment_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(session.user_id).all();

    // Calculate days remaining for paid license
    let daysRemaining = null;
    if (user.license_type === 'paid' && user.license_expires_at) {
      const expiration = new Date(user.license_expires_at);
      const now = new Date();
      daysRemaining = Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24)));
    }

    return successResponse({
      license_type: user.license_type,
      license_expires_at: user.license_expires_at,
      donation_limit: user.donation_limit,
      days_remaining: daysRemaining,
      is_expired: user.license_type === 'paid' && user.license_expires_at && new Date(user.license_expires_at) < new Date(),
      payment_history: payments.results || []
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    return errorResponse('Failed to retrieve subscription status');
  }
}

/**
 * Handle Stripe webhook events
 */
async function handleStripeWebhook(request, env) {
  try {
    const signature = request.headers.get('stripe-signature');
    const body = await request.text();

    // Verify webhook signature (in production, use proper webhook verification)
    // const event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);

    // For now, parse the body directly (implement proper verification in production)
    const event = JSON.parse(body);

    console.log('Received Stripe webhook:', event.type);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, env);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object, env);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return successResponse(null, 'Webhook processed');

  } catch (error) {
    console.error('Webhook error:', error);
    return errorResponse('Webhook processing failed', 400);
  }
}

/**
 * Handle successful payment intent webhook
 */
async function handlePaymentIntentSucceeded(paymentIntent, env) {
  try {
    const userId = paymentIntent.metadata.user_id;
    const licenseType = paymentIntent.metadata.license_type;
    const licenseDurationMonths = parseInt(paymentIntent.metadata.license_duration_months);

    if (!userId || !licenseType) {
      console.error('Missing metadata in payment intent:', paymentIntent.id);
      return;
    }

    // Update transaction status
    await env.DB.prepare(`
      UPDATE payment_transactions
      SET status = 'completed', completed_at = datetime('now')
      WHERE stripe_payment_intent_id = ? AND status = 'pending'
    `).bind(paymentIntent.id).run();

    console.log(`Payment successful for user ${userId}, license: ${licenseType}`);

  } catch (error) {
    console.error('Payment intent succeeded handler error:', error);
  }
}

/**
 * Handle failed payment intent webhook
 */
async function handlePaymentIntentFailed(paymentIntent, env) {
  try {
    // Update transaction status
    await env.DB.prepare(`
      UPDATE payment_transactions
      SET status = 'failed'
      WHERE stripe_payment_intent_id = ? AND status = 'pending'
    `).bind(paymentIntent.id).run();

    console.log(`Payment failed for payment intent: ${paymentIntent.id}`);

  } catch (error) {
    console.error('Payment intent failed handler error:', error);
  }
}