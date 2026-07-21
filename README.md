# 50 Life-Changing eBook Summaries — Landing Page + Razorpay Checkout

A one-product landing page that sells your ebook for ₹9 and only releases the
download after a genuine, verified Razorpay payment.

## What's included

- `public/index.html` — the landing page (hero, pricing, features, FAQ, Buy Now)
- `public/thank-you.html` — post-payment page that auto-starts the download
- `public/css/style.css`, `public/js/checkout.js` — styling and checkout logic
- `netlify/functions/` — **use this if you're deploying to Netlify** (like
  `astropayebooks.netlify.app`). Netlify only hosts static files — it can't
  run `server.js` — so the same create-order / verify-payment / download
  logic is duplicated here as three serverless functions.
- `server.js` — an alternative backend for Node hosts that aren't Netlify
  (Render, Railway, a VPS). Use **either** this **or** `netlify/functions/`,
  not both, depending on where you deploy.
- `private-assets/ebook.pdf` (for `server.js`) and
  `netlify/functions/ebook.pdf` (for Netlify) — **placeholder files, replace
  both with your real ebook** if you might deploy either way; otherwise just
  the one you're actually using.
- `.env` — pre-filled with the **test** Razorpay keys you shared, for use
  with `server.js` locally.

## Deploying to Netlify (matches astropayebooks.netlify.app)

Netlify's free tier is a **static file host** — it doesn't run an Express
server. That's why `/api/create-order` was failing: there was nothing there
to answer it. The fix is `netlify/functions/`, which Netlify does run.

1. In your Netlify site dashboard: **Site configuration → Environment
   variables**, add:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `PRODUCT_PRICE_INR` = `199`
   (Use your test keys first to confirm everything works, then switch to
   live keys when you're ready to accept real payments.)
2. Replace `netlify/functions/ebook.pdf` with your real file, keeping the
   filename `ebook.pdf`.
3. Push this whole project (including `netlify.toml` and the `netlify/`
   folder) to the GitHub repo your Netlify site is connected to, or drag-and-
   drop the folder in Netlify's deploy UI. Netlify reads `netlify.toml`
   automatically — no extra configuration needed.
4. Redeploy. `/api/create-order`, `/api/verify-payment`, and `/api/download`
   will now be routed to the functions instead of hitting a 404.

**If your ebook file is large:** Netlify Functions cap a single response at
roughly 6MB, which can be tight for a 50-summary PDF. If yours goes over
that, either (a) deploy `server.js` to Render/Railway instead — no such
limit there — or (b) host the PDF in external storage (S3, Google Cloud
Storage, Backblaze) and have `download.js` redirect to a short-lived signed
URL instead of returning the file directly. Ask if you want that version.

## How the payment security works

1. **Price is fixed on the server**, in `PRODUCT_PRICE_INR` (currently `9`).
   The browser never tells the server how much to charge, so nobody can pay
   less by editing the page or the request.
2. When Razorpay confirms a payment, the browser sends back a signature. The
   server recomputes that signature itself using your secret key and compares
   it. **Only an exact match is treated as paid** — this can't be faked from
   the browser since the secret key never leaves the server.
3. Only a verified payment receives a one-time download token. The real
   ebook file lives outside the public folder, so it can't be reached by
   guessing a URL — it's only ever served through `/api/download` after that
   token is checked.

## Before you go live

1. **Replace the ebook file.** Put your real PDF at
   `private-assets/ebook.pdf` (keep that exact filename, or update the path
   in `server.js`).
2. **Add your real photos.** Swap `public/assets/hero.png` for your actual
   cover art, and replace the three placeholder images in the "A look
   inside" gallery in `index.html` with real sample pages.
3. **Switch to live Razorpay keys.** The `.env` file currently has your
   **test** keys (`rzp_test_...`) — these simulate payments but never move
   real money. Go to Razorpay Dashboard → Settings → API Keys, generate a
   **live** key pair, and replace both values in `.env`. Also complete
   Razorpay's KYC/activation for your account if you haven't — live payments
   won't work until that's approved.
4. **Update the support email** in the footer of both HTML pages.
5. **Set `PUBLIC_BASE_URL`** in `.env` to your real domain once deployed.

## Running it locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`. With the test keys, use Razorpay's test
card `4111 1111 1111 1111`, any future expiry, any CVV, to simulate a
successful payment end-to-end (including the automatic download).

## Deploying `server.js` (if not using Netlify)

This is a small Node/Express app, so any of these work well:

- **Render** (render.com) — free tier, connect your GitHub repo, set
  Build Command `npm install`, Start Command `npm start`, and add the
  `.env` values under Environment Variables (don't commit `.env` itself).
- **Railway** (railway.app) — similar flow to Render.
- **A VPS** — `npm install && npm start`, put it behind a process manager
  like `pm2`, and put Nginx/Caddy in front for HTTPS.

Whichever you choose, set the four variables from `.env.example` in that
platform's environment-variable settings, and never commit your real `.env`
file to git (it's already in `.gitignore`).

## One thing worth flagging

The ad image gives the price as **₹9**, and your dictated brief mostly
says ₹9 too, but one line says "119." I've built everything around **₹9**
since that matches the image and the majority of the brief. If you actually
meant ₹119 (or anything else), just change `PRODUCT_PRICE_INR` in `.env` —
nothing else in the code needs to change.
