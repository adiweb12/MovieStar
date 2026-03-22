/**
 * services/movieBaseSync.js
 * ─────────────────────────
 * Pulls movies from movie_base microservice and upserts into MongoDB.
 * Handles Render free-tier cold starts (up to 60s wake time).
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = process.env.MOVIE_BASE_URL  || '';
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;  // 3 hours

// Render free tier can take up to 60s to wake — use generous timeout
const TIMEOUT_MS       = 90 * 1000;   // 90 seconds per request
const WAKE_RETRIES     = 5;           // retry health check this many times
const WAKE_RETRY_DELAY = 15 * 1000;   // 15 seconds between retries

let _timer = null;

// ── HTTP helper ───────────────────────────────────────────────────────────
function fetchJSON(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const proto   = url.startsWith('https') ? https : http;
    const options = { headers };
    const req     = proto.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
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
      reject(new Error(`Request timeout after ${timeoutMs / 1000}s`));
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Wake up Render free-tier service ─────────────────────────────────────
async function waitForService() {
  console.log(`[MovieBaseSync] 🔔 Waking up movie_base at ${BASE_URL}…`);

  for (let i = 1; i <= WAKE_RETRIES; i++) {
    try {
      const health = await fetchJSON(`${BASE_URL}/health`, {}, TIMEOUT_MS);
      if (health.status === 'ok') {
        console.log(`[MovieBaseSync] ✅ movie_base is awake (attempt ${i})`);
        return true;
      }
      console.warn(`[MovieBaseSync] ⚠️  Health not ok: ${JSON.stringify(health)}`);
    } catch (e) {
      console.log(`[MovieBaseSync] 💤 movie_base not ready (attempt ${i}/${WAKE_RETRIES}): ${e.message}`);
    }

    if (i < WAKE_RETRIES) {
      console.log(`[MovieBaseSync] ⏳ Waiting ${WAKE_RETRY_DELAY / 1000}s before retry…`);
      await sleep(WAKE_RETRY_DELAY);
    }
  }

  console.error(`[MovieBaseSync] ❌ movie_base did not respond after ${WAKE_RETRIES} attempts`);
  return false;
}

// ── Fetch one page of movies ──────────────────────────────────────────────
async function fetchPage(skip, limit = PAGE_SIZE) {
  const url = `${BASE_URL}/movies?skip=${skip}&limit=${limit}`;
  return fetchJSON(url, { access_token: API_KEY });
}

// ── Upsert one movie into MongoDB ─────────────────────────────────────────
async function upsertMovie(data) {
  const doc = {
    _movieBaseId:  data.id,
    title:         data.title,
    language:      data.language,
    type:          data.release_type || 'released',
    releaseDate:   data.release_date ? new Date(data.release_date) : null,
    description:   data.description  || '',
    director:      data.director     || '',
    cast:  data.cast  ? data.cast.split(',').map(s => s.trim()).filter(Boolean)  : [],
    genre: data.genre ? data.genre.split(',').map(s => s.trim()).filter(Boolean) : [],
    // Cloudinary URL from movie_base — or raw poster URL if Cloudinary not set up
    image: data.poster || null,
  };

  await Movie.findOneAndUpdate(
    { _movieBaseId: data.id },
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ── Main sync ─────────────────────────────────────────────────────────────
async function runSync() {
  if (!BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — skipping sync');
    return;
  }

  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Sync starting from ${BASE_URL}`);

  // Wake up Render free-tier service first
  const alive = await waitForService();
  if (!alive) return;

  let skip     = 0;
  let total    = 0;
  let upserted = 0;
  let failed   = 0;

  // Paginate all movies
  while (true) {
    let page;
    try {
      page = await fetchPage(skip);
    } catch (e) {
      console.error(`[MovieBaseSync] ❌ Fetch failed at skip=${skip}: ${e.message}`);
      break;
    }

    if (!Array.isArray(page) || page.length === 0) break;

    for (const movie of page) {
      try {
        await upsertMovie(movie);
        upserted++;
      } catch (e) {
        console.warn(`[MovieBaseSync] ⚠️  Upsert failed "${movie.title}": ${e.message}`);
        failed++;
      }
    }

    total += page.length;
    skip  += PAGE_SIZE;
    console.log(`[MovieBaseSync]   ↳ fetched ${total} so far…`);

    if (page.length < PAGE_SIZE) break;
  }

  const ms = Date.now() - start;
  console.log(
    `[MovieBaseSync] ✅ Done in ${(ms / 1000).toFixed(1)}s | ` +
    `fetched=${total} upserted=${upserted} failed=${failed}`
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function start() {
  if (!BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — scheduler disabled');
    return;
  }

  // NOTE: startup sync is handled by app.js inside mongoose.connection.once('open')
  // This only sets up the recurring interval.
  _timer = setInterval(() => {
    runSync().catch(e => console.error('[MovieBaseSync] Interval sync error:', e.message));
  }, INTERVAL);

  console.log('[MovieBaseSync] ⏰ Recurring sync every 3 hours');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, runSync };
