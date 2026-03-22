/**
 * services/movieBaseSync.js
 * ─────────────────────────
 * Pulls movies from movie_base microservice every 3 hours
 * and upserts them into ms3's own MongoDB.
 *
 * Completely decoupled — ms3 never touches movie_base's PostgreSQL.
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = process.env.MOVIE_BASE_URL  || 'http://localhost:8000';
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;   // 3 hours in ms

let _timer = null;

// ── HTTP helper (no external deps needed) ────────────────────────────────
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req   = proto.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 403) return reject(new Error('movie_base: Unauthorized (check MOVIE_BASE_KEY)'));
        if (res.statusCode !== 200) return reject(new Error(`movie_base: HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('movie_base: Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('movie_base: Request timeout')); });
  });
}

// ── Fetch one page ────────────────────────────────────────────────────────
async function fetchPage(skip, limit = PAGE_SIZE) {
  const url = `${BASE_URL}/movies?skip=${skip}&limit=${limit}`;
  return fetchJSON(url, { access_token: API_KEY });
}

// ── Upsert a single movie into MongoDB ───────────────────────────────────
async function upsertMovie(data) {
  const filter = { _movieBaseId: data.id };

  const doc = {
    _movieBaseId:  data.id,
    title:         data.title,
    language:      data.language,
    type:          data.release_type || 'released',
    releaseDate:   data.release_date ? new Date(data.release_date) : null,
    description:   data.description || '',
    director:      data.director    || '',
    cast:          data.cast ? data.cast.split(',').map(s => s.trim()).filter(Boolean) : [],
    genre:         data.genre ? data.genre.split(',').map(s => s.trim()).filter(Boolean) : [],
    // Use Cloudinary URL from movie_base — already optimised
    image:         data.poster || null,
    averageRating: 0,
    reviewCount:   0,
  };

  // If movie already exists in MongoDB, don't overwrite reviews/rating
  await Movie.findOneAndUpdate(
    filter,
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ── Full sync run ─────────────────────────────────────────────────────────
async function runSync() {
  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Starting sync from ${BASE_URL}`);

  if (!API_KEY) {
    console.warn('[MovieBaseSync] ⚠️  MOVIE_BASE_KEY not set — sync will likely fail (403)');
  }

  let skip     = 0;
  let total    = 0;
  let inserted = 0;
  let failed   = 0;

  try {
    // Health check first
    const health = await fetchJSON(`${BASE_URL}/health`);
    if (health.status !== 'ok') {
      console.warn(`[MovieBaseSync] ⚠️  movie_base health: ${health.status} (db: ${health.db})`);
    }
  } catch (e) {
    console.error(`[MovieBaseSync] ❌ Health check failed: ${e.message}`);
    return;
  }

  // Paginate through all movies
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
        inserted++;
      } catch (e) {
        console.warn(`[MovieBaseSync] ⚠️  Upsert failed for "${movie.title}": ${e.message}`);
        failed++;
      }
    }

    total += page.length;
    skip  += PAGE_SIZE;

    if (page.length < PAGE_SIZE) break;   // last page
  }

  const ms = Date.now() - start;
  console.log(
    `[MovieBaseSync] ✅ Done in ${ms}ms | ` +
    `fetched=${total} upserted=${inserted} failed=${failed}`
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function start() {
  if (!process.env.MOVIE_BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — scheduler disabled');
    return;
  }

  // NOTE: Initial sync is triggered by app.js inside mongoose.connection.once('open')
  // This function only sets up the recurring interval.
  _timer = setInterval(() => {
    runSync().catch(e => console.error('[MovieBaseSync] Scheduled sync error:', e));
  }, INTERVAL);

  console.log('[MovieBaseSync] ⏰ Recurring sync scheduled every 3 hours');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, runSync };
