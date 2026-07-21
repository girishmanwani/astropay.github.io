const crypto = require('crypto');

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
  const expectedPaymentSig = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedPaymentSig !== razorpay_signature) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Signature verification failed.' }) };
  }

  // Issue a self-contained download token: payload + our own HMAC over that payload.
  // The download function can verify this on its own without needing any shared
  // database or storage service — it just recomputes the same HMAC and compares.
  const payload = base64url(Buffer.from(JSON.stringify({
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    exp: Date.now() + TOKEN_TTL_MS,
  })));
  const tokenSig = base64url(crypto.createHmac('sha256', KEY_SECRET).update(payload).digest());
  const token = `${payload}.${tokenSig}`;

  return { statusCode: 200, body: JSON.stringify({ success: true, download_token: token }) };
};
