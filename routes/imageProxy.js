/**
 * routes/imageProxy.js
 * Proxies external images (Wikimedia) that require a Referer header.
 * Usage: <img src="/img-proxy?url=https://upload.wikimedia.org/...">
 *
 * Also handles Cloudinary URLs directly (no proxy needed, but included for safety).
 */

const express = require('express');
const https   = require('https');
const http    = require('http');
const router  = express.Router();

// Cache control — browser caches for 7 days
const CACHE_SECONDS = 7 * 24 * 60 * 60;

router.get('/', (req, res) => {
  const url = req.query.url;

  if (!url) return res.status(400).send('Missing url param');

  // Only proxy known safe domains
  const allowed = [
    'upload.wikimedia.org',
    'commons.wikimedia.org',
    'en.wikipedia.org',
    'res.cloudinary.com',
    'via.placeholder.com',
  ];
  try {
    const { hostname } = new URL(url);
    if (!allowed.some(d => hostname.endsWith(d))) {
      return res.redirect(url); // unknown domain — redirect directly
    }
  } catch {
    return res.status(400).send('Invalid URL');
  }

  const proto = url.startsWith('https') ? https : http;
  const reqOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MovieStar/1.0)',
      'Referer':    'https://en.wikipedia.org/',
      'Accept':     'image/webp,image/apng,image/*,*/*;q=0.8',
    },
  };

  const proxyReq = proto.get(url, reqOptions, (proxyRes) => {
    if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
      // Follow redirect
      return res.redirect(proxyRes.headers.location);
    }
    if (proxyRes.statusCode !== 200) {
      return res.status(proxyRes.statusCode).send('Image fetch failed');
    }

    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[ImageProxy] Error:', err.message, url.slice(0, 80));
    res.status(502).send('Proxy error');
  });

  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();
    res.status(504).send('Timeout');
  });
});

module.exports = router;
