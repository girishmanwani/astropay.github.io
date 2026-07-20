const Razorpay = require('razorpay');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  const PRICE_INR = Number(process.env.PRODUCT_PRICE_INR || 199);
  const PRICE_PAISE = Math.round(PRICE_INR * 100);

  if (!KEY_ID || !KEY_SECRET) {
    console.error('Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET environment variables.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured with Razorpay keys.' }) };
  }
  if (PRICE_PAISE < 100) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configured price is below the minimum Razorpay allows.' }) };
  }

  const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

  try {
    const order = await razorpay.orders.create({
      amount: PRICE_PAISE, // amount decided here, server-side — never trust a client-sent amount
      currency: 'INR',
      receipt: 'receipt_' + Date.now(),
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: KEY_ID,
      }),
    };
  } catch (err) {
    console.error('create-order error:', err);
    return { statusCode: err?.statusCode === 401 ? 401 : 500, body: JSON.stringify({ error: 'Could not create order.' }) };
  }
};
