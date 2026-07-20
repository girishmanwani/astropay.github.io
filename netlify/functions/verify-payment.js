const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const TOKEN_MAX_USES = 3; // lets a genuine buyer retry if their download fails

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured with Razorpay keys.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing payment fields.' }) };
  }

  // Recompute the signature ourselves with the secret key (never exposed to the browser)
  // and only accept an exact match. This is the step that stops anyone from faking a
  // "successful" payment from the frontend.
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Signature verification failed.' }) };
  }

  const token = crypto.randomBytes(24).toString('hex');
  const store = getStore('download-tokens');
  await store.setJSON(token, {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    created_at: Date.now(),
    uses_left: TOKEN_MAX_USES,
  });

  return { statusCode: 200, body: JSON.stringify({ success: true, download_token: token }) };
};
