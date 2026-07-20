const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

// This file is bundled into the function via `included_files` in netlify.toml —
// it lives right next to this function so it ships wherever the function does.
const EBOOK_PATH = path.join(__dirname, 'ebook.pdf');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return { statusCode: 400, body: 'Missing download token.' };

  const store = getStore('download-tokens');
  const entry = await store.get(token, { type: 'json' });

  if (!entry) return { statusCode: 403, body: 'Invalid or expired download link.' };
  if (Date.now() - entry.created_at > TOKEN_TTL_MS) return { statusCode: 403, body: 'This download link has expired.' };
  if (entry.uses_left <= 0) return { statusCode: 403, body: 'This download link has already been used.' };

  if (!fs.existsSync(EBOOK_PATH)) {
    console.error('ebook.pdf not found at', EBOOK_PATH);
    return { statusCode: 500, body: 'The ebook file has not been uploaded on the server yet. Contact support.' };
  }

  entry.uses_left -= 1;
  await store.setJSON(token, entry);

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
