import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return new Response('Missing download token.', { status: 400 });

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) return new Response('Server is not configured correctly.', { status: 500 });

  const parts = token.split('.');
  if (parts.length !== 2) return new Response('Invalid download link.', { status: 403 });
  const [payload, sig] = parts;

  // Recompute the same HMAC the verify-payment function generated. If it doesn't
  // match, this token was never issued by us (or was tampered with).
  const expectedSig = base64url(crypto.createHmac('sha256', KEY_SECRET).update(payload).digest());
  if (expectedSig !== sig) return new Response('Invalid download link.', { status: 403 });

  let data;
  try {
    data = JSON.parse(base64urlToBuffer(payload).toString('utf8'));
  } catch {
    return new Response('Invalid download link.', { status: 403 });
  }

  if (!data.exp || Date.now() > data.exp) {
    return new Response('This download link has expired. Please contact support with your payment ID.', { status: 403 });
  }

  if (!existsSync(EBOOK_PATH)) {
    console.error('ebook.pdf not found at', EBOOK_PATH);
    return new Response('The ebook file has not been uploaded on the server yet. Contact support.', { status: 500 });
  }

  // Streaming functions support responses up to ~20MB, well above the 6MB cap
  // that broke the earlier buffered version. If your file ever exceeds ~20MB,
  // switch to external storage (S3/Cloudinary) with a signed redirect instead.
  const { size } = statSync(EBOOK_PATH);
  const nodeStream = createReadStream(EBOOK_PATH);
  const webStream = Readable.toWeb(nodeStream);

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(size),
      'Content-Disposition': 'attachment; filename="200-Life-Changing-eBook-Summaries.pdf"',
    },
  });
};
