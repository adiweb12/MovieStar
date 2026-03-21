require('dotenv').config();
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');
const Movie    = require('../models/Movie');

// Download an image from url and save locally, return local path
function download(url, dest) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest);
    proto.get(url, res => {
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, ()=>{}); resolve(null); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', () => { fs.unlink(dest, ()=>{}); resolve(null); });
  });
}

// Use TMDB poster URL (w342 size) — these are real working paths
// Fallback: generate a colourful SVG poster inline
function svgPoster(title, color1, color2) {
  const lines  = title.match(/.{1,14}/g) || [title];
  const svgTxt = lines.slice(0,3).map((l, i) =>
    `<text x="150" y="${200 + i*32}" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">${l}</text>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:${color1}"/>
    <stop offset="100%" style="stop-color:${color2}"/>
  </linearGradient></defs>
  <rect width="300" height="450" fill="url(#g)" rx="8"/>
  <rect x="20" y="20" width="260" height="410" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" rx="6"/>
  <text x="150" y="80" font-family="Arial,sans-serif" font-size="38" fill="rgba(255,255,255,0.3)" text-anchor="middle">🎬</text>
  <rect x="50" y="120" width="200" height="2" fill="rgba(255,255,255,0.2)" rx="1"/>
  ${svgTxt}
  <rect x="50" y="${320}" width="200" height="2" fill="rgba(255,255,255,0.2)" rx="1"/>
  <text x="150" y="390" font-family="Arial,sans-serif" font-size="12" fill="rgba(255,255,255,0.5)" text-anchor="middle">MovieStar</text>
</svg>`;
}

const PALETTES = [
  ['#e5293e','#7b1fa2'],['#1565c0','#0d47a1'],['#2e7d32','#1b5e20'],
  ['#e65100','#bf360c'],['#6a1b9a','#4a148c'],['#00695c','#004d40'],
  ['#c62828','#b71c1c'],['#283593','#1a237e'],['#4e342e','#3e2723'],
  ['#37474f','#263238'],
];

const movies = [
  // ── Trending ──────────────────────────────────────────
  { title:'Coolie',               language:'Tamil',    type:'trending',  releaseDate:'2025-08-14', description:'Rajinikanth and Lokesh Kanagaraj in a gold-smuggling action epic.',            director:'Lokesh Kanagaraj', genre:['Action','Thriller'] },
  { title:'They Call Him OG',     language:'Telugu',   type:'trending',  releaseDate:'2025-09-25', description:'Pawan Kalyan as a ruthless gangster in this stylish crime thriller.',           director:'Sujeeth',          genre:['Action','Crime'] },
  { title:'L2: Empuraan',         language:'Malayalam',type:'trending',  releaseDate:'2025-03-27', description:"Sequel to Lucifer. Mohanlal as Khureshi-Ab'raam in a global power struggle.",  director:'Prithviraj Sukumaran', genre:['Action','Drama'] },
  { title:'Thug Life',            language:'Tamil',    type:'trending',  releaseDate:'2025-06-05', description:'Kamal Haasan and Mani Ratnam reunite for a layered gangster drama.',            director:'Mani Ratnam',      genre:['Crime','Drama'] },
  { title:'Toxic',                language:'Kannada',  type:'trending',  releaseDate:'2026-03-19', description:'Yash returns in a stylish period gangster epic.',                               director:'Geetu Mohandas',   genre:['Action','Period'] },
  // ── 2025 ──────────────────────────────────────────────
  { title:'Game Changer',         language:'Telugu',   type:'released',  releaseDate:'2025-01-10', description:'Ram Charan as a fearless officer fighting political corruption.',               director:'Shankar',          genre:['Action','Political'] },
  { title:'Identity',             language:'Malayalam',type:'released',  releaseDate:'2025-01-02', description:'Tovino Thomas in a high-octane investigative thriller.',                        director:'Akhil Paul',       genre:['Thriller'] },
  { title:'Kubera',               language:'Tamil',    type:'released',  releaseDate:'2025-06-20', description:'Dhanush and Nagarjuna in a social thriller set in Mumbai.',                     director:'Sekhar Kammula',   genre:['Drama','Thriller'] },
  { title:"Dominic and the Ladies' Purse", language:'Malayalam', type:'released', releaseDate:'2025-01-23', description:'Mammootty in a quirky detective mystery directed by Gautham Menon.', director:'Gautham Menon',    genre:['Mystery','Comedy'] },
  { title:'Viduthalai Part 2',    language:'Tamil',    type:'released',  releaseDate:'2025-02-14', description:"Vetrimaaran's intense conclusion to the police-protest saga.",                  director:'Vetrimaaran',      genre:['Drama','Political'] },
  { title:'Kalamkaval',           language:'Malayalam',type:'released',  releaseDate:'2025-12-05', description:'Mammootty as a Special Branch officer in a dark crime thriller.',               director:'Amal Neerad',      genre:['Crime','Thriller'] },
  // ── 2026 Recent ───────────────────────────────────────
  { title:'The Raja Saab',        language:'Telugu',   type:'released',  releaseDate:'2026-01-09', description:'Prabhas in a genre-bending horror-romantic comedy.',                           director:'Maruthi',          genre:['Horror','Comedy'] },
  { title:'Parasakthi',           language:'Tamil',    type:'released',  releaseDate:'2026-01-10', description:'Sivakarthikeyan in a high-stakes political drama.',                             director:'Bala',             genre:['Political','Drama'] },
  { title:'Anaganaga Oka Raju',   language:'Telugu',   type:'released',  releaseDate:'2026-01-14', description:"Naveen Polishetty's hilarious wedding comedy.",                                 director:'Mohan Krishna Indraganti', genre:['Comedy','Romance'] },
  { title:'Vaa Vaathiyaar',       language:'Tamil',    type:'released',  releaseDate:'2026-01-14', description:'Karthi as a quirky MGR-fan teacher in an action comedy.',                      director:'Pa. Ranjith',      genre:['Action','Comedy'] },
  { title:'Chatha Pacha',         language:'Malayalam',type:'released',  releaseDate:'2026-01-22', description:'A wrestling action-comedy set in Fort Kochi.',                                  director:'Don Palathara',    genre:['Action','Comedy'] },
  { title:'With Love',            language:'Tamil',    type:'released',  releaseDate:'2026-03-06', description:'Anaswara Rajan in a nostalgic journey of childhood crushes.',                   director:'Gireesh Kumar',    genre:['Romance','Drama'] },
  { title:'Aadu 3',               language:'Malayalam',type:'released',  releaseDate:'2026-03-19', description:"Shaji Pappan's chaotic fantasy return.",                                        director:'Midhun Manuel Thomas', genre:['Comedy','Fantasy'] },
  { title:'Ustaad Bhagat Singh',  language:'Telugu',   type:'released',  releaseDate:'2026-03-19', description:'Pawan Kalyan as a fierce cop in a high-energy action film.',                    director:'Harish Shankar',   genre:['Action'] },
  { title:'Kirata',               language:'Malayalam',type:'released',  releaseDate:'2026-03-20', description:'A survival thriller based on real-life mysteries.',                             director:'Jis Joy',          genre:['Thriller','Survival'] },
  { title:'Maharaja Hostel',      language:'Malayalam',type:'released',  releaseDate:'2026-03-21', description:'A campus comedy-thriller brimming with energy.',                                director:'Vineeth Sreenivasan', genre:['Comedy','Thriller'] },
  // ── Upcoming ──────────────────────────────────────────
  { title:'Band Melam',           language:'Telugu',   type:'upcoming',  releaseDate:'2026-03-26', description:'A musical romantic entertainer filled with drama and laughs.',                  genre:['Romance','Musical'] },
  { title:'Happy Raj',            language:'Tamil',    type:'upcoming',  releaseDate:'2026-03-27', description:'G.V. Prakash in a delightful family drama.',                                    genre:['Family','Comedy'] },
  { title:'Jana Nayagan',         language:'Tamil',    type:'upcoming',  releaseDate:'2026-12-31', description:"Vijay's highly anticipated political thriller.",                                 director:'Atlee',            genre:['Political','Action'] },
  { title:'Drishyam 3',           language:'Malayalam',type:'upcoming',  releaseDate:'2026-04-01', description:'The final chapter of Georgekutty\'s legendary saga.',                           director:'Jeethu Joseph',    genre:['Thriller','Drama'] },
  { title:'Biker',                language:'Telugu',   type:'upcoming',  releaseDate:'2026-04-03', description:'Sharwanand in a high-speed racing action drama.',                               genre:['Action','Sports'] },
  { title:'Dacoit',               language:'Telugu',   type:'upcoming',  releaseDate:'2026-04-10', description:'Adivi Sesh and Mrunal Thakur in an intense action-romance.',                    genre:['Action','Romance'] },
  { title:'Patriot',              language:'Malayalam',type:'upcoming',  releaseDate:'2026-04-14', description:'The Mohanlal-Mammootty multi-starrer.',                                         genre:['Action','Drama'] },
  { title:'Kara',                 language:'Tamil',    type:'upcoming',  releaseDate:'2026-04-30', description:'Dhanush in a raw period drama set in rural Tamil Nadu.',                        genre:['Period','Drama'] },
  { title:'Peddi',                language:'Telugu',   type:'upcoming',  releaseDate:'2026-04-30', description:'Ram Charan in a rural sports drama.',                                           genre:['Sports','Drama'] },
  { title:'Goodachari 2 (G2)',    language:'Telugu',   type:'upcoming',  releaseDate:'2026-05-01', description:'The beloved spy franchise returns with global stakes.',                         genre:['Action','Spy'] },
  { title:'Karuppu',              language:'Tamil',    type:'upcoming',  releaseDate:'2026-05-14', description:'Suriya and Trisha in a high-intensity action saga.',                            genre:['Action'] },
  { title:'Maa Inti Bangaram',    language:'Telugu',   type:'upcoming',  releaseDate:'2026-05-15', description:"Samantha's comeback action-drama.",                                             genre:['Action','Drama'] },
  { title:'Dhruva Natchathiram',  language:'Tamil',    type:'upcoming',  releaseDate:'2026-05-24', description:"Vikram's stylish spy thriller.",                                                director:'Gautham Menon',    genre:['Spy','Action'] },
  { title:'Jailer 2',             language:'Tamil',    type:'upcoming',  releaseDate:'2026-06-12', description:'Rajinikanth as Muthuvel Pandian returns in the mega sequel.',                   director:'Nelson Dilipkumar',genre:['Action'] },
  { title:'Dragon',               language:'Telugu',   type:'upcoming',  releaseDate:'2026-06-25', description:"Jr. NTR and Prashanth Neel's massive action project.",                         director:'Prashanth Neel',   genre:['Action'] },
  { title:'Vishwambhara',         language:'Telugu',   type:'upcoming',  releaseDate:'2026-07-10', description:"Chiranjeevi's grand socio-fantasy epic.",                                       genre:['Fantasy','Drama'] },
  { title:'Jai Hanuman',          language:'Telugu',   type:'upcoming',  releaseDate:'2026-08-18', description:'Rishab Shetty in a devotional superhero epic.',                                 genre:['Mythology','Action'] },
  { title:'The Paradise',         language:'Telugu',   type:'upcoming',  releaseDate:'2026-08-21', description:'Nani in a gritty action-adventure thriller.',                                   genre:['Action','Adventure'] },
  { title:'Ranabaali',            language:'Telugu',   type:'upcoming',  releaseDate:'2026-09-11', description:'Vijay Deverakonda in a sweeping historical period drama.',                      genre:['Period','Action'] },
  { title:'Khalifa',              language:'Malayalam',type:'upcoming',  releaseDate:'2026-09-25', description:'Prithviraj Sukumaran in a high-budget global thriller.',                        genre:['Thriller','Action'] },
  { title:'Puranaanooru',         language:'Tamil',    type:'upcoming',  releaseDate:'2026-10-15', description:'Suriya and Dulquer Salmaan in a raw period epic.',                              genre:['Period','Drama'] },
  { title:'Rowdy Janardhana',     language:'Kannada',  type:'upcoming',  releaseDate:'2026-12-18', description:'A gritty political action drama.',                                              genre:['Action','Political'] },
  { title:'Spirit',               language:'Telugu',   type:'upcoming',  releaseDate:'2027-03-05', description:'Prabhas as a fierce cop in the Vanga directorial.',                             director:'Sandeep Reddy Vanga', genre:['Crime','Action'] },
  { title:'Varanasi',             language:'Telugu',   type:'upcoming',  releaseDate:'2027-04-07', description:"Rajamouli and Mahesh Babu's globe-trotting adventure.",                         director:'S.S. Rajamouli',   genre:['Adventure','Action'] },
  { title:'Ramayana: Part 1',     language:'Hindi',    type:'upcoming',  releaseDate:'2027-10-15', description:'Ranbir Kapoor and Sai Pallavi in the epic mythological adaptation.',           director:'Nitesh Tiwari',    genre:['Mythology','Drama'] },
];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  Connected');

  await Movie.deleteMany({});
  console.log('🗑️   Cleared movies');

  const imgDir = path.join(__dirname, '..', 'public', 'images', 'movies');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const docs = [];
  for (let i = 0; i < movies.length; i++) {
    const m   = movies[i];
    const pal = PALETTES[i % PALETTES.length];
    const svg = svgPoster(m.title, pal[0], pal[1]);
    const filename = `seed-${i+1}-${m.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.svg`;
    const dest  = path.join(imgDir, filename);
    fs.writeFileSync(dest, svg);
    docs.push({
      ...m,
      image: `/images/movies/${filename}`,
      releaseDate: m.releaseDate ? new Date(m.releaseDate) : null,
    });
    process.stdout.write(`  🎬 ${m.title}\n`);
  }

  await Movie.insertMany(docs);
  console.log(`\n✅  Seeded ${docs.length} movies with SVG posters`);
  await mongoose.connection.close();
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
