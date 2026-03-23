/**
 * services/movieBaseSync.js
 * Phase 1: /sync/now per language → fast title scrape (no individual page visits)
 * Phase 2: Pull movies into MongoDB
 * Phase 3: /sync/details in batches → enrich descriptions/posters (background, non-blocking)
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = (process.env.MOVIE_BASE_URL || '').replace(/\/+$/, '');
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;

const WAKE_RETRIES  = 6;
const WAKE_DELAY    = 15 * 1000;
const SYNC_TIMEOUT  = 5 * 60 * 1000;   // 5 min per language (no detail fetching = fast)
const DETAIL_BATCH  = 20;              // enrich 20 movies at a time

const LANGUAGES = ['Malayalam', 'Tamil', 'Telugu', 'Kannada', 'Hindi'];

let _timer = null;

// ── HTTP ──────────────────────────────────────────────────────────────────
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

const GET  = (url, h, ms) => request('GET',  url, h, ms);
const POST = (url, h, ms) => request('POST', url, h, ms);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Wake service ──────────────────────────────────────────────────────────
async function waitForService() {
  console.log(`[MovieBaseSync] 🔔 Waking movie_base…`);
  for (let i = 1; i <= WAKE_RETRIES; i++) {
    try {
      const r = await GET(`${BASE_URL}/health`, {}, 30000);
      if (r.status === 200 && r.body.status === 'ok') {
        console.log(`[MovieBaseSync] ✅ Awake (attempt ${i})`);
        return true;
      }
    } catch (e) {
      console.log(`[MovieBaseSync] 💤 (${i}/${WAKE_RETRIES}): ${e.message}`);
    }
    if (i < WAKE_RETRIES) { console.log(`[MovieBaseSync] ⏳ 15s…`); await sleep(WAKE_DELAY); }
  }
  console.error(`[MovieBaseSync] ❌ Unreachable`);
  return false;
}

// ── Phase 1: Fast title scrape per language ───────────────────────────────
async function scrapeTitles(language) {
  // fetch_details=false → just list pages, no individual movie pages = very fast
  const url = `${BASE_URL}/sync/now?language=${encodeURIComponent(language)}&max_movies=500&skip_posters=true`;
  console.log(`[MovieBaseSync] 🕷️  Fast-scraping ${language} titles…`);
  try {
    const r = await POST(url, { access_token: API_KEY }, SYNC_TIMEOUT);
    if (r.status === 200) {
      const b = r.body;
      console.log(`[MovieBaseSync] ✅ ${language}: raw=${b.scraped_raw} saved=${b.saved} (${b.elapsed_sec}s)`);
      return b.saved || 0;
    }
    console.warn(`[MovieBaseSync] ⚠️  ${language} HTTP ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
    return 0;
  } catch (e) {
    console.error(`[MovieBaseSync] ❌ ${language}: ${e.message}`);
    return 0;
  }
}

// ── Phase 2: Pull movies into MongoDB ─────────────────────────────────────
async function pullMovies() {
  let skip = 0, total = 0, upserted = 0, failed = 0;
  while (true) {
    let r;
    try {
      r = await GET(`${BASE_URL}/movies?skip=${skip}&limit=${PAGE_SIZE}`, { access_token: API_KEY }, 60000);
      if (r.status !== 200) { console.error(`[MovieBaseSync] ❌ /movies ${r.status}`); break; }
    } catch (e) { console.error(`[MovieBaseSync] ❌ Fetch skip=${skip}: ${e.message}`); break; }

    const page = r.body;
    if (!Array.isArray(page) || page.length === 0) break;

    for (const m of page) {
      try {
        await Movie.findOneAndUpdate(
          { _movieBaseId: m.id },
          { $set: {
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
          }},
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
    console.log(`[MovieBaseSync]   ↳ pulled ${total}…`);
    if (page.length < PAGE_SIZE) break;
  }
  return { total, upserted, failed };
}

// ── Phase 3: Enrich details in background (non-blocking) ─────────────────
async function enrichDetails() {
  if (!BASE_URL) return;
  console.log(`[MovieBaseSync] 🔍 Enriching movie details in background…`);
  for (const lang of LANGUAGES) {
    try {
      const r = await POST(
        `${BASE_URL}/sync/details?language=${encodeURIComponent(lang)}&batch_size=${DETAIL_BATCH}`,
        { access_token: API_KEY },
        5 * 60 * 1000
      );
      if (r.status === 200) {
        console.log(`[MovieBaseSync] 📝 ${lang} details: enriched=${r.body.enriched} (${r.body.elapsed}s)`);
        // Pull updated data into MongoDB
        await pullMovies();
      }
    } catch (e) {
      console.warn(`[MovieBaseSync] ⚠️  Detail enrich ${lang}: ${e.message}`);
    }
    await sleep(2000);
  }
  console.log(`[MovieBaseSync] ✅ Detail enrichment pass complete`);
}

// ── Main sync ─────────────────────────────────────────────────────────────
async function runSync() {
  if (!BASE_URL) { console.log('[MovieBaseSync] No MOVIE_BASE_URL'); return; }

  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Sync from ${BASE_URL}`);

  const alive = await waitForService();
  if (!alive) return;

  // Check existing count
  let existingCount = 0;
  try {
    const r = await GET(`${BASE_URL}/movies/count`, { access_token: API_KEY }, 15000);
    existingCount = r.body.count || 0;
  } catch (e) {}
  console.log(`[MovieBaseSync] 📊 movie_base has ${existingCount} movies`);

  // Phase 1: Scrape titles if DB is empty (fast — no individual page visits)
  if (existingCount === 0) {
    console.log(`[MovieBaseSync] 🕷️  Scraping titles for all languages…`);
    let totalSaved = 0;
    for (const lang of LANGUAGES) {
      totalSaved += await scrapeTitles(lang);
      await sleep(2000);
    }
    console.log(`[MovieBaseSync] 📊 Title scrape done: ${totalSaved} movies in PostgreSQL`);
    if (totalSaved === 0) {
      console.error(`[MovieBaseSync] ❌ Nothing scraped — check movie_base logs`);
      return;
    }

    // Clean up actor/person records
    try {
      const cr = await POST(`${BASE_URL}/cleanup/actors`, { access_token: API_KEY }, 30000);
      if (cr.status === 200)
        console.log(`[MovieBaseSync] 🧹 Actors cleanup: removed ${cr.body.deleted} non-film records`);
    } catch (e) {
      console.warn(`[MovieBaseSync] ⚠️  Actor cleanup failed: ${e.message}`);
    }

    // Clean up movies older than Dec 2025
    try {
      const or2 = await POST(`${BASE_URL}/cleanup/old`, { access_token: API_KEY }, 30000);
      if (or2.status === 200)
        console.log(`[MovieBaseSync] 🧹 Old movies cleanup: removed ${or2.body.deleted} records`);
    } catch (e) {
      console.warn(`[MovieBaseSync] ⚠️  Old cleanup failed: ${e.message}`);
    }
  }

  // Phase 2: Pull into MongoDB
  const { total, upserted, failed } = await pullMovies();
  const ms = Date.now() - start;
  console.log(`[MovieBaseSync] ✅ Pull done in ${(ms/1000).toFixed(1)}s | fetched=${total} upserted=${upserted} failed=${failed}`);

  // Phase 3: Enrich details in background (doesn't block startup)
  if (existingCount === 0 || total > 0) {
    enrichDetails().catch(e => console.warn('[MovieBaseSync] Enrich error:', e.message));
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function start() {
  if (!BASE_URL) { console.log('[MovieBaseSync] MOVIE_BASE_URL not set — disabled'); return; }
  _timer = setInterval(() => {
    runSync().catch(e => console.error('[MovieBaseSync] Interval error:', e.message));
  }, INTERVAL);
  console.log('[MovieBaseSync] ⏰ Recurring sync every 3 hours');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, runSync };
