/**
 * routes/imageProxy.js
 * Fallback proxy for any Wikimedia images not yet uploaded to Cloudinary.
 * After sync runs, most images will be Cloudinary URLs — this proxy
 * handles the few that still point to Wikimedia during the transition period.
 */

const express = require('express');
const https   = require('https');
const http    = require('http');
const router  = express.Router();

router.get('/', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();

  // Validate URL
  let parsed;
  try { parsed = new URL(url); }
  catch { return res.status(400).end(); }

  const allowed = ['upload.wikimedia.org', 'commons.wikimedia.org',
                   'en.wikipedia.org', 'res.cloudinary.com'];
  if (!allowed.some(d => parsed.hostname.endsWith(d))) {
    return res.redirect(302, url);
  }

  const proto   = url.startsWith('https') ? https : http;
  let responded = false;

  const proxyReq = proto.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MovieStar/1.0)',
      'Referer':    'https://en.wikipedia.org/',
      'Accept':     'image/*',
    },
  }, (proxyRes) => {
    if (responded) return;

    if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
      responded = true;
      return res.redirect(302, proxyRes.headers.location);
    }

    if (proxyRes.statusCode === 429) {
      responded = true;
      // Return placeholder instead of 429 error
      return res.redirect(302, '/images/placeholder.svg');
    }

    if (proxyRes.statusCode !== 200) {
      responded = true;
      return res.redirect(302, '/images/placeholder.svg');
    }

    responded = true;
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    if (!responded) { responded = true; res.redirect(302, '/images/placeholder.svg'); }
  });

  proxyReq.setTimeout(12000, () => {
    proxyReq.destroy();
    if (!responded) { responded = true; res.redirect(302, '/images/placeholder.svg'); }
  });
});

module.exports = router;
