/**
 * services/movieBaseSync.js
 * Pulls movies from movie_base. On first run if DB is empty,
 * triggers movie_base scraper and waits for it to populate.
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = (process.env.MOVIE_BASE_URL || '').replace(/\/+$/, '');
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;  // 3 hours

const TIMEOUT_MS   = 90 * 1000;
const WAKE_RETRIES = 6;
const WAKE_DELAY   = 15 * 1000;

// Scraper can take up to 10 min — poll every 30s for up to 15 min
const SCRAPE_POLL_INTERVAL = 30 * 1000;
const SCRAPE_POLL_MAX      = 30;   // 30 × 30s = 15 minutes

let _timer = null;

// ── HTTP helpers ──────────────────────────────────────────────────────────
function fetchJSON(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req   = proto.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode === 403)
          return reject(new Error('Unauthorized — check MOVIE_BASE_KEY'));
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}`));
        try   { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from movie_base')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
    });
  });
}

function postJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const proto   = url.startsWith('https') ? https : http;
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (url.startsWith('https') ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  { 'Content-Length': 0, ...headers },
    };
    const req = proto.request(options, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode === 403) return reject(new Error('Unauthorized'));
        try   { resolve(JSON.parse(data)); }
        catch { resolve({ status: 'ok' }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Wake up Render free-tier ──────────────────────────────────────────────
async function waitForService() {
  console.log(`[MovieBaseSync] 🔔 Waking up movie_base…`);
  for (let i = 1; i <= WAKE_RETRIES; i++) {
    try {
      const health = await fetchJSON(`${BASE_URL}/health`, {});
      if (health.status === 'ok') {
        console.log(`[MovieBaseSync] ✅ movie_base awake (attempt ${i})`);
        return true;
      }
    } catch (e) {
      console.log(`[MovieBaseSync] 💤 Not ready (${i}/${WAKE_RETRIES}): ${e.message}`);
    }
    if (i < WAKE_RETRIES) await sleep(WAKE_DELAY);
  }
  console.error(`[MovieBaseSync] ❌ movie_base unreachable after ${WAKE_RETRIES} attempts`);
  return false;
}

// ── Trigger scraper on movie_base + wait for data ─────────────────────────
async function triggerAndWaitForScrape() {
  console.log(`[MovieBaseSync] 🕷️  movie_base DB is empty — triggering scraper…`);

  try {
    const result = await postJSON(
      `${BASE_URL}/sync?skip_posters=true`,  // skip posters for speed
      { access_token: API_KEY }
    );
    console.log(`[MovieBaseSync] 🕷️  Scraper triggered: ${JSON.stringify(result)}`);
  } catch (e) {
    console.warn(`[MovieBaseSync] ⚠️  Trigger failed: ${e.message}`);
  }

  // Poll until movies appear in movie_base
  console.log(`[MovieBaseSync] ⏳ Waiting for scraper to populate data…`);
  for (let i = 1; i <= SCRAPE_POLL_MAX; i++) {
    await sleep(SCRAPE_POLL_INTERVAL);
    try {
      const count = await fetchJSON(
        `${BASE_URL}/movies/count`,
        { access_token: API_KEY }
      );
      const n = count.count || 0;
      console.log(`[MovieBaseSync] 📊 movie_base has ${n} movies (poll ${i}/${SCRAPE_POLL_MAX})`);
      if (n > 0) {
        console.log(`[MovieBaseSync] ✅ Data ready — proceeding to pull`);
        return true;
      }
    } catch (e) {
      console.log(`[MovieBaseSync] ⏳ Poll ${i} failed: ${e.message}`);
    }
  }
  console.warn(`[MovieBaseSync] ⚠️  Scraper still empty after ${SCRAPE_POLL_MAX} polls — pulling anyway`);
  return false;
}

// ── Upsert one movie ──────────────────────────────────────────────────────
async function upsertMovie(data) {
  await Movie.findOneAndUpdate(
    { _movieBaseId: data.id },
    {
      $set: {
        _movieBaseId: data.id,
        title:       data.title,
        language:    data.language,
        type:        data.release_type || 'released',
        releaseDate: data.release_date ? new Date(data.release_date) : null,
        description: data.description  || '',
        director:    data.director     || '',
        cast:  data.cast  ? data.cast.split(',').map(s => s.trim()).filter(Boolean)  : [],
        genre: data.genre ? data.genre.split(',').map(s => s.trim()).filter(Boolean) : [],
        image: data.poster || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ── Main sync ─────────────────────────────────────────────────────────────
async function runSync() {
  if (!BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — skipping');
    return;
  }

  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Sync from ${BASE_URL}`);

  // 1. Wake up service
  const alive = await waitForService();
  if (!alive) return;

  // 2. Check if movie_base has any data
  let movieBaseCount = 0;
  try {
    const countRes = await fetchJSON(
      `${BASE_URL}/movies/count`,
      { access_token: API_KEY }
    );
    movieBaseCount = countRes.count || 0;
    console.log(`[MovieBaseSync] 📊 movie_base has ${movieBaseCount} movies`);
  } catch (e) {
    console.warn(`[MovieBaseSync] ⚠️  Count check failed: ${e.message}`);
  }

  // 3. If empty, trigger scraper and wait
  if (movieBaseCount === 0) {
    await triggerAndWaitForScrape();
  }

  // 4. Pull all pages
  let skip = 0, total = 0, upserted = 0, failed = 0;

  while (true) {
    let page;
    try {
      page = await fetchJSON(
        `${BASE_URL}/movies?skip=${skip}&limit=${PAGE_SIZE}`,
        { access_token: API_KEY }
      );
    } catch (e) {
      console.error(`[MovieBaseSync] ❌ Fetch failed at skip=${skip}: ${e.message}`);
      break;
    }

    if (!Array.isArray(page) || page.length === 0) break;

    for (const movie of page) {
      try { await upsertMovie(movie); upserted++; }
      catch (e) {
        console.warn(`[MovieBaseSync] ⚠️  "${movie.title}": ${e.message}`);
        failed++;
      }
    }

    total += page.length;
    skip  += PAGE_SIZE;
    console.log(`[MovieBaseSync]   ↳ fetched ${total} movies so far…`);
    if (page.length < PAGE_SIZE) break;
  }

  const ms = Date.now() - start;
  console.log(
    `[MovieBaseSync] ✅ Done in ${(ms/1000).toFixed(1)}s | ` +
    `fetched=${total} upserted=${upserted} failed=${failed}`
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function start() {
  if (!BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — disabled');
    return;
  }
  _timer = setInterval(() => {
    runSync().catch(e => console.error('[MovieBaseSync] Interval error:', e.message));
  }, INTERVAL);
  console.log('[MovieBaseSync] ⏰ Recurring sync every 3 hours');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, runSync };
