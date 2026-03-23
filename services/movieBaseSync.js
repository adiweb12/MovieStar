/**
 * services/movieBaseSync.js
 * Pulls movies from movie_base.
 * Uses /sync/now (synchronous per-language) to avoid Render killing background tasks.
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = (process.env.MOVIE_BASE_URL || '').replace(/\/+$/, '');
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;  // 3 hours

const WAKE_RETRIES = 6;
const WAKE_DELAY   = 15 * 1000;

// /sync/now can take up to 5 min per language on first run
const SYNC_TIMEOUT = 8 * 60 * 1000;  // 8 minutes

const LANGUAGES = ['Malayalam', 'Tamil', 'Telugu', 'Kannada', 'Hindi'];

let _timer = null;

// ── HTTP helpers ──────────────────────────────────────────────────────────
function request(method, url, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proto  = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const opts   = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (url.startsWith('https') ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method,
      headers:  { 'Content-Length': 0, ...headers },
    };
    const req = proto.request(opts, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode === 403)
          return reject(new Error('Unauthorized — check MOVIE_BASE_KEY'));
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs / 1000}s`));
    });
    req.end();
  });
}

const GET  = (url, headers, ms) => request('GET',  url, headers, ms);
const POST = (url, headers, ms) => request('POST', url, headers, ms);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Wake up Render free-tier ──────────────────────────────────────────────
async function waitForService() {
  console.log(`[MovieBaseSync] 🔔 Waking up movie_base…`);
  for (let i = 1; i <= WAKE_RETRIES; i++) {
    try {
      const r = await GET(`${BASE_URL}/health`, {}, 30000);
      if (r.status === 200 && r.body.status === 'ok') {
        console.log(`[MovieBaseSync] ✅ movie_base awake (attempt ${i})`);
        return true;
      }
    } catch (e) {
      console.log(`[MovieBaseSync] 💤 Not ready (${i}/${WAKE_RETRIES}): ${e.message}`);
    }
    if (i < WAKE_RETRIES) {
      console.log(`[MovieBaseSync] ⏳ Waiting 15s…`);
      await sleep(WAKE_DELAY);
    }
  }
  console.error(`[MovieBaseSync] ❌ movie_base unreachable`);
  return false;
}

// ── Trigger sync/now for one language (SYNCHRONOUS — waits for result) ───
async function scrapeLanguage(language) {
  const url = `${BASE_URL}/sync/now?language=${encodeURIComponent(language)}&max_movies=500&skip_posters=true`;
  console.log(`[MovieBaseSync] 🕷️  Scraping ${language}…`);
  try {
    const r = await POST(url, { access_token: API_KEY }, SYNC_TIMEOUT);
    if (r.status === 200) {
      const b = r.body;
      console.log(`[MovieBaseSync] ✅ ${language}: scraped=${b.scraped_raw} saved=${b.saved} time=${b.elapsed_sec}s`);
      if (b.errors && b.errors.length > 0)
        console.warn(`[MovieBaseSync] ⚠️  Errors: ${b.errors.slice(0,3).join(', ')}`);
      return b.saved || 0;
    } else {
      console.warn(`[MovieBaseSync] ⚠️  ${language} returned HTTP ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`);
      return 0;
    }
  } catch (e) {
    console.error(`[MovieBaseSync] ❌ ${language} scrape failed: ${e.message}`);
    return 0;
  }
}

// ── Get count from movie_base ─────────────────────────────────────────────
async function getMovieBaseCount() {
  try {
    const r = await GET(`${BASE_URL}/movies/count`, { access_token: API_KEY }, 30000);
    return r.body.count || 0;
  } catch { return 0; }
}

// ── Pull all movies from movie_base into MongoDB ──────────────────────────
async function pullMovies() {
  let skip = 0, total = 0, upserted = 0, failed = 0;

  while (true) {
    let page;
    try {
      const r = await GET(
        `${BASE_URL}/movies?skip=${skip}&limit=${PAGE_SIZE}`,
        { access_token: API_KEY },
        60000
      );
      if (r.status !== 200) { console.error(`[MovieBaseSync] ❌ /movies returned ${r.status}`); break; }
      page = r.body;
    } catch (e) {
      console.error(`[MovieBaseSync] ❌ Fetch failed at skip=${skip}: ${e.message}`);
      break;
    }

    if (!Array.isArray(page) || page.length === 0) break;

    for (const m of page) {
      try {
        await Movie.findOneAndUpdate(
          { _movieBaseId: m.id },
          {
            $set: {
              _movieBaseId: m.id,
              title:       m.title,
              language:    m.language,
              type:        m.release_type || 'released',
              releaseDate: m.release_date ? new Date(m.release_date) : null,
              description: m.description  || '',
              director:    m.director     || '',
              cast:  m.cast  ? m.cast.split(',').map(s => s.trim()).filter(Boolean)  : [],
              genre: m.genre ? m.genre.split(',').map(s => s.trim()).filter(Boolean) : [],
              image: m.poster || null,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        upserted++;
      } catch (e) {
        console.warn(`[MovieBaseSync] ⚠️  "${m.title}": ${e.message}`);
        failed++;
      }
    }

    total += page.length;
    skip  += PAGE_SIZE;
    console.log(`[MovieBaseSync]   ↳ pulled ${total} movies so far…`);
    if (page.length < PAGE_SIZE) break;
  }

  return { total, upserted, failed };
}

// ── Main sync ─────────────────────────────────────────────────────────────
async function runSync() {
  if (!BASE_URL) {
    console.log('[MovieBaseSync] MOVIE_BASE_URL not set — skipping');
    return;
  }

  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Sync from ${BASE_URL}`);

  // 1. Wake service
  const alive = await waitForService();
  if (!alive) return;

  // 2. Check if movie_base already has data
  const existingCount = await getMovieBaseCount();
  console.log(`[MovieBaseSync] 📊 movie_base has ${existingCount} movies in PostgreSQL`);

  // 3. If empty, scrape each language synchronously (one at a time)
  if (existingCount === 0) {
    console.log(`[MovieBaseSync] 🕷️  DB empty — scraping all languages one by one…`);
    let totalSaved = 0;
    for (const lang of LANGUAGES) {
      const saved = await scrapeLanguage(lang);
      totalSaved += saved;
      // Small pause between languages to be polite to Wikipedia
      await sleep(3000);
    }
    console.log(`[MovieBaseSync] 📊 Scraping done — ${totalSaved} movies saved to PostgreSQL`);

    if (totalSaved === 0) {
      console.error(`[MovieBaseSync] ❌ Scraping returned 0 movies — check movie_base logs`);
      return;
    }
  }

  // 4. Pull all movies from movie_base into MongoDB
  const { total, upserted, failed } = await pullMovies();

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
