require('dotenv').config();
const mongoose = require('mongoose');
const Movie    = require('../models/Movie');

// Helper: safe date parser (handles "TBA (YYYY)" → Dec 31 of that year)
function parseDate(str) {
  if (!str) return null;
  const tba = str.match(/TBA.*?(\d{4})/);
  if (tba) return new Date(`${tba[1]}-12-31`);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Placeholder image helper (no broken TMDB paths)
function img(text) {
  const encoded = encodeURIComponent(text);
  // This pulls a random high-quality photo related to the movie title
  // 300x450 is the standard movie poster aspect ratio
  return `https://source.unsplash.com/300x450/?movie,${encoded}`;
}

const movies = [
  // ── 🏆 2025 Blockbusters ────────────────────────────────
  { title: 'Coolie',               language: 'Tamil',           type: 'trending',  releaseDate: '2025-08-14', description: 'Rajinikanth and Lokesh Kanagaraj in a high-octane gold-smuggling action epic that shook the box office.',    image: img('Coolie') },
  { title: 'They Call Him OG',     language: 'Telugu',          type: 'trending',  releaseDate: '2025-09-25', description: 'Pawan Kalyan returns as a ruthless gangster in this stylish, hard-hitting thriller.',                         image: img('OG') },
  { title: 'L2: Empuraan',         language: 'Malayalam',       type: 'trending',  releaseDate: '2025-03-27', description: 'The massive sequel to Lucifer. Mohanlal as Khureshi-Ab\'raam in a global power struggle.',                   image: img('Empuraan') },
  { title: 'Game Changer',         language: 'Telugu',          type: 'released',  releaseDate: '2025-01-10', description: 'Ram Charan stars as a fearless officer fighting deep-rooted political corruption.',                           image: img('Game+Changer') },
  { title: 'Thug Life',            language: 'Tamil',           type: 'trending',  releaseDate: '2025-06-05', description: 'Kamal Haasan and Mani Ratnam reunite for a layered, gritty gangster drama.',                                 image: img('Thug+Life') },
  { title: 'Identity',             language: 'Malayalam',       type: 'released',  releaseDate: '2025-01-02', description: 'Tovino Thomas and Trisha in a high-octane investigative thriller with a mystery-driven plot.',               image: img('Identity') },
  { title: 'Kubera',               language: 'Tamil',           type: 'released',  releaseDate: '2025-06-20', description: 'Dhanush and Nagarjuna in a social thriller set in the underbelly of Mumbai.',                                image: img('Kubera') },
  { title: "Dominic and the Ladies' Purse", language: 'Malayalam', type: 'released', releaseDate: '2025-01-23', description: 'Gautham Menon directs Mammootty in a quirky, charming detective mystery.',                               image: img('Dominic') },
  { title: 'Viduthalai Part 2',    language: 'Tamil',           type: 'released',  releaseDate: '2025-02-14', description: "Vetrimaaran's intense, politically charged conclusion to the celebrated police-protest saga.",               image: img('Viduthalai+2') },
  { title: 'Kalamkaval',           language: 'Malayalam',       type: 'released',  releaseDate: '2025-12-05', description: 'Mammootty as a Special Branch officer navigating a dark and violent crime underworld.',                      image: img('Kalamkaval') },

  // ── 🟢 2026 Recent Releases ─────────────────────────────
  { title: 'The Raja Saab',        language: 'Telugu',          type: 'released',  releaseDate: '2026-01-09', description: 'Prabhas in a genre-bending horror-romantic comedy that became a massive crowd pleaser.',                    image: img('Raja+Saab') },
  { title: 'Mana Shankara Vara Prasad Garu', language: 'Telugu', type: 'released', releaseDate: '2026-01-12', description: 'Chiranjeevi in a festive family action-comedy that turned into a box-office hit.',                         image: img('Chiranjeevi') },
  { title: 'Parasakthi',           language: 'Tamil',           type: 'released',  releaseDate: '2026-01-10', description: 'Sivakarthikeyan delivers a compelling performance in this high-stakes political drama.',                    image: img('Parasakthi') },
  { title: 'Anaganaga Oka Raju',   language: 'Telugu',          type: 'released',  releaseDate: '2026-01-14', description: "Naveen Polishetty's hilarious and heartwarming wedding comedy that won audiences over.",                    image: img('Oka+Raju') },
  { title: 'Vaa Vaathiyaar',       language: 'Tamil',           type: 'released',  releaseDate: '2026-01-14', description: 'Karthi plays a passionate MGR-fan teacher in this feel-good action comedy.',                               image: img('Vaathiyaar') },
  { title: 'Chatha Pacha',         language: 'Malayalam',       type: 'released',  releaseDate: '2026-01-22', description: 'A fun wrestling-themed action comedy set in the vibrant backdrop of Fort Kochi.',                           image: img('Chatha+Pacha') },
  { title: 'With Love',            language: 'Tamil',           type: 'released',  releaseDate: '2026-03-06', description: 'Anaswara Rajan shines in this nostalgic, heartfelt journey through childhood crushes and memories.',        image: img('With+Love') },
  { title: 'Kenatha Kanom',        language: 'Tamil',           type: 'released',  releaseDate: '2026-03-13', description: 'Yogi Babu steals the show in this uproarious rural mystery comedy.',                                       image: img('Kenatha+Kanom') },
  { title: 'Toxic',                language: 'Kannada',         type: 'trending',  releaseDate: '2026-03-19', description: 'Yash makes a triumphant return in a stylish, sprawling period gangster epic.',                             image: img('Toxic') },
  { title: 'Aadu 3',               language: 'Malayalam',       type: 'released',  releaseDate: '2026-03-19', description: "Shaji Pappan's utterly chaotic and hilarious fantasy return that fans demanded.",                           image: img('Aadu+3') },
  { title: 'Ustaad Bhagat Singh',  language: 'Telugu',          type: 'released',  releaseDate: '2026-03-19', description: 'Pawan Kalyan as a fierce, principled cop in an adrenaline-pumping action entertainer.',                    image: img('Ustaad') },
  { title: 'Kirata',               language: 'Malayalam',       type: 'released',  releaseDate: '2026-03-20', description: 'A gripping survival thriller inspired by real-life mysteries from the deep forests.',                      image: img('Kirata') },
  { title: 'Maharaja Hostel',      language: 'Malayalam',       type: 'released',  releaseDate: '2026-03-21', description: 'A witty campus comedy-thriller brimming with energy and surprise twists.',                                 image: img('Maharaja+Hostel') },

  // ── 🔮 Upcoming ─────────────────────────────────────────
  { title: 'Band Melam',           language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-03-26', description: 'A breezy musical romantic entertainer filled with music, drama and laughs.',                               image: img('Band+Melam') },
  { title: 'Happy Raj',            language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-03-27', description: 'G.V. Prakash brings warmth and fun to this delightful family drama.',                                      image: img('Happy+Raj') },
  { title: 'Jana Nayagan',         language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-12-31', description: "Vijay's most anticipated political thriller — release TBA but expectations are sky-high.",                 image: img('Jana+Nayagan') },
  { title: 'Drishyam 3',           language: 'Malayalam',       type: 'upcoming',  releaseDate: '2026-04-01', description: "The final chapter of Georgekutty's legendary saga. Will the truth ever come out?",                        image: img('Drishyam+3') },
  { title: 'Biker',                language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-04-03', description: 'Sharwanand in a high-speed racing action drama packed with edge-of-seat sequences.',                       image: img('Biker') },
  { title: 'Nadaprabhu Kempegowda',language: 'Kannada',         type: 'upcoming',  releaseDate: '2026-04-08', description: 'Dhananjay leads this grand historical epic celebrating the legendary king of Bengaluru.',                  image: img('Kempegowda') },
  { title: 'Dacoit',               language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-04-10', description: 'Adivi Sesh and Mrunal Thakur in an intense, emotionally charged action-romance.',                         image: img('Dacoit') },
  { title: 'Swayambhu',            language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-04-10', description: 'Nikhil Siddhartha in a sweeping historical period drama with grandeur and heart.',                        image: img('Swayambhu') },
  { title: 'Patriot',              language: 'Malayalam',       type: 'upcoming',  releaseDate: '2026-04-14', description: 'The once-in-a-generation Mohanlal-Mammootty multi-starrer — Kerala cinema holds its breath.',             image: img('Patriot') },
  { title: 'Kara',                 language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-04-30', description: 'Dhanush and Mamitha Baiju in a raw, visceral period drama set in rural Tamil Nadu.',                      image: img('Kara') },
  { title: 'Peddi',                language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-04-30', description: 'Ram Charan in a high-octane rural sports drama filled with passion and rivalry.',                         image: img('Peddi') },
  { title: 'Goodachari 2 (G2)',    language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-05-01', description: 'The beloved spy franchise returns — bigger stakes, global locations, deadly mission.',                    image: img('G2') },
  { title: 'Karuppu',              language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-05-14', description: 'Suriya and Trisha in a high-intensity action saga that promises to redefine Tamil action cinema.',         image: img('Karuppu') },
  { title: 'Maa Inti Bangaram',    language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-05-15', description: "Samantha's powerful comeback action-drama that every fan has been waiting for.",                          image: img('Samantha') },
  { title: 'Dhruva Natchathiram',  language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-05-24', description: "Vikram's long-awaited stylish spy thriller that promises to be worth every year of waiting.",             image: img('Dhruva') },
  { title: 'Jailer 2',             language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-06-12', description: 'Rajinikanth as Muthuvel Pandian is back — the mega sequel everyone is counting down to.',                 image: img('Jailer+2') },
  { title: 'Dragon',               language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-06-25', description: 'Jr. NTR and Prashanth Neel unite for what could be the biggest action spectacle in years.',               image: img('Dragon') },
  { title: 'Vishwambhara',         language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-07-10', description: "Chiranjeevi's grand socio-fantasy epic that blends mythology with modern storytelling.",                  image: img('Vishwambhara') },
  { title: 'Jai Hanuman',          language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-08-18', description: 'Rishab Shetty joins the pan-India cinematic universe with this devotional superhero epic.',               image: img('Jai+Hanuman') },
  { title: 'The Paradise',         language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-08-21', description: 'Nani in a gritty, atmospheric action-adventure thriller with a gripping narrative.',                      image: img('The+Paradise') },
  { title: 'Ranabaali',            language: 'Telugu',          type: 'upcoming',  releaseDate: '2026-09-11', description: 'Vijay Deverakonda in a lavish, sweeping historical period drama.',                                        image: img('Ranabaali') },
  { title: 'Khalifa',              language: 'Malayalam',       type: 'upcoming',  releaseDate: '2026-09-25', description: 'Prithviraj Sukumaran in a high-budget international thriller spanning multiple continents.',               image: img('Khalifa') },
  { title: 'Puranaanooru',         language: 'Tamil',           type: 'upcoming',  releaseDate: '2026-10-15', description: 'Suriya and Dulquer Salmaan together in a raw, epic period saga — a cinematic dream team.',               image: img('Puranaanooru') },
  { title: 'Rowdy Janardhana',     language: 'Kannada',         type: 'upcoming',  releaseDate: '2026-12-18', description: 'A gritty, no-nonsense political action drama set in the corridors of power.',                            image: img('Rowdy') },
  { title: 'Spirit',               language: 'Telugu',          type: 'upcoming',  releaseDate: '2027-03-05', description: 'Prabhas as a fierce cop in the highly anticipated Sandeep Reddy Vanga directorial.',                    image: img('Spirit') },
  { title: 'Varanasi',             language: 'Telugu',          type: 'upcoming',  releaseDate: '2027-04-07', description: "Rajamouli and Mahesh Babu's globe-trotting adventure — expectations are at an all-time high.",           image: img('Varanasi') },
  { title: 'Ramayana: Part 1',     language: 'Hindi',           type: 'upcoming',  releaseDate: '2027-10-15', description: 'Ranbir Kapoor and Sai Pallavi in the most ambitious mythological epic ever attempted in Indian cinema.', image: img('Ramayana') },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅  Connected to MongoDB');

    await Movie.deleteMany({});
    console.log('🗑️   Cleared existing movies');

    const docs = movies.map(m => ({
      ...m,
      releaseDate: parseDate(m.releaseDate),
    }));

    const inserted = await Movie.insertMany(docs);
    console.log(`🎬  Seeded ${inserted.length} movies`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌  Seed error:', err.message);
    process.exit(1);
  }
};

seed();
