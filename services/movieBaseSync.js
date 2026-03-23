/**
 * services/movieBaseSync.js
 * ms3 pulls from movie_base only.
 * movie_base handles ALL Cloudinary uploads — ms3 just stores the URLs it gets.
 */

const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = (process.env.MOVIE_BASE_URL || '').replace(/\/+$/, '');
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;

const WAKE_RETRIES = 6;
const WAKE_DELAY   = 15 * 1000;
const SYNC_TIMEOUT = 5 * 60 * 1000;
const LANGUAGES    = ['Malayalam', 'Tamil', 'Telugu', 'Kannada', 'Hindi'];

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
    const req = proto.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode === 403) return reject(new Error('Unauthorized — check MOVIE_BASE_KEY'));
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout ${timeoutMs/1000}s`)); });
    req.end();
  });
}

const GET  = (url, h, ms) => request('GET',  url, h, ms);
const POST = (url, h, ms) => request('POST', url, h, ms);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Wake up movie_base ────────────────────────────────────────────────────
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
  console.error(`[MovieBaseSync] ❌ movie_base unreachable`);
  return false;
}

// ── Scrape titles on movie_base (fast) ───────────────────────────────────
async function scrapeTitles(language) {
  const url = `${BASE_URL}/sync/now?language=${encodeURIComponent(language)}&max_movies=500&skip_posters=true`;
  try {
    const r = await POST(url, { access_token: API_KEY }, SYNC_TIMEOUT);
    if (r.status === 200) {
      console.log(`[MovieBaseSync] 🕷️  ${language}: saved=${r.body.saved} (${r.body.elapsed_sec}s)`);
      return r.body.saved || 0;
    }
    console.warn(`[MovieBaseSync] ⚠️  ${language} HTTP ${r.status}: ${JSON.stringify(r.body).slice(0,120)}`);
    return 0;
  } catch (e) { console.error(`[MovieBaseSync] ❌ ${language}: ${e.message}`); return 0; }
}

// ── Ask movie_base to enrich details + upload posters to Cloudinary ───────
async function enrichOnMovieBase(language) {
  // movie_base's /sync/details fetches individual wiki pages AND uploads to Cloudinary
  const url = `${BASE_URL}/sync/details?language=${encodeURIComponent(language)}&batch_size=20`;
  try {
    const r = await POST(url, { access_token: API_KEY }, 8 * 60 * 1000);
    if (r.status === 200) {
      console.log(`[MovieBaseSync] 📝 ${language} enriched=${r.body.enriched} (${r.body.elapsed}s)`);
    }
  } catch (e) {
    console.warn(`[MovieBaseSync] ⚠️  Enrich ${language}: ${e.message}`);
  }
}

// ── Pull movies from movie_base into MongoDB ──────────────────────────────
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
      if (r.status !== 200) { console.error(`[MovieBaseSync] ❌ /movies ${r.status}`); break; }
      page = r.body;
    } catch (e) { console.error(`[MovieBaseSync] ❌ skip=${skip}: ${e.message}`); break; }

    if (!Array.isArray(page) || !page.length) break;

    for (const m of page) {
      try {
        // movie_base already uploaded poster to Cloudinary — just use what we get
        const imageUrl = m.poster || null;

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
              image: imageUrl,
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
    console.log(`[MovieBaseSync]   ↳ ${total} movies pulled…`);
    if (page.length < PAGE_SIZE) break;
  }
  return { total, upserted, failed };
}

// ── Cleanup on movie_base ─────────────────────────────────────────────────
async function runCleanup() {
  for (const ep of ['cleanup/actors', 'cleanup/old']) {
    try {
      const r = await POST(`${BASE_URL}/${ep}`, { access_token: API_KEY }, 30000);
      if (r.status === 200) console.log(`[MovieBaseSync] 🧹 ${ep}: removed ${r.body.deleted}`);
    } catch (e) { console.warn(`[MovieBaseSync] ⚠️  ${ep}: ${e.message}`); }
  }
}

// ── Main sync ─────────────────────────────────────────────────────────────
async function runSync() {
  if (!BASE_URL) { console.log('[MovieBaseSync] MOVIE_BASE_URL not set'); return; }

  const start = Date.now();
  console.log(`[MovieBaseSync] 🔄 Sync from ${BASE_URL}`);

  // 1. Wake service
  const alive = await waitForService();
  if (!alive) return;

  // 2. Check existing count on movie_base
  let existingCount = 0;
  try {
    const r = await GET(`${BASE_URL}/movies/count`, { access_token: API_KEY }, 15000);
    existingCount = r.body.count || 0;
  } catch {}
  console.log(`[MovieBaseSync] 📊 movie_base has ${existingCount} movies`);

  // 3. If empty: scrape titles first (fast — no Cloudinary yet)
  if (existingCount === 0) {
    console.log(`[MovieBaseSync] 🕷️  Scraping titles on movie_base…`);
    let saved = 0;
    for (const lang of LANGUAGES) {
      saved += await scrapeTitles(lang);
      await sleep(2000);
    }
    if (saved === 0) { console.error('[MovieBaseSync] ❌ Nothing scraped'); return; }
    await runCleanup();
  }

  // 4. Pull movies into MongoDB (gets whatever posters movie_base has so far)
  const { total, upserted, failed } = await pullMovies();
  const ms = Date.now() - start;
  console.log(`[MovieBaseSync] ✅ Initial pull done in ${(ms/1000).toFixed(0)}s | movies=${total}`);

  // 5. Now ask movie_base to enrich details + upload posters to Cloudinary
  //    This runs in background — pages already show movies while this happens
  if (existingCount === 0) {
    console.log(`[MovieBaseSync] 🖼️  Requesting movie_base to enrich & upload posters…`);
    for (const lang of LANGUAGES) {
      await enrichOnMovieBase(lang);
      await sleep(3000);
    }
    // Pull again to get the Cloudinary URLs that movie_base just uploaded
    console.log(`[MovieBaseSync] 🔄 Re-pulling to get Cloudinary poster URLs…`);
    await pullMovies();
    console.log(`[MovieBaseSync] ✅ All done — posters synced via movie_base Cloudinary`);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function start() {
  if (!BASE_URL) { console.log('[MovieBaseSync] disabled (no MOVIE_BASE_URL)'); return; }
  _timer = setInterval(() => runSync().catch(e => console.error('[MovieBaseSync]', e.message)), INTERVAL);
  console.log('[MovieBaseSync] ⏰ Recurring sync every 3 hours');
}

function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = { start, stop, runSync };
