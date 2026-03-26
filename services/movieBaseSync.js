/**
 * movieBaseSync.js — Clean version
 * Key fix: never overwrite a good image with null
 */
const https  = require('https');
const http   = require('http');
const Movie  = require('../models/Movie');

const BASE_URL  = (process.env.MOVIE_BASE_URL || '').replace(/\/+$/, '');
const API_KEY   = process.env.MOVIE_BASE_KEY  || '';
const PAGE_SIZE = 100;
const INTERVAL  = 3 * 60 * 60 * 1000;
const WAKE_RETRIES = 5;
const WAKE_DELAY   = 15000;
const SYNC_TIMEOUT = 5 * 60 * 1000;
const LANGUAGES    = ['Malayalam','Tamil','Telugu','Kannada','Hindi'];

let _timer = null;

function request(method, url, headers={}, ms=30000) {
  return new Promise((resolve, reject) => {
    const proto  = url.startsWith('https') ? https : http;
    const u      = new URL(url);
    const req    = proto.request({
      hostname: u.hostname, port: u.port||(url.startsWith('https')?443:80),
      path: u.pathname+u.search, method,
      headers: {'Content-Length':'0',...headers},
    }, res => {
      let d='';
      res.on('data', c=>(d+=c));
      res.on('end', ()=>{
        if(res.statusCode===403) return reject(new Error('Unauthorized'));
        try { resolve({status:res.statusCode,body:JSON.parse(d)}); }
        catch { resolve({status:res.statusCode,body:d}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(ms,()=>{req.destroy();reject(new Error(`Timeout ${ms/1000}s`));});
    req.end();
  });
}
const GET  = (u,h,ms)=>request('GET', u,h,ms);
const POST = (u,h,ms)=>request('POST',u,h,ms);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function waitForService() {
  console.log(`[Sync] 🔔 Waking movie_base…`);
  for(let i=1;i<=WAKE_RETRIES;i++){
    try {
      const r=await GET(`${BASE_URL}/health`,{},30000);
      if(r.status===200&&r.body.status==='ok'){console.log(`[Sync] ✅ Awake`);return true;}
    } catch(e){console.log(`[Sync] 💤 (${i}): ${e.message}`);}
    if(i<WAKE_RETRIES) await sleep(WAKE_DELAY);
  }
  return false;
}

async function scrapeTitles(language) {
  const r=await POST(
    `${BASE_URL}/sync/now?language=${encodeURIComponent(language)}&max_movies=500&skip_posters=true`,
    {access_token:API_KEY}, SYNC_TIMEOUT
  ).catch(e=>({status:0,body:{error:e.message}}));
  if(r.status===200){
    console.log(`[Sync] 🕷️  ${language}: saved=${r.body.saved} (${r.body.elapsed_sec}s)`);
    return r.body.saved||0;
  }
  console.warn(`[Sync] ⚠️  ${language} HTTP ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
  return 0;
}

async function enrichOnMovieBase(language) {
  await POST(
    `${BASE_URL}/sync/details?language=${encodeURIComponent(language)}&batch_size=20`,
    {access_token:API_KEY}, 8*60*1000
  ).then(r=>{
    if(r.status===200) console.log(`[Sync] 📝 ${language}: enriched=${r.body.enriched}`);
  }).catch(e=>console.warn(`[Sync] ⚠️  enrich ${language}: ${e.message}`));
}

async function pullMovies() {
  let skip=0, total=0, upserted=0, failed=0;
  while(true){
    let page;
    try{
      const r=await GET(`${BASE_URL}/movies?skip=${skip}&limit=${PAGE_SIZE}`,{access_token:API_KEY},60000);
      if(r.status!==200){console.error(`[Sync] ❌ /movies ${r.status}`);break;}
      page=r.body;
    }catch(e){console.error(`[Sync] ❌ skip=${skip}: ${e.message}`);break;}
    if(!Array.isArray(page)||!page.length) break;

    for(const m of page){
      try{
        // Build safe update doc — every field explicitly set, never undefined
        const now  = new Date();
        const setDoc = {
          _movieBaseId: m.id,
          title:        (String(m.title    ||'')).trim() || 'Untitled',
          language:     (String(m.language ||'')).trim() || 'Unknown',
          type:         m.release_type || 'released',
          releaseDate:  m.release_date ? new Date(m.release_date) : null,
          description:  String(m.description||''),
          director:     String(m.director   ||''),
          cast:  m.cast  ? String(m.cast).split(',').map(s=>s.trim()).filter(Boolean) : [],
          genre: m.genre ? String(m.genre).split(',').map(s=>s.trim()).filter(Boolean): [],
          updatedAt:    now,
        };

        // Use raw MongoDB driver — bypasses ALL Mongoose validators
        // This is intentional: movie_base data is trusted, description can be empty
        await Movie.collection.updateOne(
          { _movieBaseId: m.id },
          {
            $set: setDoc,
            $setOnInsert: {
              // On new doc only: set image + audit fields
              image:         m.poster || null,
              averageRating: 0,
              reviewCount:   0,
              createdAt:     now,
            },
          },
          { upsert: true }
        );
        // If movie_base gave us a poster, always update it (even on existing docs)
        if(m.poster){
          await Movie.collection.updateOne(
            { _movieBaseId: m.id },
            { $set: { image: m.poster } }
          );
        }
        upserted++;
      }catch(e){
        console.warn(`[Sync] ⚠️  "${m.title}": ${e.message}`);
        failed++;
      }
    }
    total+=page.length; skip+=PAGE_SIZE;
    console.log(`[Sync]   ↳ ${total} movies pulled…`);
    if(page.length<PAGE_SIZE) break;
  }
  return {total,upserted,failed};
}

async function runCleanup(){
  for(const ep of ['cleanup/actors','cleanup/old']){
    try{
      const r=await POST(`${BASE_URL}/${ep}`,{access_token:API_KEY},30000);
      if(r.status===200) console.log(`[Sync] 🧹 ${ep}: removed ${r.body.deleted}`);
    }catch(e){console.warn(`[Sync] ⚠️  ${ep}: ${e.message}`);}
  }
}

async function runSync(){
  if(!BASE_URL){console.log('[Sync] No MOVIE_BASE_URL');return;}
  const t0=Date.now();
  console.log(`[Sync] 🔄 Starting sync from ${BASE_URL}`);

  if(!await waitForService()) return;

  let count=0;
  try{const r=await GET(`${BASE_URL}/movies/count`,{access_token:API_KEY},15000);count=r.body.count||0;}catch{}
  console.log(`[Sync] 📊 movie_base: ${count} movies`);

  if(count===0){
    console.log(`[Sync] 🕷️  Empty DB — scraping all languages…`);
    let saved=0;
    for(const lang of LANGUAGES){ saved+=await scrapeTitles(lang); await sleep(2000); }
    if(!saved){console.error('[Sync] ❌ Nothing scraped');return;}
    await runCleanup();
  }

  // Pull current data (may have null images on first run)
  await pullMovies();

  // Enrich + upload posters on movie_base, then pull again to get Cloudinary URLs
  if(count===0){
    console.log(`[Sync] 🖼️  Enriching details & uploading posters on movie_base…`);
    for(const lang of LANGUAGES){ await enrichOnMovieBase(lang); await sleep(2000); }
    console.log(`[Sync] 🔄 Re-pulling to get Cloudinary URLs…`);
    await pullMovies();
  }

  console.log(`[Sync] ✅ Done in ${((Date.now()-t0)/1000).toFixed(0)}s`);
}

function start(){
  if(!BASE_URL){console.log('[Sync] disabled');return;}
  _timer=setInterval(()=>runSync().catch(e=>console.error('[Sync]',e.message)),INTERVAL);
  console.log('[Sync] ⏰ Every 3 hours');
}
function stop(){if(_timer){clearInterval(_timer);_timer=null;}}
module.exports={start,stop,runSync};
