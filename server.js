require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const PRICE_INR = Number(process.env.PRODUCT_PRICE_INR || 199);
const PRICE_PAISE = Math.round(PRICE_INR * 100);

if (!KEY_ID || !KEY_SECRET) {
  console.warn('WARNING: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Copy .env.example to .env and fill them in.');
}

const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// ---------------------------------------------------------------------------
// Tiny persisted store for one-time download tokens.
// Good enough for a single-product store. For higher volume, swap this file
// for a real database (Postgres/SQLite/etc) — the interface below is small
// on purpose so that swap is easy later.
// ---------------------------------------------------------------------------
const DOWNLOADS_FILE = path.join(__dirname, 'private-assets', 'downloads.json');
const EBOOK_FILE = path.join(__dirname, 'private-assets', 'ebook.pdf'); // <-- replace with the real file
const TOKEN_MAX_USES = 3; // lets a genuine buyer retry if their download fails
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveTokens(tokens) {
  fs.mkdirSync(path.dirname(DOWNLOADS_FILE), { recursive: true });
  fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(tokens, null, 2));
}

// ---------------------------------------------------------------------------
// STEP 1: Create an order. Amount is NEVER taken from the client — it always
// comes from PRODUCT_PRICE_INR on the server, so nobody can pay less than
// the real price by tampering with the frontend.
// ---------------------------------------------------------------------------
app.post('/api/create-order', async (req, res) => {
  try {
    if (PRICE_PAISE < 100) {
      return res.status(500).json({ error: 'Configured price is below the minimum Razorpay allows.' });
    }
    const order = await razorpay.orders.create({
      amount: PRICE_PAISE,
      currency: 'INR',
      receipt: 'receipt_' + Date.now(),
    });
    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: KEY_ID,
    });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(err?.statusCode === 401 ? 401 : 500).json({ error: 'Could not create order.' });
  }
});

// ---------------------------------------------------------------------------
// STEP 2: Verify the payment signature. Only on a verified match do we ever
// hand out a download token. A failed/mismatched signature is never marked
// as paid, and never gets a token.
// ---------------------------------------------------------------------------
app.post('/api/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields.' });
  }

  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Signature verification failed.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const tokens = loadTokens();
  tokens[token] = {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    created_at: Date.now(),
    uses_left: TOKEN_MAX_USES,
  };
  saveTokens(tokens);

  res.json({ success: true, download_token: token });
});

// ---------------------------------------------------------------------------
// STEP 3: Gated download. Only a valid, unexpired, unused-up token gets the
// actual file. The file itself lives outside /public, so it can't be
// reached by guessing a URL.
// ---------------------------------------------------------------------------
app.get('/api/download', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing download token.');

  const tokens = loadTokens();
  const entry = tokens[token];
  if (!entry) return res.status(403).send('Invalid or expired download link.');
  if (Date.now() - entry.created_at > TOKEN_TTL_MS) return res.status(403).send('This download link has expired.');
  if (entry.uses_left <= 0) return res.status(403).send('This download link has already been used.');

  if (!fs.existsSync(EBOOK_FILE)) {
    return res.status(500).send('The ebook file has not been uploaded on the server yet. Contact support.');
  }

  entry.uses_left -= 1;
  tokens[token] = entry;
  saveTokens(tokens);

  res.download(EBOOK_FILE, '200-Life-Changing-eBook-Summaries.pdf');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
