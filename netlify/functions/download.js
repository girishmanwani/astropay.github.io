const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// This file is bundled into the function via `included_files` in netlify.toml —
// it lives right next to this function so it ships wherever the function does.
const EBOOK_PATH = path.join(__dirname, 'ebook.pdf');

function base64urlToBuffer(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return { statusCode: 400, body: 'Missing download token.' };

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) return { statusCode: 500, body: 'Server is not configured correctly.' };

  const parts = token.split('.');
  if (parts.length !== 2) return { statusCode: 403, body: 'Invalid download link.' };
  const [payload, sig] = parts;

  // Recompute the same HMAC the verify-payment function generated. If it doesn't
  // match, this token was never issued by us (or was tampered with).
  const expectedSig = base64url(crypto.createHmac('sha256', KEY_SECRET).update(payload).digest());
  if (expectedSig !== sig) return { statusCode: 403, body: 'Invalid download link.' };

  let data;
  try {
    data = JSON.parse(base64urlToBuffer(payload).toString('utf8'));
  } catch {
    return { statusCode: 403, body: 'Invalid download link.' };
  }

  if (!data.exp || Date.now() > data.exp) {
    return { statusCode: 403, body: 'This download link has expired. Please contact support with your payment ID.' };
  }

  if (!fs.existsSync(EBOOK_PATH)) {
    console.error('ebook.pdf not found at', EBOOK_PATH);
    return { statusCode: 500, body: 'The ebook file has not been uploaded on the server yet. Contact support.' };
  }

  const fileBuffer = fs.readFileSync(EBOOK_PATH);

  // Netlify Functions cap synchronous responses around 6MB. If your PDF is bigger
  // than that, see the README section "If your ebook file is large" for the
  // alternative (external storage + signed redirect, or the Express/server.js
  // deployment instead, which has no such limit).
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="200-Life-Changing-eBook-Summaries.pdf"',
    },
    body: fileBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};
