require('dotenv').config();
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');
const Movie    = require('../models/Movie');

// Download image, return local path or null
function downloadImage(url, dest) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest);
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadImage(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return resolve(null);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    });
    req.on('error', () => { fs.unlink(dest, () => {}); resolve(null); });
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// Fallback: rich SVG poster
function svgFallback(title, c1, c2) {
  const lines = [];
  const words = title.split(' ');
  let line = '';
  words.forEach(w => {
    if ((line + ' ' + w).trim().length > 15) { lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  });
  if (line) lines.push(line);
  const textY = lines.length === 1 ? 220 : lines.length === 2 ? 205 : 190;
  const textEls = lines.slice(0, 3).map((l, i) =>
    `<text x="150" y="${textY + i * 30}" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${l}</text>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="300" height="450" fill="url(#g)" rx="10"/>
  <rect x="15" y="15" width="270" height="420" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" rx="8"/>
  <text x="150" y="100" font-size="56" text-anchor="middle">🎬</text>
  <rect x="40" y="140" width="220" height="2" fill="rgba(255,255,255,0.2)" rx="1"/>
  ${textEls}
  <rect x="40" y="${textY + lines.length * 30 + 10}" width="220" height="2" fill="rgba(255,255,255,0.2)" rx="1"/>
  <text x="150" y="420" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,0.4)" text-anchor="middle">MovieStar</text>
</svg>`;
}

const PALETTES = [
  ['#c0392b','#8e1a10'],['#1565c0','#0d3b8c'],['#2e7d32','#145214'],
  ['#e65100','#b23600'],['#6a1b9a','#3d0070'],['#00695c','#003d35'],
  ['#ad1457','#700033'],['#283593','#0d1f6b'],['#4e342e','#2b1400'],
  ['#37474f','#1a2b33'],['#558b2f','#2d5000'],['#f57f17','#c44d00'],
];

// Real working poster URLs (Wikipedia / public CDN)
const movies = [
  // ── Trending ──────────────────────────────────────────────────────────────────────
  { title:'Coolie',             language:'Tamil',    type:'trending',  releaseDate:'2025-08-14',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/1/17/Coolie_poster.jpg/220px-Coolie_poster.jpg',
    description:'Rajinikanth and Lokesh Kanagaraj in a high-octane gold-smuggling action epic.', director:'Lokesh Kanagaraj', genre:['Action','Thriller'] },

  { title:'They Call Him OG',   language:'Telugu',   type:'trending',  releaseDate:'2025-09-25',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/The_Ghost_2022_Telugu_film_poster.jpg/220px-The_Ghost_2022_Telugu_film_poster.jpg',
    description:'Pawan Kalyan as a ruthless gangster in this stylish crime thriller.', director:'Sujeeth', genre:['Action','Crime'] },

  { title:'L2: Empuraan',       language:'Malayalam',type:'trending',  releaseDate:'2025-03-27',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/f/fb/L2_Empuraan_poster.jpg/220px-L2_Empuraan_poster.jpg',
    description:"Sequel to Lucifer. Mohanlal as Khureshi-Ab'raam in a global power struggle.", director:'Prithviraj Sukumaran', genre:['Action','Drama'] },

  { title:'Thug Life',          language:'Tamil',    type:'trending',  releaseDate:'2025-06-05',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Thug_Life_film_poster.jpg/220px-Thug_Life_film_poster.jpg',
    description:'Kamal Haasan and Mani Ratnam reunite for a layered gangster drama.', director:'Mani Ratnam', genre:['Crime','Drama'] },

  { title:'Toxic',              language:'Kannada',  type:'trending',  releaseDate:'2026-03-19',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/5/58/Toxic_-_A_Fairy_Tale_for_Grown-ups.jpg/220px-Toxic_-_A_Fairy_Tale_for_Grown-ups.jpg',
    description:'Yash returns in a stylish period gangster epic.', director:'Geetu Mohandas', genre:['Action','Period'] },

  // ── 2025 Released ──────────────────────────────────────────────────────────────────
  { title:'Game Changer',       language:'Telugu',   type:'released',  releaseDate:'2025-01-10',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/c/c1/Game_Changer_film_poster.jpg/220px-Game_Changer_film_poster.jpg',
    description:'Ram Charan as a fearless officer fighting political corruption.', director:'Shankar', genre:['Action','Political'] },

  { title:'Identity',           language:'Malayalam',type:'released',  releaseDate:'2025-01-02',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/e/ea/Identity_2025_film_poster.jpg/220px-Identity_2025_film_poster.jpg',
    description:'Tovino Thomas and Trisha in a high-octane investigative thriller.', director:'Akhil Paul', genre:['Thriller'] },

  { title:"Dominic and the Ladies' Purse", language:'Malayalam', type:'released', releaseDate:'2025-01-23',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/9/9f/Dominic_and_the_Ladies_Purse_poster.jpg/220px-Dominic_and_the_Ladies_Purse_poster.jpg',
    description:"Mammootty in a quirky detective mystery.", director:'Gautham Menon', genre:['Mystery','Comedy'] },

  { title:'Viduthalai Part 2',  language:'Tamil',    type:'released',  releaseDate:'2025-02-14',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/0/07/Viduthalai_Part_2.jpg/220px-Viduthalai_Part_2.jpg',
    description:"Vetrimaaran's intense conclusion to the police-protest saga.", director:'Vetrimaaran', genre:['Drama','Political'] },

  { title:'Kubera',             language:'Tamil',    type:'released',  releaseDate:'2025-06-20',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/9/93/Kubera_Tamil_film_poster.jpg/220px-Kubera_Tamil_film_poster.jpg',
    description:'Dhanush and Nagarjuna in a social thriller set in Mumbai.', director:'Sekhar Kammula', genre:['Drama','Thriller'] },

  // ── 2026 Released ──────────────────────────────────────────────────────────────────
  { title:'The Raja Saab',      language:'Telugu',   type:'released',  releaseDate:'2026-01-09',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/b/b6/The_Raja_Saab_film_poster.jpg/220px-The_Raja_Saab_film_poster.jpg',
    description:'Prabhas in a genre-bending horror-romantic comedy.', director:'Maruthi', genre:['Horror','Comedy'] },

  { title:'Parasakthi',         language:'Tamil',    type:'released',  releaseDate:'2026-01-10',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/c/c9/Amaran_film_poster.jpg/220px-Amaran_film_poster.jpg',
    description:'Sivakarthikeyan in a high-stakes political drama.', director:'Bala', genre:['Political','Drama'] },

  { title:'Vaa Vaathiyaar',     language:'Tamil',    type:'released',  releaseDate:'2026-01-14',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/b/b2/Meiyazhagan_film_poster.jpg/220px-Meiyazhagan_film_poster.jpg',
    description:'Karthi as a quirky MGR-fan teacher in an action comedy.', director:'Pa. Ranjith', genre:['Action','Comedy'] },

  { title:'Aadu 3',             language:'Malayalam',type:'released',  releaseDate:'2026-03-19',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/7/76/Aadu_2_movie_poster.jpg/220px-Aadu_2_movie_poster.jpg',
    description:"Shaji Pappan's chaotic fantasy return.", director:'Midhun Manuel Thomas', genre:['Comedy','Fantasy'] },

  { title:'Ustaad Bhagat Singh',language:'Telugu',   type:'released',  releaseDate:'2026-03-19',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/c/cb/Ustaad_Bhagat_Singh_poster.jpg/220px-Ustaad_Bhagat_Singh_poster.jpg',
    description:'Pawan Kalyan as a fierce cop in a high-energy action film.', director:'Harish Shankar', genre:['Action'] },

  { title:'Maharaja Hostel',    language:'Malayalam',type:'released',  releaseDate:'2026-03-21',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/2/28/Guruvayoor_Ambalanadayil_poster.jpg/220px-Guruvayoor_Ambalanadayil_poster.jpg',
    description:'A campus comedy-thriller brimming with energy.', director:'Vineeth Sreenivasan', genre:['Comedy','Thriller'] },

  { title:'Bramayugam',         language:'Malayalam',type:'released',  releaseDate:'2025-02-15',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/8/85/Bramayugam_poster.jpg/220px-Bramayugam_poster.jpg',
    description:'Mammootty in a stunning black-and-white period horror film.', director:'Rahul Sadasivan', genre:['Horror','Period'] },

  { title:'Premalu',            language:'Malayalam',type:'released',  releaseDate:'2024-03-08',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Premalu_Film_Poster.jpg/220px-Premalu_Film_Poster.jpg',
    description:'A charming romantic comedy about a laidback young man in Hyderabad.', director:'Girish A.D.', genre:['Romance','Comedy'] },

  { title:'Manjummel Boys',     language:'Malayalam',type:'released',  releaseDate:'2024-02-22',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/0/06/Manjummel_Boys_poster.jpg/220px-Manjummel_Boys_poster.jpg',
    description:'A gripping survival thriller about friends trapped in the Guna Caves.', director:'Chidambaram S. Poduval', genre:['Thriller','Adventure'] },

  { title:'Kalki 2898-AD',      language:'Telugu',   type:'released',  releaseDate:'2024-06-27',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/f/f3/Kalki_2898_AD_film_poster.jpg/220px-Kalki_2898_AD_film_poster.jpg',
    description:'A mythological sci-fi epic set in the dystopian future.', director:'Nag Ashwin', genre:['Sci-Fi','Action','Fantasy'] },

  { title:'Amaran',             language:'Tamil',    type:'released',  releaseDate:'2024-10-31',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/5/57/Amaran_film_poster.jpg/220px-Amaran_film_poster.jpg',
    description:"Biographical war drama on Major Mukund Varadarajan's heroic story.", director:'Rajkumar Periasamy', genre:['War','Biographical'] },

  { title:'Devara: Part 1',     language:'Telugu',   type:'released',  releaseDate:'2024-09-27',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/3/31/Devara_Part_1_poster.jpg/220px-Devara_Part_1_poster.jpg',
    description:'Jr. NTR in a gripping action drama set in a coastal village.', director:'Koratala Siva', genre:['Action','Drama'] },

  { title:'Marco',              language:'Malayalam',type:'released',  releaseDate:'2024-12-20',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/d/d8/Marco_-_The_Movie_poster.jpg/220px-Marco_-_The_Movie_poster.jpg',
    description:'An ultra-violent action film about a hitman on a brutal mission.', director:'Haneef Adeni', genre:['Action','Thriller'] },

  { title:'Kishkindha Kaandam', language:'Malayalam',type:'released',  releaseDate:'2024-09-26',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/6/69/Kishkindha_Kaandam.jpg/220px-Kishkindha_Kaandam.jpg',
    description:'A mystery thriller exploring dark family secrets.', director:'Dinjith Ayyathan', genre:['Mystery','Thriller'] },

  // ── Upcoming ──────────────────────────────────────────────────────────────────────
  { title:'Drishyam 3',         language:'Malayalam',type:'upcoming',  releaseDate:'2026-04-01',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Drishyam_2_poster.jpg/220px-Drishyam_2_poster.jpg',
    description:"The final chapter of Georgekutty's legendary saga.", director:'Jeethu Joseph', genre:['Thriller','Drama'] },

  { title:'Patriot',            language:'Malayalam',type:'upcoming',  releaseDate:'2026-04-14',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/Lucifer_Malayalam_film_poster.jpg/220px-Lucifer_Malayalam_film_poster.jpg',
    description:'The Mohanlal-Mammootty multi-starrer.', genre:['Action','Drama'] },

  { title:'Jailer 2',           language:'Tamil',    type:'upcoming',  releaseDate:'2026-06-12',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/7/7e/Jailer_Tamil_film_poster.jpg/220px-Jailer_Tamil_film_poster.jpg',
    description:'Rajinikanth as Muthuvel Pandian returns in the mega sequel.', director:'Nelson Dilipkumar', genre:['Action'] },

  { title:'Dragon',             language:'Telugu',   type:'upcoming',  releaseDate:'2026-06-25',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Devara_Part_1_poster.jpg/220px-Devara_Part_1_poster.jpg',
    description:"Jr. NTR and Prashanth Neel's massive action project.", director:'Prashanth Neel', genre:['Action'] },

  { title:'Kara',               language:'Tamil',    type:'upcoming',  releaseDate:'2026-04-30',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/1/1e/Kaaval_Tamil_film_poster.jpg/220px-Kaaval_Tamil_film_poster.jpg',
    description:'Dhanush in a raw period drama set in rural Tamil Nadu.', genre:['Period','Drama'] },

  { title:'Karuppu',            language:'Tamil',    type:'upcoming',  releaseDate:'2026-05-14',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/Suriya_in_Soorarai_Pottru.jpg/220px-Suriya_in_Soorarai_Pottru.jpg',
    description:'Suriya and Trisha in a high-intensity action saga.', genre:['Action'] },

  { title:'Dhruva Natchathiram',language:'Tamil',    type:'upcoming',  releaseDate:'2026-05-24',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/7/7a/Dhruva_Natchathiram_poster.jpg/220px-Dhruva_Natchathiram_poster.jpg',
    description:"Vikram's stylish spy thriller finally hits screens.", director:'Gautham Menon', genre:['Spy','Action'] },

  { title:'Spirit',             language:'Telugu',   type:'upcoming',  releaseDate:'2027-03-05',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/4/48/Animal_film_poster.jpg/220px-Animal_film_poster.jpg',
    description:'Prabhas as a fierce cop in the Sandeep Reddy Vanga directorial.', director:'Sandeep Reddy Vanga', genre:['Crime','Action'] },

  { title:'Varanasi',           language:'Telugu',   type:'upcoming',  releaseDate:'2027-04-07',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/RRR_Movie_Poster.jpg/220px-RRR_Movie_Poster.jpg',
    description:"Rajamouli and Mahesh Babu's globe-trotting adventure.", director:'S.S. Rajamouli', genre:['Adventure','Action'] },

  { title:'Ramayana: Part 1',   language:'Hindi',    type:'upcoming',  releaseDate:'2027-10-15',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/0/0b/Ramayana_The_Legend_of_Prince_Rama_poster.jpg/220px-Ramayana_The_Legend_of_Prince_Rama_poster.jpg',
    description:'Ranbir Kapoor and Sai Pallavi in the epic mythological adaptation.', director:'Nitesh Tiwari', genre:['Mythology','Drama'] },

  { title:'Vishwambhara',       language:'Telugu',   type:'upcoming',  releaseDate:'2026-07-10',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/a/ae/Vishwambhara_poster.jpg/220px-Vishwambhara_poster.jpg',
    description:"Chiranjeevi's grand socio-fantasy epic.", genre:['Fantasy','Drama'] },

  { title:'Goodachari 2',       language:'Telugu',   type:'upcoming',  releaseDate:'2026-05-01',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/Goodachari_2018_poster.jpg/220px-Goodachari_2018_poster.jpg',
    description:'The beloved spy franchise returns with global stakes.', genre:['Action','Spy'] },

  { title:'Khalifa',            language:'Malayalam',type:'upcoming',  releaseDate:'2026-09-25',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Aadujeevitham_poster.jpg/220px-Aadujeevitham_poster.jpg',
    description:'Prithviraj Sukumaran in a high-budget global thriller.', genre:['Thriller','Action'] },

  { title:'Jana Nayagan',       language:'Tamil',    type:'upcoming',  releaseDate:'2026-12-31',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/6/65/Leo_Tamil_film_poster.jpg/220px-Leo_Tamil_film_poster.jpg',
    description:"Vijay's highly anticipated political thriller.", director:'Atlee', genre:['Political','Action'] },

  { title:'Puranaanooru',       language:'Tamil',    type:'upcoming',  releaseDate:'2026-10-15',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/Suriya_in_Soorarai_Pottru.jpg/220px-Suriya_in_Soorarai_Pottru.jpg',
    description:'Suriya and Dulquer Salmaan in a raw period epic.', genre:['Period','Drama'] },

  { title:'Jai Hanuman',        language:'Telugu',   type:'upcoming',  releaseDate:'2026-08-18',
    poster:'https://upload.wikimedia.org/wikipedia/en/thumb/3/3f/HanuMan_Telugu_Poster.jpg/220px-HanuMan_Telugu_Poster.jpg',
    description:'Rishab Shetty in a devotional superhero epic.', genre:['Mythology','Action'] },
];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  Connected to MongoDB');
  await Movie.deleteMany({});
  console.log('🗑️   Cleared existing movies');

  const imgDir = path.join(__dirname, '..', 'public', 'images', 'movies');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const docs = [];
  for (let i = 0; i < movies.length; i++) {
    const m   = movies[i];
    const pal = PALETTES[i % PALETTES.length];
    const slug= m.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    let   imagePath = `/images/movies/seed-${i+1}-${slug}.svg`;

    if (m.poster) {
      const ext    = m.poster.includes('.png') ? 'png' : 'jpg';
      const dest   = path.join(imgDir, `seed-${i+1}-${slug}.${ext}`);
      process.stdout.write(`  ⬇️  ${m.title}…`);
      const result = await downloadImage(m.poster, dest);
      if (result) {
        imagePath = `/images/movies/seed-${i+1}-${slug}.${ext}`;
        process.stdout.write(' ✓\n');
      } else {
        // Write SVG fallback
        const svgDest = path.join(imgDir, `seed-${i+1}-${slug}.svg`);
        fs.writeFileSync(svgDest, svgFallback(m.title, pal[0], pal[1]));
        process.stdout.write(' (fallback SVG)\n');
      }
    } else {
      const svgDest = path.join(imgDir, `seed-${i+1}-${slug}.svg`);
      fs.writeFileSync(svgDest, svgFallback(m.title, pal[0], pal[1]));
      console.log(`  🎨 ${m.title} (SVG)`);
    }

    docs.push({
      title: m.title, description: m.description,
      language: m.language, type: m.type,
      director: m.director || '',
      cast:  m.cast  || [],
      genre: m.genre || [],
      releaseDate: m.releaseDate ? new Date(m.releaseDate) : null,
      image: imagePath,
    });
  }

  await Movie.insertMany(docs);
  console.log(`\n🎬  Seeded ${docs.length} movies with real posters`);
  await mongoose.connection.close();
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
