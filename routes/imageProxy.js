const express = require('express');
const https   = require('https');
const http    = require('http');
const router  = express.Router();

router.get('/', (req, res) => {
  const url = req.query.url;
  if (!url) return res.redirect('/images/placeholder.svg');

  let parsed;
  try { parsed = new URL(url); } catch { return res.redirect('/images/placeholder.svg'); }

  const allowed = ['upload.wikimedia.org','commons.wikimedia.org',
                   'en.wikipedia.org','res.cloudinary.com'];
  if (!allowed.some(d => parsed.hostname.endsWith(d)))
    return res.redirect(302, url);

  const proto = url.startsWith('https') ? https : http;
  let done    = false;        // ← single guard prevents double-send

  const proxyReq = proto.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MovieStar/1.0)',
      'Referer':    'https://en.wikipedia.org/',
      'Accept':     'image/*',
    },
  }, proxyRes => {
    if (done) return;

    const { statusCode } = proxyRes;
    if (statusCode === 301 || statusCode === 302) {
      done = true;
      return res.redirect(302, proxyRes.headers.location);
    }
    if (statusCode !== 200) {
      done = true;
      return res.redirect(302, '/images/placeholder.svg');
    }

    done = true;
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    proxyRes.pipe(res);

    // If piping breaks after headers sent — swallow the error silently
    proxyRes.on('error', () => { try { res.end(); } catch {} });
  });

  proxyReq.on('error', () => {
    if (!done) { done = true; res.redirect(302, '/images/placeholder.svg'); }
  });

  // Timeout: destroy request, redirect to placeholder
  proxyReq.setTimeout(10000, () => {
    proxyReq.destroy();        // fires 'error' event → handled above
  });
});

module.exports = router;
